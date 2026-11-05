/**
 * TradingView Custom DataFeed — adapter over the backend market-data API
 * (OHLCV + symbol search + AI news marks), wired to the shared `api` client
 * (bearer token + 401 refresh baked in).
 *
 * Bar times are milliseconds for TradingView. API range parameters and news
 * marks remain Unix seconds; the OHLCV adapter owns the unit conversion.
 */
import { api } from "@/lib/api"

import { INDEX_SYMBOLS } from "./market-symbols"
import { extractSearchItems } from "./search-utils"
import { fetchNewsMarks } from "./news-marks"
import { formatVietnamDateKey } from "./timezone"

// Tin AI nằm ở news-marks.ts, dùng chung với IQLine; giữ nguyên đường import cũ của các file khác.
export { getNewsMarkGroup, type NewsMarkGroup, type NewsMarkItem } from "./news-marks"

export type Bar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type SymbolInfo = {
  name: string
  ticker: string
  description: string
  type: "stock" | "index"
  session: string
  timezone: string
  exchange: string
  listed_exchange: string
  minmov: number
  pricescale: number
  has_intraday: boolean
  has_daily: boolean
  has_weekly_and_monthly: boolean
  supported_resolutions: string[]
  volume_precision: number
  data_status: string
  currency_code: string
  format: "price"
}

export type DatafeedConfiguration = {
  supported_resolutions: string[]
  supports_marks: boolean
  exchanges: { value: string; name: string; desc: string }[]
  symbols_types: { name: string; value: string }[]
}

export type PeriodParams = {
  from: number
  to: number
  firstDataRequest: boolean
  countBack?: number
}

export type SearchSymbolResult = {
  symbol: string
  full_name: string
  description: string
  exchange: string
  type: "stock" | "index"
  ticker: string
}

export type NewsMark = {
  id: string
  time: number
  color: { border: string; background: string }
  text: string
  label: string
  labelFontColor: string
  minSize: number
}

/** Dots' colours for the marks, resolved from the app's theme tokens. */
export type MarkColors = { positive: string; negative: string; neutral: string }

// Resolution mapping: TradingView resolution → our API interval
const RESOLUTION_MAP: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1H",
  "120": "1H",
  "240": "1H",
  D: "1D",
  "1D": "1D",
  W: "1W",
  "1W": "1W",
  M: "1M",
  "1M": "1M",
}

const CONFIG: DatafeedConfiguration = {
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

function getSymbolInfo(symbol: string): SymbolInfo {
  const isIndex = INDEX_SYMBOLS[symbol.toUpperCase()] === true
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
    format: "price",
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

/** Minimum timestamp — 2000-01-01 UTC. TradingView may pass 0 or negative. */
const MIN_TIMESTAMP = 946684800

/** Clamp a Unix-seconds timestamp so we never request data before 2000. */
function clampTs(ts: number): number {
  return Math.max(ts, MIN_TIMESTAMP)
}

/** Normalise upstream seconds, milliseconds or ISO dates before bar conversion. */
function toEpochSeconds(raw: unknown): number {
  const numeric = typeof raw === "number" ? raw
    : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : Number.NaN
  if (Number.isFinite(numeric)) {
    return numeric > 1e11 ? Math.round(numeric / 1000) : Math.round(numeric)
  }
  const parsed = new Date(String(raw ?? "")).getTime()
  return Number.isNaN(parsed) ? Number.NaN : Math.round(parsed / 1000)
}

/** Format a date as `YYYY-MM-DD` in local (Vietnam) time for the backend. */
function formatISODate(date: Date): string {
  return formatVietnamDateKey(date)
}

type RawBar = Record<string, unknown>

export async function fetchBars(
  symbol: string,
  interval: string,
  from?: number,
  to?: number,
  signal?: AbortSignal,
): Promise<Bar[]> {
  const params = new URLSearchParams({ interval })
  if (from) params.set("start", formatISODate(new Date(clampTs(from) * 1000)))
  if (to) params.set("end", formatISODate(new Date(clampTs(to) * 1000)))

  const payload = await api<unknown>(
    `/market-data/quotes/${encodeURIComponent(symbol.toUpperCase())}/ohlcv?${params.toString()}`,
    { signal },
  )
  const items = payload && typeof payload === "object" && "data" in payload ? payload.data : payload
  if (!Array.isArray(items)) throw new Error("Dữ liệu OHLCV không hợp lệ.")
  return items
    .filter((item): item is RawBar => item != null && typeof item === "object")
    .map((item) => ({
      time: toEpochSeconds(item.time ?? item.date ?? item.timestamp) * 1000,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume) || 0,
    }))
    .filter(bar => Number.isFinite(bar.time) && bar.time > 0 && Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.time - b.time)
}

/* ── DataPulse: latest-bar polling ───────────────────────────────────────── */

type PulseSubscriber = {
  symbolInfo: SymbolInfo
  resolution: string
  lastBar: Bar | null
  callback: (bar: Bar) => void
}

class DataPulse {
  private _subscribers = new Map<string, PulseSubscriber>()
  private _timer: ReturnType<typeof setInterval> | undefined

  start() {
    if (this._timer !== undefined) return
    this._timer = setInterval(() => void this._poll(), 15_000) // Poll every 15s
  }

  stop() {
    clearInterval(this._timer)
    this._timer = undefined
  }

  subscribe(subscriber: PulseSubscriber, key: string) {
    this._subscribers.set(key, subscriber)
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
        const latestBar = bars[bars.length - 1]
        if (latestBar && (!sub.lastBar || latestBar.time >= sub.lastBar.time)) {
          sub.lastBar = latestBar
          sub.callback(latestBar)
        }
      } catch {
        // silently continue — the next tick retries
      }
    }
  }
}

