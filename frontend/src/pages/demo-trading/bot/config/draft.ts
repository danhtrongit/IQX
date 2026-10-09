/**
 * Pure helpers of the per-indicator config modal.
 *
 * The draft lives only in the form: params are kept as the text the user typed
 * (a half-typed value never silently becomes a number) and operators per rule id.
 * The rule structure (operands) is fixed by the registry and never edited.
 */
import { formatNum } from "../format"
import type {
  CrossField,
  IndicatorConfig,
  RegistryField,
  Rule,
  RuleOp,
  Side,
  SharedConfigState,
  SideConfig,
  TechnicalIndicator,
} from "./types"

export const SIDES: readonly Side[] = ["buy", "sell"]
export const SIDE_LABEL: Record<Side, string> = { buy: "Mua", sell: "Bán" }

export type DraftSide = { enabled: boolean; params: Record<string, string>; ops: Record<string, RuleOp> }
export type IndicatorDraft = Record<Side, DraftSide>

/** A side's field metadata: the base field merged with that side's override. */
export function sideField(indicator: TechnicalIndicator, side: Side, key: string): RegistryField | undefined {
  const base = indicator.fields.find((field) => field.key === key)
  if (!base) return undefined
  return { ...base, ...(indicator[side].field_overrides?.[key] ?? {}) } as RegistryField
}

export function sideFields(indicator: TechnicalIndicator, side: Side): RegistryField[] {
  return indicator.fields
    .map((field) => sideField(indicator, side, field.key))
    .filter((field): field is RegistryField => !!field && Object.hasOwn(indicator[side].params, field.key))
}

function templateSide(indicator: TechnicalIndicator, side: Side): SideConfig {
  const { enabled, params, rules } = indicator[side]
  return { enabled, params: { ...params }, rules: rules.map((rule) => ({ ...rule })) as Rule[] }
}

/** The registry default of one indicator: master OFF, both sides as templated (OFF). */
export function templateConfig(indicator: TechnicalIndicator): IndicatorConfig {
  return { master_enabled: false, buy: templateSide(indicator, "buy"), sell: templateSide(indicator, "sell") }
}

/** Saved config of one indicator, or the registry default when it was never saved. */
export function savedIndicatorConfig(state: SharedConfigState | undefined, indicator: TechnicalIndicator): IndicatorConfig {
  return state?.config.indicators[indicator.id] ?? templateConfig(indicator)
}

function draftSide(config: SideConfig): DraftSide {
  return {
    enabled: config.enabled,
    params: Object.fromEntries(Object.entries(config.params).map(([key, value]) => [key, String(value)])),
    ops: Object.fromEntries(config.rules.map((rule) => [rule.id, rule.op])),
  }
}

export function createDraft(config: IndicatorConfig): IndicatorDraft {
  return { buy: draftSide(config.buy), sell: draftSide(config.sell) }
}

/**
 * Đặt lại: params and operators of ONE side go back to the registry defaults.
 * ON/OFF of that side, the other side and the master are untouched; the user still
 * has to press Lưu to commit.
 */
export function resetDraftSide(draft: IndicatorDraft, indicator: TechnicalIndicator, side: Side): IndicatorDraft {
  const defaults = draftSide(templateSide(indicator, side))
  return { ...draft, [side]: { ...draft[side], params: defaults.params, ops: defaults.ops } }
}

export function isDraftDirty(initial: IndicatorDraft, draft: IndicatorDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(draft)
}

