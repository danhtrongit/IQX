/**
 * Pure helpers of the per-indicator config form.
 *
 * The draft lives only in the form. Row values (15 indicators) and Volume params are kept as the
 * text the user typed, so a half-typed value never silently becomes a number and `-0.05` is
 * saved as `-0.05`. Every row of a tab is its own: editing one never touches another, and the
 * Mua and Bán tabs are independent. Volume's rule structure (operands) is fixed by the registry.
 */
import { formatNum } from "../format"
import {
  isParamsSide,
  isRowsIndicator,
  type ConditionRow,
  type CrossField,
  type IndicatorConfig,
  type ParamsIndicator,
  type ParamsSideConfig,
  type RegistryField,
  type RowDefinition,
  type RowSideConfig,
  type RowsIndicator,
  type Rule,
  type RuleOp,
  type Side,
  type SharedConfigState,
  type SideConfig,
  type TechnicalIndicator,
} from "./types"
import { fieldValue, SIDE_LABEL, validateSideRows, type RowError } from "./validate"

export { SIDE_LABEL }
export const SIDES: readonly Side[] = ["buy", "sell"]

/** One condition row being edited: its switch and every field as text (number) or code (enum). */
export type DraftRow = { id: string; enabled: boolean; values: Record<string, string> }

export type DraftSide = {
  enabled: boolean
  /** Row conditions, in registry order (empty for Volume). */
  rows: DraftRow[]
  /** Volume only: side-level params as typed, operators and switches per rule id. */
  params: Record<string, string>
  ops: Record<string, RuleOp>
  rules_enabled?: Record<string, boolean>
}
export type IndicatorDraft = Record<Side, DraftSide>

/* ── Registry defaults ──────────────────────────────────────────────────── */

/** Default rows of one tab (SPEC V3 §3): every row with its own default values and switch. */
export function defaultRows(indicator: RowsIndicator, side: Side): ConditionRow[] {
  return indicator.rows.map((row) => ({ id: row.id, enabled: row.default_enabled, ...row[side] }))
}

function templateSide(indicator: TechnicalIndicator, side: Side): SideConfig {
  if (isRowsIndicator(indicator)) return { enabled: false, rules: defaultRows(indicator, side) } satisfies RowSideConfig
  const { enabled, params, rules } = indicator[side]
  return { enabled, params: { ...params }, rules: rules.map((rule) => ({ ...rule })) as Rule[] } satisfies ParamsSideConfig
}

/** The registry default of one indicator: master OFF, both tabs OFF, rows at their defaults. */
export function templateConfig(indicator: TechnicalIndicator): IndicatorConfig {
  return { master_enabled: false, buy: templateSide(indicator, "buy"), sell: templateSide(indicator, "sell") }
}

/** True when a stored tab has exactly the registry rows (ids in order) of a row-based indicator. */
function hasRegistryRows(indicator: RowsIndicator, side: SideConfig | undefined): side is RowSideConfig {
  if (!side || isParamsSide(side) || !Array.isArray(side.rules) || side.rules.length !== indicator.rows.length) return false
  return indicator.rows.every((row, index) => side.rules[index]?.id === row.id)
}

/**
 * Saved config of one indicator, or the registry default when it was never saved. A tab whose
 * rows are not the registry's (a response in an older format) is never mapped: it reads as the
 * default rows, keeping only the switches.
 */
export function savedIndicatorConfig(state: SharedConfigState | undefined, indicator: TechnicalIndicator): IndicatorConfig {
  const saved = state?.config.indicators[indicator.id]
  if (!saved) return templateConfig(indicator)
  if (!isRowsIndicator(indicator)) return saved
  const sideOf = (side: Side): SideConfig =>
    hasRegistryRows(indicator, saved[side]) ? saved[side] : { enabled: saved[side]?.enabled === true, rules: defaultRows(indicator, side) }
  return { master_enabled: saved.master_enabled, buy: sideOf("buy"), sell: sideOf("sell") }
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

const textOf = (value: unknown): string => (value === undefined || value === null ? "" : String(value))

/** A stored row as draft text: `-0.05` stays `"-0.05"`, an enum code stays its code. */
export function draftRow(row: ConditionRow): DraftRow {
  const values = Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== "id" && key !== "enabled")
      .map(([key, value]) => [key, textOf(value)]),
  )
  return { id: row.id, enabled: row.enabled !== false, values }
}

