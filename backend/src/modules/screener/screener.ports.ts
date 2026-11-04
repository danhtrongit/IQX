import type { DailyBarColumns } from '../market-integration/daily-bars.service.js';
import type { ScreenerBasket } from './screener.definition.js';
import type { UniverseRecord } from './screener.market.js';

/**
 * What the screener reads for Thị trường and Kỹ thuật (Bộ lọc 4.0 §9 step 1): the universe with its
 * stored attributes, the stored closed daily bars and the basket constituents. All of it is already
 * in the database, so a run never calls a provider per symbol for step 1. Faked in unit tests.
 */
export interface ScreenerMarketDataPort {
  /** Session T: the newest closed session the stored bars cover; null while the store is empty. */
  resolveSession(now: Date): Promise<string | null>;
  /** Every active listed stock, A→Z, with statement group and share count when known. */
  universe(): Promise<UniverseRecord[]>;
  /** Closed bars up to `session`, inside the Bot's history window; symbols without bars are absent. */
  loadBars(symbols: readonly string[], session: string): Promise<Map<string, DailyBarColumns>>;
  /** Constituents of each basket at `session`; `null` when no snapshot is stored for it. */
  basketMembers(
    baskets: readonly ScreenerBasket[],
    session: string,
    now: Date,
  ): Promise<Map<ScreenerBasket, Set<string> | null>>;
  /** Short description of the price source for the result header (e.g. `DNSE`). */
  readonly priceSource: string;
}

export const SCREENER_MARKET_DATA = Symbol('SCREENER_MARKET_DATA');
