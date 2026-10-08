/**
 * Data hooks for the hunt and Bot panels.
 *
 * Rules:
 *  - every query is scoped by the signed-in user, nothing is gated by a level;
 *  - `retry: false` on reads - a failure is reported, not retried into a fake
 *    empty state.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { insightsApi } from "./api"

/* ── Săn mã ────────────────────────────────────────────────────────────── */

export function useSanMaIndex() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "hunt", "index", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.huntIndex(signal),
  })
}

export function useHuntResult(filter: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "hunt", "result", user?.id, filter],
    enabled: !!user && filter != null,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.hunt(filter as string, signal),
  })
}

/* ── Bot ───────────────────────────────────────────────────────────────── */

export function useBotOverview() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "bot", "overview", user?.id],
    enabled: !!user,
    staleTime: 15_000,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => insightsApi.botOverview(signal),
  })
}

export function useBotPositions(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "bot", "positions", user?.id],
    enabled: !!user && enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.botPositions(signal),
  })
}

export function useBotJournal(enabled: boolean) {
  const { user } = useAuth()
  return useInfiniteQuery({
    queryKey: ["insights", "bot", "journal", user?.id],
    enabled: !!user && enabled,
    staleTime: 15_000,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => insightsApi.botJournal(pageParam, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

export function useBotPerformance(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "bot", "performance", user?.id],
    enabled: !!user && enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.botPerformance(signal),
  })
}

export function useRefreshBot() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["insights", "bot"] })
}
