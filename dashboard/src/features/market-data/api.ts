import { api, unwrap } from "@/shared/http/client"
import { splitIntradayRows, type IndexIntraday } from "./intraday"
import type { IndexData, PriceBoardData, SymbolSearchResult } from "./types"

// ── Index constants / adapters (ported from dashboard-bak) ──

/** Symbols sent to the market-index endpoint. */
const INDEX_REQUEST_SYMBOLS = ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]
/** Order in which main indices are displayed. */
const MAIN_INDEX_KEYS = ["VNINDEX", "VN30", "HNX30", "HNX", "UPCOM"]
/** Normalized index code (DNSE/realtime convention) → UI display name. */
export const INDEX_CODE_TO_NAME: Record<string, string> = {
  VNINDEX: "VN-Index",
  VN30: "VN30",
  HNX: "HNX-Index",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
}
const INDEX_ALIASES: Record<string, string> = {
  VNINDEX: "VNINDEX",
  VN30: "VN30",
  HNX: "HNX",
  HNXINDEX: "HNX",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
  UPCOMINDEX: "UPCOM",
  HNXUPCOMINDEX: "UPCOM",
}

/** Backend market-index response item (snake_case). */
interface BackendMarketIndex {
  index_name?: string
  index_value?: number
  symbol?: string
  price?: number
  change?: number
  change_percent?: number
  total_shares?: number
  total_value_million_vnd?: number
  total_stock_increase?: number
  total_stock_decline?: number
  total_stock_no_change?: number
  [key: string]: unknown
}

function normalizeIndexSymbol(rawSymbol: string | undefined): string | null {
  const normalized = rawSymbol?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  if (!normalized) return null
  return INDEX_ALIASES[normalized] || normalized
}

/** Adapt backend market-index to UI IndexData, keeping only the main indices. */
function adaptMarketIndex(raw: BackendMarketIndex): IndexData | null {
  const symbol = normalizeIndexSymbol(raw.symbol || raw.index_name)
  if (!symbol || !MAIN_INDEX_KEYS.includes(symbol)) return null

  const change = Number(raw.change) || 0
  const changePercent = Number(raw.change_percent) || 0
  const value = Number(raw.price ?? raw.index_value) || 0

  return {
    name: INDEX_CODE_TO_NAME[symbol] || symbol,
    value,
    change,
    changePercent,
    trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
    volume: raw.total_shares ? Number(raw.total_shares) : undefined,
    totalValue: raw.total_value_million_vnd
      ? Number(raw.total_value_million_vnd) * 1e6
      : undefined,
    advances: raw.total_stock_increase ? Number(raw.total_stock_increase) : undefined,
    declines: raw.total_stock_decline ? Number(raw.total_stock_decline) : undefined,
    noChange: raw.total_stock_no_change ? Number(raw.total_stock_no_change) : undefined,
  }
}

/**
 * GET market-data/overview/market-index — main market indices, sorted by
 * MAIN_INDEX_KEYS order (VN-Index, VN30, HNX-Index, UPCOM).
 */
export async function fetchMarketIndices(): Promise<IndexData[]> {
  const res = await api
    .get("market-data/overview/market-index", {
      searchParams: { symbols: INDEX_REQUEST_SYMBOLS.join(",") },
    })
    .json<unknown>()

  const rawItems = unwrap<BackendMarketIndex[]>(res as never)
  if (!Array.isArray(rawItems)) return []

  const adapted = rawItems
    .map(adaptMarketIndex)
    .filter((item): item is IndexData => item !== null)

  // Sort by MAIN_INDEX_KEYS order.
  return MAIN_INDEX_KEYS.map((key) =>
    adapted.find((r) => r.name === (INDEX_CODE_TO_NAME[key] || key)),
  ).filter((item): item is IndexData => item != null)
}

// ── Price-board adapter (ported from dashboard-bak) ──

/** Tolerant backend row: snake_case fields with occasional camelCase variants. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter đọc payload linh hoạt theo cả 2 kiểu đặt tên
type RawRecord = Record<string, any>

/**
 * Adapt backend snake_case price-board item to camelCase PriceBoardData.
 * Backend returns prices in raw VND (e.g. 219500). The UI expects prices in
 * x1000 format (e.g. 219.5) and displays via `* 1000`, so we divide by 1000.
 */
