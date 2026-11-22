/**
 * Strategy content (spec Bot và Chiến lược v2.0 §10.2, PLAN D14) and the readable difference
 * between two contents (Lịch phiên "Xem khác biệt", Cập nhật IQX, Backtest Lưu).
 *
 * hand-typed per PLAN §6; switch to generated types after contracts regen.
 *
 * `indicators` is the V3 per-indicator map the shared config and the IQX definitions already use;
 * the Buy/Sell "cards" of the spec are views of it.
 */
import { activeConditions } from "@/pages/demo-trading/bot/config/summary"
import type { IndicatorConfig, SharedConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

export type StrategyUniverse =
  | { type: "vn30" }
  | { type: "vn100" }
  | { type: "saved_list"; list_id: string; list_name: string; symbols: string[] }

export type StrategyContent = {
  universe: StrategyUniverse
  indicators: Record<string, IndicatorConfig>
  max_holding: number
  /** Only converted Bots (§11): no Buy side, the Bot only sells. */
  sell_only?: boolean
}

/** Default and bounds of Giữ tối đa (Q6). */
export const DEFAULT_MAX_HOLDING = 30
export const MAX_HOLDING_RANGE = { min: 3, max: 250 } as const

/** `VN30`, `VN100`, `Danh mục Ngân hàng`. */
export function universeName(universe: StrategyUniverse | null | undefined): string {
  if (!universe) return "—"
  if (universe.type === "vn30") return "VN30"
  if (universe.type === "vn100") return "VN100"
  return universe.list_name ? `Danh mục ${universe.list_name}` : "Danh mục đã lưu"
}

/** `VN30`, `VN100`, `Danh mục Ngân hàng · 12 mã` (a saved list counts its copied symbols). */
export function universeLabel(universe: StrategyUniverse | null | undefined): string {
  if (!universe) return "—"
  if (universe.type === "saved_list") return `${universeName(universe)} · ${universe.symbols.length} mã`
  return universeName(universe)
}

function sameUniverse(a: StrategyUniverse, b: StrategyUniverse): boolean {
  if (a.type !== b.type) return false
  if (a.type !== "saved_list" || b.type !== "saved_list") return true
  if (a.list_id !== b.list_id || a.symbols.length !== b.symbols.length) return false
  const set = new Set(a.symbols)
  return b.symbols.every((symbol) => set.has(symbol))
}

/**
 * Enabled condition rows of one side as `{indicator}: {row sentence}` (`RSI: RSI 14 < 30`).
 * Without the registry (not loaded yet) the row ids stand in, so a difference is never hidden.
 */
export function sideLines(content: Pick<StrategyContent, "indicators">, side: Side, registry: readonly TechnicalIndicator[]): string[] {
  if (registry.length > 0) {
    const known = activeConditions({ indicators: content.indicators } as SharedConfig, side, registry).flatMap((item) =>
      item.rules.map((rule) => `${item.name}: ${[...item.params, rule].join(" · ")}`),
    )
    const knownIds = new Set(registry.map((indicator) => indicator.id))
    return [...known, ...rawSideLines(content, side, (id) => !knownIds.has(id))]
  }
  return rawSideLines(content, side, () => true)
}

function rawSideLines(content: Pick<StrategyContent, "indicators">, side: Side, include: (id: string) => boolean): string[] {
  return Object.entries(content.indicators).flatMap(([id, config]) => {
    if (!include(id) || !config?.master_enabled || !config[side]?.enabled) return []
    const rules = (config[side] as { rules?: { id?: string; enabled?: boolean }[] }).rules ?? []
    return rules.filter((rule) => rule.enabled !== false).map((rule) => `${id}: ${rule.id ?? "?"}`)
  })
}

export type DiffField = "universe" | "max_holding" | "buy" | "sell"

/** One difference: `from` only = removed, `to` only = added, both = changed. */
export type DiffLine = { field: DiffField; label: string; from: string | null; to: string | null }

export const DIFF_LABEL: Record<DiffField, string> = { universe: "Rổ mã", max_holding: "Giữ tối đa", buy: "Mua", sell: "Bán" }

/** Text shown when two contents only differ in what is not a condition. */
export const DIFF_SAME_TEXT = "Hai bản giống nhau về điều kiện."

/** Differences from `from` to `to` (§5.3): Rổ mã, Giữ tối đa, each Buy/Sell row removed or added. */
export function strategyDiff(from: StrategyContent, to: StrategyContent, registry: readonly TechnicalIndicator[]): DiffLine[] {
  const lines: DiffLine[] = []
  if (!sameUniverse(from.universe, to.universe)) {
    lines.push({ field: "universe", label: DIFF_LABEL.universe, from: universeLabel(from.universe), to: universeLabel(to.universe) })
  }
  if (from.max_holding !== to.max_holding) {
    lines.push({ field: "max_holding", label: DIFF_LABEL.max_holding, from: `${from.max_holding} phiên`, to: `${to.max_holding} phiên` })
  }
  for (const side of ["buy", "sell"] as const) {
    const before = sideLines(from, side, registry)
    const after = sideLines(to, side, registry)
    for (const line of before) if (!after.includes(line)) lines.push({ field: side, label: DIFF_LABEL[side], from: line, to: null })
    for (const line of after) if (!before.includes(line)) lines.push({ field: side, label: DIFF_LABEL[side], from: null, to: line })
  }
  return lines
}
