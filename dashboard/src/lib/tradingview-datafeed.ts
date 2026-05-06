/**
 * TradingView Custom DataFeed
 * Connects to our backend /market-data API to provide OHLCV data
 */

import {
  formatVietnamDateKey,
  getVietnamDateStartTimestamp,
} from "./tradingview-timezone"
import { INDEX_SYMBOLS } from "./market-symbols"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

// ── News mark types (exported for popover) ──

export interface NewsMarkItem {
  id: string
  title: string
  slug: string
  sentiment: string | null
  sourceName: string | null
  updatedAt: string
  imageUrl: string | null
}

export interface NewsMarkGroup {
  dateKey: string
  timestamp: number
  items: NewsMarkItem[]
  dominantSentiment: "positive" | "negative" | "neutral"
}

// Resolution mapping: TradingView resolution → our API interval
const RESOLUTION_MAP: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1H",
  "120": "1H",
  "240": "1H",
  "D": "1D",
  "1D": "1D",
  "W": "1W",
  "1W": "1W",
  "M": "1M",
  "1M": "1M",
}

interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface DataFeedConfig {
  supported_resolutions: string[]
  exchanges: { value: string; name: string; desc: string }[]
  symbols_types: { name: string; value: string }[]
}

const CONFIG: DataFeedConfig & { supports_marks: boolean } = {
  supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
  supports_marks: true,
  exchanges: [
    { value: "HOSE", name: "HOSE", desc: "Sở giao dịch TP.HCM" },
    { value: "HNX", name: "HNX", desc: "Sở giao dịch Hà Nội" },
    { value: "UPCOM", name: "UPCOM", desc: "Thị trường UPCoM" },
    { value: "INDEX", name: "INDEX", desc: "Chỉ số" },
  ],
  symbols_types: [
    { name: "Tất cả", value: "" },
    { name: "Cổ phiếu", value: "stock" },
    { name: "Chỉ số", value: "index" },
  ],
}

function getSymbolInfo(symbol: string) {
  const isIndex = INDEX_SYMBOLS.has(symbol.toUpperCase())
  return {
    name: symbol,
    ticker: symbol,
    description: isIndex ? `Chỉ số ${symbol}` : symbol,
    type: isIndex ? "index" : "stock",
    session: "0900-1130,1300-1445",
    timezone: "Asia/Ho_Chi_Minh",
    exchange: isIndex ? "INDEX" : "HOSE",
    listed_exchange: isIndex ? "INDEX" : "HOSE",
    minmov: 1,
    pricescale: isIndex ? 100 : 1000,
    has_intraday: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: CONFIG.supported_resolutions,
    volume_precision: 0,
    data_status: "streaming",
    currency_code: "VND",
    format: "price" as const,
  }
}

// Seconds per resolution for countBack calculation
const RESOLUTION_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
}

/** Minimum timestamp — 2000-01-01 UTC.  TradingView may pass 0 or negative. */
const MIN_TIMESTAMP = 946684800

/** Clamp a Unix-seconds timestamp so we never request data before 2000. */
function clampTs(ts: number): number {
  return Math.max(ts, MIN_TIMESTAMP)
}

/** Format date as YYYY-MM-DD for new backend */
function formatISODate(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function fetchBars(
  symbol: string,
  interval: string,
  from?: number,
  to?: number,
): Promise<Bar[]> {
  try {
    // New backend: GET /market-data/quotes/{symbol}/ohlcv?interval=1D&start=YYYY-MM-DD&end=YYYY-MM-DD
    const params = new URLSearchParams({ interval })

    if (from) params.set("start", formatISODate(new Date(clampTs(from) * 1000)))
    if (to) params.set("end", formatISODate(new Date(clampTs(to) * 1000)))

    const url = `${API_BASE}/market-data/quotes/${symbol.toUpperCase()}/ohlcv?${params.toString()}`
    const resp = await fetch(url)

    if (!resp.ok) return []

    const json = await resp.json()
    const items = json?.data || json || []

    const bars: Bar[] = (Array.isArray(items) ? items : [])
      .map((item: any) => {
        const raw = item.time ?? item.date ?? item.timestamp
        let ms: number
        if (typeof raw === "number") {
          // Backend returns Unix seconds — convert to ms.
          // Guard: if value is already in ms (> year 2100 in seconds) keep as-is.
          ms = raw < 4_102_444_800 ? raw * 1000 : raw
        } else {
          ms = new Date(raw).getTime()
        }
        return {
          time: ms,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume) || 0,
        }
      })
      .filter((b: Bar) => !isNaN(b.time) && b.time > 0)
      .sort((a: Bar, b: Bar) => a.time - b.time)

    return bars
  } catch {
    return []
  }
}

