/**
 * Market transport for /co-phieu and /bang-gia — every call hits a real public
 * backend route (`/api/v2/...`), no demo fixtures:
 *
 * - `POST /market-data/trading/price-board` — batched live board (max 50 mã/request)
 * - `GET  /market-data/overview/market-index` — main index quotes
 * - `GET  /market-data/quotes/{symbol}/ohlcv` — intraday 5m closes for index cards
 *
 * Backend payloads are snake_case with money in raw VND; the adapters below
 * normalise them to the shared board types (prices → x1000 convention, volumes
 * as share counts, values as absolute VND). Missing upstream values stay 0 /
 * `null` so the UI prints "—" instead of inventing a price.
 */
import { api } from "@/lib/api"
import type { IndexIntraday, MarketIndexQuote, PriceBoardRow, PriceBoardSnapshot } from "./types"

type Raw = Record<string, unknown>

/** Finite number (or numeric string) → number, anything else → null. */
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

/** VND → the board's x1000 convention. */
function toK(value: number | null): number {
  return value === null ? 0 : value / 1000
}

/* ── Price board ─────────────────────────────────────────────────────────── */

/** Up to three depth levels; the backend already sends VND absolute prices. */
function levels(value: unknown): { price: number; volume: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const row = entry as Raw
    const levelPrice = num(row.price)
    if (levelPrice === null || levelPrice <= 0) return []
    return [{ price: toK(levelPrice), volume: num(row.volume) ?? 0 }]
  })
}

/**
 * Backend board row → UI row. Prices divide by 1000 (VND → x1000); a
 * `close_price` of 0/null means "chưa khớp phiên này", so the row falls back to
 * the reference price with a 0 change (board convention) instead of printing
 * "—" and a false -100%.
 */
function adaptBoardRow(raw: Raw): PriceBoardRow | null {
  const symbol = str(raw.symbol)?.toUpperCase()
  if (!symbol) return null

  const referencePrice = toK(num(raw.reference_price ?? raw.referencePrice))
  const traded = toK(num(raw.close_price ?? raw.closePrice))
  const hasTraded = traded > 0
  const closePrice = hasTraded ? traded : referencePrice
  const rawChange = num(raw.price_change ?? raw.priceChange)
  const priceChange =
    rawChange !== null ? rawChange / 1000 : hasTraded ? closePrice - referencePrice : 0
  const rawPercent = num(raw.percent_change ?? raw.percentChange)
  const percentChange =
    rawPercent ?? (hasTraded && referencePrice > 0 ? (priceChange / referencePrice) * 100 : 0)

  return {
    symbol,
    exchange: str(raw.exchange) ?? "",
    ceilingPrice: toK(num(raw.ceiling_price ?? raw.ceilingPrice)),
    floorPrice: toK(num(raw.floor_price ?? raw.floorPrice)),
    referencePrice,
    openPrice: toK(num(raw.open_price ?? raw.openPrice)),
    closePrice,
    highestPrice: toK(num(raw.high_price ?? raw.highestPrice)),
    lowestPrice: toK(num(raw.low_price ?? raw.lowestPrice)),
    priceChange,
    percentChange,
    hasTraded,
    totalVolume: num(raw.total_volume ?? raw.totalVolume) ?? 0,
    totalValue: num(raw.total_value ?? raw.totalValue) ?? 0,
    bid: levels(raw.bid_prices ?? raw.bid),
    ask: levels(raw.ask_prices ?? raw.ask),
    foreignBuy: num(raw.foreign_buy_volume ?? raw.foreignBuy) ?? 0,
    foreignSell: num(raw.foreign_sell_volume ?? raw.foreignSell) ?? 0,
    foreignRoom: num(raw.foreign_remaining_room ?? raw.foreignRoom),
  }
}

/** Backend caps one board request at 50 symbols. */
const PRICE_BOARD_CHUNK = 50

/**
 * Batched price board for a tab's symbol list. Tabs larger than 50 mã are split
 * into parallel chunks and merged; `asOf`/`source` come from the envelope so the
 * board can print when the snapshot was taken and who answered.
 */
export async function fetchPriceBoard(symbols: string[]): Promise<PriceBoardSnapshot> {
  const codes = symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  if (codes.length === 0) return { rows: [], asOf: null, source: null }

  const chunks: string[][] = []
  for (let index = 0; index < codes.length; index += PRICE_BOARD_CHUNK) {
    chunks.push(codes.slice(index, index + PRICE_BOARD_CHUNK))
  }

  const snapshots = await Promise.all(
    chunks.map(async (chunk) => {
      const payload = await api<{ data?: unknown; meta?: Raw }>(
        "/market-data/trading/price-board",
        {
          method: "POST",
          body: JSON.stringify({ symbols: chunk }),
        },
      )
      const rows = Array.isArray(payload.data) ? payload.data : []
      return {
        rows: rows.flatMap((row) => {
          const adapted = adaptBoardRow((row ?? {}) as Raw)
          return adapted ? [adapted] : []
        }),
        asOf: str(payload.meta?.as_of),
        source: str(payload.meta?.source),
      }
    }),
  )

  return {
    rows: snapshots.flatMap((snapshot) => snapshot.rows),
    asOf: snapshots.find((snapshot) => snapshot.asOf)?.asOf ?? null,
    source: snapshots.find((snapshot) => snapshot.source)?.source ?? null,
  }
}