function draftSide(config: SideConfig): DraftSide {
  if (!isParamsSide(config)) return { enabled: config.enabled, rows: config.rules.map(draftRow), params: {}, ops: {} }
  return {
    enabled: config.enabled,
    rows: [],
    params: Object.fromEntries(Object.entries(config.params).map(([key, value]) => [key, String(value)])),
    ops: Object.fromEntries(config.rules.map((rule) => [rule.id, rule.op])),
    rules_enabled: Object.fromEntries(config.rules.map((rule) => [rule.id, rule.enabled !== false])),
  }
}

export function createDraft(config: IndicatorConfig): IndicatorDraft {
  return { buy: draftSide(config.buy), sell: draftSide(config.sell) }
}

/** Replace one row of one tab; every other row and the other tab are left as they are. */
export function updateDraftRow(draft: IndicatorDraft, side: Side, index: number, row: DraftRow): IndicatorDraft {
  return { ...draft, [side]: { ...draft[side], rows: draft[side].rows.map((item, at) => (at === index ? row : item)) } }
}

/**
 * Đặt lại: the rows (or Volume params and operators) of ONE tab go back to the registry
 * defaults. ON/OFF of that tab, the other tab and the master are untouched; the user still has
 * to press Lưu to commit.
 */
export function resetDraftSide(draft: IndicatorDraft, indicator: TechnicalIndicator, side: Side): IndicatorDraft {
  const defaults = draftSide(templateSide(indicator, side))
  return {
    ...draft,
    [side]: { ...defaults, enabled: draft[side].enabled },
  }
}

export function isDraftDirty(initial: IndicatorDraft, draft: IndicatorDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(draft)
}

const pick = <T,>(mine: T | undefined, before: T | undefined, latest: T | undefined): T | undefined => (mine === before ? latest : mine)

function rebaseRows(draft: DraftRow[], oldBase: DraftRow[], newBase: DraftRow[]): DraftRow[] {
  return newBase.map((latest, index) => {
    const mine = draft[index]
    const before = oldBase[index]
    if (!mine || !before || mine.id !== latest.id || before.id !== latest.id) return latest
    const keys = new Set([...Object.keys(latest.values), ...Object.keys(mine.values)])
    return {
      id: latest.id,
      enabled: pick(mine.enabled, before.enabled, latest.enabled) ?? mine.enabled,
      values: Object.fromEntries([...keys].map((key) => [key, pick(mine.values[key], before.values[key], latest.values[key]) ?? ""])),
    }
  })
}

function rebaseSide(draft: DraftSide, oldBase: DraftSide, newBase: DraftSide): DraftSide {
  const paramKeys = new Set([...Object.keys(newBase.params), ...Object.keys(draft.params)])
  const opKeys = new Set([...Object.keys(newBase.ops), ...Object.keys(draft.ops)])
  return {
    enabled: pick(draft.enabled, oldBase.enabled, newBase.enabled) ?? draft.enabled,
    rows: rebaseRows(draft.rows, oldBase.rows, newBase.rows),
    params: Object.fromEntries([...paramKeys].map((key) => [key, pick(draft.params[key], oldBase.params[key], newBase.params[key]) ?? ""])),
    ops: Object.fromEntries(
      [...opKeys].flatMap((key) => {
        const op = pick(draft.ops[key], oldBase.ops[key], newBase.ops[key])
        return op ? [[key, op] as const] : []
      }),
    ),
    ...(newBase.rules_enabled || draft.rules_enabled
      ? {
          rules_enabled: Object.fromEntries(
            [...opKeys].map((key) => [key, pick(draft.rules_enabled?.[key], oldBase.rules_enabled?.[key], newBase.rules_enabled?.[key]) ?? true]),
          ),
        }
      : {}),
  }
}

