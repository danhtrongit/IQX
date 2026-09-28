/**
 * Data layer for the demo-trading market slice.
 *
 * Every call hits a real backend route (VCI/VND backed, public):
 * - `POST /market-data/trading/price-board` — live quote + order book
 * - `GET  /instruments` — paginated, camelCase instrument typeahead
 * - `GET  /market-data/news/ai` — per-ticker AI news list
 * - `GET  /market-data/news/ai/detail/{slug}` — article body
 * - `GET  /ai/patterns/{candles|charts}` — premium-gated AI patterns
 *
 * Backend market-data payloads are snake_case while the instrument catalogue
 * is camelCase; adapters below normalise them to shared UI types. Values that the upstream does not
 * provide stay `null` (rendered as an em dash) — they are never coerced to 0.
 *
 * The realtime WS feed (DNSE) cannot authenticate upstream, so REST is the only
 * source of truth here: the price board is polled, nothing waits on a socket.
 */
import { api } from "@/lib/api"
import type { MarketQuote } from "@/pages/demo-trading/types"

type Raw = Record<string, unknown>

/** React Query keys for every market surface (shared by the panels). */
export const marketKeys = {
  all: ["market"] as const,
  quote: (symbol: string) => ["market", "quote", symbol] as const,
  symbolSearch: (query: string) => ["market", "symbol-search", query] as const,
  news: (symbol: string, page: number, sentiment: string | null) =>
    ["market", "news", symbol, page, sentiment] as const,
  newsArticle: (slug: string) => ["market", "news-article", slug] as const,
  patterns: (kind: PatternKind, symbol: string) =>
    ["market", "patterns", kind, symbol] as const,
}

/** Finite number (or a numeric string) → number, anything else → null. */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Trimmed non-empty string → string, otherwise null. */
function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }
  if (typeof value === "number") return String(value)
  return null
}

/** A tradeable price: the upstream uses `null`/`0` for "no trade yet". */
function price(value: unknown): number | null {
  const value0 = num(value)
  return value0 !== null && value0 > 0 ? value0 : null
}

/**
 * Upstream news timestamps are Vietnam-local `YYYY-MM-DD HH:mm:ss` (no zone).
 * `Date.parse` only accepts that spelling in V8, so normalise it to the local
 * ISO form before it reaches `formatDateTime` (Safari/Firefox reject the space).
 */
function stamp(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)
    ? raw.replace(" ", "T")
    : raw
}

/** First array found in the payload: bare array, `{data}`, then `{items}`. */
function rows(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[]
  if (payload && typeof payload === "object") {
    const record = payload as { data?: unknown; items?: unknown }
    if (Array.isArray(record.data)) return record.data as Raw[]
    if (Array.isArray(record.items)) return record.items as Raw[]
  }
  return []
}

/* ── Quote (price board) ─────────────────────────────────────────────────── */

function levels(value: unknown): { price: number; volume: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const row = entry as Raw
    const levelPrice = price(row.price)
    if (levelPrice === null) return []
    return [{ price: levelPrice, volume: num(row.volume) ?? 0 }]
  })
}

function adaptQuote(raw: Raw, symbol: string): MarketQuote | null {
  const code = str(raw.symbol)?.toUpperCase()
  // Unknown tickers come back as an empty-symbol row full of zeros.
  if (!code || code !== symbol) return null
  return {
    symbol: code,
    price: price(raw.close_price),
    reference: price(raw.reference_price),
    ceiling: price(raw.ceiling_price),
    floor: price(raw.floor_price),
    high: price(raw.high_price),
    low: price(raw.low_price),
    volume: num(raw.total_volume),
    bids: levels(raw.bid_prices),
    asks: levels(raw.ask_prices),
  }
}

/** Live quote for one symbol. Unknown tickers resolve to `null`. */
export async function fetchQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<MarketQuote | null> {
  const code = symbol.trim().toUpperCase()
  if (!code) return null
  const payload = await api<unknown>("/market-data/trading/price-board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols: [code] }),
    signal,
  })
  for (const raw of rows(payload)) {
    const quote = adaptQuote(raw, code)
    if (quote) return quote
  }
  return null
}

/* ── Symbol search ───────────────────────────────────────────────────────── */

export type SymbolSearchResult = {
  symbol: string
  name: string | null
  exchange: string | null
  industry: string | null
}

/** Exchanges where the demo sandbox can actually fill an order. */
const TRADABLE_EXCHANGES: Record<string, true> = { HOSE: true, HNX: true, UPCOM: true }

function adaptSearchItem(raw: Raw): SymbolSearchResult | null {
  const symbol = str(raw.symbol)?.toUpperCase()
  if (!symbol) return null
  return {
    symbol,
    name: str(raw.name),
    exchange: str(raw.exchange)?.toUpperCase() ?? null,
    industry: str(raw.icbLv1),
  }
}

