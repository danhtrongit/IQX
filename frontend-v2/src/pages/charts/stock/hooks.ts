import { useMutation, useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { stockApi } from "./api"
import { stockKeys } from "./keys"
import type { AIInsightResponse, BctcAi, BctcPayload, FinReport, FinReportType, StockOverviewData } from "./types"

/** Company overview + latest ratio + shareholders + officers (composite). */
export function useStockOverview(symbol: string) {
  const code = symbol.toUpperCase()
  return useQuery<StockOverviewData>({
    queryKey: stockKeys.overview(code),
    queryFn: () => stockApi.getOverview(code),
    enabled: code.length > 0,
    staleTime: 5 * 60_000,
  })
}

/** KBS spreadsheet report for a statement type (income/balance/cash-flow). */
export function useFinancialReport(
  symbol: string,
  type: FinReportType,
  termType: number,
  periodCount: number,
) {
  const code = symbol.toUpperCase()
  return useQuery<FinReport | null>({
    queryKey: stockKeys.report(code, type, termType, periodCount),
    queryFn: ({ signal }) => stockApi.getReport(code, type, termType, periodCount, signal),
    enabled: code.length > 0,
    staleTime: 5 * 60_000,
  })
}

/** Raw ratio rows for the ratio charts + detail table. */
export function useFinancialRatios(symbol: string, period: "Q" | "Y") {
  const code = symbol.toUpperCase()
  return useQuery({
    queryKey: stockKeys.ratio(code, period),
    queryFn: ({ signal }) => stockApi.getRatios(code, period, signal),
    enabled: code.length > 0,
    staleTime: 5 * 60_000,
  })
}

/** Forensic BCTC analysis payload (public). */
export function useBctc(symbol: string, termType = 1) {
  const code = symbol.toUpperCase()
  return useQuery<BctcPayload>({
    queryKey: stockKeys.bctc(code, termType),
    queryFn: ({ signal }) => stockApi.getBctc(code, termType, signal),
    enabled: code.length > 0,
    staleTime: 5 * 60_000,
  })
}

/**
 * Premium AI memo for the BCTC analysis. Only runs for premium users (the
 * endpoint is premium-gated); free users see the "chưa có nhận định" state.
 * Backend caches a week, so an entry that exists is served instantly and kept
 * fresh for the same period.
 */
export function useBctcAi(symbol: string, termType = 1) {
  const { user, isPremium } = useAuth()
  const code = symbol.toUpperCase()
  return useQuery<BctcAi | null>({
    queryKey: stockKeys.bctcAi(code, termType, user?.id),
    queryFn: ({ signal }) => stockApi.getBctcAi(code, termType, signal),
    enabled: code.length > 0 && isPremium,
    staleTime: 7 * 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
  })
}

/**
 * 6-layer AI Insight. Premium + expensive, so it stays a lazy mutation: the UI
 * calls `analyze()` when the reader opens the briefing, never on mount.
 */
export function useStockAiInsight(symbol: string) {
  const { user, isPremium } = useAuth()
  const code = symbol.toUpperCase()
  const mutation = useMutation<AIInsightResponse, Error, void>({
    mutationKey: stockKeys.aiInsight(code, user?.id),
    mutationFn: () => stockApi.analyzeInsight(code),
  })

  return {
    insight: mutation.data ?? null,
    analyze: () => {
      if (!isPremium) return
      mutation.mutate()
    },
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
