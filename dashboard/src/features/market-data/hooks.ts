import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchDailyCloses, prevSessionChangePct, searchSymbols } from "./api"
import { useMarketDataContext } from "./context"
import { marketDataKeys } from "./keys"
import type { OhlcMessage, OrderBookMessage, TickMessage } from "./realtime"
import type { IndexData, PriceBoardData, SymbolSearchResult } from "./types"

/** Subscribe to a single symbol's live price. */
export function usePrice(symbol: string): {
  data: PriceBoardData | null
  isLoading: boolean
} {
  const { priceMap, isPriceLoading, subscribe } = useMarketDataContext()
  const upper = symbol.toUpperCase()

  useEffect(() => {
    if (!upper) return
    return subscribe([upper])
  }, [upper, subscribe])

  return {
    data: upper ? priceMap[upper] ?? null : null,
    isLoading: isPriceLoading && !priceMap[upper],
  }
}

/** Subscribe to multiple symbols' live prices (batched into the shared union). */
export function usePrices(symbols: string[]): {
  priceMap: Record<string, PriceBoardData>
  isLoading: boolean
} {
  const { subscribe, priceMap, isPriceLoading } = useMarketDataContext()

  const symbolsKey = useMemo(
    () =>
      symbols
        .map((s) => s.toUpperCase())
        .sort()
        .join(","),
    [symbols],
  )

  useEffect(() => {
    const syms = symbolsKey.split(",").filter(Boolean)
    if (syms.length === 0) return
    return subscribe(syms)
  }, [symbolsKey, subscribe])

  const subset = useMemo(() => {
    const result: Record<string, PriceBoardData> = {}
    for (const sym of symbolsKey.split(",")) {
      if (sym && priceMap[sym]) result[sym] = priceMap[sym]
    }
    return result
  }, [symbolsKey, priceMap])

  return { priceMap: subset, isLoading: isPriceLoading }
}

/** Get market indices data (live index channel over a 10s REST poll). */
export function useIndices(): { indices: IndexData[]; isLoading: boolean } {
  const { indices, isIndicesLoading } = useMarketDataContext()
  return { indices, isLoading: isIndicesLoading && indices.length === 0 }
}

/** Whether the realtime WS is currently connected (vs REST-polling fallback). */
export function useRealtimeStatus(): boolean {
  const { isRealtime } = useMarketDataContext()
  return isRealtime
}

/** Debounce a string value (250ms) for typeahead search. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Debounced symbol typeahead for the global search. Enabled when q.length >= 1. */
export function useSymbolSearch(q: string): {
  results: SymbolSearchResult[]
  isLoading: boolean
  isFetching: boolean
} {
  const debouncedQ = useDebounced(q.trim(), 250)
  const query = useQuery({
    queryKey: marketDataKeys.symbolSearch(debouncedQ),
    queryFn: () => searchSymbols(debouncedQ),
    enabled: debouncedQ.length >= 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  return {
    results: query.data ?? [],
    isLoading: query.isLoading && debouncedQ.length >= 1,
    isFetching: query.isFetching,
  }
}

/**
 * Previous-session % change for a symbol (last daily close vs the one before).
 * Used off-hours when the live board has no trade for today. Only fetches when
 * `enabled` is true; cached 30 min since off-hours data is static.
 */
export function usePreviousSessionChange(
  symbol: string,
  enabled: boolean,
): number {
  const upper = symbol.toUpperCase()
  const query = useQuery<number[]>({
    queryKey: marketDataKeys.dailyCloses(upper),
    queryFn: () => fetchDailyCloses(upper),
    enabled: Boolean(upper) && enabled,
    staleTime: 30 * 60_000,
  })
  return useMemo(() => prevSessionChangePct(query.data ?? []), [query.data])
}

/**
 * Subscribe to live matched-trade ticks for a symbol via the shared WS client.
 * Returns the most recent tick (or null). For UIs that want a stream, pass an
 * `onTick` callback.
 */
export function useRealtimeTicks(
  symbol: string,
  onTick?: (tick: TickMessage) => void,
): TickMessage | null {
  const { getRealtimeClient } = useMarketDataContext()
  const [last, setLast] = useState<TickMessage | null>(null)
  const cbRef = useRef(onTick)
  useEffect(() => {
    cbRef.current = onTick
  }, [onTick])

  useEffect(() => {
    const client = getRealtimeClient()
    const upper = symbol.toUpperCase()
    if (!client || !upper) return
    return client.on(upper, "tick", (msg) => {
      const tick = msg as TickMessage
      setLast(tick)
      cbRef.current?.(tick)
    })
  }, [symbol, getRealtimeClient])

  return last
}

/** Subscribe to the live order book (bid/ask depth) for a symbol. */
export function useOrderBook(symbol: string): OrderBookMessage | null {
  const { getRealtimeClient } = useMarketDataContext()
  const [book, setBook] = useState<OrderBookMessage | null>(null)

  useEffect(() => {
    const client = getRealtimeClient()
    const upper = symbol.toUpperCase()
    if (!client || !upper) return
    return client.on(upper, "orderbook", (msg) => setBook(msg as OrderBookMessage))
  }, [symbol, getRealtimeClient])

  // Đổi mã → book cũ không còn hợp lệ; trả null thay vì reset state trong effect.
  return book && book.symbol.toUpperCase() === symbol.toUpperCase() ? book : null
}

/** Subscribe to live 1-minute OHLC bars for a symbol. */
export function useRealtimeOhlc(
  symbol: string,
  onBar?: (bar: OhlcMessage) => void,
): OhlcMessage | null {
  const { getRealtimeClient } = useMarketDataContext()
  const [last, setLast] = useState<OhlcMessage | null>(null)
  const cbRef = useRef(onBar)
  useEffect(() => {
    cbRef.current = onBar
  }, [onBar])

  useEffect(() => {
    const client = getRealtimeClient()
    const upper = symbol.toUpperCase()
    if (!client || !upper) return
    return client.on(upper, "ohlc", (msg) => {
      const bar = msg as OhlcMessage
      setLast(bar)
      cbRef.current?.(bar)
    })
  }, [symbol, getRealtimeClient])

  return last
}
