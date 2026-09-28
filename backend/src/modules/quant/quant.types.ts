import type { OhlcvRecord } from './indicators.js';

export const QUANT_MARKET_DATA = Symbol('QUANT_MARKET_DATA');
export type HistoricalBars = {
  records: OhlcvRecord[];
  startIndex: number;
  skippedRows?: number;
  source?: string;
  sourcePriority?: number;
  adjusted?: boolean;
};
export interface QuantMarketDataProvider {
  /** Historical OHLCV; corporate-action adjustment is not guaranteed by the upstream contract. */
  getHistoricalOhlcv(
    symbol: string,
    start: string,
    end: string,
    options?: { warmupSessions?: number; maxBars?: number },
  ): Promise<HistoricalBars>;
}
