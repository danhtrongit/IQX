export type Execution = 'next_open' | 'same_close';
export type FeePreset = 'standard' | 'none';

export type BacktestRequest = {
  symbol: string;
  start: string;
  end: string;
  assumptions: { capital: number; fee_preset: FeePreset; execution: Execution };
};

export type Kpis = {
  total_return_pct?: number | null;
  annualized_return_pct?: number | null;
  max_drawdown_pct?: number | null;
  closed_trade_count?: number | null;
  win_rate_pct?: number | null;
  buy_hold_return_pct?: number | null;
  [k: string]: unknown;
};

export type CurvePoint = { date: string; return_pct: number | null; buy_hold_pct?: number | null; market_pct?: number | null };

export type ChartSeriesMeta = { id: string; label: string; available: boolean; unavailable_reason?: string | null };

export type OpenPosition = {
  qty: number; cost: number; date: string; price: number; last_price: number;
  market_value: number; unrealized_pnl: number; signal_date?: string | null;
};

export type PendingOrder = { side?: string; date?: string; symbol?: string; qty?: number; [k: string]: unknown };

export type BacktestTrade = {
  number: number;
  entry_signal_date?: string; entry_date?: string; entry_price?: number; entry_fee?: number; entry_total?: number;
  exit_signal_date?: string; exit_date?: string; exit_price?: number; exit_fee_tax?: number; exit_net?: number;
  exit_reason?: string;
  qty?: number; hold?: number; pnl?: number; pnl_pct?: number; outcome?: 'win' | 'loss' | 'flat';
};

export type BacktestResult = {
  kpis: Kpis;
  counts?: { closed_trade_count?: number; winning_trade_count?: number; [k: string]: unknown };
  supplementary?: { winning_trade_count?: number; profit_factor?: number | null };
  initial: CurvePoint;
  curve: CurvePoint[];
  chart?: { title?: string; unit?: string; series?: ChartSeriesMeta[] };
  open_position?: OpenPosition | null;
  pending_orders?: PendingOrder[];
};

export type Snapshot = {
  symbol: string; capital: number; execution: Execution; fee_preset: FeePreset;
  requested_start: string; requested_end: string; actual_start?: string; actual_end?: string;
  bar_count?: number; shared_revision?: number;
  data_warnings?: { code: string; message: string }[];
};

export type BacktestRun = {
  run_id: string;
  status: string;
  kind: string;
  shared_revision?: number;
  created_at?: string;
  request?: Partial<BacktestRequest> & { assumptions?: Partial<BacktestRequest['assumptions']> };
  snapshot?: Snapshot | null;
  result?: BacktestResult | null;
  error?: { code?: string; message?: string } | null;
};

export type TradesPage = {
  run_id: string; total: number; offset: number; limit: number;
  items: BacktestTrade[];
  open_position?: OpenPosition | null;
  pending_orders?: PendingOrder[];
};
