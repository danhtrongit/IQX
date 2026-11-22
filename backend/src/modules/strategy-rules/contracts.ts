/**
 * Shared contracts of Bot và Chiến lược v2.0 (PLAN-bot-strategy §4): strategy content, one session
 * step of the rules (§3.3), Backtest basket results (§4.7, §4.8), the daily price store and the
 * ports implemented by the other workstreams. Pure types + DI tokens: no Nest, no database.
 *
 * Money is integer VND as `bigint` everywhere inside the rules; JSON views stringify it.
 */

import type { IndicatorConfig, Tri } from '../quant/v2/types.js';
import type { SqlClient } from '../../platform/database/database.service.js';

export type { Tri } from '../quant/v2/types.js';

// ---------------------------------------------------------------------------------------------
// Strategy content (§10.2, D14)
// ---------------------------------------------------------------------------------------------

export type UniverseType = 'vn30' | 'vn100' | 'saved_list';

export type IndexUniverse = { type: 'vn30' | 'vn100' };
/** Saved list copied into the version when saved, already filtered to the store (VN100). */
export type SavedListUniverse = {
  type: 'saved_list';
  list_id: string;
  list_name: string;
  symbols: string[];
};
export type StrategyUniverse = IndexUniverse | SavedListUniverse;

/**
 * Content of one strategy version (user strategies and IQX definitions). `indicators` is the V3
 * per-indicator map (`master_enabled`, `buy{enabled,rules}`, `sell{…}`) used by shared configs;
 * Buy/Sell "cards" are views of it. `sell_only` only exists on converted strategies (§11.2).
 */
export type StrategyContent = {
  universe: StrategyUniverse;
  indicators: Record<string, IndicatorConfig>;
  max_holding: number;
  sell_only?: boolean;
};

/** Who validates: a user version, or an IQX definition (stricter: VN30/VN100, ≥1 Sell row). */
export type StrategyContentKind = 'user' | 'iqx' | 'converted';

export type StrategyErrorCode = 'STRATEGY_INVALID' | 'UNIVERSE_EMPTY';

export type StrategyValidationIssue = { path: string; message: string };

export type StrategyValidationResult =
  | { ok: true; content: StrategyContent; config_hash: string }
  | { ok: false; code: StrategyErrorCode; issues: StrategyValidationIssue[] };

export type StrategySource = 'iqx' | 'user';
export type StrategyRunSource = StrategySource | 'draft';

/** Exact version a schedule row, a run or a receipt points to. */
export type StrategyRef = { source: StrategySource; id: string; version: number };

/** A strategy version resolved for display + execution (`STRATEGY_READER`). */
export type ResolvedStrategy = {
  ref: StrategyRef;
  name: string;
  /** `bản dd/mm HH:mm` (user) or `v{n}` (IQX). */
  version_label: string;
  content: StrategyContent;
  config_hash: string;
  /** IQX template hidden by an admin (still runnable where pinned, §7.2). */
  hidden: boolean;
  /** Soft-deleted user strategy (still resolvable for history, §4.6). */
  deleted: boolean;
};

// ---------------------------------------------------------------------------------------------
// Fees and fixed parameters
// ---------------------------------------------------------------------------------------------

export type FeeRules = {
  buy_fee_bps: number;
  sell_fee_bps: number;
  sell_tax_bps: number;
  lot_size: number;
};

// ---------------------------------------------------------------------------------------------
// One session of the rules (§3.3) — `stepSession`
// ---------------------------------------------------------------------------------------------

export type AnchorReason = 'entry' | 'policy_cutover';

/** An open position at the start of a session. */
export type PositionState = {
  symbol: string;
  qty: number;
  /** Session the buy filled (holding 0). */
  entry_session: string;
  entry_price_vnd: bigint;
  /** Gross + buy fee paid. */
  entry_cost_vnd: bigint;
  /** Session the holding limit counts from: entry, or P for positions converted at §11. */
  anchor_session: string;
  anchor_reason: AnchorReason;
  /** Free-form label of the buy universe at entry (display only). */
  entry_universe_label?: string | null;
};

export type PortfolioState = {
  cash_vnd: bigint;
  /** Sorted by symbol. */
  positions: PositionState[];
  /** Last session already processed; a step for the same or an earlier session is refused (R14). */
  last_session: string | null;
};

/** Market data + signals of one symbol for session D. */
export type SymbolSessionInput = {
  /** Official close of D in VND; null when the symbol has no valid bar in D (suspended). */
  close_vnd: bigint | null;
  /** Last known close up to D (valuation only, never a fill price). */
  last_close_vnd?: bigint | null;
  /** GTGD TB20: mean close × volume of the symbol's last 20 bars, D included (VND). */
  gtgd20_vnd: bigint | null;
  /** Buy side of the strategy at D (only `true` triggers). */
  buy_signal: Tri;
  /** Sell side of the strategy at D. */
  sell_signal: Tri;
  /** Sell side could not be evaluated for a reason worth journaling (e.g. a grant error, R05). */
  sell_issue?: string | null;
};

