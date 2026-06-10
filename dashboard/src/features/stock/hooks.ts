import { useMutation, useQuery } from "@tanstack/react-query"
import { usePremiumStatus } from "@/features/premium"
import { stockApi } from "./api"
import { stockKeys } from "./keys"
import type { FinReportType, InsightResponse } from "./types"

/** Company overview + ratio + shareholders + officers (composite). */
export function useStockOverview(symbol: string) {
  return useQuery({
    queryKey: stockKeys.overview(symbol),
    queryFn: () => stockApi.getOverview(symbol),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
  })
}

/** KBS spreadsheet report for a statement type (income/balance/cashflow). */
export function useFinancialReport(
  symbol: string,
  type: FinReportType,
  termType: number,
  periodCount: number,
) {
  return useQuery({
    queryKey: stockKeys.report(symbol, type, termType, periodCount),
    queryFn: () => stockApi.getReport(symbol, type, termType, periodCount),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
  })
}

/** Raw ratio rows for the charts + detail table. */
export function useFinancialRatios(symbol: string, period: "Q" | "Y") {
  return useQuery({
    queryKey: stockKeys.ratio(symbol, period),
    queryFn: () => stockApi.getRatios(symbol, period),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
  })
}

/** Forensic BCTC analysis payload. */
export function useBctc(symbol: string, termType = 1) {
  return useQuery({
    queryKey: stockKeys.bctc(symbol, termType),
    queryFn: () => stockApi.getBctc(symbol, termType),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
  })
}

/**
 * Premium AI memo for the BCTC analysis. Only runs for premium users (the
 * endpoint is premium-gated); non-premium users see the BctcAiMemo placeholder.
 */
export function useBctcAi(symbol: string, termType = 1) {
  const { isPremium } = usePremiumStatus()
  return useQuery({
    queryKey: stockKeys.bctcAi(symbol, termType),
    queryFn: () => stockApi.getBctcAi(symbol, termType),
    enabled: !!symbol && isPremium,
    staleTime: 10 * 60_000,
  })
}

// Indices (whole-market gauges) — AI Insight needs a specific listed stock.
const INDEX_CODES = new Set([
  "VNINDEX",
  "VN30",
  "HNX",
  "HNXINDEX",
  "UPCOM",
  "UPCOMINDEX",
  "HNX30",
])

export function isIndexSymbol(symbol: string): boolean {
  return INDEX_CODES.has(symbol.toUpperCase())
}

/**
 * 6-layer AI insight. Premium + expensive, so it is a lazy mutation: the UI
 * calls `analyze()` once (on first open) rather than auto-fetching on mount.
 * Returns the data alongside `analyze`/`isPending`/`error` for the component.
 */
export function useStockAiInsight(symbol: string) {
  const mutation = useMutation<InsightResponse, Error>({
    mutationKey: stockKeys.aiInsight(symbol),
    mutationFn: () => stockApi.analyzeInsight(symbol),
  })

  return {
    insight: mutation.data ?? null,
    analyze: mutation.mutate,
    analyzeAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
