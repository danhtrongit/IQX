/**
 * Kiểu dữ liệu cho trang Chiến lược (`/chien-luoc`) — port từ
 * `dashboard/src/features/backtest/types.ts` và `dashboard/src/features/alerts/types.ts`.
 *
 * Hợp đồng backend-v2 qua shared API boundary:
 * - `POST /backtest/run` trả BỐN khoá ở top level (`meta`, `kpis`, `equity_curve`,
 *   `trades`) — không bọc trong envelope `{ data, meta }`.
 * - `combination` của cảnh báo là JSON tự do `{ logic, conditions[] }`; `join` là
 *   liên kết với điều kiện TRƯỚC đó và bỏ trống ở điều kiện đầu.
 * - Giá trị upstream không có thì giữ `null` (UI render "—"), không ép về 0.
 */

/* ── Backtest ────────────────────────────────────────────────────────────── */

export type FactorKind = "bin" | "num"
export type Logic = "AND" | "OR"
export type Side = "buy" | "sell"

/** Một chỉ tiêu trong thư viện factor (`GET /backtest/catalog`). */
export type Factor = {
  id: string
  label: string
  side: Side
  group: string
  groupLabel: string
  kind: FactorKind
  indicator: string
  op: string
  /** Ngưỡng mặc định của backend; `null` với chỉ tiêu dạng tín hiệu (bin). */
  default: number | string | null
  editable: boolean
  min: number | null
  max: number | null
  step: number | null
  unit: string
  isPercent: boolean
  desc: string
}

export type FactorGroup = {
  group: string
  groupLabel: string
  factors: Factor[]
}

export type FactorLibrary = {
  buy: FactorGroup[]
  sell: FactorGroup[]
  count: number
}

/** Một preset rủi ro — backend phát dict không đồng nhất (mult/pct/amount). */
export type RiskPresetOption = {
  value: string | number | null
  label: string
  mult?: number
  pct?: number
  amount?: number
}

export type RiskPresets = {
  stopLoss: RiskPresetOption[]
  takeProfit: RiskPresetOption[]
  positionSize: RiskPresetOption[]
  fee: RiskPresetOption[]
}

export type Template = {
  key: string
  name: string
  description: string
  config: StrategyConfig
}

export type Catalog = {
  factors: FactorLibrary
  templates: Template[]
  riskPresets: RiskPresets
}

export type StopLossMode = "none" | "atr" | "fixed"
export type PositionSizeMode = "all" | "half" | "quarter" | "tenth" | "fixed"
export type FeeMode = "standard" | "low" | "none"

/** `risk` của `POST /backtest/run` — đủ cả 8 trường backend chấp nhận. */
export type RiskInput = {
  stopLoss: StopLossMode
  stopAtrMult: number
  stopFixedPct: number
  takeProfitPct: number | null
  maxHolding: number | null
  positionSize: PositionSizeMode
  positionFixedAmount: number
  fee: FeeMode
}

/** Lựa chọn trong UI: id factor + ngưỡng đã chỉnh (chỉ với factor `num`). */
export type Selection = {
  id: string
  value?: number
}

export type StrategySideConfig = {
  logic: Logic
  factors: { id: string; value?: number }[]
}

export type StrategyConfig = {
  buy: StrategySideConfig
  sell: StrategySideConfig
  risk: RiskInput
}

export type RunRequest = {
  symbol: string
  start: string
  end: string
  capital: number
  buy: StrategySideConfig
  sell: StrategySideConfig
  risk: RiskInput
}

export type Kpis = {
  cagr: number | null
  sharpe: number | null
  sharpeCi: [number | null, number | null]
  maxDrawdown: number | null
  ddRecoverySessions: number | null
  winRate: number | null
  nTrades: number
  nWins: number
  avgHold: number | null
  netReturn: number | null
  buyHoldReturn: number | null
  nSessions: number
}

export type EquityPoint = {
  date: string
  strategy: number
  buyHold: number
  /** Do pass benchmark của backend gắn vào (base 100, forward-filled). */
  vnindex?: number
}

export type Trade = {
  idx: number
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  hold: number
  pnlPct: number
  trigger: string
  entryTrigger: string
}

export type RunMeta = {
  symbol: string
  start: string
  end: string
  nSessions: number
  capital: number
}

export type RunResult = {
  meta: RunMeta
  kpis: Kpis
  equityCurve: EquityPoint[]
  trades: Trade[]
}

export type SavedStrategy = {
  id: string
  name: string
  symbol: string | null
  config: StrategyConfig
  createdAt: string
  updatedAt: string
}

/** Mặc định của form — `stop_loss` mặc định của backend là `atr`. */
export const DEFAULT_RISK: RiskInput = {
  stopLoss: "atr",
  stopAtrMult: 2,
  stopFixedPct: 0.05,
  takeProfitPct: null,
  maxHolding: 60,
  positionSize: "all",
  positionFixedAmount: 10_000_000,
  fee: "standard",
}

/* ── Cảnh báo ────────────────────────────────────────────────────────────── */

export type Condition = {
  indicator: string
  op: string
  value: number | string | null
  /** Liên kết với điều kiện trước (AND/OR); bỏ trống ở điều kiện đầu. */
  join?: Logic | null
}

export type Combination = {
  logic: Logic
  conditions: Condition[]
}

export type AlertSignal = {
  key: string
  side: Side
  taName: string
  messageTitle: string
  combination: Combination | null
  isEnabled: boolean
  sortOrder: number
}

export type UserAlertRule = {
  id: string
  name: string
  side: Side
  baseSignalKey: string | null
  combination: Combination | null
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type AlertEvent = {
  id: string
  symbol: string
  signalKey: string | null
  sessionDate: string
  firedAt: string
  price: number | null
  delivered: boolean
}

export type TelegramStatus = {
  linked: boolean
  linkedAt: string | null
  botUsername: string | null
}

export type TelegramLink = {
  deepLink: string
  token: string
}

/** `POST /alerts/rules` — theo preset (`signal_key`) hoặc tùy chỉnh đầy đủ. */
export type CreateRuleBody = {
  signalKey?: string
  name?: string
  side?: Side
  combination?: Combination
  isEnabled?: boolean
}

export type UpdateRuleBody = {
  name?: string
  combination?: Combination
  isEnabled?: boolean
}
