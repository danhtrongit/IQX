/** Types for the backtester feature — mirror the backend payloads. */

export type FactorKind = "bin" | "num"
export type Logic = "AND" | "OR"
export type Side = "buy" | "sell"

export interface Factor {
  id: string
  label: string
  side: Side
  group: string
  group_label: string
  kind: FactorKind
  indicator: string
  op: string
  default: number | string | null
  editable: boolean
  min: number | null
  max: number | null
  step: number | null
  unit: string
  is_percent: boolean
  desc: string
}

export interface FactorGroup {
  group: string
  group_label: string
  factors: Factor[]
}

export interface FactorLibrary {
  buy: FactorGroup[]
  sell: FactorGroup[]
  count: number
}

export interface RiskPresetOption {
  value: string | number | null
  label: string
  mult?: number
  pct?: number
  amount?: number
}

export interface RiskPresets {
  stop_loss: RiskPresetOption[]
  take_profit: RiskPresetOption[]
  position_size: RiskPresetOption[]
  fee: RiskPresetOption[]
}

export interface StrategyConfig {
  buy: { logic: Logic; factors: { id: string; value?: number }[] }
  sell: { logic: Logic; factors: { id: string; value?: number }[] }
  risk: RiskInput
}

export interface Template {
  key: string
  name: string
  description: string
  config: StrategyConfig
}

export interface CatalogResponse {
  factors: FactorLibrary
  templates: Template[]
  risk_presets: RiskPresets
}

export interface RiskInput {
  stop_loss: "none" | "atr" | "fixed"
  stop_atr_mult: number
  stop_fixed_pct: number
  take_profit_pct: number | null
  max_holding: number | null
  position_size: "all" | "half" | "fixed"
  position_fixed_amount: number
  fee: "standard" | "low"
}

export interface RunRequest {
  symbol: string
  start: string
  end: string
  capital: number
  buy: StrategyConfig["buy"]
  sell: StrategyConfig["sell"]
  risk: RiskInput
}

export interface Kpis {
  cagr: number | null
  sharpe: number | null
  sharpe_ci: [number | null, number | null]
  max_drawdown: number | null
  dd_recovery_sessions: number | null
  win_rate: number | null
  n_trades: number
  n_wins: number
  avg_hold: number | null
  net_return: number | null
  buy_hold_return: number | null
  n_sessions: number
}

export interface EquityPoint {
  date: string
  strategy: number
  buy_hold: number
}

export interface Trade {
  idx: number
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  hold: number
  pnl_pct: number
  trigger: string
}

export interface RunResult {
  meta: { symbol: string; start: string; end: string; n_sessions: number; capital: number }
  kpis: Kpis
  equity_curve: EquityPoint[]
  trades: Trade[]
}

export interface SavedStrategy {
  id: string
  name: string
  symbol: string | null
  config: StrategyConfig & { symbol?: string; start?: string; end?: string; capital?: number }
  created_at: string
  updated_at: string
}

/** Local UI selection: factor id + (for NUM factors) the tuned threshold. */
export interface Selection {
  id: string
  value?: number
}

export const DEFAULT_RISK: RiskInput = {
  stop_loss: "atr",
  stop_atr_mult: 2.0,
  stop_fixed_pct: 0.05,
  take_profit_pct: null,
  max_holding: 60,
  position_size: "all",
  position_fixed_amount: 10_000_000,
  fee: "standard",
}
