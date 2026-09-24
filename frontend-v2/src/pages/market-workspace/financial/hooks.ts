import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { fetchBctcDashboard, fetchBctcNarrative } from "./api"
import { bctcKeys } from "./keys"

/**
 * Storytelling BCTC dashboard — deterministic compute layer (public, no gate).
 * Mirrors the legacy `useBctcDashboard`: public GET, staleTime 5m.
 */
export function useBctcDashboard(symbol: string, termType = 1) {
  return useQuery({
    queryKey: bctcKeys.dashboard(symbol, termType),
    queryFn: ({ signal }) => fetchBctcDashboard(symbol, termType, signal),
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
export function useBctcNarrative(symbol: string, termType = 1) {
  const { isPremium } = useAuth()
  return useQuery({
    queryKey: bctcKeys.narrative(symbol, termType),
    queryFn: ({ signal }) => fetchBctcNarrative(symbol, termType, signal),
    enabled: !!symbol && isPremium,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}
