import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { securitiesKeys } from "../keys"
import { fetchDirectorySymbols, fetchGroupSymbols } from "./api"
import type { DirectorySymbol, StockGroup } from "./types"
const EMPTY_TICKERS: string[] = []

/** The full tradable-stock directory (reference data — cached for the session). */
export function useSymbols(): {
  symbols: DirectorySymbol[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const query = useQuery<DirectorySymbol[]>({
    queryKey: securitiesKeys.directorySymbols,
    queryFn: fetchDirectorySymbols,
    staleTime: 5 * 60_000,
  })

  return {
    symbols: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}

/**
 * The tickers of an index group (VN30/HOSE/ETF…). Disabled while no group is
 * selected; returns a `Set` for O(1) membership checks while filtering.
 */
export function useGroups(group: StockGroup | null): {
  tickers: string[]
  tickerSet: Set<string>
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery<string[]>({
    queryKey: securitiesKeys.directoryGroup(group ?? ""),
    queryFn: () => fetchGroupSymbols(group as string),
    enabled: Boolean(group),
    staleTime: 5 * 60_000,
  })

  const tickers = query.data ?? EMPTY_TICKERS
  const tickerSet = useMemo(() => new Set(tickers), [tickers])

  return {
    tickers,
    tickerSet,
    isLoading: query.isLoading && Boolean(group),
    error: query.error,
  }
}
