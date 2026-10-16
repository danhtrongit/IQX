export type TradingAccount = {
  id: string;
  status: string;
  initial_cash_vnd: number;
  cash_available_vnd: number;
  cash_reserved_vnd: number;
  cash_pending_vnd: number;
  total_cash_vnd: number;
};

export type TradingPosition = {
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;
  quantity_pending: number;
  quantity_reserved: number;
  avg_cost_vnd: number;
  current_price_vnd: number | null;
  market_value_vnd: number | null;
  unrealized_pnl_vnd: number | null;
};

export type TradingPortfolio = {
  account: TradingAccount;
  positions: TradingPosition[];
  total_market_value_vnd: number;
  nav_vnd: number;
  total_unrealized_pnl_vnd: number;
  return_pct: number;
  refresh_warnings: string[];
  pending_rights: {
    pending_cash_dividend_vnd: number;
    pending_stock_dividend_quantity: number;
  } | null;
};

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'expired' | 'rejected';

export type TradingOrder = {
  id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  status: OrderStatus | string;
  quantity: number;
  limit_price_vnd: number | null;
  filled_price_vnd: number | null;
  gross_amount_vnd: number | null;
  fee_vnd: number | null;
  tax_vnd: number | null;
  net_amount_vnd: number | null;
  trading_date: string | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  created_at: string | null;
};

export type OrderPage = {
  orders: TradingOrder[];
  total: number;
  page: number;
  pageSize: number;
};

export type PlaceOrderInput = {
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: number;
  limit_price_vnd?: number;
};

export type WatchlistItem = {
  id: string;
  symbol: string;
  sortOrder: number;
  name: string | null;
  exchange: string | null;
};

export type EngineRefreshResult = Record<string, unknown> & {
  warnings?: string[];
};

export type PortfolioAnalysis = {
  insufficient: boolean;
  reason: string | null;
  title: string | null;
  verdict: string | null;
  lede: string | null;
  score: number | null;
  sections: { key: string; title: string; text: string }[];
  actions: { title: string; detail: string | null }[];
  closing: string | null;
  cached: boolean;
};
