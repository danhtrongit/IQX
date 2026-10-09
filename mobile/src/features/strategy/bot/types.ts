/** Money fields arrive as strings; everything is optional/nullable on purpose. */
export type Money = string | number | null | undefined;

export type BotAccount = {
  as_of_session?: string | null;
  cash_vnd?: Money; market_value_vnd?: Money; nav_vnd?: Money;
  pnl_total_net_vnd?: Money; return_total?: Money; valuation_complete?: boolean;
};
export type BotIssue = { code?: string; detail?: string; symbol?: string | null };
export type BotConditions = {
  state?: string; state_label?: string; buy_status?: string; sell_status?: string;
  buy_condition_count?: number; sell_condition_count?: number;
  effective_revision?: number | null; effective_session?: string | null; saved_revision?: number | null;
  pending?: { revision?: number; effective_session?: string; status?: string } | null;
  open_positions?: number;
  errors?: { buy?: string | null; sell?: string | null } | null;
};
export type BotOverview = {
  eligible?: boolean;
  disclosure?: unknown;
  account?: BotAccount | null;
  bot?: { initial_cash_vnd?: Money; new_buys_enabled?: boolean; policy_version?: string } | null;
  bot_run?: { status?: 'idle' | 'running' | 'succeeded' | 'failed'; issues?: BotIssue[]; last_updated_at?: string | null; processed_unseen_sessions?: number } | null;
  conditions?: BotConditions | null;
};

export type BotPosition = {
  id: string; symbol: string; qty?: number;
  entry_price_vnd?: Money; current_close_vnd?: Money; market_value_vnd?: Money;
  unrealized_pnl_net_vnd?: Money; weight_pct?: Money; holding_sessions?: number; opened_session?: string;
};

export type BotTrade = {
  id: string; symbol: string;
  buy?: { session?: string; price_vnd?: Money; qty?: number; fee_vnd?: Money; total_vnd?: Money; reason_label?: string | null } | null;
  sell?: { session?: string; price_vnd?: Money; qty?: number; fee_vnd?: Money; tax_vnd?: Money; net_vnd?: Money; reason_label?: string | null } | null;
  realized_pnl_vnd?: Money; realized_pnl_pct?: Money; holding_sessions?: number;
};

export type BotSession = {
  session: string; run_status?: string; config_revision?: number | null;
  counts?: { buy?: number; sell?: number; hold?: number; skip?: number; total?: number };
  reasons?: { action: string; count: number; reason_label?: string | null }[];
  universe?: { kind?: string; name?: string; revision?: number } | null;
  nav_end_vnd?: Money; cash_end_vnd?: Money;
};

export type BotSessionItem = {
  id: string; action: string; symbol: string; reason_label?: string | null; reason?: string | null;
  execution?: { qty?: number; price_vnd?: Money } | null;
};

export type Page<T> = { items: T[]; next_cursor?: string | null };
