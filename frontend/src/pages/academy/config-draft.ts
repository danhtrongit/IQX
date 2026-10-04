/**
 * Pure helpers for the per-indicator Buy/Sell config panel of Học viện.
 *
 * The draft only lives in the form: params are kept as the raw input text so a
 * half-typed value never silently becomes a number, and operators are kept per
 * rule id. Rule structure (operands) is fixed by the registry and never edited.
 * See 00-MASTER/SHARED-CONFIG-API.md §2–3 for the draft/save/switch rules.
 */
import { ApiError } from "@/lib/api"
import {
  sideField,
  type IndicatorConfig,
  type RegistryField,
  type Rule,
  type RuleOp,
  type SharedConfigState,
  type Side,
  type SideConfig,
  type TechnicalIndicator,
} from "@/lib/shared-config"

export const SIDES: readonly Side[] = ["buy", "sell"]

export type DraftSide = { enabled: boolean; params: Record<string, string>; ops: Record<string, RuleOp> }
export type IndicatorDraft = Record<Side, DraftSide>

export type ConfigFieldError = { path: string; message: string }

function templateSide(indicator: TechnicalIndicator, side: Side): SideConfig {
  const { enabled, params, rules } = indicator[side]
  return { enabled, params: { ...params }, rules: rules.map(rule => ({ ...rule })) }
}

/** Saved config of one indicator, or the registry template (master OFF) when never saved. */
export function savedIndicatorConfig(state: SharedConfigState | undefined, indicator: TechnicalIndicator): IndicatorConfig {
  const saved = state?.config.indicators[indicator.id]
  if (saved) return saved
  return { master_enabled: false, buy: templateSide(indicator, "buy"), sell: templateSide(indicator, "sell") }
}

function draftSide(config: SideConfig): DraftSide {
  return {
    enabled: config.enabled,
    params: Object.fromEntries(Object.entries(config.params).map(([key, value]) => [key, String(value)])),
    ops: Object.fromEntries(config.rules.map(rule => [rule.id, rule.op])),
  }
}

export function createDraft(config: IndicatorConfig): IndicatorDraft {
  return { buy: draftSide(config.buy), sell: draftSide(config.sell) }
}

/** Đặt lại: restore params + operators of one side to the saved values; `enabled` and the other side stay. */
export function resetDraftSide(draft: IndicatorDraft, saved: IndicatorConfig, side: Side): IndicatorDraft {
  const restored = draftSide(saved[side])
  return { ...draft, [side]: { ...draft[side], params: restored.params, ops: restored.ops } }
}

export function sideFields(indicator: TechnicalIndicator, side: Side): RegistryField[] {
  return indicator.fields
    .map(field => sideField(indicator, side, field.key))
    .filter((field): field is RegistryField => !!field)
}

/** Client-side bound check from registry metadata; the server re-validates on save. */
export function paramError(field: RegistryField, text: string | undefined): string | null {
  if (text === undefined || text.trim() === "") return `${field.label}: bắt buộc nhập.`
  const value = Number(text)
  if (!Number.isFinite(value)) return `${field.label}: phải là số.`
  if (field.type === "integer" && !Number.isInteger(value)) return `${field.label}: phải là số nguyên.`
  if (value < field.min || value > field.max) return `${field.label}: từ ${field.min} đến ${field.max}.`
  return null
}

export function draftErrors(indicator: TechnicalIndicator, draft: IndicatorDraft): Record<Side, Record<string, string>> {
  const result: Record<Side, Record<string, string>> = { buy: {}, sell: {} }
  for (const side of SIDES) {
    for (const field of sideFields(indicator, side)) {
      const error = paramError(field, draft[side].params[field.key])
      if (error) result[side][field.key] = error
    }
  }
  return result
}

function applyOp(rule: Rule, op: RuleOp | undefined): Rule {
  if (!op || !(rule.allowed_ops as RuleOp[]).includes(op)) return rule
  return { ...rule, op } as Rule
}

function buildSide(saved: SideConfig, draft: DraftSide): SideConfig {
  return {
    enabled: draft.enabled,
    params: Object.fromEntries(Object.entries(draft.params).map(([key, text]) => [key, Number(text)])),
    rules: saved.rules.map(rule => applyOp(rule, draft.ops[rule.id])),
  }
}

/**
 * Indicator record sent in the PATCH. Master is only switched ON when the panel was
 * opened from the master switch (`activate`); turning both sides OFF saves master OFF.
 * Editing params never flips master.
 */
export function buildIndicatorConfig(saved: IndicatorConfig, draft: IndicatorDraft, activate: boolean): IndicatorConfig {
  const buy = buildSide(saved.buy, draft.buy)
  const sell = buildSide(saved.sell, draft.sell)
  const master = buy.enabled || sell.enabled ? activate || saved.master_enabled : false
  return { master_enabled: master, buy, sell }
}

export function isDraftDirty(saved: IndicatorConfig, draft: IndicatorDraft): boolean {
  return JSON.stringify(createDraft(saved)) !== JSON.stringify(draft)
}

/** Validation details forwarded by the API (422 `details`/`errors` arrays of `{path,message}`). */
export function configFieldErrors(error: unknown): ConfigFieldError[] {
  if (!(error instanceof ApiError)) return []
  const source = Array.isArray(error.details)
    ? error.details
    : error.details && typeof error.details === "object" && Array.isArray((error.details as { errors?: unknown }).errors)
      ? (error.details as { errors: unknown[] }).errors
      : []
  return source.flatMap(item => {
    if (!item || typeof item !== "object") return []
    const { path, message } = item as { path?: unknown; message?: unknown }
    if (typeof message !== "string") return []
    return [{ path: Array.isArray(path) ? path.join(".") : typeof path === "string" ? path : "", message }]
  })
}

/** Server error that belongs to one param field of one side (path `…<side>.params.<key>`). */
export function fieldErrorFor(errors: ConfigFieldError[], side: Side, key: string): string | null {
  const suffix = `${side}.params.${key}`
  return errors.find(error => error.path === suffix || error.path.endsWith(`.${suffix}`))?.message ?? null
}
