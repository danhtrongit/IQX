import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchMarketIndices, fetchPriceBoard } from "./api"
import { marketDataKeys } from "./keys"
import type { IndexData, PriceBoardData } from "./types"

const PRICE_INTERVAL = 5_000 // 5s — unified for all consumers
const INDEX_INTERVAL = 10_000 // 10s

interface MarketDataContextValue {
  priceMap: Record<string, PriceBoardData>
  indices: IndexData[]
  isPriceLoading: boolean
  isIndicesLoading: boolean
  /** Register symbols into the union; returns an unsubscribe fn (ref-counted). */
  subscribe: (symbols: string[]) => () => void
}

const MarketDataContext = createContext<MarketDataContextValue>({
  priceMap: {},
  indices: [],
  isPriceLoading: true,
  isIndicesLoading: true,
  subscribe: () => () => {},
})

/**
 * MarketDataProvider — preserves dashboard-bak's batched, ref-counted union of
 * subscribed symbols, but backs the actual fetching with TanStack Query:
 *  - ONE prices `useQuery` keyed on the sorted symbol union, `refetchInterval` 5s.
 *  - ONE indices `useQuery`, `refetchInterval` 10s.
 * Both pause when the tab is hidden (`refetchIntervalInBackground: false`).
 */
export function MarketDataProvider({ children }: { children: ReactNode }) {
  // Ref-counted subscription tracking. Key: uppercase symbol → subscriber count.
  const refCountMap = useRef<Map<string, number>>(new Map())
  const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([])

  const subscribe = useCallback((symbols: string[]): (() => void) => {
    const map = refCountMap.current
    let changed = false

    for (const sym of symbols) {
      const upper = sym.toUpperCase()
      if (!upper) continue
      const prev = map.get(upper) || 0
      map.set(upper, prev + 1)
      if (prev === 0) changed = true
    }

    if (changed) setSubscribedSymbols(Array.from(map.keys()))

    return () => {
      let removed = false
      for (const sym of symbols) {
        const upper = sym.toUpperCase()
        if (!upper) continue
        const count = map.get(upper) || 0
        if (count <= 1) {
          map.delete(upper)
          removed = true
        } else {
          map.set(upper, count - 1)
        }
      }
      if (removed) setSubscribedSymbols(Array.from(map.keys()))
    }
  }, [])

  // Sorted union key — stable across re-orders so the query key is deterministic.
  const symbolsKey = useMemo(
    () => [...subscribedSymbols].sort().join(","),
    [subscribedSymbols],
  )

  // ── Single batched price query for the WHOLE symbol union ──
  const pricesQuery = useQuery({
    queryKey: marketDataKeys.priceBoard(symbolsKey),
    queryFn: () => fetchPriceBoard(symbolsKey.split(",").filter(Boolean)),
    enabled: symbolsKey.length > 0,
    refetchInterval: PRICE_INTERVAL,
    refetchIntervalInBackground: false, // pause when tab hidden
    staleTime: PRICE_INTERVAL,
  })

  const priceMap = useMemo(() => {
    const map: Record<string, PriceBoardData> = {}
    for (const item of pricesQuery.data ?? []) map[item.symbol] = item
    return map
  }, [pricesQuery.data])

  // ── Indices query ──
  const indicesQuery = useQuery({
    queryKey: marketDataKeys.indices(),
    queryFn: fetchMarketIndices,
    refetchInterval: INDEX_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: INDEX_INTERVAL,
  })

  const indices = indicesQuery.data ?? []

  const value = useMemo<MarketDataContextValue>(
    () => ({
      priceMap,
      indices,
      // Only "loading" when we have subscribers but no data yet.
      isPriceLoading:
        symbolsKey.length > 0 && pricesQuery.isLoading,
      isIndicesLoading: indicesQuery.isLoading,
      subscribe,
    }),
    [
      priceMap,
      indices,
      symbolsKey,
      pricesQuery.isLoading,
      indicesQuery.isLoading,
      subscribe,
    ],
  )

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  )
}

/** Raw context access (internal — consumers should prefer the typed hooks). */
export function useMarketDataContext() {
  return useContext(MarketDataContext)
}
