import type {
  DepthLevel,
  DirectoryEntry,
  IndexCode,
  IndexQuote,
  Quote,
} from "./types.ts"

type Raw = Record<string, unknown>

/** Finite number or numeric string, anything else is null. */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The API wraps every list as `{ data: [...], meta }`. Returns null when the shape is wrong. */
export function dataRows(payload: unknown): Raw[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null
  return payload.data.filter(isRecord)
}

/** `meta.as_of`, the moment the server answered, as epoch ms. */
export function envelopeTime(payload: unknown): number | null {
  if (!isRecord(payload) || !isRecord(payload.meta)) return null
  return parseTime(payload.meta.as_of)
}

/** ISO text, `YYYY-MM-DD HH:mm` or epoch ms to epoch ms. */
export function parseTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const text = str(value)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : parsed
}

const INDEX_NAMES: Record<IndexCode, string> = {
  VNINDEX: "VN-Index",
  VN30: "VN30",
  HNX: "HNX-Index",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
}

const INDEX_ALIASES: Record<string, IndexCode> = {
  VNINDEX: "VNINDEX",
  VN30: "VN30",
  HNX: "HNX",
  HNXINDEX: "HNX",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
  UPCOMINDEX: "UPCOM",
  HNXUPCOMINDEX: "UPCOM",
}

/** Board order of the indices. */
export const INDEX_ORDER: readonly IndexCode[] = [
  "VNINDEX",
  "VN30",
  "HNX",
  "HNX30",
  "UPCOM",
]

export function indexCode(raw: unknown): IndexCode | null {
  const key = str(raw)
    ?.replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
  return key ? (INDEX_ALIASES[key] ?? null) : null
}

function parseIndex(row: Raw): IndexQuote | null {
  const code = indexCode(row.symbol ?? row.index_name)
  const value = num(row.price ?? row.index_value)
  if (!code || value === null || value <= 0) return null
  const turnoverMillion = num(row.total_value_million_vnd)
  return {
    code,
    name: INDEX_NAMES[code],
    value,
    ref: num(row.ref_price),
    change: num(row.change) ?? 0,
    pct: num(row.change_percent) ?? 0,
    volume: num(row.total_shares),
    turnover: turnoverMillion === null ? null : turnoverMillion * 1e6,
    advances: num(row.total_stock_increase),
    declines: num(row.total_stock_decline),
    unchanged: num(row.total_stock_no_change),
    ceilings: num(row.total_stock_ceiling),
    floors: num(row.total_stock_floor),
    time: parseTime(row.time),
  }
}

/** `GET /market-data/overview/market-index`. Rows come back in board order, unknown indices dropped. */
export function parseIndices(payload: unknown): IndexQuote[] | null {
  const rows = dataRows(payload)
  if (!rows) return null
  const parsed = rows.flatMap((row) => parseIndex(row) ?? [])
  return INDEX_ORDER.flatMap(
    (code) => parsed.find((item) => item.code === code) ?? []
  )
}

function parseDepth(value: unknown): DepthLevel[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const price = num(entry.price)
    if (price === null || price <= 0) return []
    return [{ price, volume: num(entry.volume) ?? 0 }]
  })
}

function positive(value: number | null): number | null {
  return value !== null && value > 0 ? value : null
}

function parseQuote(row: Raw): Quote | null {
  const symbol = str(row.symbol)?.toUpperCase()
  if (!symbol) return null
  const ref = positive(num(row.reference_price))
  const matched = positive(num(row.close_price))
  const traded = matched !== null
  const price = matched ?? ref
  // A symbol the board does not know comes back as an empty row.
  if (price === null) return null
  let change = 0
  let pct = 0
  if (traded) {
    change = num(row.price_change) ?? (ref !== null ? matched - ref : 0)
    pct = num(row.percent_change) ?? (ref !== null ? (change / ref) * 100 : 0)
  }
  return {
    symbol,
    exchange: str(row.exchange),
    ref,
    ceiling: positive(num(row.ceiling_price)),
    floor: positive(num(row.floor_price)),
    open: positive(num(row.open_price)),
    high: positive(num(row.high_price)),
    low: positive(num(row.low_price)),
    price,
    traded,
    change,
    pct,
    volume: num(row.total_volume),
    value: num(row.total_value),
    bid: parseDepth(row.bid_prices),
    ask: parseDepth(row.ask_prices),
    foreignBuy: num(row.foreign_buy_volume),
    foreignSell: num(row.foreign_sell_volume),
  }
}

/** `POST /market-data/trading/price-board`. */
export function parsePriceBoard(payload: unknown): Quote[] | null {
  const rows = dataRows(payload)
  if (!rows) return null
  return rows.flatMap((row) => parseQuote(row) ?? [])
}

/** `GET /market-data/reference/groups/{group}/symbols`. */
export function parseGroupSymbols(payload: unknown): string[] | null {
  const rows = dataRows(payload)
  if (!rows) return null
  const symbols = rows.flatMap((row) => str(row.symbol)?.toUpperCase() ?? [])
  return [...new Set(symbols)]
}

const LISTED_EXCHANGES = new Set(["HOSE", "HNX", "UPCOM"])

/** `GET /market-data/reference/symbols`, kept to listed stocks only. */
export function parseDirectory(payload: unknown): DirectoryEntry[] | null {
  const rows = dataRows(payload)
  if (!rows) return null
  return rows.flatMap((row): DirectoryEntry[] => {
    const symbol = str(row.symbol)?.toUpperCase()
    const exchange = str(row.exchange)?.toUpperCase()
    if (!symbol || !exchange || !LISTED_EXCHANGES.has(exchange)) return []
    if (str(row.asset_type)?.toLowerCase() !== "stock") return []
    return [{ symbol, name: str(row.name) ?? "", exchange }]
  })
}

/** Message of an `{ error: { code, message } }` body, if the body has that shape. */
export function parseErrorBody(payload: unknown): {
  code: string | null
  message: string | null
} {
  if (!isRecord(payload) || !isRecord(payload.error))
    return { code: null, message: null }
  return { code: str(payload.error.code), message: str(payload.error.message) }
}
