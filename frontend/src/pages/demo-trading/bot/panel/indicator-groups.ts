import type { TechnicalIndicator } from "../config/types"

export type IndicatorGroup<T extends { id: string } = TechnicalIndicator> = { id: string; title: string; indicators: T[] }

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
 * The 16 indicators grouped by what they measure, never by the Học viện chapter that teaches them (spec Học viện
 * v4.1 §6.1: a tool shows indicator names only). Same groups as the indicator sample v2 and the Bộ lọc technical
 * tab, in this order. Members are listed by id; an id this table does not know falls into the last group.
 */
const GROUPS = [
  { id: "average", title: "Đường trung bình", members: ["ma", "ema", "ma_cross"] },
  { id: "momentum", title: "Động lượng", members: ["rsi", "macd", "stochastic", "cci", "roc", "williams_r"] },
  { id: "volatility", title: "Biến động", members: ["bollinger"] },
  { id: "channel", title: "Kênh giá", members: ["donchian"] },
  { id: "trend", title: "Xu hướng", members: ["dmi"] },
  { id: "volume", title: "Khối lượng", members: ["volume", "obv"] },
  { id: "money_flow", title: "Dòng tiền", members: ["mfi", "cmf"] },
] as const

const OTHER = { id: "other", title: "Khác" }
const GROUP_OF: ReadonlyMap<string, { id: string; title: string }> = new Map(
  GROUPS.flatMap((group) => group.members.map((member) => [member, group] as const)),
)
const GROUP_ORDER: readonly string[] = [...GROUPS.map((group) => group.id), OTHER.id]

/** Groups in a fixed order; inside a group the order of `indicators` (the registry order) is kept. */
export function groupByType<T extends { id: string }>(indicators: readonly T[]): IndicatorGroup<T>[] {
  const buckets = new Map<string, IndicatorGroup<T>>()
  for (const indicator of indicators) {
    const group = GROUP_OF.get(indicator.id) ?? OTHER
    const bucket = buckets.get(group.id) ?? { id: group.id, title: group.title, indicators: [] }
    bucket.indicators.push(indicator)
    buckets.set(group.id, bucket)
  }
  return [...buckets.values()].sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id))
}

/** The panel's list: the search matches the indicator name or id, then the matches are grouped by type. */
export function groupIndicators(indicators: readonly TechnicalIndicator[], query: string): IndicatorGroup[] {
  const needle = normalizeSearch(query)
  return groupByType(
    indicators.filter((indicator) => !needle || normalizeSearch(indicator.name).includes(needle) || normalizeSearch(indicator.id).includes(needle)),
  )
}