/** The slice of the TradingView `IDatafeedApi` this adapter implements. */
export type MarketDataFeed = {
  onReady(callback: (config: DatafeedConfiguration) => void): void
  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: (items: SearchSymbolResult[]) => void,
  ): void
  resolveSymbol(
    symbolName: string,
    onResolve: (info: SymbolInfo) => void,
    onError: (reason: string) => void,
  ): void
  getBars(
    symbolInfo: SymbolInfo,
    resolution: string,
    periodParams: PeriodParams,
    onResult: (bars: Bar[], meta: { noData: boolean }) => void,
    onError: (reason: string) => void,
  ): void
  getMarks(
    symbolInfo: SymbolInfo,
    from: number,
    to: number,
    onDataCallback: (marks: NewsMark[]) => void,
    resolution: string,
  ): void
  subscribeBars(
    symbolInfo: SymbolInfo,
    resolution: string,
    onTick: (bar: Bar) => void,
    listenerGuid: string,
  ): void
  unsubscribeBars(listenerGuid: string): void
}

export function createDataFeed(markColors: MarkColors): MarketDataFeed {
  const dataPulse = new DataPulse()

  return {
    onReady(callback) {
      setTimeout(() => callback(CONFIG), 0)
    },

    async searchSymbols(userInput, _exchange, _symbolType, onResult) {
      const input = userInput.trim()
      if (!input) {
        onResult([])
        return
      }

      try {
        // The v2 instruments route performs ranked, paginated search server
        // side; avoid downloading the complete provider catalog for every
        // keystroke.
        const params = new URLSearchParams({ q: input, page: "1", page_size: "20", include_indices: "true" })
        const payload = await api<unknown>(
          `/instruments?${params.toString()}`,
        )

        onResult(
          extractSearchItems(payload)
            .filter((entry) => {
              const item = entry as RawBar
              const symbol = String(item.symbol ?? item.ticker ?? "").toUpperCase()
              const name = String(item.name ?? item.organ_name ?? "").toUpperCase()
              return symbol.includes(input.toUpperCase()) || name.includes(input.toUpperCase())
            })
            .slice(0, 20)
            .map((entry) => {
            const item = entry as RawBar
            const symbol = String(item.symbol ?? item.ticker ?? "").toUpperCase()
            const isIndex = INDEX_SYMBOLS[symbol] === true
            const exchange = String(item.exchange ?? (isIndex ? "INDEX" : "HOSE"))
            return {
              symbol,
              full_name: `${exchange}:${symbol}`,
              description: String(
                item.name ??
                  item.organ_name ??
                  item.nameEn ??
                  (isIndex ? `Chỉ số ${symbol}` : symbol),
              ),
              exchange,
              type: isIndex ? ("index" as const) : ("stock" as const),
              ticker: symbol,
            }
          }),
        )
      } catch {
        onResult([])
      }
    },

    resolveSymbol(symbolName, onResolve, onError) {
      setTimeout(() => {
        const symbol = symbolName.split(":").pop() || symbolName
        try {
          onResolve(getSymbolInfo(symbol.toUpperCase()))
        } catch {
          onError("Symbol not found")
        }
      }, 0)
    },

    getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      const interval = RESOLUTION_MAP[resolution] || "1D"

      // Calculate proper from based on countBack
      let from: number | undefined = periodParams.from
      const to = periodParams.to

      if (periodParams.countBack && periodParams.countBack > 0) {
        const secPerBar = RESOLUTION_SECONDS[interval] || 86400
        // Add 50% buffer for weekends/holidays
        const needed = Math.ceil(periodParams.countBack * secPerBar * 1.5)
        const countBackFrom = to - needed
        from = Math.min(from || countBackFrom, countBackFrom)
      }

      if (periodParams.firstDataRequest) {
        // On first load, don't limit — let the backend use its default range
        from = undefined
      }

      fetchBars(symbolInfo.ticker, interval, from, to)
        .then((bars) => {
          const inRange = bars.filter(bar => bar.time < to * 1000)
          onResult(inRange, { noData: inRange.length === 0 })
        })
        .catch((error: unknown) =>
          onError(error instanceof Error ? error.message : "Failed to fetch bars"),
        )
    },

    getMarks(symbolInfo, from, to, onDataCallback) {
      fetchNewsMarks(symbolInfo.ticker, from, to)
        .then((groups) => {
          onDataCallback(
            groups.map((group) => ({
              id: group.dateKey,
              time: group.timestamp,
              color: {
                border: markColors[group.dominantSentiment],
                background: markColors[group.dominantSentiment],
              },
              text: group.items.map((item) => item.title).join("\n"),
              label: String(group.items.length),
              labelFontColor: "#ffffff",
              minSize: 20,
            })),
          )
        })
        .catch(() => onDataCallback([]))
    },

    subscribeBars(symbolInfo, resolution, onTick, listenerGuid) {
      dataPulse.subscribe(
        { symbolInfo, resolution, lastBar: null, callback: onTick },
        listenerGuid,
      )
    },

    unsubscribeBars(listenerGuid) {
      dataPulse.unsubscribe(listenerGuid)
    },
  }
}