/** The strategy that runs in session D (from the locked schedule row), or null = none chosen. */
export type SessionStrategy = {
  max_holding: number;
  /** false for `sell_only` strategies. */
  buy_enabled: boolean;
  /** true when the Sell side has at least one enabled row. */
  sell_enabled: boolean;
};

export type SessionInput = {
  session: string;
  strategy: SessionStrategy | null;
  /** Buy universe at D, store-eligible, uppercase. */
  universe: readonly string[];
  /** Inputs of every universe member and every held symbol. A held symbol missing = no price. */
  symbols: Readonly<Record<string, SymbolSessionInput>>;
};

export type SessionParams = {
  fees: FeeRules;
};

export type ExitReason = 'indicator' | 'max_holding';

export type SessionSell = {
  symbol: string;
  qty: number;
  price_vnd: bigint;
  gross_vnd: bigint;
  fee_vnd: bigint;
  tax_vnd: bigint;
  /** gross − fee − tax, added to cash immediately (Q9). */
  net_vnd: bigint;
  entry_session: string;
  entry_price_vnd: bigint;
  entry_cost_vnd: bigint;
  anchor_session: string;
  anchor_reason: AnchorReason;
  /** net − entry cost. */
  pnl_vnd: bigint;
  exit_reason: ExitReason;
  /** Every reason that was true (both when the Sell condition and the limit coincide, R03). */
  exit_reasons: ExitReason[];
  /** Sessions from entry to D ("Thực giữ"). */
  holding_sessions: number;
  /** Sessions from anchor to D (used for the limit). */
  counted_sessions: number;
  max_holding_at_exit: number;
  sell_issue: string | null;
};

export type SessionBuy = {
  symbol: string;
  qty: number;
  price_vnd: bigint;
  gross_vnd: bigint;
  fee_vnd: bigint;
  /** gross + fee, taken from cash. */
  total_vnd: bigint;
  gtgd20_vnd: bigint;
  /** 1-based rank among the session's candidates. */
  rank: number;
  budget_vnd: bigint;
  /** entry + 2 sessions, when the calendar can tell (null otherwise). */
  sellable_from: string | null;
};

export type BuySkipCode =
  'session_buy_limit' | 'insufficient_cash' | 'budget_below_lot' | 'symbol_cap';

export type SessionSkip = {
  symbol: string;
  code: BuySkipCode;
  message: string;
  rank: number;
  gtgd20_vnd: bigint;
};

/** Per position decision when it was not sold, plus session-level notes. */
export type JournalCode =
  | 't2_wait'
  | 'sell_unknown'
  | 'sell_not_met'
  | 'no_sell_condition'
  | 'due_unfilled'
  | 'no_price'
  | 'sell_issue'
  | 'universe_empty'
  | 'no_strategy'
  | 'sell_only'
  | 'nav_incomplete';

export type JournalEntry = {
  symbol: string | null;
  code: JournalCode;
  message: string;
  /** For position entries: counted / held / limit at D. */
  counted_sessions?: number;
  holding_sessions?: number;
  max_holding?: number;
};

export type SessionNav = {
  /** Cash after the sells (sizing basis). */
  cash_after_sells_vnd: bigint;
  /** NAV used for sizing = cash after sells + Σ qty × close(D) of the remaining positions (§3.3 step 2). */
  sizing_nav_vnd: bigint | null;
  /** End of session (step 5): cash + Σ qty × close(D) (last close when D has none). */
  cash_vnd: bigint;
  market_value_vnd: bigint;
  nav_vnd: bigint;
  /** false when a held symbol has no close in D (buys are blocked, B14 v1.0). */
  complete: boolean;
};

export type SessionCounters = {
  sells: number;
  buys: number;
  time_exits: number;
  t2_blocked: number;
  due_unfilled: number;
  universe_empty: boolean;
  skipped_buys: number;
};

export type SessionResult = {
  session: string;
  rules_version: string;
  sells: SessionSell[];
  buys: SessionBuy[];
  skips: SessionSkip[];
  journal: JournalEntry[];
  nav: SessionNav;
  counters: SessionCounters;
  next_state: PortfolioState;
};

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------

