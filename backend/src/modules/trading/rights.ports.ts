import type { VnDate } from './rights.types.js';

/**
 * Upstream corporate-action source for demo-trading rights. Kept as an abstract
 * class so Nest can use it as the injection token, matching `TradingMarketPort`.
 */
export abstract class TradingRightsEventsPort {
  abstract fetch(input: {
    from: VnDate;
    to: VnDate;
    codes: 'DIV,ISS' | 'AIS';
  }): Promise<readonly unknown[]>;
}
