/** UI-facing market index summary (camelCase). */
export interface IndexData {
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
}

/** UI-facing live price-board row for a single symbol (camelCase, prices in x1000). */
export interface PriceBoardData {
  symbol: string
  exchange: string
  ceilingPrice: number
  floorPrice: number
  referencePrice: number
  openPrice: number
  closePrice: number
  highestPrice: number
  lowestPrice: number
  priceChange: number
  percentChange: number
  /** False when no trade happened today (pre-market / off-hours): price falls back to reference. */
  hasTraded: boolean
  totalVolume: number
  totalValue: number
  /** KL của lệnh khớp gần nhất (cổ phiếu) — chỉ có khi nhận tick realtime. */
  lastMatchVolume?: number
  bid: { price: number; volume: number }[]
  ask: { price: number; volume: number }[]
  foreignBuy: number
  foreignSell: number
  foreignRoom: number | null
}

/** Typeahead search result row (camelCase). */
export interface SymbolSearchResult {
  symbol: string
  name: string
  nameEn: string
  exchange: string
  sectorName: string
}
