import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { searchSymbols } from "./api"
import { marketDataKeys } from "./keys"
import { useMarketDataContext } from "./provider"
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
  const ctx = useMarketDataContext()

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
    return ctx.subscribe(syms)
  }, [symbolsKey, ctx.subscribe])

  const subset = useMemo(() => {
    const result: Record<string, PriceBoardData> = {}
    for (const sym of symbolsKey.split(",")) {
      if (sym && ctx.priceMap[sym]) result[sym] = ctx.priceMap[sym]
    }
    return result
  }, [symbolsKey, ctx.priceMap])

  return { priceMap: subset, isLoading: ctx.isPriceLoading }
}

/** Get market indices data (auto-polled every 10s). */
export function useIndices(): { indices: IndexData[]; isLoading: boolean } {
  const { indices, isIndicesLoading } = useMarketDataContext()
  return { indices, isLoading: isIndicesLoading && indices.length === 0 }
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
