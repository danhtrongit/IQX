/**
 * Tính sẵn mẫu nến của mọi phiên của mọi mã trong kho Flashback (Candle Dojo v1.3 §3, §4).
 *
 * Với từng mã của một phiên bản kho:
 * 1. đọc toàn bộ phiên theo `idx` tăng dần từ phiên 0 (giá đã điều chỉnh, đúng giá người chơi thấy);
 * 2. lấy giá gốc và giá tham chiếu của sở cho 4 thẻ Việt Nam (`fb_dataset_raw`); lấy lỗi thì dùng lại
 *    giá gốc đã lưu, không có thì phiên đó không xét 4 thẻ này (43 thẻ còn lại vẫn xét);
 * 3. `prep()` một lần trên cả chuỗi (EMA, ATR tuần tự từ phiên 0), rồi `pick()` ở từng phiên: kết quả
 *    chỉ dùng các phiên ≤ i nên không nhìn trước và không đổi theo điểm cắt;
 * 4. bỏ kết quả tại `i` nếu trong `[i − n + 1 − 25, i]` (mẫu cộng 25 phiên bối cảnh) có phiên `bad = 1`
 *    hoặc `gap_before > 5`;
 * 5. ghi giá gốc và mẫu của mã trong một transaction (chạy lại không tạo dòng trùng).
 *
 * Bộ nhận diện là bản chuẩn dùng chung của Candle Dojo (`candle-dojo/shared/detector.ts`), không sửa
 * định nghĩa. Một lần chạy được ghi vào `fb_dataset_pattern_runs`; lần `done` mới nhất của phiên bản
 * là lần được dùng lúc chơi. Mã lỗi vẫn dùng cho ván nhưng không có thẻ; chỉ khi không mã nào tính
 * được thì cả lần chạy `failed` (kho mới không được kích hoạt).
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import { cdCard } from '../candle-dojo/shared/cards.js';
import {
  CANDLE_DETECTOR_VERSION,
  pick,
  prep,
  type CdBar,
  type CdRawBar,
} from '../candle-dojo/shared/detector.js';
import { vietnamDate } from './flashback.round-builder.js';
import {
  FLASHBACK_DATASET_SOURCE,
  type DatasetRawPrice,
  type FlashbackDatasetSourcePort,
} from './flashback-dataset.source.js';
import {
  FLASHBACK_PATTERNS_REPOSITORY,
  FlashbackPatternsRepository,
  type PatternExchange,
  type PatternRawRow,
  type PatternRow,
  type PatternRunFailure,
  type PatternRunLog,
  type PatternRunTrigger,
  type PatternSeriesBar,
} from './flashback-patterns.repository.js';

/** Token của bước 2b "Tính mẫu nến" mà bộ dựng kho gọi (tuỳ chọn: thiếu thì bộ dựng bỏ qua bước này). */
export const FLASHBACK_PATTERN_STEP = Symbol('FLASHBACK_PATTERN_STEP');

/** Số phiên bối cảnh trước mẫu mà dữ liệu xấu cũng làm mẫu bị loại (v1.3 §3.2 bước 5). */
export const PATTERN_CONTEXT_SESSIONS = 25;

/** Khoảng nghỉ lớn nhất (`gap_before`) còn chấp nhận trong cửa sổ của một mẫu (v1.3 §3.2 bước 5). */
export const PATTERN_MAX_GAP_SESSIONS = 5;

/** Lần tính không báo nhịp quá chừng này thì coi là bị ngắt. */
export const PATTERN_STALE_RUN_MS = 10 * 60_000;

const DEFAULT_CONCURRENCY = 4;
const PROGRESS_INTERVAL_MS = 1_000;
const RAW_SOURCE_LABEL = 'VCI:price-history:dong:raw';

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 220);

// ------------------------------------------------------------------ logic thuần

export interface SymbolPatternResult {
  readonly patterns: PatternRow[];
  /** Số phiên không có giá gốc (không xét 4 thẻ Việt Nam). */
  readonly missingRawSessions: number;
}

