/**
 * Shared Buy/Sell configuration of the 16 technical indicators (rule version `iqx-rules-4.0`,
 * SPEC V3). One saved configuration per account is shared by the Bot and the full Backtest; this
 * tool is the only place that edits it.
 *
 * The 15 row-based indicators store one row per registry condition, each with its own periods,
 * thresholds and operator (`model: "rows"`). Volume keeps its side-level params and rule
 * templates (`model: "legacy_params"`).
 */
export type CompareOp =
  | ">"
  | "<"
  | "cross_up"
  | "cross_down"
  | "reenter_lower"
  | "reenter_upper"
  | "break_upper"
  | "break_lower"
  | "cross_up_middle"
  | "cross_down_middle"
  | "break_high"
  | "break_low"
export type MembershipOp = "∈" | "∉"
export type RuleOp = CompareOp | MembershipOp
export type Side = "buy" | "sell"

/* ── Volume (params + rule templates) ───────────────────────────────────── */

export type Operand =
  | { kind: "series"; key: string; offset?: number; offset_param?: string }
  | { kind: "param"; key: string }
  | { kind: "constant"; value: number }

export type Rule =
  | {
      id: string
      kind: "compare" | "cross"
      enabled?: boolean
      lhs: Operand
      op: CompareOp
      rhs: Operand
      allowed_ops: CompareOp[]
    }
  | {
      id: string
      kind: "membership"
      enabled?: boolean
      lhs: Operand
      op: MembershipOp
      rhs: { kind?: "interval"; lower: Operand; upper: Operand; bounds?: "open" }
      allowed_ops: MembershipOp[]
    }

export type ParamsSideConfig = { enabled: boolean; params: Record<string, number>; rules: Rule[] }

/* ── Row conditions (15 indicators) ─────────────────────────────────────── */

/** Values of one condition row: numbers (periods, thresholds) and enum codes (`op`, `dir`…). */
export type RowValues = Record<string, number | string>

/** One stored condition row: its stable id (`rsi.trend`), its switch and its own values. */
export type ConditionRow = { id: string; enabled: boolean; [field: string]: number | string | boolean }

export type RowSideConfig = { enabled: boolean; rules: ConditionRow[] }

export type SideConfig = RowSideConfig | ParamsSideConfig
export type IndicatorConfig = { master_enabled: boolean; buy: SideConfig; sell: SideConfig }

export type SharedConfig = {
  schema_version: string
  revision: number
  rule_version: string
  indicators: Record<string, IndicatorConfig>
}

export type EffectiveStatus = "pending" | "effective" | "calendar_unavailable"

/** The revision the Bot uses today: the newest saved one whose effective session has started. */
export type EffectiveSharedConfig = {
  revision: number
  effective_session: string
  config_hash: string
  config: SharedConfig
  /** Stored in a format before `iqx-rules-4.0`: `config` is the SPEC V3 reset, never evaluated. */
  outdated?: boolean
  legacy?: { needs_review: boolean } | null
}

export type SharedConfigState = {
  /** 0 = never saved; `config` is then the registry default. */
  saved_revision: number
  effective_revision: number | null
  /** Session from which the LATEST SAVED revision counts (not the one in force). */
  effective_session: string | null
  /** Status of the latest saved revision. */
  status: EffectiveStatus
  /** The latest SAVED config: what the form edits, not necessarily the one in force. */
  config: SharedConfig
  config_hash: string
  registry_version: string
  /** Indicator ids whose lesson quiz is passed (capability `indicator:<id>`). */
  granted_indicators: string[]
  /** The latest saved revision is in an old format: `config` holds the new defaults (switches kept). */
  outdated?: boolean
  legacy?: { needs_review: boolean } | null
  /** The config in force today; `null` before any revision became effective. */
  effective?: EffectiveSharedConfig | null
}

export type SaveSharedConfigResult = {
  revision: number
  config: SharedConfig
  config_hash: string
  effective_session: string | null
  status: EffectiveStatus
}

/* ── Registry ───────────────────────────────────────────────────────────── */

/** `left op right` must hold between two params of the same side (Volume; e.g. `fast < slow`). */
export type CrossField = { left: string; op: CompareOp; right: string }

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
  options?: readonly number[]
}

export type RegistrySide = ParamsSideConfig & { field_overrides?: Record<string, Partial<RegistryField>> }

/** A number slot of a row sentence; `options` makes it a select (SMA / MA Cross periods). */
export type RowNumberField = {
  key: string
  /** Also the label of the validation messages (`Chu kỳ RSI phải từ 2 đến 200, số nguyên.`). */
  label: string
  type: "integer" | "number"
  min: number
  max: number
  step: number
  options?: readonly number[]
}
export type RowEnumOption = { value: string; label: string }
/** A select slot of a row sentence: stable code stored, label shown (`cross_up` → `cắt lên`). */
export type RowEnumField = { key: string; label: string; type: "enum"; options: readonly RowEnumOption[] }
export type RowField = RowNumberField | RowEnumField

/** `left < right` between two numeric fields of the same row (fast < slow). */
export type RowConstraint = { left: string; op: "<"; right: string }

/**
 * One condition row of the registry. `sentence` is the row text with `{field}` placeholders in
 * input order (`"RSI {period} {op} {threshold}"`); the fixed text is shown verbatim.
 */
export type RowDefinition = {
  id: string
  sentence: string
  fields: readonly RowField[]
  constraints: readonly RowConstraint[]
  default_enabled: boolean
  buy: RowValues
  sell: RowValues
}

type IndicatorBase = {
  id: string
  name: string
  chapter: number
  /** null while the lesson is not published (Học viện v3.2 ships chapters gradually). */
  lesson_id: string | null
  family: "state" | "event"
  formula: string
  availability: "ohlcv" | "needs_history_context"
  learned: boolean
}

export type RowsIndicator = IndicatorBase & { model: "rows"; rows: readonly RowDefinition[] }

export type ParamsIndicator = IndicatorBase & {
  model: "legacy_params"
  fields: RegistryField[]
  buy: RegistrySide
  sell: RegistrySide
  /** `cross_fields` are enforced on save (e.g. `fast < slow`). */
  validation?: { cross_fields?: CrossField[] }
}

export type TechnicalIndicator = RowsIndicator | ParamsIndicator

export type TechnicalRegistry = {
  calculation_version: string
  rule_version: string
  indicators: TechnicalIndicator[]
}

export const isRowsIndicator = (indicator: TechnicalIndicator): indicator is RowsIndicator => indicator.model === "rows"

/** A Volume-style side (`params` + rule templates); every other side is a list of rows. */
export const isParamsSide = (side: SideConfig): side is ParamsSideConfig => "params" in side
