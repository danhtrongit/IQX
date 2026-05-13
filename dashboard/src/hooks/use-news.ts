import { useState, useEffect, useCallback, useRef } from "react"
import { api } from "@/lib/api"

export interface NewsItem {
  id: string
  ticker: string | null
  industry: string | null
  title: string
  shortContent: string | null
  sourceLink: string | null
  imageUrl: string | null
  updatedAt: string
  source: string | null
  sourceName: string | null
  sentiment: string | null
  score: number | null
  slug: string
}

export interface NewsArticle {
  id: string
  ticker: string | null
  companyName: string | null
  industry: string | null
  title: string
  shortContent: string | null
  summary: string | null
  highlightPosition: string | null
  fullContent: string | null
  sourceLink: string | null
  imageUrl: string | null
  updatedAt: string
  source: string | null
  sourceName: string | null
  sentiment: string | null
  score: number | null
  slug: string
  newsType: string | null
  fileAttachments: any[]
}

export interface NewsFilter {
  ticker?: string
  sentiment?: string
  newsfrom?: string
  industry?: string
}

interface FilterOption {
  name: string
  value: string
}

/** Adapt backend snake_case news item to camelCase */
function adaptNewsItem(raw: any): NewsItem {
  return {
    id: raw.id || raw._id || "",
    ticker: raw.ticker || null,
    industry: raw.industry || null,
    title: raw.title || "",
    shortContent: raw.short_content ?? raw.shortContent ?? null,
    sourceLink: raw.source_link ?? raw.sourceLink ?? null,
    imageUrl: raw.image_url ?? raw.imageUrl ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? raw.update_date ?? "",
    source: raw.source || null,
    sourceName: raw.source_name ?? raw.sourceName ?? null,
    sentiment: raw.sentiment || null,
    score: raw.score ?? null,
    slug: raw.slug || "",
  }
}

/** Adapt backend article detail */
function adaptArticle(raw: any): NewsArticle {
  return {
    id: raw.id || raw._id || "",
    ticker: raw.ticker || null,
    companyName: raw.company_name ?? raw.companyName ?? null,
    industry: raw.industry || null,
    title: raw.title || "",
    shortContent: raw.short_content ?? raw.shortContent ?? null,
    summary: raw.summary || null,
    highlightPosition: raw.highlight_position ?? raw.highlightPosition ?? null,
    fullContent: raw.full_content ?? raw.fullContent ?? null,
    sourceLink: raw.source_link ?? raw.sourceLink ?? null,
    imageUrl: raw.image_url ?? raw.imageUrl ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? raw.update_date ?? "",
    source: raw.source || null,
    sourceName: raw.source_name ?? raw.sourceName ?? null,
    sentiment: raw.sentiment || null,
    score: raw.score ?? null,
    slug: raw.slug || "",
    newsType: raw.news_type ?? raw.newsType ?? null,
    fileAttachments: raw.file_attachments ?? raw.fileAttachments ?? [],
  }
}

export function useNewsList(filters: NewsFilter = {}, pageSize = 15) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const fetchNews = useCallback(async (p: number, f: NewsFilter) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setIsLoading(true)
    try {
      // New backend: GET /market-data/news/ai
      // Param mapping: pageSize → page_size, updateFrom → update_from, etc.
      const params: Record<string, string | number> = {
        page: p,
        page_size: pageSize,
        language: "vi",
      }
      if (f.ticker) params.ticker = f.ticker
      if (f.sentiment) params.sentiment = f.sentiment
      if (f.newsfrom) params.source = f.newsfrom
      if (f.industry) params.industry = f.industry

      const res = await api
        .get("market-data/news/ai", { searchParams: params, signal: ctrl.signal })
        .json<any>()

      // Backend may return { data: [...], total_records, page, page_size }
      // or just the paginated response directly
      const rawItems = res.data || res.items || []
      const adapted = Array.isArray(rawItems) ? rawItems.map(adaptNewsItem) : []

      setItems(adapted)
      setTotal(res.total_records ?? res.pagination?.total ?? adapted.length)
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setItems([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [pageSize])

  useEffect(() => {
    setPage(1)
    fetchNews(1, filters)
  }, [filters.ticker, filters.sentiment, filters.newsfrom, filters.industry, fetchNews])

  const loadPage = (p: number) => {
    setPage(p)
    fetchNews(p, filters)
  }

  const refresh = () => fetchNews(page, filters)

  return { items, isLoading, page, total, pageSize, loadPage, refresh }
}

export function useNewsArticle(slug: string | null) {
  const [article, setArticle] = useState<NewsArticle | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!slug) {
      setArticle(null)
      return
    }
    let cancelled = false
    setIsLoading(true)

    // New backend: GET /market-data/news/ai/detail/{slug}
    api
      .get(`market-data/news/ai/detail/${slug}`, { searchParams: { language: "vi" } })
      .json<any>()
      .then((res) => {
        if (!cancelled) {
          const rawArticle = res.data || res
          setArticle(rawArticle ? adaptArticle(rawArticle) : null)
        }
      })
      .catch(() => {
        if (!cancelled) setArticle(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [slug])

  return { article, isLoading }
}

export function useNewsFilters() {
  const [industries, setIndustries] = useState<FilterOption[]>([])
  const [sources, setSources] = useState<FilterOption[]>([])

  useEffect(() => {
    // New backend: GET /market-data/news/ai/catalogs
    // Returns { topics, sources, industries } in one call
    api
      .get("market-data/news/ai/catalogs", { searchParams: { language: "vi" } })
      .json<any>()
      .then((res) => {
        const data = res.data || res

        // Adapt industries
        if (Array.isArray(data.industries)) {
          setIndustries(
            data.industries.map((i: any) => ({
              name: i.name || i.label || i.slug || "",
              value: i.slug || i.value || i.name || "",
            })),
          )
        }

        // Adapt sources
        if (Array.isArray(data.sources)) {
          setSources(
            data.sources.map((s: any) => ({
              name: s.name || s.label || s.slug || "",
              value: s.slug || s.value || s.name || "",
            })),
          )
        }
      })
      .catch(() => {})
  }, [])

  return { industries, sources }
}
