// ─── Hook: pre-market VN-Index market analysis ────────────
// Uses the shared `api` ky client (same pattern as midday/useMidDayMarketAnalysis.ts).
// The endpoint returns the analysis directly (no { data, meta } envelope).

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/http/client"
import type { PreMarketAnalysis } from "./types"

export function usePreMarketAnalysis(enabled = true) {
  return useQuery<PreMarketAnalysis>({
    queryKey: ["market-analysis", "premarket", "latest"],
    queryFn: () => api.get("market-analysis/premarket/latest").json<PreMarketAnalysis>(),
    staleTime: 30 * 60 * 1000,
    enabled,
  })
}
