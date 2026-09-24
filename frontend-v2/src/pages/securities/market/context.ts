import { createContext, useContext } from "react"

import type { MarketIndexQuote, PriceBoardRow } from "./types"

/**
 * The board's live data surface: one ref-counted symbol union shared by every
 * consumer on the page, backed by the realtime WebSocket with a REST price-board
 * poll as reference data and fallback. Pages mount their own provider (the
 * transport is feature-owned, not app-global), so a page that shows no prices
 * opens no socket.
 */
export interface MarketDataContextValue {
  /** Merged board rows (REST snapshot + tick/order-book overlays), keyed by symbol. */
  priceMap: Record<string, PriceBoardRow>
  /** Main market indices (REST poll + live index-channel overlay). */
  indices: MarketIndexQuote[]
  isPriceLoading: boolean
  isIndicesLoading: boolean
  /** Failure of the board snapshot (realtime ticks can still keep rows alive). */
  priceError: Error | null
  /** True while the realtime socket is connected (the board labels this "Realtime"). */
  isRealtime: boolean
  /** Epoch ms of the newest board data: last tick received or last REST snapshot. */
  boardUpdatedAt: number | null
  /** Upstream that answered the newest snapshot (e.g. "VCI"); null before it lands. */
  boardSource: string | null
  /** Epoch ms of the newest index data: last live index message or REST poll. */
  indicesUpdatedAt: number | null
  /** Register symbols into the shared union; returns an unsubscribe fn (ref-counted). */
  subscribe: (symbols: string[]) => () => void
}

export const MarketDataContext = createContext<MarketDataContextValue | null>(null)

export function useMarketDataContext(): MarketDataContextValue {
  const context = useContext(MarketDataContext)
  if (!context) throw new Error("useMarketDataContext must be used within MarketDataProvider")
  return context
}
