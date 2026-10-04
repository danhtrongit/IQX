/**
 * Draft model of the Backtest v2 editor (SHARED-CONFIG-API §2–3).
 *
 * - `saved` is the last saved revision; `draft` is the unsaved form. Buy and
 *   Sell are edited independently: no action on one side touches the other.
 * - "Đặt lại" resets params/operators of the CURRENT tab to the registry
 *   template; enabled flags and the other side are untouched.
 * - "Hủy" discards the draft. Only "Lưu" writes, and it sends just the changed
 *   indicators (`changedIndicators`) with `expected_revision`.
 * - Switch semantics: enabling a side turns the master ON; turning off the last
 *   enabled side turns the master OFF; param/operator edits never flip master.
 */
import type { IndicatorConfig, RegistryField, Rule, Side, TechnicalIndicator } from "@/lib/shared-config"
import { sideField } from "@/lib/shared-config"

export type IndicatorMap = Record<string, IndicatorConfig>

export type DraftState = {
  /** Saved revision the draft is based on (0 = never saved). */
  revision: number
  saved: IndicatorMap
  draft: IndicatorMap
  tab: Side
}

export type SideTemplate = Pick<TechnicalIndicator, "buy" | "sell">

export type DraftAction =
  | { type: "load"; revision: number; indicators: IndicatorMap }
  /** After a 409: adopt the newer saved revision but keep the user's own edits. */
  | { type: "rebase"; revision: number; indicators: IndicatorMap }
  | { type: "tab"; side: Side }
  | { type: "add"; id: string; side: Side }
  | { type: "set_enabled"; id: string; side: Side; enabled: boolean }
  | { type: "param"; id: string; side: Side; key: string; value: number }
  | { type: "op"; id: string; side: Side; ruleIndex: number; op: Rule["op"] }
  | { type: "reset_tab"; templates: Record<string, SideTemplate> }
  | { type: "cancel" }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function initialDraft(revision: number, indicators: IndicatorMap): DraftState {
  return { revision, saved: clone(indicators), draft: clone(indicators), tab: "buy" }
}

function updateIndicator(
  state: DraftState,
  id: string,
  update: (indicator: IndicatorConfig) => IndicatorConfig,
): DraftState {
  const current = state.draft[id]
  if (!current) return state
  return { ...state, draft: { ...state.draft, [id]: update(clone(current)) } }
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "load":
      return { ...initialDraft(action.revision, action.indicators), tab: state.tab }
    case "rebase": {
      const changed = changedIndicators(state)
      return {
        revision: action.revision,
        saved: clone(action.indicators),
        draft: { ...clone(action.indicators), ...clone(changed) },
        tab: state.tab,
      }
    }
    case "tab":
      return { ...state, tab: action.side }
    case "add":
      return updateIndicator(state, action.id, (indicator) => {
        indicator[action.side].enabled = true
        indicator.master_enabled = true
        return indicator
      })
    case "set_enabled":
      return updateIndicator(state, action.id, (indicator) => {
        indicator[action.side].enabled = action.enabled
        if (action.enabled) indicator.master_enabled = true
        else if (!indicator.buy.enabled && !indicator.sell.enabled) indicator.master_enabled = false
        return indicator
      })
    case "param":
      return updateIndicator(state, action.id, (indicator) => {
        indicator[action.side].params[action.key] = action.value
        return indicator
      })
    case "op":
      return updateIndicator(state, action.id, (indicator) => {
        const rule = indicator[action.side].rules[action.ruleIndex]
        if (rule && (rule.allowed_ops as string[]).includes(action.op)) rule.op = action.op as never
        return indicator
      })
    case "reset_tab": {
      const side = state.tab
      const draft = { ...state.draft }
      for (const [id, template] of Object.entries(action.templates)) {
        const current = draft[id]
        if (!current) continue
        const next = clone(current)
        next[side].params = clone(template[side].params)
        next[side].rules = clone(template[side].rules)
        draft[id] = next
      }
      return { ...state, draft }
    }
    case "cancel":
      return { ...state, draft: clone(state.saved) }
  }
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** Indicators whose draft differs from the saved revision (the PATCH body). */
export function changedIndicators(state: Pick<DraftState, "saved" | "draft">): IndicatorMap {
  const changed: IndicatorMap = {}
  for (const [id, indicator] of Object.entries(state.draft)) {
    if (!same(indicator, state.saved[id])) changed[id] = indicator
  }
  return changed
}

export function isDirty(state: Pick<DraftState, "saved" | "draft">): boolean {
  return Object.keys(changedIndicators(state)).length > 0
}

/** True when the indicator contributes to that side (master ON + side ON). */
export function isSideActive(indicator: IndicatorConfig | undefined, side: Side): boolean {
  return !!indicator?.master_enabled && !!indicator[side].enabled
}

export function hasBuyRules(indicators: IndicatorMap): boolean {
  return Object.values(indicators).some((indicator) => isSideActive(indicator, "buy"))
}

export function fieldError(field: RegistryField, value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return `${field.label}: cần nhập số.`
  if (value < field.min || value > field.max) return `${field.label}: ${field.min}–${field.max}.`
  if (field.type === "integer" && !Number.isInteger(value)) return `${field.label}: cần là số nguyên.`
  return null
}

/** Field errors of the changed indicators, keyed `id.side.key`. */
export function draftErrors(
  state: Pick<DraftState, "saved" | "draft">,
  registry: Record<string, TechnicalIndicator>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [id, indicator] of Object.entries(changedIndicators(state))) {
    const entry = registry[id]
    if (!entry) continue
    for (const side of ["buy", "sell"] as const) {
      for (const key of Object.keys(indicator[side].params)) {
        const field = sideField(entry, side, key)
        if (!field) continue
        const message = fieldError(field, indicator[side].params[key])
        if (message) errors[`${id}.${side}.${key}`] = message
      }
    }
  }
  return errors
}
