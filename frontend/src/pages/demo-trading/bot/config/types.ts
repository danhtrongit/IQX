/**
 * Shared Buy/Sell configuration of the 16 technical indicators (rule version
 * `iqx-rules-3.0`). One saved configuration per account is shared by the Bot and
 * the full Backtest; this tool is the only place that edits it.
 */
export type CompareOp = ">" | "<"
export type MembershipOp = "∈" | "∉"
export type RuleOp = CompareOp | MembershipOp
export type Side = "buy" | "sell"

export type Operand =
  | { kind: "series"; key: string; offset?: number }
  | { kind: "param"; key: string }
  | { kind: "constant"; value: number }

export type Rule =
  | { id: string; kind: "compare" | "cross"; lhs: Operand; op: CompareOp; rhs: Operand; allowed_ops: CompareOp[] }
  | {
      id: string
      kind: "membership"
      lhs: Operand
      op: MembershipOp
      rhs: { kind?: "interval"; lower: Operand; upper: Operand; bounds?: "open" }
      allowed_ops: MembershipOp[]
    }

export type SideConfig = { enabled: boolean; params: Record<string, number>; rules: Rule[] }
export type IndicatorConfig = { master_enabled: boolean; buy: SideConfig; sell: SideConfig }

export type SharedConfig = {
  schema_version: string
  revision: number
  rule_version: string
  indicators: Record<string, IndicatorConfig>
}

export type EffectiveStatus = "pending" | "effective" | "calendar_unavailable"

export type SharedConfigState = {
  /** 0 = never saved; `config` is then the registry default. */
  saved_revision: number
  effective_revision: number | null
  effective_session: string | null
  status: EffectiveStatus
  config: SharedConfig
  config_hash: string
  registry_version: string
  /** Indicator ids whose lesson quiz is passed (capability `indicator:<id>`). */
  granted_indicators: string[]
  legacy?: { needs_review: boolean } | null
}

export type SaveSharedConfigResult = {
  revision: number
  config: SharedConfig
  config_hash: string
  effective_session: string | null
  status: EffectiveStatus
}

export type RegistryField = {
  key: string
  label: string
  type: "integer" | "number"
  min: number
  max: number
  step: number
  unit: string
  api_scale: number
  wire_unit: string
}

export type RegistrySide = SideConfig & { field_overrides?: Record<string, Partial<RegistryField>> }

export type TechnicalIndicator = {
  id: string
  name: string
  chapter: number
  lesson_id: string
  family: "state" | "event"
  formula: string
  availability: "ohlcv" | "needs_history_context"
  fields: RegistryField[]
  buy: RegistrySide
  sell: RegistrySide
  learned: boolean
  /** Not published by the API yet; honoured when present. */
  validation?: { cross_fields?: { left: string; op: CompareOp; right: string }[] }
}

export type TechnicalRegistry = {
  calculation_version: string
  rule_version: string
  indicators: TechnicalIndicator[]
}
