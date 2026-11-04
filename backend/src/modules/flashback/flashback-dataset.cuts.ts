/**
 * Cắt đề từ kho dữ liệu khi chủ phòng bấm Bắt đầu (IQX-Flashback-SPEC-DuLieu.md §3).
 *
 * - Mảng cộng dồn của phiên bản `active` được nạp vào bộ nhớ một lần (khi server khởi động hoặc khi
 *   kho đổi phiên bản); bắt đầu ván chỉ đọc đúng `W + H + P` nến của đoạn đã chọn từ `fb_dataset_bars`.
 * - Danh sách điểm cắt hợp lệ của mọi mã theo khoá `(phiên bản, H, P, ngày hôm nay, tham số)` được
 *   giữ trong bộ nhớ: phòng sau cùng cặp (H, P) trong ngày không quét lại; đổi ngày thì tính lại vì
 *   điều kiện "cách hôm nay 12 tháng" phụ thuộc hôm nay.
 * - Chọn mã ngẫu nhiên đều trong các mã có ít nhất một điểm cắt, rồi điểm cắt ngẫu nhiên đều của
 *   mã đó, bằng `crypto.randomInt` (CSPRNG). Không thử lại, không nới điều kiện, không chống lặp mã.
 * - Không có điểm cắt nào: trả `null` (ván không bắt đầu, chưa trừ xu) và cảnh báo quản trị.
 */

import { randomInt } from 'node:crypto';

import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';

import {
  FLASHBACK_OPS_ALERTS,
  noopFlashbackOpsAlerts,
  type FlashbackOpsAlertPort,
} from './flashback.alerts.js';
import { vietnamDate } from './flashback.round-builder.js';
import type { FlashbackBar } from './flashback.types.js';
import {
  datasetCutConfigKey,
  DATASET_MAX_PHASE_BARS,
  DATASET_MIN_PHASE_BARS,
  readFlashbackDatasetConfig,
  type FlashbackDatasetConfig,
} from './flashback-dataset.config.js';
import {
  cutLength,
  cutoffDayFor,
  listValidCuts,
  pickUniformCut,
  splitCutBars,
  type CutParams,
  type DatasetPrefix,
  type RandomInt,
  type SymbolCuts,
} from './flashback-dataset.logic.js';
import {
  FLASHBACK_DATASET_REPOSITORY,
  FlashbackDatasetRepository,
  type DatasetAlertCode,
  type DatasetCutRow,
} from './flashback-dataset.repository.js';

/** Bộ sinh số ngẫu nhiên: `crypto.randomInt` (CSPRNG) trong sản xuất, bản giả trong test. */
export const FLASHBACK_DATASET_RANDOM = Symbol('FLASHBACK_DATASET_RANDOM');

/** Cặp (H, P) tính sẵn lúc khởi động. */
const WARM_VIEW_BARS = 60;
const WARM_PLAY_BARS = 30;

/** Số cặp (H, P) tối đa giữ trong bộ nhớ trong cùng một ngày. */
const MAX_CACHED_PAIRS = 64;

/** Nạp mảng cộng dồn song song chừng này mã một lúc. */
const LOAD_CONCURRENCY = 4;

/** Không lặp lại cùng một cảnh báo trong chừng này phút. */
const ALERT_COOLDOWN_MINUTES = 30;

/** Dữ liệu một ván đã cắt (khớp `FbMatchDataset` của phòng chơi). */
export interface CutResult {
  readonly symbol: string;
  readonly warmupBars: readonly FlashbackBar[];
  readonly bars: readonly FlashbackBar[];
  readonly priceSource: string;
  readonly datasetVersion: number;
  readonly startIdx: number;
}

interface LoadedDataset {
  readonly version: number;
  readonly prefixes: ReadonlyMap<string, DatasetPrefix>;
  readonly sources: ReadonlyMap<string, string>;
}

interface CutIndex {
  readonly candidates: readonly SymbolCuts[];
  readonly eligibleSymbols: number;
  readonly totalCuts: number;
}

export function toFlashbackBar(row: DatasetCutRow): FlashbackBar {
  return { d: row.date, o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume };
}