function rebaseSide(draft: DraftSide, oldBase: DraftSide, newBase: DraftSide): DraftSide {
  const pick = <T,>(mine: T | undefined, before: T | undefined, latest: T | undefined): T | undefined =>
    mine === before ? latest : mine
  const paramKeys = new Set([...Object.keys(newBase.params), ...Object.keys(draft.params)])
  const opKeys = new Set([...Object.keys(newBase.ops), ...Object.keys(draft.ops)])
  return {
    enabled: pick(draft.enabled, oldBase.enabled, newBase.enabled) ?? draft.enabled,
    params: Object.fromEntries([...paramKeys].map((key) => [key, pick(draft.params[key], oldBase.params[key], newBase.params[key]) ?? ""])),
    ops: Object.fromEntries(
      [...opKeys].flatMap((key) => {
        const op = pick(draft.ops[key], oldBase.ops[key], newBase.ops[key])
        return op ? [[key, op] as const] : []
      }),
    ),
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

/* ── Validation ─────────────────────────────────────────────────────────── */

/**
 * `fast < slow` style constraints for a registry response that does not publish
 * `validation.cross_fields`. A published list, even an empty one, always wins.
 */
const FALLBACK_CROSS_FIELDS: Record<string, CrossField[]> = {
  macd: [{ left: "fast", op: "<", right: "slow" }],
  ma_cross: [{ left: "fast", op: "<", right: "slow" }],
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

/** The cross-field constraints of an indicator: the registry's, or the built-in ones when it publishes none. */
export function crossFieldsOf(indicator: TechnicalIndicator): CrossField[] {
  return indicator.validation?.cross_fields ?? FALLBACK_CROSS_FIELDS[indicator.id] ?? []
}

/** `Chu kỳ EMA nhanh` -> `chu kỳ EMA nhanh` inside a sentence; an acronym-first label keeps its case. */
function inSentence(label: string): string {
  return /^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

/** `Chu kỳ EMA nhanh phải nhỏ hơn chu kỳ EMA chậm.` for `{ left: "fast", op: "<", right: "slow" }`. */
export function crossFieldMessage(indicator: TechnicalIndicator, side: Side, cross: CrossField): string {
  const label = (key: string) => sideField(indicator, side, key)?.label ?? key
  return `${label(cross.left)} phải ${cross.op === "<" ? "nhỏ hơn" : "lớn hơn"} ${inSentence(label(cross.right))}.`
}

/** Per side: a message per param field (range, step or cross-field), keyed by the field the API would name. */
export type DraftErrors = Record<Side, { fields: Record<string, string> }>

export function draftErrors(indicator: TechnicalIndicator, draft: IndicatorDraft): DraftErrors {
  const result: DraftErrors = { buy: { fields: {} }, sell: { fields: {} } }
  for (const side of SIDES) {
    const fields = result[side].fields
    for (const field of sideFields(indicator, side)) {
      const error = paramError(field, draft[side].params[field.key])
      if (error) fields[field.key] = error
    }
    // A cross-field rule is judged on two valid numbers only and reported on its left field, as the API does.
    for (const cross of crossFieldsOf(indicator)) {
      if (fields[cross.left] || fields[cross.right]) continue
      const leftText = draft[side].params[cross.left]
      const rightText = draft[side].params[cross.right]
      if (leftText === undefined || rightText === undefined) continue
      const left = Number(leftText)
      const right = Number(rightText)
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue
      if (!(cross.op === "<" ? left < right : left > right)) fields[cross.left] = crossFieldMessage(indicator, side, cross)
    }
  }
  return result
}

export function hasDraftErrors(errors: DraftErrors): boolean {
  return SIDES.some((side) => Object.keys(errors[side].fields).length > 0)
}

/* ── Build the PATCH record ─────────────────────────────────────────────── */

function applyOp(rule: Rule, op: RuleOp | undefined): Rule {
  if (!op || !(rule.allowed_ops as RuleOp[]).includes(op)) return rule
  return { ...rule, op } as Rule
}

function buildSide(saved: SideConfig, draft: DraftSide): SideConfig {
  return {
    enabled: draft.enabled,
    params: Object.fromEntries(Object.entries(draft.params).map(([key, text]) => [key, Number(text)])),
    rules: saved.rules.map((rule) => applyOp(rule, draft.ops[rule.id])),
  }
}

/**
 * Indicator record sent in the PATCH. Master is only switched ON when the modal was
 * opened from the master switch (`activate`) and a side is ON; both sides OFF always
 * saves master OFF (there is no empty-but-true condition). Editing params never flips
 * the master.
 */
export function buildIndicatorConfig(saved: IndicatorConfig, draft: IndicatorDraft, activate: boolean): IndicatorConfig {
  const buy = buildSide(saved.buy, draft.buy)
  const sell = buildSide(saved.sell, draft.sell)
  const master = buy.enabled || sell.enabled ? activate || saved.master_enabled : false
  return { master_enabled: master, buy, sell }
}