/**
 * After a conflict the newest saved config is loaded without losing the user's work:
 * every value the user changed is kept, every value they did not touch follows the
 * newer saved config. Nothing newer is overwritten by an untouched, stale field.
 */
export function rebaseDraft(draft: IndicatorDraft, oldBase: IndicatorConfig, newBase: IndicatorConfig): IndicatorDraft {
  const before = createDraft(oldBase)
  const latest = createDraft(newBase)
  return { buy: rebaseSide(draft.buy, before.buy, latest.buy), sell: rebaseSide(draft.sell, before.sell, latest.sell) }
}

/* ── Volume param fields ────────────────────────────────────────────────── */

/** A side's field metadata: the base field merged with that side's override. */
export function sideField(indicator: ParamsIndicator, side: Side, key: string): RegistryField | undefined {
  const base = indicator.fields.find((field) => field.key === key)
  if (!base) return undefined
  return { ...base, ...(indicator[side].field_overrides?.[key] ?? {}) } as RegistryField
}

/** The param fields of one side (Volume); none for a row-based indicator. */
export function sideFields(indicator: TechnicalIndicator, side: Side): RegistryField[] {
  if (isRowsIndicator(indicator)) return []
  return indicator.fields
    .map((field) => sideField(indicator, side, field.key))
    .filter((field): field is RegistryField => !!field && Object.hasOwn(indicator[side].params, field.key))
}

const EPSILON = 1e-6

export function paramError(field: RegistryField, text: string | undefined): string | null {
  const range = `từ ${formatNum(field.min)} đến ${formatNum(field.max)}`
  if (text === undefined || text.trim() === "") return `${field.label}: bắt buộc nhập.`
  const value = Number(text)
  if (!Number.isFinite(value)) return `${field.label}: phải là số.`
  if (field.type === "integer" && !Number.isInteger(value)) return `${field.label}: nhập số nguyên ${range}.`
  if (value < field.min || value > field.max) return `${field.label}: nhập ${field.type === "integer" ? "số nguyên " : ""}${range}.`
  const steps = (value - field.min) / field.step
  if (Math.abs(steps - Math.round(steps)) > EPSILON) return `${field.label}: nhập ${range}, bước ${formatNum(field.step)}.`
  return null
}

/** The cross-field constraints of a params indicator, as the registry publishes them. */
export function crossFieldsOf(indicator: ParamsIndicator): CrossField[] {
  return indicator.validation?.cross_fields ?? []
}

/** `Chu kỳ EMA nhanh` -> `chu kỳ EMA nhanh` inside a sentence; an acronym-first label keeps its case. */
function inSentence(label: string): string {
  return /^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

/** `Chu kỳ EMA nhanh phải nhỏ hơn chu kỳ EMA chậm.` for `{ left: "fast", op: "<", right: "slow" }`. */
export function crossFieldMessage(indicator: ParamsIndicator, side: Side, cross: CrossField): string {
  const label = (key: string) => sideField(indicator, side, key)?.label ?? key
  return `${label(cross.left)} phải ${cross.op === "<" ? "nhỏ hơn" : "lớn hơn"} ${inSentence(label(cross.right))}.`
}

/* ── Validation ─────────────────────────────────────────────────────────── */

/**
 * Per tab: the row errors (SPEC V3 §4 messages, in row order) and, for Volume, a message per
 * param field keyed by the field the API would name.
 */
export type DraftErrors = Record<Side, { rows: RowError[]; fields: Record<string, string> }>

function paramsErrors(indicator: ParamsIndicator, side: Side, draft: DraftSide): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const field of sideFields(indicator, side)) {
    const error = paramError(field, draft.params[field.key])
    if (error) fields[field.key] = error
  }
  // A cross-field rule is judged on two valid numbers only and reported on its left field, as the API does.
  for (const cross of crossFieldsOf(indicator)) {
    if (fields[cross.left] || fields[cross.right]) continue
    const leftText = draft.params[cross.left]
    const rightText = draft.params[cross.right]
    if (leftText === undefined || rightText === undefined) continue
    const left = Number(leftText)
    const right = Number(rightText)
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue
    if (!(cross.op === "<" ? left < right : left > right)) fields[cross.left] = crossFieldMessage(indicator, side, cross)
  }
  return fields
}

