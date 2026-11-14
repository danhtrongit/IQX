/** Colour meaning of a price on a Vietnamese board. Only used for market numbers. */
export type PriceTone = "up" | "down" | "ref" | "ceiling" | "floor"

export interface DepthLevel {
  /** VND. */
  price: number
  /** Shares. */
  volume: number
}

/** One stock row of the IQX price board. Prices are in VND, as the API sends them. */
export interface Quote {
  symbol: string
  exchange: string | null
  ref: number | null
  ceiling: number | null
  floor: number | null
  open: number | null
  high: number | null
  low: number | null
  /** Last matched price, or the reference price while nothing has matched yet. */
  price: number | null
  /** False until the first match of a session. */
  traded: boolean
  /** VND, 0 until traded. */
  change: number
  /** Percent, 0 until traded. */
  pct: number
  /** Shares. */
  volume: number | null
  /** VND. */
  value: number | null
  bid: DepthLevel[]
  ask: DepthLevel[]
  foreignBuy: number | null
  foreignSell: number | null
}

export type IndexCode = "VNINDEX" | "VN30" | "HNX" | "HNX30" | "UPCOM"

/** Index values are points, never scaled. */
export interface IndexQuote {
  code: IndexCode
  name: string
  value: number
  ref: number | null
  change: number
  pct: number
  /** Shares. */
  volume: number | null
  /** VND. */
  turnover: number | null
  advances: number | null
  declines: number | null
  unchanged: number | null
  ceilings: number | null
  floors: number | null
  /** Epoch ms of the index data. */
  time: number | null
}

export interface DirectoryEntry {
  symbol: string
  name: string
  exchange: string
}
