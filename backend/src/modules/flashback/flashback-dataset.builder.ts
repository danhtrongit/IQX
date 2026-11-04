/**
 * Bộ dựng kho dữ liệu Flashback v2.2 (IQX-Flashback-SPEC-DuLieu.md §2.2).
 *
 * Một lần chạy là MỘT phiên bản kho:
 * 1. lấy rổ VN100 hiện hành và lịch phiên của sàn;
 * 2. với từng mã: tải toàn bộ lịch sử (DNSE, dự phòng VCI), tính `gap_before`, `bad`, `ret`,
 *    `value_raw` và các mảng cộng dồn, ghi vào kho dưới trạng thái `building`;
 * 3. kiểm từng bộ: dưới `W + 60` phiên thì loại "Chưa đủ lịch sử"; lỗi tải hoặc dữ liệu hỏng thì
 *    loại mã đó kèm lý do, các mã khác vẫn chạy tiếp;
 * 4. kiểm cả kho: từ `min_symbols` (80) mã hợp lệ trở lên thì chuyển sang `active` trong một
 *    transaction (phiên bản cũ thành `retired`); ít hơn thì đánh dấu `failed`, GIỮ kho đang dùng và
 *    báo quản trị;
 * 5. ghi nhật ký: thời gian chạy, số mã thành công, mã bị loại và lý do.
 *
 * Idempotent: chỉ một lần tạo kho `building` tại một thời điểm (ràng buộc duy nhất của CSDL), lần
 * chạy đồng thời nhận `already_running`; lần tạo bị ngắt giữa chừng (mất nhịp) được đánh dấu lỗi ở
 * lần chạy kế tiếp.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import {
  FLASHBACK_OPS_ALERTS,
  noopFlashbackOpsAlerts,
  type FlashbackOpsAlertPort,
} from './flashback.alerts.js';
import { vietnamDate } from './flashback.round-builder.js';
import { datasetMinBars, readFlashbackDatasetConfig } from './flashback-dataset.config.js';
import {
  computeBars,
  computePrefix,
  cutoffDayFor,
  listValidCuts,
  TradingCalendar,
  type CutParams,
  type DatasetValueBasis,
} from './flashback-dataset.logic.js';
import {
  EMPTY_DATASET_PROGRESS,
  FLASHBACK_DATASET_REPOSITORY,
  FlashbackDatasetRepository,
  type DatasetAlertCode,
  type DatasetBuildLog,
  type DatasetProgress,
  type DatasetTrigger,
} from './flashback-dataset.repository.js';
import {
  FLASHBACK_DATASET_SOURCE,
  type FlashbackDatasetSourcePort,
} from './flashback-dataset.source.js';

/** Lần tạo kho không báo nhịp quá chừng này thì coi là bị ngắt. */
export const DATASET_STALE_BUILD_MS = 10 * 60_000;

/** Tỷ lệ nến lỗi tối đa của một mã; quá mức này thì dữ liệu của mã bị coi là hỏng. */
export const DATASET_MAX_BAD_RATIO = 0.2;

/** Số lần lấy giá trị khớp thật lỗi liên tiếp thì bỏ qua bước này cho cả lần tạo kho. */
const MATCHED_VALUE_BREAKER = 3;

/** Số mã tải song song. */
const DEFAULT_CONCURRENCY = 4;

/** Khoảng tối thiểu giữa hai lần ghi nhịp/tiến độ. */
const PROGRESS_INTERVAL_MS = 1_000;

/** Cặp (H, P) dùng để thống kê số điểm cắt trong nhật ký (phòng 60/30 phổ biến nhất). */
const LOG_CUT_VIEW = 60;
const LOG_CUT_PLAY = 30;

export interface DatasetBuildOptions {
  readonly trigger: DatasetTrigger;
  readonly requestedBy?: string | null;
  readonly now?: Date;
  readonly concurrency?: number;
  /** Không ghi gì vào CSDL: chỉ tải, tính và báo cáo (dùng cho `--dry-run` của lệnh CLI). */
  readonly dryRun?: boolean;
  readonly onProgress?: (progress: DatasetProgress) => void;
}

