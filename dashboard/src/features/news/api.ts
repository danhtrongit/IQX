import { api } from "@/shared/http/client"
import type {
  FilterOption,
  NewsArticle,
  NewsCatalogs,
  NewsFilter,
  NewsItem,
  NewsListResult,
} from "./types"

/* ── Adapters (snake_case → camelCase), ported from dashboard-bak ─────────── */

/** Loosely-typed backend payload: the news API uses several fallback key spellings. */
type Raw = Record<string, unknown>

/** Read the first non-nullish value among `keys`, coerced to a trimmed string or null. */
function str(raw: Raw, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && v !== "") return String(v)
  }
  return null
}

/** Read the first non-nullish value among `keys` as a number, or null. */
function num(raw: Raw, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === "number") return v
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v)
  }
  return null
}

/** Adapt a backend news list item to camelCase. */
function adaptNewsItem(raw: Raw): NewsItem {
  return {
    id: str(raw, "id", "_id") ?? "",
    ticker: str(raw, "ticker"),
    industry: str(raw, "industry"),
    title: str(raw, "title") ?? "",
    shortContent: str(raw, "short_content", "shortContent"),
    sourceLink: str(raw, "source_link", "sourceLink"),
    imageUrl: str(raw, "image_url", "imageUrl"),
    updatedAt: str(raw, "updated_at", "updatedAt", "update_date") ?? "",
    source: str(raw, "source"),
    sourceName: str(raw, "source_name", "sourceName"),
    sentiment: str(raw, "sentiment"),
    score: num(raw, "score"),
    slug: str(raw, "slug") ?? "",
  }
}

/** Adapt a backend article detail to camelCase. */
function adaptArticle(raw: Raw): NewsArticle {
  return {
    id: str(raw, "id", "_id") ?? "",
    ticker: str(raw, "ticker"),
    companyName: str(raw, "company_name", "companyName"),
    industry: str(raw, "industry"),
    title: str(raw, "title") ?? "",
    shortContent: str(raw, "short_content", "shortContent"),
    summary: str(raw, "summary"),
    highlightPosition: str(raw, "highlight_position", "highlightPosition"),
    fullContent: str(raw, "full_content", "fullContent"),
    sourceLink: str(raw, "source_link", "sourceLink"),
    imageUrl: str(raw, "image_url", "imageUrl"),
    updatedAt: str(raw, "updated_at", "updatedAt", "update_date") ?? "",
    source: str(raw, "source"),
    sourceName: str(raw, "source_name", "sourceName"),
    sentiment: str(raw, "sentiment"),
    score: num(raw, "score"),
    slug: str(raw, "slug") ?? "",
    newsType: str(raw, "news_type", "newsType"),
    fileAttachments: (raw.file_attachments ?? raw.fileAttachments ?? []) as unknown[],
  }
}

function adaptFilterOption(raw: Raw): FilterOption {
  return {
    name: str(raw, "name", "label", "slug") ?? "",
    value: str(raw, "slug", "value", "name") ?? "",
  }
}

/* ── API ─────────────────────────────────────────────────────────────────── */

export const newsApi = {
  /** Paginated AI news feed with optional ticker/sentiment/source/industry filters. */
  listNews: async (
    filters: NewsFilter,
    page: number,
    pageSize: number,
  ): Promise<NewsListResult> => {
    const searchParams: Record<string, string | number> = {
      page,
      page_size: pageSize,
      language: "vi",
    }
    if (filters.ticker) searchParams.ticker = filters.ticker
    if (filters.sentiment) searchParams.sentiment = filters.sentiment
    if (filters.newsfrom) searchParams.source = filters.newsfrom
    if (filters.industry) searchParams.industry = filters.industry

    const res = await api
      .get("market-data/news/ai", { searchParams })
      .json<Raw>()

    // Backend may return { data: [...], total_records, page, page_size }
    // or { items: [...] } / a bare array.
    const rawItems = (res.data ?? res.items ?? []) as unknown
    const items = Array.isArray(rawItems)
      ? rawItems.map((r) => adaptNewsItem(r as Raw))
      : []
    const pagination = res.pagination as Raw | undefined
    const total =
      num(res, "total_records") ?? (pagination && num(pagination, "total")) ?? items.length

    return { items, total }
  },

  /** A single article by slug. */
  getArticle: async (slug: string): Promise<NewsArticle | null> => {
    const res = await api
      .get(`market-data/news/ai/detail/${slug}`, { searchParams: { language: "vi" } })
      .json<Raw>()
    const rawArticle = (res.data ?? res) as Raw
    return rawArticle ? adaptArticle(rawArticle) : null
  },

  /** Filter catalogs (sources + industries) returned in one call. */
  getCatalogs: async (): Promise<NewsCatalogs> => {
    const res = await api
      .get("market-data/news/ai/catalogs", { searchParams: { language: "vi" } })
      .json<Raw>()
    const data = (res.data ?? res) as Raw

    const industries = Array.isArray(data.industries)
      ? (data.industries as Raw[]).map(adaptFilterOption)
      : []
    const sources = Array.isArray(data.sources)
      ? (data.sources as Raw[]).map(adaptFilterOption)
      : []

    return { industries, sources }
  },
}