@Injectable()
export class FlashbackDatasetCuts implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlashbackDatasetCuts.name);
  private loaded: LoadedDataset | null = null;
  private loading: { version: number; promise: Promise<LoadedDataset> } | null = null;
  private readonly cutCache = new Map<string, CutIndex>();
  private cacheEpoch = '';

  constructor(
    @Inject(FLASHBACK_DATASET_REPOSITORY) private readonly repository: FlashbackDatasetRepository,
    @Optional()
    @Inject(FLASHBACK_OPS_ALERTS)
    private readonly opsAlerts: FlashbackOpsAlertPort = noopFlashbackOpsAlerts,
    @Optional()
    @Inject(FLASHBACK_DATASET_RANDOM)
    private readonly random: RandomInt = (max) => randomInt(max),
  ) {}

  /** Tính sẵn kho đang dùng và cặp 60/30 khi khởi động; không chặn khởi động, lỗi chỉ ghi log. */
  onApplicationBootstrap(): void {
    void this.warmUp().catch((error: unknown) =>
      this.logger.warn(
        `Flashback dataset: chưa tính sẵn được kho khi khởi động (${error instanceof Error ? error.message : 'lỗi'})`,
      ),
    );
  }

  async warmUp(now: Date = new Date()): Promise<void> {
    const version = await this.repository.activeVersionNumber();
    if (version === null) return;
    const loaded = await this.ensureLoaded(version);
    const config = await this.config();
    this.cutIndex(loaded, config, WARM_VIEW_BARS, WARM_PLAY_BARS, vietnamDate(now));
  }

  /**
   * Cắt một đoạn `W + H + P` phiên liên tục cho phòng (H, P). `null` nếu không có điểm cắt hợp lệ
   * (đã ghi cảnh báo, ván không bắt đầu).
   */
  async pick(now: Date, viewBars: number, playBars: number): Promise<CutResult | null> {
    this.assertPhase('viewBars', viewBars);
    this.assertPhase('playBars', playBars);
    try {
      return await this.cut(now, viewBars, playBars);
    } catch (error) {
      // Lỗi hạ tầng (CSDL, nạp kho): không bắt đầu ván, chưa trừ xu, báo quản trị.
      await this.alert(
        'data_error',
        `Không cắt được dữ liệu ván ${viewBars}/${playBars}: ${error instanceof Error ? error.message : 'lỗi không rõ'}`.slice(0, 400),
      );
      return null;
    }
  }

  private async cut(now: Date, viewBars: number, playBars: number): Promise<CutResult | null> {
    const version = await this.repository.activeVersionNumber();
    if (version === null) {
      await this.alert(
        'no_active_version',
        'Chưa có phiên bản kho dữ liệu đang dùng nên không bắt đầu được ván. Hãy chạy "Làm mới kho".',
      );
      return null;
    }
    const loaded = await this.ensureLoaded(version);
    const config = await this.config();
    const today = vietnamDate(now);
    const index = this.cutIndex(loaded, config, viewBars, playBars, today);
    const picked = pickUniformCut(index.candidates, this.random);
    if (!picked) {
      await this.alert(
        'no_cut',
        `Không tìm được điểm cắt hợp lệ cho phòng ${viewBars}/${playBars} (phiên bản kho ${version}, ${loaded.prefixes.size} mã). Ván không bắt đầu, chưa trừ xu.`,
      );
      return null;
    }
    const length = cutLength({ warmup: config.warmupSessions, viewBars, playBars });
    const rows = await this.repository.loadBars(version, picked.symbol, picked.startIdx, length);
    if (rows.length !== length || rows[0]?.idx !== picked.startIdx) {
      await this.alert(
        'data_error',
        `Kho dữ liệu phiên bản ${version} thiếu nến của một điểm cắt đã chọn (${rows.length}/${length} phiên). Ván không bắt đầu.`,
      );
      return null;
    }
    const { warmupBars, bars } = splitCutBars(rows.map(toFlashbackBar), config.warmupSessions);
    return {
      symbol: picked.symbol,
      warmupBars,
      bars,
      priceSource: `dataset:v${version}:${loaded.sources.get(picked.symbol) ?? 'unknown'}`,
      datasetVersion: version,
      startIdx: picked.startIdx,
    };
  }

  /**
   * Dựng lại đúng dữ liệu của một ván đã chơi từ `(dataset_version, symbol, start_idx, W, H, P)`
   * (§3.5): dùng để chấm điểm, xem lại và kiểm tra khiếu nại mà không cần bản chép của nến.
   */
  async rebuild(input: {
    version: number;
    symbol: string;
    startIdx: number;
    warmup: number;
    viewBars: number;
    playBars: number;
  }): Promise<{ warmupBars: FlashbackBar[]; bars: FlashbackBar[] } | null> {
    const length = cutLength({
      warmup: input.warmup,
      viewBars: input.viewBars,
      playBars: input.playBars,
    });
    const rows = await this.repository.loadBars(input.version, input.symbol, input.startIdx, length);
    if (rows.length !== length) return null;
    return splitCutBars(rows.map(toFlashbackBar), input.warmup);
  }

  /** Số mã có ít nhất một điểm cắt hợp lệ của (H, P) hôm nay, cho trang quản trị và test. */
  async eligibleSymbols(now: Date, viewBars: number, playBars: number): Promise<number | null> {
    const version = await this.repository.activeVersionNumber();
    if (version === null) return null;
    const loaded = await this.ensureLoaded(version);
    const config = await this.config();
    return this.cutIndex(loaded, config, viewBars, playBars, vietnamDate(now)).eligibleSymbols;
  }

  // ------------------------------------------------------------------ nội bộ

  private assertPhase(name: string, value: number): void {
    if (!Number.isInteger(value) || value < DATASET_MIN_PHASE_BARS || value > DATASET_MAX_PHASE_BARS)
      throw new RangeError(
        `${name} phải là số nguyên từ ${DATASET_MIN_PHASE_BARS} đến ${DATASET_MAX_PHASE_BARS}`,
      );
  }

  private async config(): Promise<FlashbackDatasetConfig> {
    return readFlashbackDatasetConfig(await this.repository.readConfig()).config;
  }

  private cutIndex(
    loaded: LoadedDataset,
    config: FlashbackDatasetConfig,
    viewBars: number,
    playBars: number,
    today: string,
  ): CutIndex {
    const epoch = `${loaded.version}|${today}|${datasetCutConfigKey(config)}`;
    if (epoch !== this.cacheEpoch) {
      this.cutCache.clear();
      this.cacheEpoch = epoch;
    }
    const key = `${viewBars}|${playBars}`;
    const cached = this.cutCache.get(key);
    if (cached) return cached;
    const params: CutParams = {
      warmup: config.warmupSessions,
      viewBars,
      playBars,
      cutoffDay: cutoffDayFor(today, config.minMonthsAgo),
      maxZeroVolumeRatio: config.maxZeroVolumeRatio,
      minLiquidityVnd: config.minLiquidityVnd,
      minDailyVolatility: config.minDailyVolatility,
    };
    const candidates: SymbolCuts[] = [];
    let totalCuts = 0;
    for (const [symbol, prefix] of loaded.prefixes) {
      const cuts = listValidCuts(prefix, params);
      candidates.push({ symbol, cuts });
      totalCuts += cuts.length;
    }
    const index: CutIndex = {
      candidates,
      eligibleSymbols: candidates.filter((candidate) => candidate.cuts.length > 0).length,
      totalCuts,
    };
    if (this.cutCache.size >= MAX_CACHED_PAIRS) {
      const oldest = this.cutCache.keys().next().value;
      if (oldest !== undefined) this.cutCache.delete(oldest);
    }
    this.cutCache.set(key, index);
    return index;
  }

  private ensureLoaded(version: number): Promise<LoadedDataset> {
    if (this.loaded?.version === version) return Promise.resolve(this.loaded);
    if (this.loading?.version === version) return this.loading.promise;
    const promise = this.load(version).then(
      (loaded) => {
        this.loaded = loaded;
        if (this.loading?.promise === promise) this.loading = null;
        return loaded;
      },
      (error: unknown) => {
        if (this.loading?.promise === promise) this.loading = null;
        throw error;
      },
    );
    this.loading = { version, promise };
    return promise;
  }

  private async load(version: number): Promise<LoadedDataset> {
    const started = Date.now();
    const symbols = (await this.repository.listSymbols(version)).filter((row) => row.status === 'ok');
    const prefixes = new Map<string, DatasetPrefix>();
    const sources = new Map<string, string>();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < symbols.length) {
        const row = symbols[next++]!;
        const prefix = await this.repository.loadPrefix(version, row.symbol);
        if (!prefix) continue;
        prefixes.set(row.symbol, prefix);
        sources.set(row.symbol, row.priceSource ?? 'unknown');
      }
    };
    await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
    // Giữ thứ tự mã ổn định (kết quả của hai luồng nạp có thể xen kẽ).
    const ordered = new Map([...prefixes.entries()].sort(([a], [b]) => a.localeCompare(b)));
    this.logger.log(
      `Flashback dataset: nạp phiên bản ${version} (${ordered.size} mã) trong ${Date.now() - started} ms`,
    );
    return { version, prefixes: ordered, sources };
  }

  private async alert(code: DatasetAlertCode, message: string): Promise<void> {
    this.logger.warn(`Flashback dataset: ${message}`);
    try {
      if (await this.repository.hasRecentAlert(code, ALERT_COOLDOWN_MINUTES)) return;
      await this.repository.appendAlert('high', code, message);
    } catch (error) {
      this.logger.error(
        `Flashback dataset: không ghi được cảnh báo (${error instanceof Error ? error.message : 'lỗi'})`,
      );
    }
    await this.opsAlerts.send({ level: 'high', message: `Kho dữ liệu: ${message}` });
  }
}