/**
 * Mẫu nến của mọi phiên của một mã (v1.3 §3.2). `raw` là giá gốc theo `idx` (thiếu phiên nào thì phiên
 * đó không xét 4 thẻ Việt Nam); luôn truyền chế độ giá gốc cho bộ nhận diện để không bao giờ xét 4 thẻ
 * này trên giá đã điều chỉnh.
 */
export function computeSymbolPatterns(
  bars: readonly PatternSeriesBar[],
  raw: ReadonlyMap<number, PatternRawRow>,
  exchange: PatternExchange,
): SymbolPatternResult {
  const total = bars.length;
  const series: CdBar[] = [];
  const rawSeries: Array<CdRawBar | null> = [];
  const dirty = new Int32Array(total + 1);
  let missingRawSessions = 0;
  for (let index = 0; index < total; index += 1) {
    const bar = bars[index]!;
    if (bar.idx !== index) throw new RangeError(`Phiên thứ ${index} có idx ${bar.idx}: chuỗi phiên không liên tục`);
    series.push({ o: bar.open, h: bar.high, l: bar.low, c: bar.close });
    const row = raw.get(bar.idx);
    if (row) rawSeries.push({ o: row.open, h: row.high, l: row.low, c: row.close, ref: row.ref, exchange });
    else {
      rawSeries.push(null);
      missingRawSessions += 1;
    }
    dirty[index + 1] = dirty[index]! + (bar.bad === 1 || bar.gapBefore > PATTERN_MAX_GAP_SESSIONS ? 1 : 0);
  }
  const prepared = prep(series, rawSeries);
  const patterns: PatternRow[] = [];
  for (let index = 1; index < total; index += 1) {
    const match = pick(prepared, index);
    if (!match) continue;
    const from = Math.max(0, index - match.n + 1 - PATTERN_CONTEXT_SESSIONS);
    if (dirty[index + 1]! - dirty[from]! > 0) continue;
    const card = cdCard(match.id);
    if (!card) throw new RangeError(`Bộ nhận diện trả thẻ không có trong danh mục: ${match.id}`);
    patterns.push({
      idx: index,
      date: bars[index]!.date,
      cardId: match.id,
      cardN: match.n,
      tier: card.tier,
    });
  }
  return { patterns, missingRawSessions };
}

// ------------------------------------------------------------------ dịch vụ

export interface PatternRunProgress {
  readonly done: number;
  readonly total: number;
  readonly patterns: number;
}

export interface PatternRunOptions {
  readonly version: number;
  readonly trigger: PatternRunTrigger;
  readonly requestedBy?: string | null;
  readonly now?: Date;
  readonly concurrency?: number;
  /** Mặc định `CANDLE_DETECTOR_VERSION` của bộ nhận diện đang chạy. */
  readonly detectorVersion?: number;
  /** Không ghi gì vào CSDL (không tạo lần chạy, không ghi giá gốc và mẫu): chỉ tải, tính và báo cáo. */
  readonly dryRun?: boolean;
  readonly onProgress?: (progress: PatternRunProgress) => void;
}

export type PatternRunResult =
  | {
      readonly status: 'done' | 'failed';
      /** 0 khi chạy thử (`dryRun`): không có dòng nhật ký. */
      readonly runId: number;
      readonly version: number;
      readonly detectorVersion: number;
      readonly symbolsDone: number;
      readonly symbolsTotal: number;
      readonly patternsCount: number;
      readonly failed: readonly PatternRunFailure[];
      readonly reason: string | null;
      readonly durationMs: number;
      readonly log: PatternRunLog;
    }
  | { readonly status: 'already_running'; readonly version: number };

/** Cổng của bước 2b mà bộ dựng kho dùng (để test thay bằng bản giả). */
export interface FlashbackPatternStepPort {
  run(options: PatternRunOptions): Promise<PatternRunResult>;
}

type SymbolOutcome = {
  readonly patterns: number;
  readonly sessions: number;
  readonly missingRawSessions: number;
  readonly withRaw: boolean;
  readonly rawError: string | null;
  readonly reusedRaw: boolean;
  /** Số mẫu theo từng thẻ của mã. */
  readonly cards: ReadonlyMap<string, number>;
};

