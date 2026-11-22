/**
 * Strategy signals per symbol per session (§3.3, §3.4, D7). Each side is the Kleene AND of every
 * indicator whose side has ≥1 enabled row; each indicator is the AND of its enabled rows, through the
 * existing V3 evaluator (`quant/v2/conditions`). Only `true` triggers. A side without any enabled row
 * is all `false` (Sell: only the holding limit can sell).
 *
 * Indicators are computed over the symbol's FULL stored series from its first bar (D7), so a value
 * at session D only depends on bars <= D: the Backtest (whole range at once) and the Bot (series up to
 * D) read identical values.
 */

import { evaluateIndicatorSide } from '../quant/v2/conditions/evaluate.js';
import type { SeriesCache } from '../quant/v2/conditions/series-cache.js';
import { calc, isFiniteNumber } from '../quant/v2/indicators.js';
import { and3 } from '../quant/v2/rules.js';
import { loadTechnicalRegistry } from '../quant/v2/technical-registry.js';
import type { Bar, RegistryEntry, SeriesMap, Side, Tri } from '../quant/v2/types.js';
import { activeIndicatorIds } from './content.js';
import type { SignalCache, StrategyContent, SymbolSeries, SymbolSignals } from './contracts.js';

export const TRI_TRUE = 1;
export const TRI_FALSE = 0;
export const TRI_UNKNOWN = -1;

export function encodeTri(value: Tri): number {
  return value === true ? TRI_TRUE : value === false ? TRI_FALSE : TRI_UNKNOWN;
}

export function decodeTri(value: number | undefined): Tri {
  return value === TRI_TRUE ? true : value === TRI_FALSE ? false : null;
}

/** Bars of a columnar series as evaluator objects (built per symbol, then dropped). */
export function seriesBars(
  series: SymbolSeries,
  calendar: readonly string[],
  market: Float64Array | null = null,
): Bar[] {
  const bars: Bar[] = new Array<Bar>(series.close.length);
  for (let i = 0; i < series.close.length; i += 1) {
    const idx = series.session_idx[i]!;
    const bar: Bar = {
      date: calendar[idx]!,
      open: series.open[i]!,
      high: series.high[i]!,
      low: series.low[i]!,
      close: series.close[i]!,
      volume: series.volume[i]!,
    };
    if (market) {
      const value = market[idx];
      bar.market = value !== undefined && Number.isFinite(value) ? value : null;
    }
    bars[i] = bar;
  }
  return bars;
}

function needsMarket(
  content: Pick<StrategyContent, 'indicators'>,
  registry: readonly RegistryEntry[],
): boolean {
  const ids = new Set([
    ...activeIndicatorIds(content, 'buy', registry),
    ...activeIndicatorIds(content, 'sell', registry),
  ]);
  return registry.some(
    (entry) => ids.has(entry.id) && entry.availability === 'needs_history_context',
  );
}

/**
 * The V3 `SeriesCache` contract with a cheaper memo key than `createSeriesCache` (which builds a
 * canonical JSON per lookup, i.e. per bar per row): `id|k=v,…` over sorted keys. Same `calc`, same
 * series, same values; only the lookup is faster.
 */
export function createFastSeriesCache(bars: readonly Bar[]): SeriesCache {
  const memo = new Map<string, SeriesMap>();
  let close: Array<number | null> | undefined;
  return {
    bars,
    series(indicatorId, params) {
      const keys = Object.keys(params);
      if (keys.length > 1) keys.sort();
      let key = indicatorId;
      for (const k of keys) key += `|${k}=${params[k]}`;
      let value = memo.get(key);
      if (value === undefined) {
        value = calc(indicatorId, params, bars);
        memo.set(key, value);
      }
      return value;
    },
    close() {
      close ??= bars.map((bar) => (isFiniteNumber(bar.close) ? bar.close : null));
      return close;
    },
  };
}

