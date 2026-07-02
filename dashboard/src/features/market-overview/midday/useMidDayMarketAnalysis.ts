// ─── Hook: mid-day VN-Index market analysis ───────────────
// Uses the shared `api` ky client (same pattern as daily/useDailyMarketAnalysis.ts).
// The endpoint returns the analysis directly (no { data, meta } envelope).

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/http/client"
import type { MidDayAnalysis } from "./types"

export function useMidDayMarketAnalysis(enabled = true) {
  return useQuery<MidDayAnalysis>({
    queryKey: ["market-analysis", "midday", "latest"],
    queryFn: () => api.get("market-analysis/midday/latest").json<MidDayAnalysis>(),
    staleTime: 30 * 60 * 1000,
    enabled,
  })
}
