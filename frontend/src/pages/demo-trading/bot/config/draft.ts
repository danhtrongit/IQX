/**
 * Pure helpers of the per-indicator config modal.
 *
 * The draft lives only in the form: params are kept as the text the user typed
 * (a half-typed value never silently becomes a number) and operators per rule id.
 * The rule structure (operands) is fixed by the registry and never edited.
 */
import { formatNum } from "../format"
import type {
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

/** `fast < slow` style constraints the API does not publish yet. */
const FALLBACK_CROSS_FIELDS: Record<string, { left: string; right: string }[]> = {
  macd: [{ left: "fast", right: "slow" }],
  ma_cross: [{ left: "fast", right: "slow" }],
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

function crossFieldsOf(indicator: TechnicalIndicator): { left: string; right: string }[] {
  return indicator.validation?.cross_fields ?? FALLBACK_CROSS_FIELDS[indicator.id] ?? []
}

export type DraftErrors = Record<Side, { fields: Record<string, string>; form: string | null }>

export function draftErrors(indicator: TechnicalIndicator, draft: IndicatorDraft): DraftErrors {
  const result: DraftErrors = { buy: { fields: {}, form: null }, sell: { fields: {}, form: null } }
  for (const side of SIDES) {
    for (const field of sideFields(indicator, side)) {
      const error = paramError(field, draft[side].params[field.key])
      if (error) result[side].fields[field.key] = error
    }
    if (Object.keys(result[side].fields).length === 0) {
      for (const constraint of crossFieldsOf(indicator)) {
        const left = Number(draft[side].params[constraint.left])
        const right = Number(draft[side].params[constraint.right])
        if (!(left < right)) {
          result[side].form = "Chu kỳ nhanh phải nhỏ hơn chu kỳ chậm."
          break
        }
      }
    }
  }
  return result
}

export function hasDraftErrors(errors: DraftErrors): boolean {
  return SIDES.some((side) => Object.keys(errors[side].fields).length > 0 || errors[side].form !== null)
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
