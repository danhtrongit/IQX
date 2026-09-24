/**
 * Consumer hooks for the board transport. Each page mounts its own
 * `MarketDataProvider`; these hooks register the symbols a view actually shows
 * and read the merged rows back out.
 */
import { useEffect, useMemo } from "react"

import { useMarketDataContext } from "./context"
import type { MarketIndexQuote, PriceBoardRow } from "./types"

/**
 * Live rows for `symbols`, batched into the shared union (sorted, ref-counted,
 * de-duplicated). Only the symbols a view renders are subscribed, so paging the
 * directory or switching board tabs re-points the socket at the new set.
 */
export function usePrices(symbols: string[]): {
  priceMap: Record<string, PriceBoardRow>
  isLoading: boolean
  error: Error | null
} {
  const { subscribe, priceMap, isPriceLoading, priceError } = useMarketDataContext()

  const symbolsKey = useMemo(
    () =>
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
        .sort()
        .join(","),
    [symbols],
  )

  useEffect(() => {
    const codes = symbolsKey.split(",").filter(Boolean)
    if (codes.length === 0) return
    return subscribe(codes)
  }, [symbolsKey, subscribe])

  const subset = useMemo(() => {
    const result: Record<string, PriceBoardRow> = {}
    for (const symbol of symbolsKey.split(",")) {
      const row = priceMap[symbol]
      if (row) result[symbol] = row
    }
    return result
  }, [symbolsKey, priceMap])

  return { priceMap: subset, isLoading: isPriceLoading, error: priceError }
}

/** Main indices plus the timestamp of the newest index data (live or polled). */
export function useIndices(): {
  indices: MarketIndexQuote[]
  isLoading: boolean
  updatedAt: number | null
} {
  const { indices, isIndicesLoading, indicesUpdatedAt } = useMarketDataContext()
  return { indices, isLoading: isIndicesLoading, updatedAt: indicesUpdatedAt }
}

/**
 * Board transport status for the toolbar: whether the socket is live, when the
 * newest board data arrived, and which upstream answered the snapshot.
 */
export function useBoardStatus(): {
  isRealtime: boolean
  updatedAt: number | null
  source: string | null
} {
  const { isRealtime, boardUpdatedAt, boardSource } = useMarketDataContext()
  return { isRealtime, updatedAt: boardUpdatedAt, source: boardSource }
}
