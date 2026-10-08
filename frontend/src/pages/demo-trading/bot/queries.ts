import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { botKeys, fetchJournal, fetchOverview, fetchPositions } from "./api"

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

/** Every decision of the Bot, newest first, one cursor page at a time. */
export function useBotJournal(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useInfiniteQuery({
    queryKey: botKeys.journal(user?.id),
    queryFn: ({ pageParam, signal }) => fetchJournal(pageParam, signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 15_000,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}