/** Typeahead search restricted to active, tradable stocks (HOSE/HNX/UPCOM). */
export async function searchTradableSymbols(
  query: string,
  signal?: AbortSignal,
): Promise<SymbolSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const params = new URLSearchParams({ q, page: "1", page_size: "10", asset_type: "stock", include_indices: "false" })
  const payload = await api<unknown>(`/instruments?${params.toString()}`, { signal })
  const items = payload && typeof payload === "object" && Array.isArray((payload as Raw).data)
    ? ((payload as Raw).data as Raw[])
    : []
  return items
    .map(adaptSearchItem)
    .filter((item): item is SymbolSearchResult => item !== null)
    .filter((item) => item.exchange !== null && TRADABLE_EXCHANGES[item.exchange] === true)
}

/* ── News ────────────────────────────────────────────────────────────────── */

export type NewsItem = {
  id: string
  slug: string
  title: string
  summary: string | null
  imageUrl: string | null
  sourceLink: string | null
  sourceName: string | null
  sentiment: string | null
  score: number | null
  updatedAt: string | null
  industry: string | null
  /** Ticker the article is tagged with (null for market-wide news). */
  ticker: string | null
}

export type NewsArticle = NewsItem & {
  companyName: string | null
  /** Plain-text body (`news_full_content_text`), never raw HTML. */
  body: string | null
}

/** One page of the per-ticker feed: the rows plus the upstream total. */
export type NewsPage = { items: NewsItem[]; total: number }

/** Rows per news page — also the page size the panel's pager counts in. */
export const NEWS_PAGE_SIZE = 12

/** Backend row → UI news item; rows without a title or slug are dropped. */
function adaptNewsItem(raw: Raw): NewsItem | null {
  const title = str(raw.title)
  const slug = str(raw.slug)
  if (!title || !slug) return null
  return {
    id: str(raw.id) ?? slug,
    slug,
    title,
    summary: str(raw.short_content),
    imageUrl: str(raw.image_url),
    sourceLink: str(raw.source_link),
    sourceName: str(raw.source_name) ?? str(raw.source),
    sentiment: str(raw.sentiment),
    score: num(raw.score),
    updatedAt: stamp(raw.update_date) ?? stamp(raw.updated_at),
    industry: str(raw.industry),
    ticker: str(raw.ticker),
  }
}

/**
 * Per-ticker AI news list (`kind=business`, the legacy panel's feed).
 * `sentiment` filters server-side; an empty/absent value means "tất cả".
 */
export async function fetchSymbolNews(
  symbol: string,
  page: number,
  sentiment?: string | null,
  signal?: AbortSignal,
): Promise<NewsPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(NEWS_PAGE_SIZE),
    language: "vi",
  })
  const code = symbol.trim().toUpperCase()
  if (code) params.set("ticker", code)
  if (sentiment) params.set("sentiment", sentiment)
  const payload = await api<Raw>(`/market-data/news/ai?${params.toString()}`, { signal })
  const items = rows(Array.isArray(payload.data) ? payload.data : [])
    .map(adaptNewsItem)
    .filter((item): item is NewsItem => item !== null)
  return { items, total: num(payload.total_records) ?? items.length }
}

/** Article body for the in-panel reader. */
export async function fetchNewsArticle(
  slug: string,
  signal?: AbortSignal,
): Promise<NewsArticle | null> {
  const payload = await api<Raw>(
    `/market-data/news/ai/detail/${encodeURIComponent(slug)}?language=vi`,
    { signal },
  )
  const raw = (payload.data ?? null) as Raw | null
  if (!raw) return null
  const item = adaptNewsItem(raw)
  if (!item) return null
  return {
    ...item,
    companyName: str(raw.company_name),
    body: str(raw.news_full_content_text) ?? str(raw.summary),
  }
}

/* ── AI patterns ─────────────────────────────────────────────────────────── */

export type PatternKind = "candles" | "charts"
export type PatternSignal = "bullish" | "bearish" | "neutral"

export type PatternItem = {
  name: string
  signal: PatternSignal
  signalLabel: string | null
  state: string | null
  meaning: string | null
  action: string | null
}

function adaptPatternSignal(value: unknown): PatternSignal {
  const raw = str(value)?.toLowerCase() ?? ""
  if (raw === "bullish" || raw === "bearish" || raw === "neutral") return raw
  return "neutral"
}

/** AI-detected patterns for a symbol (premium-gated upstream). */
export async function fetchPatterns(
  kind: PatternKind,
  symbol: string,
  signal?: AbortSignal,
): Promise<PatternItem[]> {
  const params = new URLSearchParams({ symbol: symbol.trim().toUpperCase() })
  const payload = await api<Raw>(
    `/ai/patterns/${kind}?${params.toString()}`,
    { signal },
  )
  return rows(payload).flatMap((raw) => {
    const name = str(raw.name)
    if (!name) return []
    return [
      {
        name,
        signal: adaptPatternSignal(raw.signal),
        signalLabel: str(raw.signalLabel),
        state: str(raw.state),
        meaning: str(raw.meaning),
        action: str(raw.action),
      },
    ]
  })
}
