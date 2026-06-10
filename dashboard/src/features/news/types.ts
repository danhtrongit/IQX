/** A single news list item (camelCase, adapted from backend snake_case). */
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

/** Full article detail. */
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
  fileAttachments: unknown[]
}

/** Server-side filters for the paginated news list. */
export interface NewsFilter {
  ticker?: string
  sentiment?: string
  /** Maps to backend `source`. */
  newsfrom?: string
  industry?: string
}

/** A label/value pair used to drive the filter <Select>s. */
export interface FilterOption {
  name: string
  value: string
}

/** Catalogs (sources + industries) for the filter dropdowns. */
export interface NewsCatalogs {
  industries: FilterOption[]
  sources: FilterOption[]
}

/** Paginated list result. */
export interface NewsListResult {
  items: NewsItem[]
  total: number
}