@Injectable()
export class FlashbackPatternsCompute implements FlashbackPatternStepPort {
  private readonly logger = new Logger(FlashbackPatternsCompute.name);

  constructor(
    @Inject(FLASHBACK_PATTERNS_REPOSITORY) private readonly repository: FlashbackPatternsRepository,
    @Inject(FLASHBACK_DATASET_SOURCE) private readonly source: FlashbackDatasetSourcePort,
  ) {}

  async run(options: PatternRunOptions): Promise<PatternRunResult> {
    const startedAt = Date.now();
    const detectorVersion = options.detectorVersion ?? CANDLE_DETECTOR_VERSION;
    const today = vietnamDate(options.now ?? new Date());
    const version = options.version;
    const dryRun = options.dryRun === true;

    if (!dryRun) await this.repository.failStaleRuns(PATTERN_STALE_RUN_MS);
    const symbols = await this.repository.okSymbols(version);
    const run = dryRun
      ? { id: 0 }
      : await this.repository.createRun({
          version,
          detectorVersion,
          trigger: options.trigger,
          requestedBy: options.requestedBy ?? null,
          symbolsTotal: symbols.length,
        });
    if (!run) return { status: 'already_running', version };

    const failed: PatternRunFailure[] = [];
    const rawErrors: PatternRunFailure[] = [];
    const reused: string[] = [];
    const totals = { done: 0, ok: 0, patterns: 0, sessions: 0, missingRaw: 0, withRaw: 0, withoutRaw: 0 };
    const cardCounts = new Map<string, number>();
    let lastTouch = 0;

    const log = (error?: string): PatternRunLog => ({
      failed: [...failed].sort((a, b) => a.symbol.localeCompare(b.symbol)),
      raw: {
        source: RAW_SOURCE_LABEL,
        symbols_with_raw: totals.withRaw,
        symbols_without_raw: totals.withoutRaw,
        errors: [...rawErrors].sort((a, b) => a.symbol.localeCompare(b.symbol)),
        reused: [...reused].sort(),
      },
      missing_raw_sessions: totals.missingRaw,
      sessions: totals.sessions,
      cards: Object.fromEntries([...cardCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      timings: { duration_ms: Date.now() - startedAt },
      ...(error ? { error } : {}),
    });

    const finish = async (
      status: 'done' | 'failed',
      reason: string | null,
    ): Promise<PatternRunResult> => {
      const finalLog = log(reason ?? undefined);
      if (!dryRun) {
        await this.repository.finishRun(run.id, {
          status,
          symbolsDone: totals.ok,
          patternsCount: totals.patterns,
          log: finalLog,
        });
      }
      this.logger.log(
        `Flashback patterns v${version} (bộ nhận diện ${detectorVersion}): ${status}, ${totals.ok}/${symbols.length} mã, ${totals.patterns} mẫu, ${failed.length} mã lỗi, ${finalLog.timings!.duration_ms} ms`,
      );
      return {
        status,
        runId: run.id,
        version,
        detectorVersion,
        symbolsDone: totals.ok,
        symbolsTotal: symbols.length,
        patternsCount: totals.patterns,
        failed: finalLog.failed ?? [],
        reason,
        durationMs: finalLog.timings!.duration_ms,
        log: finalLog,
      };
    };

    try {
      if (symbols.length === 0) return await finish('failed', 'Phiên bản kho không có mã hợp lệ để tính mẫu');
      const exchanges = await this.repository.exchanges(symbols);
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < symbols.length) {
          const symbol = symbols[next++]!;
          try {
            const outcome = await this.processSymbol({
              version,
              symbol,
              detectorVersion,
              today,
              dryRun,
              exchange: exchanges.get(symbol.toUpperCase()) ?? 'HOSE',
            });
            for (const [cardId, count] of outcome.cards) cardCounts.set(cardId, (cardCounts.get(cardId) ?? 0) + count);
            totals.ok += 1;
            totals.patterns += outcome.patterns;
            totals.sessions += outcome.sessions;
            totals.missingRaw += outcome.missingRawSessions;
            if (outcome.withRaw) totals.withRaw += 1;
            else totals.withoutRaw += 1;
            if (outcome.reusedRaw) reused.push(symbol);
            if (outcome.rawError) rawErrors.push({ symbol, reason: outcome.rawError });
          } catch (error) {
            failed.push({ symbol, reason: errorText(error) });
          }
          totals.done += 1;
          options.onProgress?.({ done: totals.done, total: symbols.length, patterns: totals.patterns });
          const now = Date.now();
          if (!dryRun && now - lastTouch >= PROGRESS_INTERVAL_MS) {
            lastTouch = now;
            await this.repository
              .touchRun(run.id, { symbolsDone: totals.ok, patternsCount: totals.patterns })
              .catch(() => undefined);
          }
        }
      };
      const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 8));
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (totals.ok === 0)
        return await finish('failed', `Không tính được mẫu nến cho mã nào (${failed.length} mã lỗi)`);
      return await finish('done', null);
    } catch (error) {
      const reason = `Tính mẫu nến thất bại: ${errorText(error)}`;
      this.logger.warn(`Flashback patterns v${version}: ${reason}`);
      try {
        return await finish('failed', reason);
      } catch (finishError) {
        this.logger.error(`Flashback patterns: không ghi được trạng thái lỗi (${errorText(finishError)})`);
        throw error;
      }
    }
  }

  /** Giá gốc → mẫu → ghi một mã. Ném lỗi nếu mã không tính được (mã đó không có thẻ). */
  private async processSymbol(input: {
    version: number;
    symbol: string;
    detectorVersion: number;
    today: string;
    dryRun: boolean;
    exchange: PatternExchange;
  }): Promise<SymbolOutcome> {
    const { version, symbol } = input;
    const bars = await this.repository.loadSeries(version, symbol);
    if (bars.length === 0) throw new Error('Mã không có phiên nào trong kho');

    let fetched: ReadonlyMap<string, DatasetRawPrice> | null = null;
    let rawError: string | null = null;
    if (typeof this.source.rawPrices === 'function') {
      try {
        fetched = await this.source.rawPrices(symbol, input.today);
        if (!fetched) rawError = 'Nguồn không có giá gốc của mã';
      } catch (error) {
        rawError = errorText(error);
      }
    } else {
      rawError = 'Nguồn dữ liệu không có giá gốc';
    }

    // Giá gốc khớp theo NGÀY với phiên của kho; phiên thiếu thì không xét 4 thẻ Việt Nam.
    let fresh: PatternRawRow[] | null = null;
    const prices = fetched;
    if (prices) {
      fresh = bars.flatMap((bar) => {
        const price = prices.get(bar.date);
        return price ? [{ idx: bar.idx, ...price }] : [];
      });
      if (fresh.length === 0) {
        rawError = 'Giá gốc của nguồn không khớp ngày nào của kho';
        fresh = null;
      }
    }

    let exchange = input.exchange;
    let effective: PatternRawRow[];
    let reusedRaw = false;
    if (fresh) {
      effective = fresh;
    } else {
      // Không lấy được lần này: dùng lại giá gốc đã lưu (không xoá), nếu có.
      const stored = await this.repository.loadRaw(version, symbol);
      effective = stored.rows;
      reusedRaw = stored.rows.length > 0;
      if (reusedRaw) exchange = stored.exchange;
    }

    const result = computeSymbolPatterns(bars, new Map(effective.map((row) => [row.idx, row])), exchange);
    if (!input.dryRun) {
      await this.repository.saveSymbol({
        version,
        symbol,
        detectorVersion: input.detectorVersion,
        exchange,
        raw: fresh,
        patterns: result.patterns,
      });
    }
    const cards = new Map<string, number>();
    for (const pattern of result.patterns) cards.set(pattern.cardId, (cards.get(pattern.cardId) ?? 0) + 1);
    return {
      patterns: result.patterns.length,
      sessions: bars.length,
      missingRawSessions: result.missingRawSessions,
      withRaw: effective.length > 0,
      rawError,
      reusedRaw,
      cards,
    };
  }
}
