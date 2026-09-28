export type TradingStatus = 'loading' | 'ready' | 'empty' | 'error';
export type OrderSide = 'buy' | 'sell';

export interface PaperPortfolio {
  currency: string;
  equity?: number | string;
  buyingPower?: number | string;
  dayChange?: number | string;
  dayChangePercent?: number | string;
}

export interface Position {
  symbol: string;
  name?: string;
  quantity: number | string;
  averagePrice?: number | string;
  marketValue?: number | string;
  unrealizedChange?: number | string;
  unrealizedChangePercent?: number | string;
}

export interface OrderDraft {
  symbol: string;
  side: OrderSide;
  quantity: number | string;
  limitPrice?: number | string;
}
