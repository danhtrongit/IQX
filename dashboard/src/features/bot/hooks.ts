import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { botApi } from "./api"
import { botKeys } from "./keys"

export function useBotOverview() {
  return useQuery({
    queryKey: botKeys.overview,
    queryFn: botApi.getOverview,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useBotPositions(enabled = true) {
  return useQuery({
    queryKey: botKeys.positions,
    queryFn: botApi.getPositions,
    enabled,
    staleTime: 15_000,
  })
}

export function useBotJournal(enabled = true) {
  return useInfiniteQuery({
    queryKey: botKeys.journal,
    queryFn: ({ pageParam }) => botApi.getJournal(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 15_000,
  })
}

export function useBotPerformance(enabled = true, from?: string, to?: string) {
  return useQuery({
    queryKey: botKeys.performance(from, to),
    queryFn: () => botApi.getPerformance(from, to),
    enabled,
    staleTime: 15_000,
  })
}

export function useRefreshBot() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: botKeys.all })
}
