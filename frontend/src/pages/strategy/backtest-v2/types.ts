/**
 * DTOs of the bot-v2 Backtest (`/strategy/backtests`, CONTRACTS §4).
 *
 * `RunResult` mirrors `backend/src/modules/quant/v2/types.ts` (CLEAN_TECH_2.0
 * engine). KPI values travel in percent units (net_return 12.5 = +12,5%); a KPI
 * the engine cannot compute is `null` and the UI renders "—", never 0.
 */
import type { SharedConfig, Side } from "@/lib/shared-config"

export type Execution = "same_close" | "next_open"
export type FeePreset = "standard" | "none"

export type ExecutionProfile = {
  stop_loss: string
  take_profit_pct: number | null
  max_holding: number | null
  trailing: string
  position_size: string
  lot_size: number
  min_held_bars: number
}

export type RunOptions = {
  capital: number
  fee_buy: number
  fee_sell: number
  lot: number
  execution: Execution
  min_held_bars: number
  start: string
  end: string
}

export type CurvePoint = {
  date: string
  value: number
  return_pct: number
  buy_hold_pct: number
  market_pct: number | null
  phase?: "before_first_execution"
}

export type ClosedTrade = {
  number: number
  qty: number
  entry_date: string
  entry_signal_date: string
  entry_price: number
  exit_date: string
  exit_signal_date: string
  exit_price: number
  hold: number
  pnl: number
  pnl_pct: number
  exit_reason: string
  concurrent_reasons?: string[]
}

export type OpenPosition = {
  qty: number
  price: number
  cost: number
  index: number
  date: string
  signal_date: string
  last_price: number
  market_value: number
  unrealized_pnl: number
}

export type CanceledOrder = { reason: "end_of_range"; action: Side; signalIndex: number }

/** Percent units; `null` = not computable (rendered "—"). */
export type Kpis = {
  net_return: number | null
  cagr: number | null
  max_drawdown: number | null
  n_trades: number | null
  n_wins: number | null
  win_rate: number | null
  buy_hold_return: number | null
  market_return: number | null
  profit_factor: number | null
}

/** Run snapshot: the engine part is frozen; the service adds data/fee/version metadata. */
export type RunSnapshot = {
  config: SharedConfig
  options: RunOptions
  actual_start: string
  actual_end: string
  bar_count: number
  shared_revision?: number
  config_hash?: string
  data_hash?: string
  data_source?: string
  requested_start?: string
  requested_end?: string
  fee_preset?: FeePreset
  open_position_policy?: string
  [extra: string]: unknown
}

export type RunResult = {
  schema_version: string
  engine_version: string
  calculation_version: string
  rule_version: string
  formula_version: string
  profile: ExecutionProfile
  snapshot: RunSnapshot
  initial: CurvePoint
  /** Full curve and full trade history — never truncated. */
  curve: CurvePoint[]
  trades: ClosedTrade[]
  open_position: OpenPosition | null
  cash: number
  canceled: CanceledOrder[]
  kpis: Kpis
  /** `research_result` (CONTRACTS §4.1), when `research` was requested. */
  research_result?: unknown
  /** `system_result` (CONTRACTS §4.1), when `system` was requested. */
  system_result?: unknown
}

export type ParamPath = { indicator: string; side: Side; key: string }

export type ResearchRequest =
  | { kind: "sensitivity"; path: ParamPath; values: number[] }
  | { kind: "out_of_sample"; split_date: string }
  | {
      kind: "walk_forward"
      path: ParamPath
      values: number[]
      train_bars: number
      test_bars: number
      step_bars: number
      criterion: "net_return"
      min_trades: number
    }

export type ResearchKind = ResearchRequest["kind"]

export type LogicNode =
  | { type: "indicator"; indicator_id: string }
  | { type: "and" | "or"; children: LogicNode[] }
  | { type: "not"; child: LogicNode }

export type RankingKey = "roc_20" | "rs_market" | "relative_volume" | "distance_52w_high"
export type UniverseMarket = "HOSE" | "HNX" | "UPCOM" | "ALL"

/**
 * Frozen `system` payload (CONTRACTS §4.1) — the subset this screen sends.
 * Every present key is capability-gated server-side.
 */
export type SystemRequest = {
  symbols?: string[]
  universe?: { list_id?: string; market?: UniverseMarket }
  ranking?: { key: RankingKey; direction: "desc" | "asc" }
  logic?: LogicNode
  sizing?: { mode: "pct_nav"; pct: number } | { mode: "fixed_amount"; amount_vnd: number }
  max_positions?: number
}

/** `system_result` (CONTRACTS §4.1). */
export type SystemResult = {
  curve: CurvePoint[]
  trades: (ClosedTrade & { symbol: string })[]
  positions_open: (OpenPosition & { symbol: string })[]
  kpis: Kpis
  ledger_size: number
  applied: string[]
}

export type BacktestAssumptions = {
  capital?: number
  fee_preset: FeePreset
  execution: Execution
}

export type BacktestRunRequest = {
  idempotency_key: string
  shared_revision: number
  symbol: string
  start: string
  end: string
  assumptions: BacktestAssumptions
  research?: ResearchRequest
  system?: SystemRequest
}

export type BacktestRunResponse = {
  run_id: string
  status: "succeeded" | "failed"
  kind?: string
  result: RunResult
  research_result?: unknown
  system_result?: unknown
}

export type BacktestRunSummary = {
  run_id: string
  kind: string
  status: string
  shared_revision: number | null
  symbol: string | null
  start: string | null
  end: string | null
  created_at: string | null
}

/** Advanced capability ids that this screen can request (CONTRACTS §2). */
export type AdvancedCapability =
  | ResearchKind
  | "universe"
  | "ranking"
  | "logic_groups"
  | "sizing_pct_nav"
  | "sizing_fixed_amount"
  | "max_positions"
  | "portfolio"
