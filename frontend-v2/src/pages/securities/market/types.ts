/**
 * Market types for the securities surfaces.
 *
 * Money convention (must stay identical to the legacy board, `PriceBoardData`):
 * stock prices are carried in **x1000 đồng** (`73.4` = 73,400đ) because that is
 * how Vietnamese boards print them; `totalValue` stays in **absolute VND**, and
 * volumes are share counts. Index values are **điểm chỉ số**, never scaled.
 */

/** One order-book depth level; `price` follows the x1000 convention. */
export interface DepthLevel {
  price: number
  volume: number
}

/** A live price-board row (one ticker). */
export interface PriceBoardRow {
  symbol: string
  exchange: string
  ceilingPrice: number
  floorPrice: number
  referencePrice: number
  openPrice: number
  closePrice: number
  highestPrice: number
  lowestPrice: number
  /** Chênh lệch so với giá tham chiếu, x1000 convention. */
  priceChange: number
  percentChange: number
  /** False before the first match of the session: `closePrice` falls back to reference. */
  hasTraded: boolean
  totalVolume: number
  /** Tổng giá trị khớp (VND tuyệt đối). */
  totalValue: number
  /** KL của lệnh khớp gần nhất — only present on realtime ticks. */
  lastMatchVolume?: number
  bid: DepthLevel[]
  ask: DepthLevel[]
  foreignBuy: number
  foreignSell: number
  foreignRoom: number | null
}

/** One market index summary (điểm chỉ số). */
export interface MarketIndexQuote {
  name: string
  value: number
  change: number
  changePercent: number
  trend: "up" | "down" | "flat"
  volume?: number
  /** Tổng giá trị giao dịch (VND tuyệt đối). */
  totalValue?: number
  advances?: number
  declines?: number
  noChange?: number
  /** Source timestamp as the upstream reports it (e.g. "14:32:05"). */
  time?: string
}

/** Today's 5-minute closes for one index plus the previous session's reference close. */
export interface IndexIntraday {
  /** Epoch seconds of today's bars (ascending). */
  times: number[]
  /** Closes of today's bars (points, ascending). */
  closes: number[]
  /** Close of the last bar before today (giá tham chiếu), or null. */
  refValue: number | null
}

/** A batch price-board snapshot plus the provenance the board prints. */
export interface PriceBoardSnapshot {
  rows: PriceBoardRow[]
  /** Envelope `meta.as_of` — when the backend fetched the snapshot (ISO-8601). */
  asOf: string | null
  /** Envelope `meta.source` — which upstream answered (e.g. "VCI"). */
  source: string | null
}

/** Main indices ranked the way the strip and the summary table print them. */
export const MAIN_INDEX_ORDER = ["VN-Index", "VN30", "HNX30", "HNX-Index", "UPCOM"] as const