/** Trading sessions of the store (VNINDEX dates) plus an optional prediction of future ones. */
export interface SessionCalendarLike {
  readonly dates: readonly string[];
  readonly first: string | null;
  readonly last: string | null;
  has(date: string): boolean;
  indexOf(date: string): number;
  /** Number of sessions s with `from < s <= to` (holding count; 0 when to <= from). */
  countSessions(from: string, to: string): number;
  /** The n-th session after `date` (n ≥ 1), predicted beyond the stored range when allowed. */
  addSessions(date: string, n: number): string | null;
  /** Stored sessions within [start, end]. */
  sessionsBetween(start: string, end: string): string[];
}

// ---------------------------------------------------------------------------------------------
// Price store (§2.1, D2–D4) — columnar series
// ---------------------------------------------------------------------------------------------

/** One symbol's full adjusted daily series, columnar (no per-bar objects, D8). */
export type SymbolSeries = {
  symbol: string;
  /** Index of each bar in the bundle calendar (strictly increasing). */
  session_idx: Int32Array;
  /** Prices in integer VND (VNINDEX: index points). */
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  series_rev: number;
};

/** Everything a basket run (or a Bot session) needs from the store, read once. */
export type PriceSeriesBundle = {
  /** VNINDEX dates up to `data_as_of` (the trading calendar). */
  calendar: string[];
  data_as_of: string | null;
  symbols: Record<string, SymbolSeries>;
  /** VNINDEX closes aligned to `calendar` (NaN where missing); null when unavailable. */
  market: Float64Array | null;
  /** sha256 over (symbol, series_rev, series_hash) of the loaded symbols. */
  data_hash: string;
};

export type PriceStoreMeta = {
  data_store: 'flashback_vn100';
  data_as_of: string | null;
  earliest_start: string | null;
  price_unit: 'VND';
  adjusted: boolean;
  sessions: number;
};

export type StoreEligibility = {
  /** Latest VN30 members that have bars in the store. */
  vn30: string[];
  /** Latest VN100 members that have bars in the store ("thuộc kho VN100"). */
  vn100: string[];
  membership_session: { vn30: string | null; vn100: string | null };
};

export interface PriceStorePort {
  meta(): Promise<PriceStoreMeta>;
  /** Stored sessions (VNINDEX dates), ascending. */
  calendar(): Promise<string[]>;
  /** Store-eligible current members (Backtest, D4). */
  eligibility(): Promise<StoreEligibility>;
  /** Members of VN30/VN100 effective at `session` (Bot, §2.2), store-eligible. */
  membersAt(index: 'VN30' | 'VN100', session: string): Promise<string[]>;
  /** Full series (from the first stored bar) of `symbols` up to `until` (default data_as_of). */
  loadSeries(symbols: readonly string[], options?: { until?: string }): Promise<PriceSeriesBundle>;
}

// ---------------------------------------------------------------------------------------------
// Backtest basket run (§4.7, §4.8)
// ---------------------------------------------------------------------------------------------

export type DataWarningCode =
  | 'UNIVERSE_CURRENT_MEMBERS'
  | 'UNIVERSE_SNAPSHOT'
  | 'SYMBOLS_EXCLUDED'
  | 'SYMBOL_SHORT_HISTORY'
  | 'MARKET_CONTEXT_UNAVAILABLE';

export type DataWarning = { code: DataWarningCode; message: string; symbols?: string[] };

export type BasketBacktestInput = {
  content: StrategyContent;
  /** Resolved, store-eligible symbols of the basket (≤ 100). */
  universe: readonly string[];
  /** Symbols dropped from the basket because they are outside the store (warning only). */
  excluded_symbols?: readonly string[];
  /** Inclusive dates (need not be sessions). */
  start: string;
  end: string;
  data: PriceSeriesBundle;
  fees?: FeeRules;
  /** Reuse signals across runs keyed by (config hash, symbol, series_rev). */
  signal_cache?: SignalCache;
  /** Precomputed signals (replays and golden tests); default = computed from `content`. */
  signals?: SignalProvider;
};

export type BacktestTrade = Omit<SessionSell, 'symbol'> & {
  symbol: string;
  exit_session: string;
  /** pnl / entry cost × 100. */
  pnl_pct: number;
};

export type BacktestCurvePoint = {
  date: string;
  nav_vnd: bigint;
  /** % returns since the start. */
  strategy: number;
  basket: number;
  vnindex: number | null;
};

export type BacktestKpis = {
  total_return_pct: number;
  /** null (`—`) when the run has fewer than 60 sessions. */
  annualized_return_pct: number | null;
  max_drawdown_pct: number;
  closed_trades: number;
  /** null (`—`) when no trade closed. */
  win_rate_pct: number | null;
  basket_buy_hold_pct: number;
  vnindex_pct: number | null;
};

