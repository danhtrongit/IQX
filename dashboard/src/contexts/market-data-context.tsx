import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import {
  fetchPriceBoard,
  fetchMarketIndices,
  type PriceBoardData,
  type IndexData,
} from "@/hooks/use-market-data"

// ── Types ──

interface MarketDataContextType {
  priceMap: Record<string, PriceBoardData>
  indices: IndexData[]
  isLoading: boolean
  subscribe: (symbols: string[]) => () => void
}

const MarketDataContext = createContext<MarketDataContextType>({
  priceMap: {},
  indices: [],
  isLoading: true,
  subscribe: () => () => {},
})

// ── Constants ──

const PRICE_INTERVAL = 5_000  // 5s - unified for all consumers
const INDEX_INTERVAL = 10_000
const INDEX_DISPLAY: Record<string, string> = {
  VNINDEX: "VN-Index",
  VN30: "VN30",
  HNX: "HNX-Index",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
}
const MAIN_INDEX_KEYS = ["VNINDEX", "VN30", "HNX", "UPCOM"]

interface RawPollingIndex {
  symbol: string
  price: number | string
  change: number | string
  changePercent: number | string
}

function mapRawToIndices(rawList: RawPollingIndex[]): IndexData[] {
  const mapped = rawList
    .filter((r) => MAIN_INDEX_KEYS.includes(r.symbol))
    .map((r) => {
      const price = Number(r.price) || 0
      const change = Number(r.change) || 0
      const changePct = Number(r.changePercent) || 0
      return {
        name: INDEX_DISPLAY[r.symbol] || r.symbol,
        value: price,
        change,
        changePercent: changePct,
        trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
      } satisfies IndexData
    })

  mapped.sort((a, b) => {
    const aKey = Object.keys(INDEX_DISPLAY).find((k) => INDEX_DISPLAY[k] === a.name) || a.name
    const bKey = Object.keys(INDEX_DISPLAY).find((k) => INDEX_DISPLAY[k] === b.name) || b.name
    return MAIN_INDEX_KEYS.indexOf(aKey) - MAIN_INDEX_KEYS.indexOf(bKey)
  })
  return mapped
}

// ── Provider ──

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [priceMap, setPriceMap] = useState<Record<string, PriceBoardData>>({})
  const [indices, setIndices] = useState<IndexData[]>([])
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [isIndicesLoading, setIsIndicesLoading] = useState(true)

  // Ref-counted subscription tracking
  // Key: uppercase symbol, Value: number of active subscribers
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

    if (changed) {
      setSubscribedSymbols(Array.from(map.keys()))
    }

    // Return unsubscribe function
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
      if (removed) {
        setSubscribedSymbols(Array.from(map.keys()))
      }
    }
  }, [])

  // ── Price polling (single batch for ALL symbols) ──

  const symbolsKey = useMemo(
    () => [...subscribedSymbols].sort().join(","),
    [subscribedSymbols],
  )

  useEffect(() => {
    if (!symbolsKey) {
      setIsPriceLoading(false)
      return
    }

    const syms = symbolsKey.split(",").filter(Boolean)
    let cancelled = false

    const load = async (force = false) => {
      if (!force && document.hidden) return
      try {
        const results = await fetchPriceBoard(syms)
        if (cancelled) return
        const map: Record<string, PriceBoardData> = {}
        for (const item of results) {
          map[item.symbol] = item
        }
        setPriceMap((prev) => ({ ...prev, ...map }))
      } catch { /* silently ignore */ }
      if (!cancelled) setIsPriceLoading(false)
    }

    void load(true)
    const timer = setInterval(load, PRICE_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [symbolsKey])

  // ── Indices polling ──

  useEffect(() => {
    let cancelled = false

    const fetchIndices = async (force = false) => {
      if (!force && document.hidden) return
      try {
        const rawList = await fetchMarketIndices()
        if (cancelled || !rawList || rawList.length === 0) return
        setIndices(mapRawToIndices(rawList))
        setIsIndicesLoading(false)
      } catch {
        /* ignore polling errors */
      }
    }

    void fetchIndices(true)

    const pollTimer = setInterval(fetchIndices, INDEX_INTERVAL)

    const handleVisibility = () => {
      if (!document.hidden) {
        void fetchIndices(true)
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)

    const timeout = setTimeout(() => {
      if (!cancelled) setIsIndicesLoading(false)
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      clearInterval(pollTimer)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  // ── Pause polling when tab is hidden ──

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        // Tab became visible → trigger immediate refresh
        const syms = Array.from(refCountMap.current.keys())
        if (syms.length > 0) {
          fetchPriceBoard(syms).then((results) => {
            const map: Record<string, PriceBoardData> = {}
            for (const item of results) {
              map[item.symbol] = item
            }
            setPriceMap((prev) => ({ ...prev, ...map }))
          }).catch(() => {
            /* ignore visibility refresh errors */
          })
        }
        // Indices refresh through the polling effect above.
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  const isLoading = isPriceLoading || isIndicesLoading

  const value = useMemo(
    () => ({ priceMap, indices, isLoading, subscribe }),
    [priceMap, indices, isLoading, subscribe],
  )

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  )
}

// ── Consumer Hooks ──

/** Raw context access */
export function useMarketData() {
  return useContext(MarketDataContext)
}

/** Subscribe to a single symbol's live price */
export function usePrice(symbol: string): { data: PriceBoardData | null; isLoading: boolean } {
  const { priceMap, isLoading, subscribe } = useContext(MarketDataContext)
  const upper = symbol.toUpperCase()

  useEffect(() => {
    if (!upper) return
    return subscribe([upper])
  }, [upper, subscribe])

  return {
    data: upper ? priceMap[upper] ?? null : null,
    isLoading: isLoading && !priceMap[upper],
  }
}

/** Subscribe to multiple symbols' live prices (batch) */
export function usePrices(symbols: string[]): { priceMap: Record<string, PriceBoardData>; isLoading: boolean } {
  const ctx = useContext(MarketDataContext)

  const symbolsKey = useMemo(
    () => symbols.map((s) => s.toUpperCase()).sort().join(","),
    [symbols],
  )

  useEffect(() => {
    const syms = symbolsKey.split(",").filter(Boolean)
    if (syms.length === 0) return
    return ctx.subscribe(syms)
  }, [symbolsKey, ctx.subscribe])

  const subset = useMemo(() => {
    const result: Record<string, PriceBoardData> = {}
    for (const sym of symbolsKey.split(",")) {
      if (sym && ctx.priceMap[sym]) {
        result[sym] = ctx.priceMap[sym]
      }
    }
    return result
  }, [symbolsKey, ctx.priceMap])

  return {
    priceMap: subset,
    isLoading: ctx.isLoading,
  }
}

/** Get market indices data (auto-polled) */
export function useIndices(): { indices: IndexData[]; isLoading: boolean } {
  const { indices, isLoading } = useContext(MarketDataContext)
  return { indices, isLoading: isLoading && indices.length === 0 }
}
