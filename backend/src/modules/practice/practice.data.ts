import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { QUANT_MARKET_DATA, type QuantMarketDataProvider } from '../quant/quant.types.js';
import { canonicalJson, sha256Hex, type Bar } from '../quant/v2/index.js';
import {
  PRACTICE_STORE,
  type FrozenBarRow,
  type PracticeStoreProvider,
  type SymbolDataRow,
} from './practice.repository.js';
import { PRACTICE_SET, type PracticeSet } from './practice.set.js';

/** Hard cap on bars requested from the provider (warmup + observation + 24 months fit easily). */
const MAX_BARS = 4_000;

export type PracticeDataErrorCode = 'DATA_UNAVAILABLE' | 'DATA_INSUFFICIENT';

/** Raised when frozen data cannot be produced. Messages never mention a symbol or a date. */
export class PracticeDataError extends Error {
  constructor(
    readonly code: PracticeDataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PracticeDataError';
  }
}

/**
 * Chronological calendar of one symbol made ONLY of sessions present in the source data
 * (no synthetic bars). Indices are global positions inside `bars`; all dates stay on the server.
 */
export type PracticeCalendar = {
  bars: Bar[];
  /** First observation session (global index). Warmup bars precede it. */
  observationStart: number;
  /** First test session = "Phiên 1". The observation window ends right before it ("Phiên 0"). */
  firstTest: number;
  /** Last test session. Nothing after it is ever read. */
  lastTest: number;
};

/** Nest injection token of the frozen-data source used by the service (stubbed in tests). */
export const PRACTICE_DATA = Symbol('PRACTICE_DATA');

export interface PracticeCaseDataPort {
  /** Frozen bars of a hidden symbol; throws `PracticeDataError` when unavailable. */
  load(symbol: string): Promise<LoadedCase>;
}

export type LoadedCase = {
  data_version: string;
  calendar: PracticeCalendar;
  notes: string[];
};

/** Public codes of data caveats; they carry no symbol and no date. */
export const DATA_NOTE_CODES = ['warmup_short', 'prices_not_adjusted', 'rows_skipped'] as const;

/** Session label of a global index: Phiên 1 = first test session, 0 = last observation, <0 before. */
export const sessionOf = (calendar: PracticeCalendar, index: number): number =>
  index - calendar.firstTest + 1;

/** Position of each date range inside frozen rows; throws when the data is too thin. */
export function buildCalendar(rows: readonly FrozenBarRow[], set: PracticeSet): PracticeCalendar {
  const bars: Bar[] = rows.map(([date, open, high, low, close, volume]) => ({
    date,
    open,
    high,
    low,
    close,
    volume,
  }));
  const observationStart = bars.findIndex((bar) => bar.date >= set.observation.from);
  const firstTest = bars.findIndex((bar) => bar.date >= set.test.from);
  let lastTest = -1;
  for (let i = bars.length - 1; i >= 0; i--) {
    if ((bars[i] as Bar).date <= set.test.to) {
      lastTest = i;
      break;
    }
  }
  if (
    observationStart < 0 ||
    firstTest < 0 ||
    firstTest <= observationStart ||
    lastTest < firstTest ||
    firstTest - observationStart < set.min_sessions.observation ||
    lastTest - firstTest + 1 < set.min_sessions.test
  ) {
    throw new PracticeDataError(
      'DATA_INSUFFICIENT',
      'Dữ liệu của tình huống chưa đủ để chạy. Lượt này chưa bị tính.',
    );
  }
  return { bars: bars.slice(0, lastTest + 1), observationStart, firstTest, lastTest };
}

/** Median close of the rows; used to detect thousand-VND quotes. */
function medianClose(rows: readonly FrozenBarRow[]): number {
  const closes = rows.map((row) => row[4]).sort((a, b) => a - b);
  return closes[Math.floor(closes.length / 2)] ?? 0;
}

/**
 * Freezes and serves the daily bars of the practice symbols. Bars come from the same adapter as
 * the quant v2 backtests (`QUANT_MARKET_DATA`), are stored once per (set_version, symbol) with a
 * `data_version` hash, and are immutable afterwards.
 */
