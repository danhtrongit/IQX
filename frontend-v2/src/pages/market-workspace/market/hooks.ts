/**
 * One hook per session brief. All three are fetched eagerly by the workspace
 * (the "MỚI" pill compares all three), so each keeps the previous brief on
 * screen while a newer one loads and surfaces `isError` instead of inventing
 * data — an unpublished brief answers 404 and callers render the pending state.
 */
import { useQuery } from "@tanstack/react-query"

import { fetchDailyAnalysis, fetchMidDayAnalysis, fetchPreMarketAnalysis } from "./api"
import { useLocalTodayIso } from "./date"
import { marketWorkspaceKeys } from "./keys"
import type { DailyAnalysis, MidDayAnalysis, PreMarketAnalysis } from "./types"

const BRIEF_STALE_MS = 30 * 60 * 1000
const BRIEF_POLL_MS = 30 * 1000

/**
 * `/latest` can legitimately keep returning yesterday's row while today's
 * report is being generated. Keep that row visible, but poll in the visible
 * tab until the response carries today's session date. A successful current
 * report disables the interval so idle workspaces do not keep hitting the API.
 */
function refreshUntilToday<T extends { session_date: string }>(today: string) {
  return {
    refetchInterval: (query: { state: { data: T | undefined } }) => {
      const data = query.state.data
      return !data || data.session_date !== today ? BRIEF_POLL_MS : false
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } as const
}

export function useDailyMarketAnalysis(enabled = true) {
  const today = useLocalTodayIso()
  return useQuery<DailyAnalysis>({
    queryKey: marketWorkspaceKeys.analysis.latest("daily", today),
    queryFn: ({ signal }) => fetchDailyAnalysis(signal),
    staleTime: BRIEF_STALE_MS,
    enabled,
    ...refreshUntilToday<DailyAnalysis>(today),
  })
}

export function useMidDayMarketAnalysis(enabled = true) {
  const today = useLocalTodayIso()
  return useQuery<MidDayAnalysis>({
    queryKey: marketWorkspaceKeys.analysis.latest("midday", today),
    queryFn: ({ signal }) => fetchMidDayAnalysis(signal),
    staleTime: BRIEF_STALE_MS,
    enabled,
    ...refreshUntilToday<MidDayAnalysis>(today),
  })
}

export function usePreMarketAnalysis(enabled = true) {
  const today = useLocalTodayIso()
  return useQuery<PreMarketAnalysis>({
    queryKey: marketWorkspaceKeys.analysis.latest("premarket", today),
    queryFn: ({ signal }) => fetchPreMarketAnalysis(signal),
    staleTime: BRIEF_STALE_MS,
    enabled,
    ...refreshUntilToday<PreMarketAnalysis>(today),
  })
}
