import type { TechnicalIndicator } from "../config/types"

export type IndicatorGroup = { chapter: number; indicators: TechnicalIndicator[] }

/** Lower-case without diacritics, so "khoi luong" finds "Khối lượng". */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
}

/**
 * Chapter groups in chapter order; inside a group the registry order is kept. The search
 * matches the indicator name or id.
 */
export function groupIndicators(indicators: readonly TechnicalIndicator[], query: string): IndicatorGroup[] {
  const needle = normalizeSearch(query)
  const groups = new Map<number, TechnicalIndicator[]>()
  for (const indicator of indicators) {
    if (needle && !normalizeSearch(indicator.name).includes(needle) && !normalizeSearch(indicator.id).includes(needle)) continue
    const list = groups.get(indicator.chapter) ?? []
    list.push(indicator)
    groups.set(indicator.chapter, list)
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([chapter, list]) => ({ chapter, indicators: list }))
}
