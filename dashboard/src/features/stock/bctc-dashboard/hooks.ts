import { useQuery } from "@tanstack/react-query"

import { usePremiumStatus } from "@/features/premium"

import { stockApi } from "../api"
import { stockKeys } from "../keys"

/**
 * Storytelling BCTC dashboard — deterministic compute layer (public, no gate).
 * Mirrors `useBctc`: public GET, staleTime 5m.
 */
export function useBctcDashboard(symbol: string, termType = 1) {
  return useQuery({
    queryKey: stockKeys.bctcDashboard(symbol, termType),
    queryFn: () => stockApi.getBctcDashboard(symbol, termType),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
  })
}

/**
 * Premium AI narrative for the dashboard (verdict + story + per-block answers).
 * Only runs for premium users (the endpoint is premium-gated); non-premium users
 * still see every chart/number — the prose is simply omitted / behind the
 * PremiumGate. The narrative only changes when a new report lands, so keep the
 * client copy fresh for ~1 day (matches the backend cache horizon).
 */
export function useBctcDashboardAi(symbol: string, termType = 1) {
  const { isPremium } = usePremiumStatus()
  return useQuery({
    queryKey: stockKeys.bctcDashboardAi(symbol, termType),
    queryFn: () => stockApi.getBctcDashboardAi(symbol, termType),
    enabled: !!symbol && isPremium,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}