// ── News marks helpers ──

const newsMarkCache = new Map<string, NewsMarkGroup[]>()

function getDominantSentiment(items: NewsMarkItem[]): "positive" | "negative" | "neutral" {
  let pos = 0, neg = 0
  for (const item of items) {
    const s = (item.sentiment || "").toLowerCase()
    if (s === "positive") pos++
    else if (s === "negative") neg++
  }
  if (pos > neg) return "positive"
  if (neg > pos) return "negative"
  return "neutral"
}

function sentimentToColor(s: "positive" | "negative" | "neutral"): { border: string; background: string } {
  switch (s) {
    case "positive": return { border: "#10b981", background: "#10b981" }
    case "negative": return { border: "#ef4444", background: "#ef4444" }
    default: return { border: "#f59e0b", background: "#f59e0b" }
  }
}

async function fetchNewsMarks(symbol: string, from: number, to: number): Promise<NewsMarkGroup[]> {
  const cacheKey = `${symbol}-${from}-${to}`
  if (newsMarkCache.has(cacheKey)) return newsMarkCache.get(cacheKey)!

  try {
    const fromDate = formatVietnamDateKey(new Date(clampTs(from) * 1000))
    // Cap toDate to today — TradingView may pass far-future timestamps
    const rawTo = new Date(clampTs(to) * 1000)
    const now = new Date()
    const toDate = formatVietnamDateKey(rawTo > now ? now : rawTo)

    // New backend: GET /market-data/news/ai
    // Param mapping: updateFrom → update_from, updateTo → update_to, pageSize → page_size
    const resp = await fetch(
      `${API_BASE}/market-data/news/ai?ticker=${encodeURIComponent(symbol)}&update_from=${fromDate}&update_to=${toDate}&page_size=100&language=vi`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!resp.ok) return []

    const json = await resp.json()
    const items: any[] = json?.data || []

    // Group by date (YYYY-MM-DD)
    const grouped = new Map<string, NewsMarkItem[]>()
    for (const item of items) {
      const rawUpdatedAt = item.updated_at ?? item.updatedAt
      const updatedAt = rawUpdatedAt ? new Date(rawUpdatedAt) : null
      const dateStr =
        updatedAt && !Number.isNaN(updatedAt.getTime())
          ? formatVietnamDateKey(updatedAt)
          : (rawUpdatedAt || "").slice(0, 10)
      if (!dateStr) continue
      if (!grouped.has(dateStr)) grouped.set(dateStr, [])
      grouped.get(dateStr)!.push({
        id: item.id || item._id || "",
        title: item.title,
        slug: item.slug,
        sentiment: item.sentiment,
        sourceName: item.source_name ?? item.sourceName,
        updatedAt: rawUpdatedAt,
        imageUrl: item.image_url ?? item.imageUrl,
      })
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

/** Get cached news marks for a specific mark ID (dateKey) */
export function getNewsMarkGroup(_symbol: string, markId: string): NewsMarkGroup | null {
  for (const groups of newsMarkCache.values()) {
    const found = groups.find(g => g.dateKey === markId)
    if (found) return found
  }
  return null
}

// DataPulse for real-time updates (polling)
class DataPulse {
  private _subscribers: Map<
    string,
    {
      symbolInfo: any
      resolution: string
      lastBar: Bar | null
      callback: (bar: Bar) => void
    }
  > = new Map()
  private _timer: ReturnType<typeof setInterval> | null = null

  start() {
    if (this._timer) return
    this._timer = setInterval(() => this._poll(), 15000) // Poll every 15s
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  subscribe(
    key: string,
    symbolInfo: any,
    resolution: string,
    callback: (bar: Bar) => void,
    lastBar: Bar | null,
  ) {
    this._subscribers.set(key, { symbolInfo, resolution, lastBar, callback })
    this.start()
  }

  unsubscribe(key: string) {
    this._subscribers.delete(key)
    if (this._subscribers.size === 0) this.stop()
  }

  private async _poll() {
    for (const [, sub] of this._subscribers) {
      try {
        const interval = RESOLUTION_MAP[sub.resolution] || "1D"
        const now = Math.floor(Date.now() / 1000)
        const from = sub.lastBar ? Math.floor(sub.lastBar.time / 1000) - 60 : now - 86400

        const bars = await fetchBars(sub.symbolInfo.ticker, interval, from, now)
        if (bars.length > 0) {
          const latestBar = bars[bars.length - 1]
          if (!sub.lastBar || latestBar.time >= sub.lastBar.time) {
            sub.lastBar = latestBar
            sub.callback(latestBar)
          }
        }
      } catch {
        // silently continue
      }
    }
  }
}

// ── Export DataFeed ──

export function createDataFeed(): any {
  const dataPulse = new DataPulse()

  return {
    onReady(callback: (config: DataFeedConfig) => void) {
      setTimeout(() => callback(CONFIG), 0)
    },

    async searchSymbols(
      userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (items: any[]) => void,
    ) {
      const input = userInput.trim()
      if (!input) {
        onResult([])
        return
      }

      try {
        // New backend: GET /market-data/reference/symbols/search?q=...&page_size=...&include_indices=true
        const resp = await fetch(
          `${API_BASE}/market-data/reference/symbols/search?q=${encodeURIComponent(input)}&page_size=20&include_indices=true`,
        )
        if (!resp.ok) {
          onResult([])
          return
        }

        const json = await resp.json()
        const items = json?.data || json || []

        const results = (Array.isArray(items) ? items : []).map((item: any) => {
          const symbol = (item.symbol || item.ticker || "").toUpperCase()
          const isIndex = INDEX_SYMBOLS.has(symbol)
          return {
            symbol,
            full_name: `${item.exchange || (isIndex ? "INDEX" : "HOSE")}:${symbol}`,
            description: item.name || item.organ_name || item.nameEn || (isIndex ? `Chỉ số ${symbol}` : symbol),
            exchange: item.exchange || (isIndex ? "INDEX" : "HOSE"),
            type: isIndex ? "index" : "stock",
            ticker: symbol,
          }
        })

        onResult(results)
      } catch {
        onResult([])
      }
    },

    resolveSymbol(
      symbolName: string,
      onResolve: (info: any) => void,
      onError: (reason: string) => void,
    ) {
      setTimeout(() => {
        const symbol = symbolName.split(":").pop() || symbolName
        try {
          const info = getSymbolInfo(symbol.toUpperCase())
          onResolve(info)
        } catch {
          onError("Symbol not found")
        }
      }, 0)
    },

    getBars(
      symbolInfo: any,
      resolution: string,
      periodParams: { from: number; to: number; firstDataRequest: boolean; countBack?: number },
      onResult: (bars: Bar[], meta: { noData: boolean }) => void,
      onError: (reason: string) => void,
    ) {
      const interval = RESOLUTION_MAP[resolution] || "1D"

      // Calculate proper from based on countBack
      let from: number | undefined = periodParams.from
      const to = periodParams.to

      if (periodParams.countBack && periodParams.countBack > 0) {
        const secPerBar = RESOLUTION_SECONDS[interval] || 86400
        // Add 50% buffer for weekends/holidays
        const needed = Math.ceil(periodParams.countBack * secPerBar * 1.5)
        const countBackFrom = to - needed
        // Use whichever is earlier
        from = Math.min(from || countBackFrom, countBackFrom)
      }

      if (periodParams.firstDataRequest) {
        // On first load, don't limit - let backend use its default range
        from = undefined
      }

      fetchBars(symbolInfo.ticker, interval, from, to)
        .then((bars) => {
          if (bars.length === 0) {
            onResult([], { noData: true })
          } else {
            onResult(bars, { noData: false })
          }
        })
        .catch((err) => onError(err?.message || "Failed to fetch bars"))
    },

    getMarks(
      symbolInfo: any,
      from: number,
      to: number,
      onDataCallback: (marks: any[]) => void,
      _resolution: string,
    ) {
      fetchNewsMarks(symbolInfo.ticker, from, to)
        .then((groups) => {
          const marks = groups.map((group) => ({
            id: group.dateKey,
            time: group.timestamp,
            color: sentimentToColor(group.dominantSentiment),
            text: group.items.map((n) => n.title).join("\n"),
            label: String(group.items.length),
            labelFontColor: "#ffffff",
            minSize: 20,
          }))
          onDataCallback(marks)
        })
        .catch(() => onDataCallback([]))
    },

    subscribeBars(
      symbolInfo: any,
      resolution: string,
      onTick: (bar: Bar) => void,
      listenerGuid: string,
    ) {
      dataPulse.subscribe(listenerGuid, symbolInfo, resolution, onTick, null)
    },

    unsubscribeBars(listenerGuid: string) {
      dataPulse.unsubscribe(listenerGuid)
    },
  }
}