function sideSeries(
  content: Pick<StrategyContent, 'indicators'>,
  side: Side,
  cache: SeriesCache,
  registry: readonly RegistryEntry[],
  from: number,
): Int8Array {
  const length = cache.bars.length;
  const out = new Int8Array(length).fill(TRI_UNKNOWN);
  const ids = activeIndicatorIds(content, side, registry);
  if (ids.length === 0) {
    out.fill(TRI_FALSE, from);
    return out;
  }
  const values: Tri[] = new Array<Tri>(ids.length);
  for (let i = from; i < length; i += 1) {
    for (let k = 0; k < ids.length; k += 1) {
      const id = ids[k]!;
      const evaluation = evaluateIndicatorSide(id, content.indicators[id]![side], cache, i);
      values[k] = evaluation.status === 'no_signal' ? null : evaluation.result;
    }
    out[i] = encodeTri(and3(values));
  }
  return out;
}

export type ComputeSignalsOptions = {
  registry?: readonly RegistryEntry[];
  cache?: SignalCache;
  /** Strategy config hash (cache key). Required for caching. */
  config_hash?: string;
  /** VNINDEX closes aligned to the calendar (market-context indicators). */
  market?: Float64Array | null;
  /**
   * Evaluate only bars in calendar sessions >= this index (earlier bars stay unknown). Indicator
   * series are still computed over the full series from its first bar (D7), so values are equal.
   */
  from_session_idx?: number;
};

/** Buy/Sell tri-state series aligned to `series` bars. */
export function computeSymbolSignals(
  content: Pick<StrategyContent, 'indicators'>,
  series: SymbolSeries,
  calendar: readonly string[],
  options: ComputeSignalsOptions = {},
): SymbolSignals {
  const registry = options.registry ?? loadTechnicalRegistry();
  const lastIdx = series.session_idx[series.session_idx.length - 1] ?? -1;
  const fromSession = options.from_session_idx ?? 0;
  const key =
    options.cache && options.config_hash
      ? `${options.config_hash}:${series.symbol}:${series.series_rev}:${series.close.length}:${lastIdx}:${fromSession}`
      : null;
  const cached = key ? options.cache!.get(key) : undefined;
  if (cached) return cached;
  const market = needsMarket(content, registry) ? (options.market ?? null) : null;
  const cache = createFastSeriesCache(seriesBars(series, calendar, market));
  const from = Math.max(0, barIndexAtOrBefore(series, fromSession - 1) + 1);
  const result: SymbolSignals = {
    buy: sideSeries(content, 'buy', cache, registry, from),
    sell: sideSeries(content, 'sell', cache, registry, from),
  };
  if (key) options.cache!.set(key, result);
  return result;
}

/** Index of the bar of `series` in calendar session `sessionIdx`, or -1 (no bar that day). */
export function barIndexAt(series: SymbolSeries, sessionIdx: number): number {
  const idx = series.session_idx;
  let lo = 0;
  let hi = idx.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const value = idx[mid]!;
    if (value === sessionIdx) return mid;
    if (value < sessionIdx) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Index of the last bar of `series` at or before calendar session `sessionIdx`, or -1. */
export function barIndexAtOrBefore(series: SymbolSeries, sessionIdx: number): number {
  const idx = series.session_idx;
  let lo = 0;
  let hi = idx.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (idx[mid]! <= sessionIdx) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** A valid fill price: finite, positive integer VND. */
export function validClose(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/**
 * GTGD TB20 at bar `barIdx`: mean of close × volume over the symbol's last 20 bars (D included),
 * integer VND (floor). Fewer bars available: the mean of those. null when D has no valid close.
 */
export function gtgd20At(series: SymbolSeries, barIdx: number, window = 20): bigint | null {
  if (barIdx < 0 || !validClose(series.close[barIdx])) return null;
  let sum = 0n;
  let count = 0n;
  for (let i = Math.max(0, barIdx - window + 1); i <= barIdx; i += 1) {
    const close = series.close[i]!;
    const volume = series.volume[i]!;
    if (!Number.isFinite(close) || !Number.isFinite(volume) || close <= 0 || volume < 0) continue;
    sum += BigInt(Math.round(close)) * BigInt(Math.round(volume));
    count += 1n;
  }
  return count === 0n ? null : sum / count;
}