@Injectable()
export class PracticeDataService implements PracticeCaseDataPort {
  private readonly logger = new Logger(PracticeDataService.name);
  private readonly inflight = new Map<string, Promise<SymbolDataRow>>();
  private readonly decoded = new Map<string, LoadedCase>();

  constructor(
    @Inject(PRACTICE_STORE) private readonly repository: PracticeStoreProvider,
    @Inject(PRACTICE_SET) private readonly set: PracticeSet,
    @Optional()
    @Inject(QUANT_MARKET_DATA)
    private readonly market?: QuantMarketDataProvider,
  ) {}

  /** Frozen bars of a symbol (fetched and frozen on first use). */
  async load(symbol: string): Promise<LoadedCase> {
    const row = await this.frozen(symbol);
    const key = `${row.set_version}:${row.symbol}:${row.data_version}`;
    const cached = this.decoded.get(key);
    if (cached) return cached;
    const loaded: LoadedCase = {
      data_version: row.data_version,
      calendar: buildCalendar(row.bars, this.set),
      notes: row.warnings,
    };
    this.decoded.set(key, loaded);
    return loaded;
  }

  private async frozen(symbol: string): Promise<SymbolDataRow> {
    const stored = await this.repository.store().symbolData(this.set.set_version, symbol);
    if (stored) return stored;
    const key = `${this.set.set_version}:${symbol}`;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.freeze(symbol).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async freeze(symbol: string): Promise<SymbolDataRow> {
    const { set } = this;
    if (!this.market) {
      throw new PracticeDataError('DATA_UNAVAILABLE', 'Nguồn dữ liệu tình huống chưa sẵn sàng.');
    }
    let history;
    try {
      history = await this.market.getHistoricalOhlcv(symbol, set.observation.from, set.test.to, {
        warmupSessions: set.warmup.sessions_requested,
        maxBars: MAX_BARS,
      });
    } catch (error) {
      // Operator log only: no user id, and the user-facing message never names the symbol.
      this.logger.warn(
        `Practice data fetch failed for set ${set.set_version}: ${error instanceof Error ? error.name : 'error'}`,
      );
      throw new PracticeDataError(
        'DATA_UNAVAILABLE',
        'Dữ liệu tình huống tạm thời chưa sẵn sàng. Lượt này chưa bị tính.',
      );
    }
    const from = Math.max(0, history.startIndex - set.warmup.sessions_requested);
    const kept = history.records.slice(from).filter((record) => record.time <= set.test.to);
    const warmupBars = Math.max(0, history.startIndex - from);
    // Provider quotes may be in thousand VND; a large-cap share never trades below 1,000 VND.
    const priceScale = kept.length && medianClose(kept.map(toRow(1))) < 1_000 ? 1_000 : 1;
    const rows = kept.map(toRow(priceScale));
    const calendar = buildCalendar(rows, set);
    const warnings: string[] = [];
    if (warmupBars < set.warmup.sessions_required) warnings.push('warmup_short');
    if (history.adjusted !== true) warnings.push('prices_not_adjusted');
    if ((history.skippedRows ?? 0) > 0) warnings.push('rows_skipped');
    const row: SymbolDataRow = {
      set_version: set.set_version,
      symbol,
      data_version: sha256Hex(
        canonicalJson({ data: set.versions.data, price_scale: priceScale, bars: rows }),
      ),
      source: history.source ?? null,
      source_priority: history.sourcePriority ?? null,
      adjusted: history.adjusted === true,
      price_scale: priceScale,
      warmup_bars: warmupBars,
      observation_bars: calendar.firstTest - calendar.observationStart,
      test_bars: calendar.lastTest - calendar.firstTest + 1,
      warnings,
      bars: rows,
    };
    await this.repository.store().insertSymbolData(row);
    // A concurrent freezer may have won: always serve what is actually stored.
    return (await this.repository.store().symbolData(set.set_version, symbol)) ?? row;
  }
}

const toRow =
  (scale: number) =>
  (record: {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }): FrozenBarRow => {
    const price = (value: number): number => (scale === 1 ? value : Math.round(value * scale));
    return [
      record.time,
      price(record.open),
      price(record.high),
      price(record.low),
      price(record.close),
      record.volume,
    ];
  };
