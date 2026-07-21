import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap0Api } from "./api"
import { cap0Keys } from "./keys"
import type { Cap0Gate, Cap0Progress, PlacementResult } from "./types"

/**
 * Current user's Cấp 0 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (the journey bar / checklist reflect live progress).
 * `data` is `null` when the user hasn't entered Cấp 0 yet.
 */
export function useCap0Progress() {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap0Progress | null>({
    queryKey: cap0Keys.progress(),
    queryFn: cap0Api.getProgress,
    enabled: isAuthenticated,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 0 query (progress) — used by every mutation. */
function useInvalidateCap0() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap0Keys.all })
}

/** POST /cap0/enter — enter Cấp 0 + seed the practice account. */
export function useEnterCap0() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, void>({
    mutationFn: cap0Api.enter,
    onSuccess: invalidate,
  })
}

/** POST /cap0/placement — records the "have you traded before?" answer. */
export function usePlacement() {
  const invalidate = useInvalidateCap0()
  return useMutation<PlacementResult, unknown, boolean>({
    mutationFn: (hasTradedBefore) => cap0Api.placement(hasTradedBefore),
    onSuccess: invalidate,
  })
}

/** PATCH /cap0/task — mark a task done (with an optional behaviour gate). */
export function useCompleteTask() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, { taskNo: number; gate?: Cap0Gate }>({
    mutationFn: ({ taskNo, gate }) => cap0Api.completeTask(taskNo, gate),
    onSuccess: invalidate,
  })
}

/** POST /cap0/graduate — graduate to Cấp 1 (switches mode to Thực chiến). */
export function useGraduate() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, void>({
    mutationFn: cap0Api.graduate,
    onSuccess: invalidate,
  })
}
