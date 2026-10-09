import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { botKeys, fetchJournalSessions, fetchOverview, fetchPositions, fetchSessionDecisions, fetchTrades } from "./api"

/** Reads only: a failure is reported, never retried into a fake empty state. */
export function useBotOverview() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: botKeys.overview(user?.id),
    queryFn: ({ signal }) => fetchOverview(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 15_000,
  })
}

export function useBotPositions(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: botKeys.positions(user?.id),
    queryFn: ({ signal }) => fetchPositions(signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 15_000,
  })
}

/** Closed trades with the server's realized P&L, newest first, one cursor page at a time. */
export function useBotTrades(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useInfiniteQuery({
    queryKey: botKeys.trades(user?.id),
    queryFn: ({ pageParam, signal }) => fetchTrades(pageParam, signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 15_000,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

/** One row per trading session (run status, source, config revision, reason counts), newest first. */
export function useBotJournalSessions(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useInfiniteQuery({
    queryKey: botKeys.sessions(user?.id),
    queryFn: ({ pageParam, signal }) => fetchJournalSessions(pageParam, signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 15_000,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

/** The decisions of one session; loaded only while its row is expanded. */
export function useSessionDecisions(session: string, enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useInfiniteQuery({
    queryKey: botKeys.sessionDecisions(user?.id, session),
    queryFn: ({ pageParam, signal }) => fetchSessionDecisions(session, pageParam, signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 60_000,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}
