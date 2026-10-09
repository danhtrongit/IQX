/**
 * Data hooks for the hunt panels. (The Bot tool has its own hooks in `../bot`.)
 *
 * Rules:
 *  - every query is scoped by the signed-in user, nothing is gated by a level;
 *  - `retry: false` on reads - a failure is reported, not retried into a fake
 *    empty state.
 */
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { insightsApi } from "./api"

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
