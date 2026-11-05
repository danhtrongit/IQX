/**
 * Tin AI gắn lên biểu đồ (dấu tin theo ngày). Dùng chung cho `datafeed.ts` (TradingView) và `iqline-datafeed.ts`:
 * cùng một bộ nhớ đệm nên `NewsMarkPopover` / `getNewsMarkGroup` đọc được nhóm tin dù biểu đồ nào đã nạp chúng.
 */
import { api } from "@/lib/api"

import { formatVietnamDateKey, getVietnamDateStartTimestamp } from "./timezone"

export type NewsMarkItem = {
  id: string
  title: string
  slug: string
  sentiment: string | null
  sourceName: string | null
  updatedAt: string
  imageUrl: string | null
}

export type NewsMarkGroup = {
  dateKey: string
  timestamp: number
  items: NewsMarkItem[]
  dominantSentiment: "positive" | "negative" | "neutral"
}

type RawItem = Record<string, unknown>

/** Mốc nhỏ nhất, 2000-01-01 UTC. Biểu đồ có thể truyền 0 hoặc số âm. */
const MIN_TIMESTAMP = 946684800

function clampTs(ts: number): number {
  return Math.max(ts, MIN_TIMESTAMP)
}

export const newsMarkCache = new Map<string, NewsMarkGroup[]>()

export function getDominantSentiment(
  items: NewsMarkItem[],
): "positive" | "negative" | "neutral" {
  let pos = 0
  let neg = 0
  for (const item of items) {
    const sentiment = (item.sentiment || "").toLowerCase()
    if (sentiment === "positive") pos++
    else if (sentiment === "negative") neg++
  }
  if (pos > neg) return "positive"
  if (neg > pos) return "negative"
  return "neutral"
}

export async function fetchNewsMarks(
  symbol: string,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<NewsMarkGroup[]> {
  const cacheKey = `${symbol}-${from}-${to}`
  const cached = newsMarkCache.get(cacheKey)
  if (cached) return cached

  try {
    const fromDate = formatVietnamDateKey(new Date(clampTs(from) * 1000))
    // Cap toDate to today: TradingView may pass far-future timestamps
    const rawTo = new Date(clampTs(to) * 1000)
    const now = new Date()
    const toDate = formatVietnamDateKey(rawTo > now ? now : rawTo)

    const params = new URLSearchParams({
      ticker: symbol,
      update_from: fromDate,
      update_to: toDate,
      page_size: "100",
      language: "vi",
    })
    const timeout = AbortSignal.timeout(8000)
    const payload = await api<{ data?: unknown }>(
      `/market-data/news/ai?${params.toString()}`,
      { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
    )
    const items = Array.isArray(payload?.data) ? (payload.data as RawItem[]) : []

    // Group by Vietnam date (YYYY-MM-DD)
    const grouped = new Map<string, NewsMarkItem[]>()
    for (const item of items) {
      const rawUpdatedAt = item.updated_at ?? item.updatedAt
      const updatedAt = rawUpdatedAt ? new Date(String(rawUpdatedAt)) : null
      const dateStr =
        updatedAt && !Number.isNaN(updatedAt.getTime())
          ? formatVietnamDateKey(updatedAt)
          : String(rawUpdatedAt ?? "").slice(0, 10)
      if (!dateStr) continue
      const bucket = grouped.get(dateStr) ?? []
      bucket.push({
        id: String(item.id ?? item._id ?? ""),
        title: String(item.title ?? ""),
        slug: String(item.slug ?? ""),
        sentiment: item.sentiment == null ? null : String(item.sentiment),
        sourceName:
          item.source_name != null
            ? String(item.source_name)
            : item.sourceName != null
              ? String(item.sourceName)
              : null,
        updatedAt: String(rawUpdatedAt ?? ""),
        imageUrl:
          item.image_url != null
            ? String(item.image_url)
            : item.imageUrl != null
              ? String(item.imageUrl)
              : null,
      })
      grouped.set(dateStr, bucket)
    }

    const result: NewsMarkGroup[] = []
    for (const [dateKey, newsItems] of grouped) {
      result.push({
        dateKey,
        timestamp: getVietnamDateStartTimestamp(dateKey),
        items: newsItems,
        dominantSentiment: getDominantSentiment(newsItems),
      })
    }

    newsMarkCache.set(cacheKey, result)
    // Keep cache small
    if (newsMarkCache.size > 20) {
      const firstKey = newsMarkCache.keys().next().value
      if (firstKey) newsMarkCache.delete(firstKey)
    }

    return result
  } catch {
    return []
  }
}

/** Get cached news marks for a specific mark ID (dateKey), used by the popover lookup. */
export function getNewsMarkGroup(
  _symbol: string,
  markId: string,
): NewsMarkGroup | null {
  for (const groups of newsMarkCache.values()) {
    const found = groups.find((group) => group.dateKey === markId)
    if (found) return found
  }
  return null
}
