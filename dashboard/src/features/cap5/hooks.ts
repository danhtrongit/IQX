import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap5Api } from "./api"
import { cap5Keys } from "./keys"
import type { Cap5Progress } from "./types"

/**
 * Current user's Cấp 5 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (mirrors `cap4/hooks.ts`). `data` is `null` when the
 * user hasn't entered Cấp 5 yet. `enabled` lets callers outside the Cấp 5 shell
 * pass their own `isCap5Active` so this never fires elsewhere.
 */
export function useCap5Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap5Progress | null>({
    queryKey: cap5Keys.progress(),
    queryFn: cap5Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 5 query — used by every mutation. */
function useInvalidateCap5() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap5Keys.all })
}

/** POST /cap5/enter — enter Cấp 5 (idempotent; requires Cấp 4 graduated). */
export function useEnterCap5() {
  const invalidate = useInvalidateCap5()
  return useMutation<Cap5Progress, unknown, void>({
    mutationFn: cap5Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap5/task — idempotent recompute của 2 nhiệm vụ. */
export function useCompleteCap5Task() {
  const invalidate = useInvalidateCap5()
  return useMutation<Cap5Progress, unknown, number>({
    mutationFn: (taskNo) => cap5Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/** POST /cap5/graduate — graduate to Cấp 6 (only when 2/2 nhiệm vụ done). */
export function useGraduateCap5() {
  const invalidate = useInvalidateCap5()
  return useMutation<Cap5Progress, unknown, void>({
    mutationFn: cap5Api.graduate,
    onSuccess: invalidate,
  })
}