/** Both tabs are checked, every row included, whatever its switch or the tab's switch. */
export function draftErrors(indicator: TechnicalIndicator, draft: IndicatorDraft): DraftErrors {
  const result: DraftErrors = { buy: { rows: [], fields: {} }, sell: { rows: [], fields: {} } }
  for (const side of SIDES) {
    if (isRowsIndicator(indicator)) result[side].rows = validateSideRows(indicator.id, indicator.rows, side, draft[side].rows)
    else result[side].fields = paramsErrors(indicator, side, draft[side])
  }
  return result
}

export function hasDraftErrors(errors: DraftErrors): boolean {
  return SIDES.some((side) => errors[side].rows.length > 0 || Object.keys(errors[side].fields).length > 0)
}

/* ── Build the PATCH record ─────────────────────────────────────────────── */

/** A stored row from its draft: numbers parsed from the typed text, enum codes as chosen. */
export function rowFromDraft(definition: RowDefinition, row: DraftRow): ConditionRow {
  const values = Object.fromEntries(definition.fields.map((field) => [field.key, fieldValue(field, row.values[field.key])]))
  return { id: definition.id, enabled: row.enabled, ...values }
}

function applyRule(rule: Rule, op: RuleOp | undefined, enabled: boolean | undefined): Rule {
  const nextOp = op && (rule.allowed_ops as RuleOp[]).includes(op) ? op : rule.op
  const next = { ...rule, op: nextOp } as Rule
  if (enabled !== undefined && (rule.enabled !== undefined || enabled !== true)) {
    next.enabled = enabled
  }
  return next
}

function buildSide(indicator: TechnicalIndicator, side: Side, saved: SideConfig, draft: DraftSide): SideConfig {
  if (isRowsIndicator(indicator)) {
    return { enabled: draft.enabled, rules: indicator.rows.map((definition, index) => rowFromDraft(definition, draft.rows[index] ?? { id: definition.id, enabled: false, values: {} })) }
  }
  const rules = isParamsSide(saved) ? saved.rules : indicator[side].rules
  return {
    enabled: draft.enabled,
    params: Object.fromEntries(Object.entries(draft.params).map(([key, text]) => [key, Number(text)])),
    rules: rules.map((rule) => applyRule(rule, draft.ops[rule.id], draft.rules_enabled?.[rule.id])),
  }
}

/**
 * Indicator record sent in the PATCH. Master is only switched ON when the form was opened from
 * the master switch (`activate`) and a tab is ON; both tabs OFF always saves master OFF (there is
 * no empty-but-true condition). Editing values never flips the master.
 */
export function buildIndicatorConfig(indicator: TechnicalIndicator, saved: IndicatorConfig, draft: IndicatorDraft, activate: boolean): IndicatorConfig {
  const buy = buildSide(indicator, "buy", saved.buy, draft.buy)
  const sell = buildSide(indicator, "sell", saved.sell, draft.sell)
  const master = buy.enabled || sell.enabled ? activate || saved.master_enabled : false
  return { master_enabled: master, buy, sell }
}

/** JSON with sorted object keys: two configs are the same whatever key order the server stored. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** True when saving `next` would not change `saved` (key order aside). */
export function sameIndicatorConfig(saved: IndicatorConfig, next: IndicatorConfig): boolean {
  return canonical(saved) === canonical(next)
}
