import { canonicalJson } from '../hash.js';
import { calc, isFiniteNumber } from '../indicators.js';
import type { Bar, SeriesMap } from '../types.js';

type Series = Array<number | null>;

/**
 * Memoised indicator series over one bar array. Every condition row asks for its own full
 * param set, so two rows of one indicator with different periods compute independently
 * (SPEC V3 §1.2) while rows with identical params share one computation. The formulas are the
 * unchanged `calc` of `indicators.ts`.
 */
export type SeriesCache = {
  readonly bars: readonly Bar[];
  /** `calc(indicatorId, params, bars)`, computed once per indicator + canonical params. */
  series(indicatorId: string, params: Record<string, number>): SeriesMap;
  /** Closing prices (non-finite closes are missing). */
  close(): Series;
};

export function createSeriesCache(bars: readonly Bar[]): SeriesCache {
  const memo = new Map<string, SeriesMap>();
  let close: Series | undefined;
  return {
    bars,
    series(indicatorId, params) {
      const key = `${indicatorId}:${canonicalJson(params)}`;
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