export type DatasetBuildResult =
  | {
      readonly status: 'active';
      readonly version: number;
      readonly okCount: number;
      readonly excludedCount: number;
      readonly durationMs: number;
      readonly log: DatasetBuildLog;
    }
  | {
      readonly status: 'failed';
      readonly version: number | null;
      readonly reason: string;
      readonly okCount: number;
      readonly excludedCount: number;
      readonly durationMs: number;
      readonly log: DatasetBuildLog;
    }
  | { readonly status: 'already_running'; readonly version: number };

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 220);

type SymbolOutcome =
  | {
      readonly ok: true;
      readonly symbol: string;
      readonly priceSource: string;
      readonly valueBasis: DatasetValueBasis;
      readonly cutCount: number;
    }
  | {
      readonly ok: false;
      readonly symbol: string;
      readonly reason: string;
      readonly barsCount: number;
      readonly firstDate: string | null;
      readonly lastDate: string | null;
    };

@Injectable()
export class FlashbackDatasetBuilder {
  private readonly logger = new Logger(FlashbackDatasetBuilder.name);

  constructor(
    @Inject(FLASHBACK_DATASET_REPOSITORY) private readonly repository: FlashbackDatasetRepository,
    @Inject(FLASHBACK_DATASET_SOURCE) private readonly source: FlashbackDatasetSourcePort,
    @Optional()
    @Inject(FLASHBACK_OPS_ALERTS)
    private readonly opsAlerts: FlashbackOpsAlertPort = noopFlashbackOpsAlerts,
  ) {}

