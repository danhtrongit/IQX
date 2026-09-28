export type MarketDirection = 'up' | 'down' | 'flat';
export type MarketStatus = 'loading' | 'ready' | 'empty' | 'error' | 'premium';

export interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent?: number;
  direction?: MarketDirection;
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  price: number | string;
  change: number | string;
  changePercent?: number;
  direction?: MarketDirection;
}

export interface MarketOverview {
  headline: string;
  score?: number;
  updatedAt?: string;
  indices?: MarketIndex[];
  watchlist?: WatchlistItem[];
}
