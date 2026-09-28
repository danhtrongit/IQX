import type { JsonObject } from '../reports/reports.types.js';

export type PortfolioPricePoint = {
  date: string;
  timestampMs: number;
  close: number;
  volume: number;
};

export type PortfolioHolding = {
  ticker: string;
  quantity: number;
  avgCostVnd: bigint;
  currentPriceVnd: bigint;
  marketValueVnd: bigint;
  unrealizedPnlVnd: bigint;
  costBasisVnd: bigint;
  sector: string;
  priceHistory: PortfolioPricePoint[];
  priceSource: 'symbol_snapshot' | 'daily_close';
  priceAsOf: string;
  priceAgeDays: number | null;
  priceStale: boolean;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  fundamentalsSource: string | null;
};
export type PortfolioTrade = {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  priceVnd: bigint;
  tradedAt: Date;
};
export type PortfolioInput = {
  accountId: string;
  navVnd: bigint;
  cashVnd: bigint;
  /** Cash is reported by bucket so NAV can be audited without losing reserved/pending funds. */
  cashAvailableVnd: bigint;
  cashReservedVnd: bigint;
  cashPendingVnd: bigint;
  holdings: PortfolioHolding[];
  trades: PortfolioTrade[];
  benchmarkHistory: PortfolioPricePoint[];
  asOf: string;
};
export type PortfolioReport = {
  analysis: JsonObject;
  narrative: JsonObject | null;
  meta: JsonObject;
};
export interface PortfolioAiPort {
  complete(input: {
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    responseFormat: 'json';
  }): Promise<{ content: string; model: string }>;
}
export const PORTFOLIO_AI = Symbol('PORTFOLIO_AI');
