import type { SqlClient } from '../../platform/database/index.js';

export const BOT_SNAPSHOT_PROVIDER = Symbol('BOT_SNAPSHOT_PROVIDER');
/** Injection token of the buy-universe resolver port (see {@link BotUniversePort}). */
export const BOT_UNIVERSE = Symbol('BOT_UNIVERSE');

export type BotIssue = {
  code: string;
  symbol: string | null;
  detail: string | null;
};

export type BotSnapshotSymbol = {
  close_vnd?: string | number;
  close_is_official?: boolean;
  /** 20-session average traded value in VND; absent when fewer than 20 valid sessions exist. */
  trading_value_avg20_vnd?: string | number;
  security_status_verified?: boolean;
  tradable_security_status?: boolean;
  source_refs?: Record<string, unknown>;
};

export type BotUniverseKind = 'vn30' | 'custom';

/** Index membership row that backs a VN30 universe for one session. */
export type BotMembershipEvidence = {
  index_code: string;
  session_date: string;
  source: string;
  source_hash: string;
  fetched_at: string;
};

/**
 * The buy universe frozen into the run snapshot. `unavailable` means the source could not be
 * verified: no new buys, sells continue (never a fallback to another source).
 */
export type BotUniverseEvidence = {
  status: 'verified' | 'unavailable';
  kind: BotUniverseKind;
  /** 0 = implicit VN30 default (no revision row). */
  revision: number;
  name: string;
  saved_list_id: string | null;
  effective_session: string | null;
  /** Sorted unique uppercase symbols; empty when unavailable. */
  symbols: string[];
  symbols_hash: string | null;
  membership: BotMembershipEvidence | null;
  unavailable_reason: string | null;
};

/** Compact pin of the universe stored in the immutable run receipt. */
export type BotUniversePin = {
  kind: BotUniverseKind;
  revision: number;
  status: 'verified' | 'unavailable';
  effective_session: string | null;
  symbols_hash: string | null;
};

export type ResolvedBotUniverse = {
  evidence: BotUniverseEvidence;
  /** Revision row to mark `effective` when the run is captured; null for the implicit VN30. */
  revisionId: string | null;
};

/**
 * Buy-universe resolver used by the Bot worker. `consume` runs inside the capture
 * transaction and returns false when the resolved revision was cancelled in the meantime.
 */
export interface BotUniversePort {
  resolveForSession(userId: string, tradingDate: string): Promise<ResolvedBotUniverse>;
  consume(tx: SqlClient, userId: string, resolved: ResolvedBotUniverse): Promise<boolean>;
  /** Whether a symbol is in the universe that is effective today (positions view). */
  effectiveSymbols(userId: string, tradingDate: string): Promise<ReadonlySet<string> | null>;
}

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
  /** Present only when the run receipt pins a shared Buy/Sell config revision. */
  shared_config_signals?: BotSharedConfigSignals;
  /** Effective buy universe captured with the snapshot (absent in pre-v1.0 snapshots). */
  universe?: BotUniverseEvidence;
  snapshot_hash?: string;
};

export type BotSideStatus = 'active' | 'inactive' | 'blocked';

export type BotSideBlock = {
  reason: 'config_invalid_or_unauthorized' | 'legacy_needs_review';
  detail: string;
  indicator_ids: string[];
};

export type BotConditionRuleEvidence = {
  id: string;
  indicator: string;
  side: 'buy' | 'sell';
  op: '>' | '<' | '∈' | '∉';
  lhs: number | null;
  rhs: number | null;
  rhs_lower?: number | null;
  rhs_upper?: number | null;
  result: boolean | null;
  missing: boolean;
  previous_lhs?: number | null;
  previous_rhs?: number | null;
};

export type BotConditionSnapshot = {
  buy_active_ids: string[];
  sell_active_ids: string[];
  rules: BotConditionRuleEvidence[];
};

/**
 * Frozen evaluation of the pinned shared Buy/Sell config on the session's last
 * completed bar. `null` = missing data.
 */
export type BotSharedConfigSignals = {
  revision: number;
  config_hash: string;
  effective_session: string;
  /** Buy side usable: at least one valid indicator has master + Buy ON and no side failure. */
  buy_active: boolean;
  /** Sell side usable: at least one valid indicator has master + Sell ON and no side failure. */
  sell_active: boolean;
  /** `blocked` = enabled but invalid/unauthorized/legacy: the whole side is stopped. */
  buy_status?: BotSideStatus;
  sell_status?: BotSideStatus;
  buy_block?: BotSideBlock | null;
  sell_block?: BotSideBlock | null;
  buy: Record<string, boolean | null>;
  sell: Record<string, boolean | null>;
  /** Per-symbol evidence frozen with the source snapshot for deterministic retries. */
  conditions?: Record<string, BotConditionSnapshot>;
  data: {
    source: string | null;
    hash: string;
    warmup_sessions: number;
    market_symbol: string | null;
  };
};

export interface BotSnapshotProvider {
  /**
   * Builds the market side of a run snapshot. `universeSymbols` are the effective buy
   * universe members (empty when the universe is unavailable); `openSymbols` are every held
   * position. Data is delivered for the union and one symbol's gap never fails the snapshot.
   */
  buildSnapshot(
    tradingDate: string,
    options: { openSymbols: readonly string[]; universeSymbols?: readonly string[] },
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
  cap6_graduated_at: Date | string | null;
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
  policy_version?: string | null;
  universe_revision?: number | null;
  universe_kind?: BotUniverseKind | null;
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
  /** Legacy history only; NULL for positions opened under iqx-bot-v1.0. */
  amplitude_at_entry_vnd: string | null;
  amplitude_source_ref: string | null;
  stop_loss_vnd: string | null;
  take_profit_vnd: string | null;
  entry_source_snapshot?: unknown;
  entry_config_revision?: number | null;
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

export type BotDecisionRow = {
  id: string;
  bot_run_id: string;
  symbol: string | null;
  action: string;
  reason_code: string;
  reason: string;
  execution_id: string | null;
  decision_config_revision?: number | null;
  condition_snapshot?: BotConditionSnapshot | null;
  created_at: Date | string;
};
