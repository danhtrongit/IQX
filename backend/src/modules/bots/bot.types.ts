export const BOT_SNAPSHOT_PROVIDER = Symbol('BOT_SNAPSHOT_PROVIDER');

export type BotIssue = {
  code: string;
  symbol: string | null;
  detail: string | null;
};

export type LayerVerdict = 'ok' | 'neu' | 'bad';

export type BotLayerEvidence = {
  verdict: LayerVerdict;
  raw_level: string;
  is_very_negative: boolean | null;
  source_ref: string;
};

export type BotSnapshotSymbol = {
  close_vnd?: string | number;
  close_is_official?: boolean;
  trading_value_avg20_vnd?: string | number;
  filter_ids?: string[];
  layers?: Record<string, BotLayerEvidence>;
  l1_amplitude_vnd?: string | number | null;
  l1_amplitude_source_ref?: string | null;
  security_status_verified?: boolean;
  tradable_security_status?: boolean;
  source_refs?: Record<string, unknown>;
};

export type BotMarketSnapshotInput = {
  trading_date: string;
  data_version: string;
  close_is_official: boolean;
  buy_inputs_complete: boolean;
  symbols: Record<string, BotSnapshotSymbol>;
  fee_rules: {
    buy_fee_rate_bps: number;
    sell_fee_rate_bps: number;
    sell_tax_rate_bps: number;
    board_lot_size: number;
    source_ref: string;
  };
  vnindex?: string | number | null;
  issues?: BotIssue[];
  source_refs?: Record<string, unknown>;
  snapshot_hash?: string;
};

export interface BotSnapshotProvider {
  buildSnapshot(
    tradingDate: string,
    options: { openSymbols: readonly string[] },
  ): Promise<BotMarketSnapshotInput>;
}

export type BotRunStatus = 'idle' | 'running' | 'succeeded' | 'failed';

export type BotRunResult = {
  id: string;
  userId: string;
  tradingDate: string;
  status: Exclude<BotRunStatus, 'idle'>;
  buyCount: number;
  sellCount: number;
  issues: BotIssue[];
  inputHash: string | null;
};

export type BotBatchResult = {
  initialized: number;
  processed: number;
  succeeded: number;
  failed: number;
  skippedNotSession: number;
};

export type BotAccountRow = {
  id: string;
  user_id: string;
  initial_cash_vnd: string;
  cash_vnd: string;
  status: 'active' | 'suspended';
  activated_at: Date | string;
};

export type BotInstanceRow = {
  id: string;
  user_id: string;
  bot_account_id: string;
  strategy_id: string;
  strategy_version: number;
  execution_model: string;
  cap6_graduated_at: Date | string;
  activated_at: Date | string;
};

export type BotRunRow = {
  id: string;
  user_id: string;
  bot_account_id: string | null;
  trading_date: Date | string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: Date | string;
  completed_at: Date | string | null;
  issues: unknown;
  strategy_id: string | null;
  strategy_version: number | null;
  execution_model: string | null;
  source_snapshot_hash: string | null;
  rule_snapshot: unknown;
  rule_hash: string | null;
  nav_basis_vnd: string | null;
  blocked_symbols_at_start: unknown;
  buy_count: number;
  sell_count: number;
  reconciled_at: Date | string | null;
};

export type BotPositionRow = {
  id: string;
  bot_account_id: string;
  symbol: string;
  qty_open: number;
  entry_price_vnd: string;
  entry_value_vnd: string;
  entry_fee_vnd: string;
  amplitude_at_entry_vnd: string;
  amplitude_source_ref: string;
  stop_loss_vnd: string;
  take_profit_vnd: string;
  opened_session: Date | string;
  opened_at: Date | string;
  closed_session: Date | string | null;
  closed_at: Date | string | null;
  buy_execution_id: string | null;
  sell_execution_id: string | null;
  status: 'open' | 'closed';
  filter_ids: unknown;
  source_refs: unknown;
};
