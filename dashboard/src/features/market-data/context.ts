import { createContext, useContext } from "react"
import type { RealtimeClient } from "./realtime"
import type { IndexData, PriceBoardData } from "./types"

export interface MarketDataContextValue {
  priceMap: Record<string, PriceBoardData>
  indices: IndexData[]
  isPriceLoading: boolean
  isIndicesLoading: boolean
  /** True while the realtime WS is connected (vs REST-polling fallback). */
  isRealtime: boolean
  /** Register symbols into the union; returns an unsubscribe fn (ref-counted). */
  subscribe: (symbols: string[]) => () => void
  /** Access the shared realtime WS client (orderbook/ohlc subscriptions). */
  getRealtimeClient: () => RealtimeClient | null
}

export const MarketDataContext = createContext<MarketDataContextValue>({
  priceMap: {},
  indices: [],
  isPriceLoading: true,
  isIndicesLoading: true,
  isRealtime: false,
  subscribe: () => () => {},
  getRealtimeClient: () => null,
})

/** Raw context access (internal — consumers should prefer the typed hooks). */
export function useMarketDataContext() {
  return useContext(MarketDataContext)
}