/* ── Market indices ──────────────────────────────────────────────────────── */

/** Symbols sent to the market-index endpoint (backend `VALID_INDEX_SYMBOLS`). */
export const INDEX_REQUEST_SYMBOLS = [
  "VNINDEX",
  "VN30",
  "HNXIndex",
  "HNX30",
  "HNXUpcomIndex",
] as const

/** Upstream index code → board display name. */
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

/** Display name → upstream code (reverse of `INDEX_CODE_TO_NAME`). */
export const INDEX_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(INDEX_CODE_TO_NAME).map(([code, name]) => [name, code]),
)

/** Board display order — also the strip and summary-table order. */
const MAIN_INDEX_KEYS = ["VNINDEX", "VN30", "HNX30", "HNX", "UPCOM"] as const

/** `HNXIndex` / `HNX-Index` / `hnx` → canonical code; null when unusable. */
function normalizeIndexCode(value: string | null): string | null {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  if (!normalized) return null
  return INDEX_ALIASES[normalized] ?? normalized
}

function adaptIndex(raw: Raw): MarketIndexQuote | null {
  const code = normalizeIndexCode(str(raw.symbol) ?? str(raw.index_name))
  if (!code || !MAIN_INDEX_KEYS.includes(code as (typeof MAIN_INDEX_KEYS)[number])) return null

  const change = num(raw.change) ?? 0
  const value = num(raw.price ?? raw.index_value) ?? 0
  const totalValueMillion = num(raw.total_value_million_vnd)
  return {
    name: INDEX_CODE_TO_NAME[code] ?? code,
    value,
    change,
    changePercent: num(raw.change_percent) ?? 0,
    trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
    volume: num(raw.total_shares) ?? undefined,
    totalValue: totalValueMillion === null ? undefined : totalValueMillion * 1e6,
    advances: num(raw.total_stock_increase) ?? undefined,
    declines: num(raw.total_stock_decline) ?? undefined,
    noChange: num(raw.total_stock_no_change) ?? undefined,
    time: str(raw.time) ?? undefined,
  }
}

/**
 * `GET /market-data/overview/market-index` — the main indices, ordered the way
 * the board prints them. Response shape is `{ data, source_url }`.
 */
export async function fetchMarketIndices(): Promise<MarketIndexQuote[]> {
  const params = new URLSearchParams({ symbols: INDEX_REQUEST_SYMBOLS.join(",") })
  const payload = await api<{ data?: unknown }>(
    `/market-data/overview/market-index?${params.toString()}`,
  )
  const rows = Array.isArray(payload.data) ? payload.data : []
  const adapted = rows.flatMap((row) => {
    const item = adaptIndex((row ?? {}) as Raw)
    return item ? [item] : []
  })

  return MAIN_INDEX_KEYS.flatMap((key) => {
    const name = INDEX_CODE_TO_NAME[key]
    const item = adapted.find((candidate) => candidate.name === name)
    return item ? [item] : []
  })
}

/* ── Index intraday ──────────────────────────────────────────────────────── */

/**
 * Split ascending OHLCV rows into today's 5m closes and the previous session's
 * last close (the reference line of the card). Rows tolerate `close`/
 * `close_price` and `time`/`t` spellings; invalid rows are skipped.
 */
function splitIntradayRows(rows: Raw[], startOfTodayEpochS: number): IndexIntraday {
  const times: number[] = []
  const closes: number[] = []
  let refValue: number | null = null

  for (const row of rows) {
    const time = num(row.time ?? row.t)
    const close = num(row.close ?? row.close_price)
    if (time === null || time <= 0 || close === null || close <= 0) continue
    if (time >= startOfTodayEpochS) {
      times.push(time)
      closes.push(close)
    } else {
      // Nến cuối của phiên trước → giá tham chiếu (rows ascending).
      refValue = close
    }
  }

  return { times, closes, refValue }
}

/**
 * `GET /market-data/quotes/{symbol}/ohlcv?interval=5m` — today's intraday closes
 * for an index plus the previous session's close. Any failure resolves to empty
 * data so the card prints "chưa có dữ liệu phiên" instead of breaking the board.
 */
export async function fetchIndexIntraday(symbol: string): Promise<IndexIntraday> {
  const code = symbol.trim().toUpperCase()
  if (!code) return { times: [], closes: [], refValue: null }
  try {
    const now = new Date()
    // end = ngày mai để lấy trọn phiên hôm nay (backend parse end là 00:00 UTC).
    const end = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const params = new URLSearchParams({ start, end, interval: "5m" })
    const payload = await api<{ data?: unknown }>(
      `/market-data/quotes/${encodeURIComponent(code)}/ohlcv?${params.toString()}`,
    )
    const rows = Array.isArray(payload.data) ? (payload.data as Raw[]) : []
    const startOfToday =
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
    return splitIntradayRows(rows, startOfToday)
  } catch {
    return { times: [], closes: [], refValue: null }
  }
}
