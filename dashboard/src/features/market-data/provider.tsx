import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchMarketIndices, fetchPriceBoard } from "./api"
import { marketDataKeys } from "./keys"
import { RealtimeClient, type TickMessage } from "./realtime"
import type { IndexData, PriceBoardData } from "./types"

// When WS is live, the price-board snapshot is only needed for reference data
// (ceiling/floor/reference) + as a fallback, so we poll it slowly. When WS is
// down we fall back to the original fast poll for live prices.
const PRICE_INTERVAL_WS = 30_000 // 30s — reference refresh + backstop
const PRICE_INTERVAL_POLL = 5_000 // 5s — fallback live polling
const INDEX_INTERVAL = 10_000 // 10s
const OVERLAY_FLUSH_MS = 500 // batch tick-driven re-renders to ~2/s

/** Live tick overlay applied on top of the price-board snapshot. */
interface TickOverlay {
  closePrice: number // x1000 convention (VND / 1000), matching PriceBoardData
  totalVolume: number
}

interface MarketDataContextValue {
  priceMap: Record<string, PriceBoardData>
  indices: IndexData[]
  isPriceLoading: boolean
  isIndicesLoading: boolean
  /** Register symbols into the union; returns an unsubscribe fn (ref-counted). */
  subscribe: (symbols: string[]) => () => void
  /** Access the shared realtime WS client (orderbook/ohlc subscriptions). */
  getRealtimeClient: () => RealtimeClient | null
}

const MarketDataContext = createContext<MarketDataContextValue>({
  priceMap: {},
  indices: [],
  isPriceLoading: true,
  isIndicesLoading: true,
  subscribe: () => () => {},
  getRealtimeClient: () => null,
})

/**
 * MarketDataProvider — ref-counted symbol union backed by:
 *  - A realtime WebSocket (DNSE-fed tick stream) for live prices.
 *  - A price-board `useQuery` for reference data (ceiling/floor/ref) and as a
 *    fallback when the WS is unavailable.
 *  - An indices `useQuery` (10s) — indices stay on polling for now.
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

  // ── Realtime WebSocket ─────────────────────────────
  const clientRef = useRef<RealtimeClient | null>(null)
  const overlayRef = useRef<Map<string, TickOverlay>>(new Map())
  const [wsConnected, setWsConnected] = useState(false)
  const [overlayVersion, setOverlayVersion] = useState(0)

  if (clientRef.current === null && typeof window !== "undefined") {
    clientRef.current = new RealtimeClient({ onStatusChange: setWsConnected })
  }

  // Connect once on mount; flush batched ticks on an interval.
  useEffect(() => {
    const client = clientRef.current
    if (!client) return
    client.connect()
    const flush = setInterval(() => {
      if (overlayRef.current.size > 0) setOverlayVersion((v) => v + 1)
    }, OVERLAY_FLUSH_MS)
    return () => {
      clearInterval(flush)
      client.disconnect()
    }
  }, [])

  // Subscribe tick stream for the current symbol union; clean up on change.
  useEffect(() => {
    const client = clientRef.current
    if (!client) return
    const symbols = symbolsKey.split(",").filter(Boolean)
    const unsubs = symbols.map((sym) =>
      client.on(sym, "tick", (msg) => {
        const tick = msg as TickMessage
        overlayRef.current.set(tick.symbol.toUpperCase(), {
          closePrice: tick.price / 1000, // VND → x1000 convention
          totalVolume: tick.total_volume,
        })
      }),
    )
    return () => {
      for (const u of unsubs) u()
    }
  }, [symbolsKey])

  // ── Price-board snapshot (reference data + fallback) ──
  const pricesQuery = useQuery({
    queryKey: marketDataKeys.priceBoard(symbolsKey),
    queryFn: () => fetchPriceBoard(symbolsKey.split(",").filter(Boolean)),
    enabled: symbolsKey.length > 0,
    refetchInterval: wsConnected ? PRICE_INTERVAL_WS : PRICE_INTERVAL_POLL,
    refetchIntervalInBackground: false, // pause when tab hidden
    staleTime: PRICE_INTERVAL_POLL,
  })

  // Merge snapshot with live tick overlay. overlayVersion forces recompute
  // after each batched flush.
  const priceMap = useMemo(() => {
    const map: Record<string, PriceBoardData> = {}
    for (const item of pricesQuery.data ?? []) {
      const overlay = overlayRef.current.get(item.symbol.toUpperCase())
      if (!overlay || overlay.closePrice <= 0) {
        map[item.symbol] = item
        continue
      }
      const closePrice = overlay.closePrice
      const ref = item.referencePrice || 0
      const priceChange = ref > 0 ? closePrice - ref : item.priceChange
      const percentChange = ref > 0 ? (priceChange / ref) * 100 : item.percentChange
      map[item.symbol] = {
        ...item,
        closePrice,
        priceChange,
        percentChange,
        hasTraded: true,
        totalVolume: overlay.totalVolume || item.totalVolume,
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricesQuery.data, overlayVersion])

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
      getRealtimeClient: () => clientRef.current,
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