function adaptPriceBoardItem(raw: RawRecord): PriceBoardData {
  const toK = (v: number | null | undefined) => (v != null ? v / 1000 : 0)

  const referencePrice = toK(raw.reference_price ?? raw.referencePrice)
  const rawClose = toK(raw.close_price ?? raw.closePrice)
  // Pre-market / no trades yet: backend returns close_price=0. Fall back to the
  // reference price so the board shows a valid price with 0 change (standard VN
  // price-board behavior) instead of "—" and a false -100%.
  const hasTraded = rawClose > 0
  const closePrice = hasTraded ? rawClose : referencePrice
  const priceChange =
    raw.price_change != null
      ? toK(raw.price_change)
      : raw.priceChange != null
        ? raw.priceChange
        : hasTraded
          ? closePrice - referencePrice
          : 0
  const percentChange =
    raw.percent_change ??
    raw.percentChange ??
    (hasTraded && referencePrice > 0 ? (priceChange / referencePrice) * 100 : 0)

  return {
    symbol: raw.symbol || "",
    exchange: raw.exchange || "",
    ceilingPrice: toK(raw.ceiling_price ?? raw.ceilingPrice),
    floorPrice: toK(raw.floor_price ?? raw.floorPrice),
    referencePrice,
    openPrice: toK(raw.open_price ?? raw.openPrice),
    closePrice,
    highestPrice: toK(raw.high_price ?? raw.highestPrice),
    lowestPrice: toK(raw.low_price ?? raw.lowestPrice),
    priceChange,
    percentChange,
    hasTraded,
    totalVolume: raw.total_volume ?? raw.totalVolume ?? 0,
    totalValue: raw.total_value ?? raw.totalValue ?? 0,
    bid: Array.isArray(raw.bid_prices)
      ? raw.bid_prices.map((b: RawRecord) => ({ price: toK(b.price), volume: b.volume ?? 0 }))
      : raw.bid || [],
    ask: Array.isArray(raw.ask_prices)
      ? raw.ask_prices.map((a: RawRecord) => ({ price: toK(a.price), volume: a.volume ?? 0 }))
      : raw.ask || [],
    foreignBuy: raw.foreign_buy_volume ?? raw.foreignBuy ?? 0,
    foreignSell: raw.foreign_sell_volume ?? raw.foreignSell ?? 0,
    foreignRoom: raw.foreign_remaining_room ?? raw.foreignRoom ?? null,
  }
}

/** POST market-data/trading/price-board — live price-board for a batch of symbols. */
/** Backend PriceBoardRequest chỉ nhận tối đa 50 mã/request. */
const PRICE_BOARD_CHUNK = 50

export async function fetchPriceBoard(symbols: string[]): Promise<PriceBoardData[]> {
  if (symbols.length === 0) return []
  // Tab lớn (VN100/HOSE/…) vượt giới hạn 50 mã → chia lô song song rồi gộp.
  const chunks: string[][] = []
  for (let i = 0; i < symbols.length; i += PRICE_BOARD_CHUNK) {
    chunks.push(symbols.slice(i, i + PRICE_BOARD_CHUNK))
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await api
        .post("market-data/trading/price-board", { json: { symbols: chunk } })
        .json<unknown>()
      const rawItems = unwrap<RawRecord[]>(res as never)
      return Array.isArray(rawItems) ? rawItems.map(adaptPriceBoardItem) : []
    }),
  )
  return results.flat()
}

/** GET market-data/quotes/{symbol}/ohlcv — recent daily closes (ascending by time). */
export async function fetchDailyCloses(symbol: string): Promise<number[]> {
  if (!symbol) return []
  try {
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      .toISOString()
      .slice(0, 10)
    const json = await api
      .get(`market-data/quotes/${symbol.toUpperCase()}/ohlcv`, {
        searchParams: { start, end, interval: "1D" },
      })
      .json<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>()
    const rows = Array.isArray(json) ? json : json.data || []
    return rows
      .map((p) => Number(p.close ?? p.close_price ?? 0))
      .filter((v) => v > 0)
  } catch {
    return []
  }
}

/**
 * GET market-data/quotes/{symbol}/ohlcv?interval=5m — today's intraday closes
 * for an index (e.g. VNINDEX, VN30, HNXIndex, HNX30) plus the previous
 * session's last close as reference. Returns empty arrays on any failure.
 */
export async function fetchIndexIntraday(symbol: string): Promise<IndexIntraday> {
  if (!symbol) return { times: [], closes: [], refValue: null }
  try {
    const now = new Date()
    // end = ngày mai để chắc chắn lấy trọn phiên hôm nay (backend parse end là 00:00 UTC).
    const end = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10)
    const json = await api
      .get(`market-data/quotes/${symbol.toUpperCase()}/ohlcv`, {
        searchParams: { start, end, interval: "5m" },
      })
      .json<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>()
    const rows = Array.isArray(json) ? json : json.data || []
    const startOfToday =
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
    return splitIntradayRows(rows, startOfToday)
  } catch {
    return { times: [], closes: [], refValue: null }
  }
}

/**
 * Previous-session % change from a series of daily closes (ascending).
 * Compares the last close to the one before it. Scale-invariant, so adjusted
 * closes are fine. Returns 0 when there are fewer than 2 valid points.
 */
export function prevSessionChangePct(closes: number[]): number {
  if (!Array.isArray(closes) || closes.length < 2) return 0
  const last = closes[closes.length - 1]
  const prev = closes[closes.length - 2]
  if (!prev) return 0
  return ((last - prev) / prev) * 100
}

function adaptSymbolSearchItem(raw: RawRecord): SymbolSearchResult {
  return {
    symbol: (raw.symbol || raw.ticker || "").toUpperCase(),
    name: raw.name || raw.organ_name || raw.organName || "",
    nameEn: raw.name_en || raw.nameEn || "",
    exchange: raw.exchange || "",
    sectorName: raw.sector_name || raw.sectorName || "",
  }
}

/** GET market-data/reference/symbols/search — typeahead search for the global search box. */
export async function searchSymbols(q: string): Promise<SymbolSearchResult[]> {
  if (!q) return []
  const res = await api
    .get("market-data/reference/symbols/search", {
      searchParams: { q, page_size: "8", include_indices: "true" },
    })
    .json<unknown>()
  // Endpoint may answer with { data }, { items }, or a bare array.
  const obj = res as { data?: unknown; items?: unknown } | unknown[]
  const rawItems = Array.isArray(obj)
    ? obj
    : ((obj as { data?: unknown }).data ??
        (obj as { items?: unknown }).items ??
        [])
  return Array.isArray(rawItems) ? rawItems.map(adaptSymbolSearchItem) : []
}
