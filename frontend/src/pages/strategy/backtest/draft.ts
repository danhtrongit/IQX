/**
 * Backtest bản nháp (tab IQX §3.3): indicator configs edited without touching the Bot's saved config.
 * A Chiến lược IQX fills the draft exactly as if the user had removed every card and added each of its
 * indicators with "+ Mua" / "+ Bán", then typed its rows (the §7.2.11 check compares both paths).
 */
import { templateConfig } from "@/pages/demo-trading/bot/config/draft"
import type { IndicatorConfig, SharedConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { IQX_MAX_HOLDING, type IqxStrategyDefinition } from "../shared/iqx"
import { isSideUsed } from "./sides"

export type Indicators = Record<string, IndicatorConfig>

const SIDES: readonly Side[] = ["buy", "sell"]

/** JSON with sorted keys: two configs are equal whatever key order the server stored. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export const sameConfig = (a: unknown, b: unknown) => canonical(a) === canonical(b)

export const withIndicators = (config: SharedConfig, indicators: Indicators): SharedConfig => ({ ...config, indicators })

/** Registry defaults of every indicator (compose mode never starts from the admin's own Bot config). */
export function defaultIndicators(indicators: readonly TechnicalIndicator[]): Indicators {
  return Object.fromEntries(indicators.map((indicator) => [indicator.id, templateConfig(indicator)]))
}

/** "✕" on a card: that side off, its rows kept; with no side left the indicator is off (same as the saved remove). */
export function removeSide(saved: IndicatorConfig, side: Side): IndicatorConfig {
  const other = side === "buy" ? saved.sell : saved.buy
  return { ...saved, [side]: { ...saved[side], enabled: false }, master_enabled: other.enabled ? saved.master_enabled : false }
}

/**
 * The draft after "Dùng" on a Chiến lược IQX: every card that is not in the strategy is removed, every
 * indicator of the strategy gets its sides; a side the strategy does not use is off (its rows kept).
 */
export function applyIqxStrategy(base: Indicators, definition: IqxStrategyDefinition): Indicators {
  const config = withIndicators({ schema_version: "", revision: 0, rule_version: "", indicators: base }, base)
  const next: Indicators = {}
  for (const [id, current] of Object.entries(base)) {
    const wanted = definition.indicators[id]
    if (!wanted) {
      let cleared = current
      for (const side of SIDES) if (isSideUsed(config, id, side)) cleared = removeSide(cleared, side)
      next[id] = cleared
      continue
    }
    const sideOf = (side: Side) => (wanted.master_enabled && wanted[side].enabled ? structuredClone(wanted[side]) : { ...structuredClone(current[side]), enabled: false })
    const buy = sideOf("buy")
    const sell = sideOf("sell")
    next[id] = { master_enabled: buy.enabled || sell.enabled, buy, sell }
  }
  return next
}

/** Indicators of the draft that differ from the saved config: what a run or "Lưu cho Bot" sends. */
export function changedIndicators(saved: Indicators, draft: Indicators): Indicators {
  return Object.fromEntries(Object.entries(draft).filter(([id, config]) => !sameConfig(saved[id], config)))
}

/** The definition of a Chiến lược IQX built from the form: only the indicators with a side in use. */
export function strategyDefinitionOf(indicators: Indicators, maxHolding: number): IqxStrategyDefinition {
  const config = withIndicators({ schema_version: "", revision: 0, rule_version: "", indicators }, indicators)
  const used = Object.entries(indicators).filter(([id]) => SIDES.some((side) => isSideUsed(config, id, side)))
  return { max_holding: maxHolding, indicators: Object.fromEntries(used.map(([id, value]) => [id, structuredClone(value)])) }
}

export function maxHoldingError(text: string): string | null {
  const value = Number(text.trim())
  return text.trim() !== "" && Number.isInteger(value) && value >= IQX_MAX_HOLDING.min && value <= IQX_MAX_HOLDING.max
    ? null
    : `Giữ tối đa phải từ ${IQX_MAX_HOLDING.min} đến ${IQX_MAX_HOLDING.max} phiên, số nguyên.`
}

/** Publish checks of a Chiến lược IQX the form can tell before the server (§5.4). */
export function strategyErrors(indicators: Indicators, maxHoldingText: string): string[] {
  const config = withIndicators({ schema_version: "", revision: 0, rule_version: "", indicators }, indicators)
  const ids = Object.keys(indicators)
  return [
    maxHoldingError(maxHoldingText),
    ids.some((id) => isSideUsed(config, id, "buy")) ? null : "Chưa bật chỉ báo Mua nào.",
    ids.some((id) => isSideUsed(config, id, "sell")) ? null : "Chưa bật chỉ báo Bán nào.",
  ].filter((message): message is string => message !== null)
}

/** `Mua: A + B` · `Bán: C · giữ tối đa N phiên` of a card (§3.2). */
export function strategySummary(definition: IqxStrategyDefinition, indicators: readonly TechnicalIndicator[]): { buy: string; sell: string } {
  const config = withIndicators({ schema_version: "", revision: 0, rule_version: "", indicators: definition.indicators }, definition.indicators)
  // In the order of the strategy (the order its author added the cards), named like the library.
  const names = (side: Side) =>
    Object.keys(definition.indicators)
      .filter((id) => isSideUsed(config, id, side))
      .map((id) => indicators.find((indicator) => indicator.id === id)?.name ?? id)
      .join(" + ") || "—"
  return { buy: `Mua: ${names("buy")}`, sell: `Bán: ${names("sell")} · giữ tối đa ${definition.max_holding} phiên` }
}
