import { useQuery } from "@tanstack/react-query"
import { fetchAllSymbols, fetchGroupSymbols, fetchIndustries } from "./api"
import { stockDirectoryKeys } from "./keys"
import type { DirectorySymbol, Industry } from "./types"

/** The full tradable-symbol directory (cached for the session). */
export function useSymbols() {
  const query = useQuery<DirectorySymbol[]>({
    queryKey: stockDirectoryKeys.symbols,
    queryFn: fetchAllSymbols,
    staleTime: 5 * 60_000,
  })

  return {
    symbols: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}

/**
 * The set of tickers in an index group (VN30/HOSE/ETF…). Disabled when no group
 * is selected. Returns a `Set` for O(1) membership checks while filtering.
 */
export function useGroups(group: string | null) {
  const query = useQuery<string[]>({
    queryKey: stockDirectoryKeys.group(group ?? ""),
    queryFn: () => fetchGroupSymbols(group as string),
    enabled: !!group,
    staleTime: 5 * 60_000,
  })

  return {
    tickers: query.data ?? [],
    tickerSet: new Set(query.data ?? []),
    isLoading: query.isLoading && !!group,
  }
}

/** ICB industry classification list (5-minute cache). */
export function useIndustries() {
  const query = useQuery<Industry[]>({
    queryKey: stockDirectoryKeys.industries,
    queryFn: fetchIndustries,
    staleTime: 30 * 60_000,
  })

  return {
    industries: query.data ?? [],
    isLoading: query.isLoading,
  }
}
