// ─── Hook: daily VN-Index market analysis ───────────────
// Uses the shared `api` ky client (same pattern as market-overview/api.ts).
// The endpoint returns the analysis directly (no { data, meta } envelope).

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/http/client"
import type { DailyAnalysis } from "./types"

export function useDailyMarketAnalysis(enabled = true) {
  return useQuery<DailyAnalysis>({
    queryKey: ["market-analysis", "daily", "latest"],
    queryFn: () => api.get("market-analysis/daily/latest").json<DailyAnalysis>(),
    staleTime: 30 * 60 * 1000,
    enabled,
  })
}