  async build(options: DatasetBuildOptions): Promise<DatasetBuildResult> {
    const startedAt = options.now ?? new Date();
    const clockStart = Date.now();
    const today = vietnamDate(startedAt);
    const dryRun = options.dryRun === true;
    const { config } = readFlashbackDatasetConfig(await this.repository.readConfig());
    const minBars = datasetMinBars(config);

    if (!dryRun) {
      const interrupted = await this.repository.failStaleBuilds(DATASET_STALE_BUILD_MS);
      if (interrupted.length > 0) {
        await this.raise(
          'refresh_failed',
          `Lần tạo kho phiên bản ${interrupted.join(', ')} bị ngắt giữa chừng và đã được đánh dấu lỗi.`,
        );
      }
    }

    let progress: DatasetProgress = { ...EMPTY_DATASET_PROGRESS };
    let version = 0;
    if (!dryRun) {
      const created = await this.repository.createBuilding({
        trigger: options.trigger,
        requestedBy: options.requestedBy ?? null,
        maxGapSessions: config.maxGapSessions,
        progress,
      });
      if (!created) {
        const running = await this.repository.buildingVersion();
        return { status: 'already_running', version: running?.version ?? 0 };
      }
      version = created.version;
    }

    // Trạng thái chạy chung của các luồng tải.
    const state = { total: 0, done: 0, ok: 0, excluded: 0, matchedFailures: 0, matchedOff: false };
    let lastWrite = 0;
    const excluded: Array<{ symbol: string; reason: string }> = [];
    const sourceCounts = new Map<string, number>();
    const basis = { matched: 0, mixed: 0, approx: 0 };
    let calendarInfo: DatasetBuildLog['calendar'] = { sessions: 0, first: null, last: null, source: '' };
    let basketInfo: DatasetBuildLog['basket'] = { index: config.basket, count: 0, source: '' };
    let symbolsWithCut = 0;
    let totalCuts = 0;

    const publish = async (phase: DatasetProgress['phase'], force = false): Promise<void> => {
      progress = { phase, total: state.total, done: state.done, ok: state.ok, excluded: state.excluded };
      options.onProgress?.(progress);
      const now = Date.now();
      if (!force && now - lastWrite < PROGRESS_INTERVAL_MS) return;
      lastWrite = now;
      if (!dryRun) await this.repository.updateProgress(version, progress).catch(() => undefined);
    };

    const buildLog = (outcome: 'active' | 'failed', error?: string): DatasetBuildLog => {
      const durationMs = Date.now() - clockStart;
      return {
        started_at: startedAt.toISOString(),
        finished_at: new Date(startedAt.getTime() + durationMs).toISOString(),
        duration_ms: durationMs,
        outcome,
        ...(error ? { error } : {}),
        basket: basketInfo,
        calendar: calendarInfo,
        symbols: { ok: state.ok, excluded: state.excluded },
        excluded: [...excluded].sort((a, b) => a.symbol.localeCompare(b.symbol)),
        value_basis: { ...basis },
        sources: Object.fromEntries(sourceCounts),
        parameters: {
          min_symbols: config.minSymbols,
          min_bars: minBars,
          warmup_sessions: config.warmupSessions,
          max_gap_sessions: config.maxGapSessions,
        },
        cuts: {
          view_bars: LOG_CUT_VIEW,
          play_bars: LOG_CUT_PLAY,
          symbols_with_cut: symbolsWithCut,
          total_cuts: totalCuts,
        },
      };
    };

    const sourceLabel = (): string =>
      [...sourceCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
        .join('+') || 'none';

    const fail = async (reason: string, code: DatasetAlertCode): Promise<DatasetBuildResult> => {
      const log = buildLog('failed', reason);
      if (!dryRun && version > 0) {
        await this.repository
          .markFailed(version, {
            symbolsCount: state.ok,
            source: sourceLabel(),
            log,
            progress: { ...progress, phase: 'done' },
          })
          .catch((error: unknown) =>
            this.logger.error(`Flashback dataset: không ghi được trạng thái lỗi (${errorText(error)})`),
          );
      }
      this.logger.warn(`Flashback dataset v${version}: ${reason}`);
      if (!dryRun) await this.raise(code, reason);
      return {
        status: 'failed',
        version: version > 0 ? version : null,
        reason,
        okCount: state.ok,
        excludedCount: state.excluded,
        durationMs: log.duration_ms,
        log,
      };
    };

    try {
      await publish('basket', true);
      const basket = await this.source.basket(config.basket);
      basketInfo = { index: config.basket, count: basket.symbols.length, source: basket.source };
      if (basket.symbols.length < config.minSymbols) {
        throw new Error(
          `Rổ ${config.basket} chỉ có ${basket.symbols.length} mã, ít hơn ${config.minSymbols} mã tối thiểu`,
        );
      }
      state.total = basket.symbols.length;

      await publish('calendar', true);
      const calendarData = await this.source.calendar();
      const calendar = new TradingCalendar(calendarData.dates);
      calendarInfo = {
        sessions: calendar.size,
        first: calendar.first,
        last: calendar.last,
        source: calendarData.source,
      };

      await publish('symbols', true);
      const cutParams: CutParams = {
        warmup: config.warmupSessions,
        viewBars: LOG_CUT_VIEW,
        playBars: LOG_CUT_PLAY,
        cutoffDay: cutoffDayFor(today, config.minMonthsAgo),
        maxZeroVolumeRatio: config.maxZeroVolumeRatio,
        minLiquidityVnd: config.minLiquidityVnd,
        minDailyVolatility: config.minDailyVolatility,
      };

      const processSymbol = async (symbol: string): Promise<SymbolOutcome> => {
        const noData = (reason: string, barsCount = 0, first: string | null = null, last: string | null = null): SymbolOutcome => ({
          ok: false,
          symbol,
          reason,
          barsCount,
          firstDate: first,
          lastDate: last,
        });
        // Giá trị khớp thật (VCI) chạy song song với nến; lỗi thì mã đó dùng giá trị xấp xỉ.
        const wantMatched = typeof this.source.matchedValues === 'function' && !state.matchedOff;
        const matchedPromise = wantMatched
          ? this.source.matchedValues!(symbol, today).then(
              (values) => ({ ok: true as const, values }),
              () => ({ ok: false as const, values: null }),
            )
          : Promise.resolve({ ok: true as const, values: null });
        let history;
        try {
          history = await this.source.history(symbol, today, config.priceSources);
        } catch (error) {
          return noData(`Lỗi tải dữ liệu: ${errorText(error)}`);
        }
        const matched = await matchedPromise;
        if (wantMatched) {
          if (matched.ok) state.matchedFailures = 0;
          else if ((state.matchedFailures += 1) >= MATCHED_VALUE_BREAKER) state.matchedOff = true;
        }
        const rows = history.rows;
        if (rows.length < minBars) {
          return noData(
            `Chưa đủ lịch sử (${rows.length}/${minBars} phiên)`,
            rows.length,
            rows[0]?.date ?? null,
            rows.at(-1)?.date ?? null,
          );
        }
        const computed = computeBars(rows, calendar, matched.values);
        if (computed.badCount / computed.bars.length > DATASET_MAX_BAD_RATIO) {
          return noData(
            `Lỗi dữ liệu: ${computed.badCount}/${computed.bars.length} nến lỗi`,
            rows.length,
            rows[0]!.date,
            rows.at(-1)!.date,
          );
        }
        const prefix = computePrefix(computed.bars, config.maxGapSessions);
        if (!dryRun) {
          await this.repository.saveSymbol(
            version,
            {
              symbol,
              priceSource: history.source,
              valueBasis: computed.valueBasis,
              badCount: computed.badCount,
            },
            computed.bars,
            prefix,
          );
        }
        return {
          ok: true,
          symbol,
          priceSource: history.source,
          valueBasis: computed.valueBasis,
          cutCount: listValidCuts(prefix, cutParams).length,
        };
      };

      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < basket.symbols.length) {
          const symbol = basket.symbols[next++]!;
          let outcome: SymbolOutcome;
          try {
            outcome = await processSymbol(symbol);
          } catch (error) {
            // Lỗi ghi một mã (ví dụ giá trị ngoài phạm vi cột): loại mã, các mã khác chạy tiếp.
            outcome = {
              ok: false,
              symbol,
              reason: `Lỗi xử lý dữ liệu: ${errorText(error)}`,
              barsCount: 0,
              firstDate: null,
              lastDate: null,
            };
          }
          state.done += 1;
          if (outcome.ok) {
            state.ok += 1;
            sourceCounts.set(outcome.priceSource, (sourceCounts.get(outcome.priceSource) ?? 0) + 1);
            basis[outcome.valueBasis] += 1;
            if (outcome.cutCount > 0) symbolsWithCut += 1;
            totalCuts += outcome.cutCount;
          } else {
            state.excluded += 1;
            excluded.push({ symbol, reason: outcome.reason });
            if (!dryRun) {
              await this.repository.saveExcluded(version, {
                symbol,
                barsCount: outcome.barsCount,
                firstDate: outcome.firstDate,
                lastDate: outcome.lastDate,
                reason: outcome.reason,
              });
            }
          }
          await publish('symbols');
        }
      };
      const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 8));
      await Promise.all(Array.from({ length: concurrency }, worker));

      await publish('finalize', true);
      if (state.ok < config.minSymbols) {
        return await fail(
          `Kho mới chỉ có ${state.ok} mã hợp lệ, ít hơn ${config.minSymbols} mã tối thiểu; giữ kho đang dùng`,
          'too_few_symbols',
        );
      }
      const log = buildLog('active');
      if (!dryRun) {
        await this.repository.activate(version, {
          symbolsCount: state.ok,
          source: sourceLabel(),
          log,
          progress: { ...progress, phase: 'done' },
        });
      }
      await publish('done', true);
      this.logger.log(
        `Flashback dataset v${version}: ${state.ok} mã hợp lệ, ${state.excluded} mã bị loại, ${log.duration_ms} ms`,
      );
      return {
        status: 'active',
        version,
        okCount: state.ok,
        excludedCount: state.excluded,
        durationMs: log.duration_ms,
        log,
      };
    } catch (error) {
      return fail(`Làm mới kho thất bại: ${errorText(error)}`, 'refresh_failed');
    }
  }

  /** Ghi cảnh báo mức Cao vào nhật ký (trang quản trị) và gửi ra kênh cảnh báo kỹ thuật. */
  private async raise(code: DatasetAlertCode, message: string): Promise<void> {
    try {
      await this.repository.appendAlert('high', code, message);
    } catch (error) {
      this.logger.error(`Flashback dataset: không ghi được cảnh báo (${errorText(error)})`);
    }
    await this.opsAlerts.send({ level: 'high', message: `Kho dữ liệu: ${message}` });
  }
}