export type BacktestPerSymbol = {
  symbol: string;
  closed_trades: number;
  wins: number;
  realized_pnl_vnd: bigint;
  unrealized_pnl_vnd: bigint;
  /** (realized + unrealized) / initial capital × 100. */
  contribution_pct: number;
};

export type BacktestOpenPosition = {
  symbol: string;
  entry_session: string;
  entry_price_vnd: bigint;
  qty: number;
  last_close_vnd: bigint;
  holding_sessions: number;
  counted_sessions: number;
  max_holding: number;
  /** Before the sell fee (§3.5). */
  unrealized_pnl_vnd: bigint;
  unrealized_pct: number;
};

export type BacktestSkippedOrder = {
  date: string;
  symbol: string;
  code: BuySkipCode;
  message: string;
};

export type BacktestResult = {
  rules_version: string;
  sessions: number;
  start_session: string | null;
  end_session: string | null;
  initial_cash_vnd: bigint;
  final_nav_vnd: bigint;
  cash_end_vnd: bigint;
  kpis: BacktestKpis;
  curve: BacktestCurvePoint[];
  trades: BacktestTrade[];
  per_symbol: BacktestPerSymbol[];
  open_positions: BacktestOpenPosition[];
  skipped_orders: {
    counts: Partial<Record<BuySkipCode, number>>;
    total: number;
    items: BacktestSkippedOrder[];
  };
  basket_buy_hold: { symbols: string[]; return_pct: number };
  warnings: DataWarning[];
  time_exits: number;
};

/** Memo of per-symbol signal series (worker-local). */
export type SignalCache = Map<string, SymbolSignals>;

/** Tri-state series aligned to a symbol's bars: 1 true, 0 false, -1 unknown. */
export type SymbolSignals = { buy: Int8Array; sell: Int8Array };

/** Signals of one strategy per symbol (memoised by the caller). */
export type SignalProvider = (symbol: string) => SymbolSignals | null;

export type DateRangeCheck =
  | { ok: true; start: string; end: string; earliest_start: string; latest_end: string }
  | { ok: false; code: 'DATE_RANGE_INVALID'; message: string };

// ---------------------------------------------------------------------------------------------
// Ports implemented by other workstreams (W2, W3, W4)
// ---------------------------------------------------------------------------------------------

/** Implemented by the price-store module (W1). */
export const PRICE_STORE = Symbol('PRICE_STORE');

/** Resolves `{source,id,version}` to content + label + hidden (W2). */
export const STRATEGY_READER = Symbol('STRATEGY_READER');
export interface StrategyReaderPort {
  /** `version` omitted = latest (user) / current (IQX). null when it does not exist for this user. */
  resolve(
    userId: string,
    ref: { source: StrategySource; id: string; version?: number },
    client?: SqlClient,
  ): Promise<ResolvedStrategy | null>;
}

/** Bot schedule (W3). */
export const BOT_SCHEDULE_PORT = Symbol('BOT_SCHEDULE_PORT');

export type ScheduleUsage = { last: boolean; next: boolean };

export type DuePosition = { symbol: string; counted: number; sell_session: string };

export type DueImpact = {
  next_session: string;
  n_current: number;
  n_new: number;
  positions: DuePosition[];
};

export type ScheduleApplyRequest = {
  ref: { source: StrategySource; id: string; version?: number };
  expected_next_session: string;
  confirm_due_positions?: readonly string[];
  /** user strategies: follow the latest version (default true for `user`). */
  follow_latest?: boolean;
};

export interface BotSchedulePort {
  usage(userId: string, source: StrategySource, id: string): Promise<ScheduleUsage>;
  /** Writes the unlocked next-session row inside the caller's transaction. */
  applyNext(tx: SqlClient, userId: string, request: ScheduleApplyRequest): Promise<unknown>;
  impact(
    userId: string,
    ref: { source: StrategySource; id: string; version?: number },
  ): Promise<DueImpact>;
  /** Number of Bots whose next session uses each IQX template id. */
  botCountsByIqx(): Promise<Map<string, number>>;
}

/** In-app + email notifications (W4). */
export const NOTIFICATION_WRITER = Symbol('NOTIFICATION_WRITER');

export type BotTradesNotificationPayload = {
  strategy_label: string;
  version_label: string;
  buys: Array<{ symbol: string; qty: number; price_vnd: string }>;
  sells: Array<{
    symbol: string;
    qty: number;
    price_vnd: string;
    exit_reason: ExitReason;
    pnl_vnd: string;
  }>;
};

export interface NotificationWriterPort {
  /** Inserted in the Bot run's commit transaction; deduplicated by (user, type, trade_date). */
  botTrades(
    tx: SqlClient,
    userId: string,
    tradeDate: string,
    payload: BotTradesNotificationPayload,
  ): Promise<void>;
}
