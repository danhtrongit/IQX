import type { DailyBarColumns } from '../market-integration/daily-bars.service.js';
import type { MarketScope, ScreenerBasket, StatementGroup } from './screener.definition.js';

/**
 * Thị trường (Bộ lọc 4.0 §2): the scope of the filter, evaluated on the stored closed bars of
 * session T. Pure: the service loads the universe, bars and basket members and passes them in.
 *
 * Units: bars are in thousand VND; `price` is nghìn đồng; `market_cap` and `avg_value` are tỷ đồng
 * (`thousand VND × 1000 × shares / 1e9 = price × shares / 1e6`).
 */

export type UniverseRecord = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  /** ICB sector (display only since 4.0; the scope uses the statement group). */
  sector: string | null;
  /** Statement template of the company; null until `market.symbol-attributes` has read it. */
  group: StatementGroup | null;
  /** Shares behind Vốn hóa; null until read. */
  shares: number | null;
};

export type MarketValues = {
  /** nghìn đồng: close at T. */
  price: number | null;
  /** % against the previous session's close. */
  change_pct: number | null;
  /** tỷ đồng. */
  market_cap: number | null;
  /** tỷ đồng: mean of close × volume over the last N sessions, T included. */
  avg_value: number | null;
};

export const EMPTY_MARKET_VALUES: MarketValues = Object.freeze({
  price: null,
  change_pct: null,
  market_cap: null,
  avg_value: null,
});

const finiteOrNull = (value: number): number | null => (Number.isFinite(value) ? value : null);

/**
 * Close, change, market cap and average traded value at session T from the closed bars. A symbol
 * with no bar at T has no value at all (spec §5); fewer than N bars gives no average (§2.2).
 */
export function computeMarketValues(
  bars: DailyBarColumns | null,
  session: string,
  shares: number | null,
  sessions: number,
): MarketValues {
  if (!bars || bars.dates.length === 0 || bars.dates.at(-1) !== session) return EMPTY_MARKET_VALUES;
  const last = bars.dates.length - 1;
  const price = bars.close[last]!;
  const previous = last > 0 ? bars.close[last - 1]! : null;
  let avg: number | null = null;
  if (bars.dates.length >= sessions) {
    let sum = 0;
    for (let i = last - sessions + 1; i <= last; i += 1) sum += bars.close[i]! * bars.volume[i]!;
    avg = finiteOrNull(sum / sessions / 1e6);
  }
  return {
    price: finiteOrNull(price),
    change_pct: previous && previous > 0 ? finiteOrNull((price / previous - 1) * 100) : null,
    market_cap: shares !== null && shares > 0 ? finiteOrNull((price * shares) / 1e6) : null,
    avg_value: avg,
  };
}

/** Which criterion lacked the data to decide (the symbol is then out of scope, §2.2). */
export type MissingCriterion =
  | 'exchange'
  | 'basket'
  | 'statement_group'
  | 'close_price'
  | 'market_cap'
  | 'avg_value';

export type ScopeVerdict = { in_scope: true } | { in_scope: false; missing: MissingCriterion | null };

/** Constituents per chosen basket at T; `null` = no snapshot is stored for that basket. */
export type BasketMembers = ReadonlyMap<ScreenerBasket, ReadonlySet<string> | null>;

const within = (value: number, min: number | null, max: number | null): boolean =>
  (min === null || value >= min) && (max === null || value <= max);

/**
 * Sàn, Rổ, Ngành are OR inside and AND between. A criterion in use that cannot be decided for the
 * symbol (no exchange, no statement group, no basket snapshot) puts it OUT of scope and is counted
 * under `missing`. These three need no bars, so the service applies them first and loads bars only
 * for the symbols that pass.
 */
export function cheapVerdict(
  record: UniverseRecord,
  market: MarketScope,
  baskets: BasketMembers,
): ScopeVerdict {
  if (market.exchanges.length) {
    if (record.exchange === null) return { in_scope: false, missing: 'exchange' };
    if (!(market.exchanges as readonly string[]).includes(record.exchange))
      return { in_scope: false, missing: null };
  }
  if (market.baskets.length) {
    const known = market.baskets.filter((code) => baskets.get(code));
    if (known.length === 0) return { in_scope: false, missing: 'basket' };
    if (!known.some((code) => baskets.get(code)!.has(record.symbol)))
      return { in_scope: false, missing: null };
  }
  if (market.statement_groups.length) {
    if (record.group === null) return { in_scope: false, missing: 'statement_group' };
    if (!market.statement_groups.includes(record.group)) return { in_scope: false, missing: null };
  }
  return { in_scope: true };
}

/**
 * Giá đóng cửa, Vốn hóa and GTGD bình quân: inclusive ranges on the values at T. A value that cannot
 * be computed (no bar at T, no share count, fewer than N sessions) is out of scope, counted under `missing`.
 */
export function valueVerdict(values: MarketValues, market: MarketScope): ScopeVerdict {
  const { close_price: price, market_cap: cap, avg_value: avg } = market;
  if (price.min !== null || price.max !== null) {
    if (values.price === null) return { in_scope: false, missing: 'close_price' };
    if (!within(values.price, price.min, price.max)) return { in_scope: false, missing: null };
  }
  if (cap.min !== null || cap.max !== null) {
    if (values.market_cap === null) return { in_scope: false, missing: 'market_cap' };
    if (!within(values.market_cap, cap.min, cap.max)) return { in_scope: false, missing: null };
  }
  if (avg.min !== null) {
    if (values.avg_value === null) return { in_scope: false, missing: 'avg_value' };
    if (values.avg_value < avg.min) return { in_scope: false, missing: null };
  }
  return { in_scope: true };
}

/** All six criteria: OR inside a list, AND between criteria, in the order of the Thị trường block. */
export function scopeVerdict(
  record: UniverseRecord,
  values: MarketValues,
  market: MarketScope,
  baskets: BasketMembers,
): ScopeVerdict {
  const cheap = cheapVerdict(record, market, baskets);
  return cheap.in_scope ? valueVerdict(values, market) : cheap;
}

/** Whether the scope needs the stored bars at all (price, cap or average value in use). */
export function marketNeedsBars(market: MarketScope): boolean {
  return (
    market.close_price.min !== null ||
    market.close_price.max !== null ||
    market.market_cap.min !== null ||
    market.market_cap.max !== null ||
    market.avg_value.min !== null
  );
}

export type MarketQuality = {
  /** Active listed stocks before any filter. */
  universe: number;
  /** Symbols inside the Thị trường scope (the result's "doanh nghiệp trong phạm vi"). */
  in_scope: number;
  /** Out of scope because a criterion in use could not be decided for them (§2.2). */
  excluded_missing: Record<MissingCriterion, number>;
  /** Chosen baskets with no stored constituents at T. */
  baskets_unavailable: string[];
  /** Symbols in scope without a bar at T (suspended or data not yet stored). */
  without_session_bar: number;
};

export const emptyMarketQuality = (): MarketQuality => ({
  universe: 0,
  in_scope: 0,
  excluded_missing: {
    exchange: 0,
    basket: 0,
    statement_group: 0,
    close_price: 0,
    market_cap: 0,
    avg_value: 0,
  },
  baskets_unavailable: [],
  without_session_bar: 0,
});
