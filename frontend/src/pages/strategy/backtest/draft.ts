/**
 * Bản nháp of tab Chỉ báo (spec v2.0 §4.3, §10.2): Rổ mã + Điều kiện Mua + Điều kiện Bán + Giữ tối đa.
 *
 * The form keeps EVERY indicator of the registry (unused ones at their defaults, master off) so the config
 * dialog can open any of them; `contentOf` keeps only the indicators with a side in use, which is the
 * strategy `content` sent to a run and saved as a version. Two drafts are "the same" when their contents are
 * equal as canonical JSON (D23: the server checks `from_run_id` by hash, the client by deep equality).
 */
import { templateConfig } from "@/pages/demo-trading/bot/config/draft"
import type { IndicatorConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { IQX_MAX_HOLDING } from "../shared/iqx"
import type { StrategyContent, Universe } from "./api"
import { isSideUsed } from "./sides"

export type Indicators = Record<string, IndicatorConfig>

export const SIDES: readonly Side[] = ["buy", "sell"]
export const DEFAULT_MAX_HOLDING = 30

export type Draft = { universe: Universe; indicators: Indicators; holdingText: string }

/** JSON with sorted keys: two configs are equal whatever key order the server stored. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export const sameConfig = (a: unknown, b: unknown) => canonical(a) === canonical(b)

/** Registry defaults of every indicator. */
export function defaultIndicators(indicators: readonly TechnicalIndicator[]): Indicators {
  return Object.fromEntries(indicators.map((indicator) => [indicator.id, templateConfig(indicator)]))
}

/** The form of a strategy content: registry defaults, then the strategy's own indicators. */
export function draftFromContent(registry: readonly TechnicalIndicator[], content: StrategyContent): Draft {
  return {
    universe: structuredClone(content.universe),
    indicators: { ...defaultIndicators(registry), ...structuredClone(content.indicators) },
    holdingText: String(content.max_holding),
  }
}

/** A new strategy (§4.3 "＋ Tạo chiến lược mới"): empty sides, rổ VN30, giữ tối đa 30. */
export function emptyDraft(registry: readonly TechnicalIndicator[], universe: Universe = { type: "vn30" }): Draft {
  return { universe, indicators: defaultIndicators(registry), holdingText: String(DEFAULT_MAX_HOLDING) }
}

/** "✕" on a card: that side off, its rows kept; with no side left the indicator is off. */
export function removeSide(saved: IndicatorConfig, side: Side): IndicatorConfig {
  const other = side === "buy" ? saved.sell : saved.buy
  return { ...saved, [side]: { ...saved[side], enabled: false }, master_enabled: other.enabled ? saved.master_enabled : false }
}

/** Only the indicators with a side in use, in the draft's own order. */
export function usedIndicators(indicators: Indicators): Indicators {
  const used = Object.entries(indicators).filter(([id]) => SIDES.some((side) => isSideUsed(indicators, id, side)))
  return Object.fromEntries(used.map(([id, value]) => [id, structuredClone(value)]))
}

export const hasSide = (indicators: Indicators, side: Side) => Object.keys(indicators).some((id) => isSideUsed(indicators, id, side))

/** Giữ tối đa (3–250 phiên, integer, never clamped). */
export function maxHoldingError(text: string): string | null {
  const value = Number(text.trim())
  return text.trim() !== "" && Number.isInteger(value) && value >= IQX_MAX_HOLDING.min && value <= IQX_MAX_HOLDING.max
    ? null
    : `Giữ tối đa phải từ ${IQX_MAX_HOLDING.min} đến ${IQX_MAX_HOLDING.max} phiên, số nguyên.`
}

/** The strategy `content` of the form (§10.2). Giữ tối đa must be valid first (`maxHoldingError`). */
export function contentOf(draft: Draft, options: { sellOnly?: boolean } = {}): StrategyContent {
  return {
    universe: structuredClone(draft.universe),
    indicators: usedIndicators(draft.indicators),
    max_holding: Number(draft.holdingText.trim()),
    ...(options.sellOnly ? { sell_only: true } : {}),
  }
}

/** Contents compared as the server would hash them; `null` never equals anything. */
export function sameContent(a: StrategyContent | null | undefined, b: StrategyContent | null | undefined): boolean {
  if (!a || !b) return false
  return canonical(normalised(a)) === canonical(normalised(b))
}

function normalised(content: StrategyContent): StrategyContent {
  return { ...content, indicators: usedIndicators(content.indicators), sell_only: content.sell_only ? true : undefined }
}

export const universeLabel = (universe: Universe | null | undefined): string =>
  !universe ? "—" : universe.type === "saved_list" ? universe.list_name : universe.type === "vn100" ? "VN100" : "VN30"

const HCM = "Asia/Ho_Chi_Minh"

/** `08/11 13:47` (Asia/Ho_Chi_Minh): the label of a version of a Chiến lược của tôi. */
export function stampLabel(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: HCM, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  return `${parts.day}/${parts.month} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`
}

export const versionLabel = (iso: string | null | undefined) => `bản ${stampLabel(iso)}`

/** `Mua: A + B` · `Bán: C · giữ tối đa N phiên` · `Rổ VN30` of a strategy card (§4.2). */
export function strategySummary(content: StrategyContent, registry: readonly TechnicalIndicator[]): { buy: string; sell: string; universe: string } {
  const names = (side: Side) =>
    Object.keys(content.indicators)
      .filter((id) => isSideUsed(content.indicators, id, side))
      .map((id) => registry.find((indicator) => indicator.id === id)?.name ?? id)
      .join(" + ") || "—"
  return { buy: `Mua: ${names("buy")}`, sell: `Bán: ${names("sell")} · giữ tối đa ${content.max_holding} phiên`, universe: `Rổ ${universeLabel(content.universe)}` }
}

/** Publish checks of a Chiến lược IQX the form can tell before the server (§7.2). */
export function composeErrors(draft: Draft): string[] {
  return [
    draft.universe.type === "vn30" || draft.universe.type === "vn100" ? null : "Rổ chiến lược IQX chỉ là VN30 hoặc VN100.",
    maxHoldingError(draft.holdingText),
    hasSide(draft.indicators, "buy") ? null : "Chưa bật chỉ báo Mua nào.",
    hasSide(draft.indicators, "sell") ? null : "Chưa bật chỉ báo Bán nào.",
  ].filter((message): message is string => message !== null)
}

/** The content an old (v1) Chiến lược IQX definition stands for: no universe = VN30 (§7.1). */
export function contentFromDefinition(definition: { universe?: Universe | null; indicators: Indicators; max_holding?: number | null; sell_only?: boolean }): StrategyContent {
  return {
    universe: definition.universe ?? { type: "vn30" },
    indicators: definition.indicators,
    max_holding: definition.max_holding ?? DEFAULT_MAX_HOLDING,
    ...(definition.sell_only ? { sell_only: true } : {}),
  }
}
