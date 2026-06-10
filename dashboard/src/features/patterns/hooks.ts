import { useQuery } from "@tanstack/react-query"
import { fetchPatterns, type PatternItem, type PatternKind } from "./api"
import { patternsKeys } from "./keys"

/**
 * AI pattern recognition for a symbol + kind (candles | charts).
 * Premium-gated upstream; the panel renders inside a <PremiumGate>, so we only
 * fire the query when a symbol is present.
 */
export function usePatterns(kind: PatternKind, symbol: string | null) {
  const query = useQuery({
    queryKey: patternsKeys.list(kind, symbol ?? ""),
    queryFn: ({ signal }) => fetchPatterns(kind, symbol as string, signal),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
  })

  return {
    items: (query.data ?? []) as PatternItem[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
