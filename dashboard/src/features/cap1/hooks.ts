import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap1Api } from "./api"
import { cap1Keys } from "./keys"
import type { Cap1Progress, KehoachInput, KetsoInput, OrderKehoach, OrderKetso } from "./types"

/**
 * Current user's Cấp 1 progress. `staleTime: 0` so it always refetches after
 * a mutation invalidates it (mirrors `cap0/hooks.ts#useCap0Progress`). `data`
 * is `null` when the user hasn't entered Cấp 1 yet.
 *
 * `enabled` (default `true`) lets callers OUTSIDE the Cấp 1 shell (e.g.
 * `TradingPanel`, shared with /bieu-do & /co-phieu) pass their own
 * `isCap1Active` so this query never fires outside Cấp 1.
 */
export function useCap1Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap1Progress | null>({
    queryKey: cap1Keys.progress(),
    queryFn: cap1Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 1 query (progress) — used by every mutation. */
function useInvalidateCap1() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap1Keys.all })
}

/** POST /cap1/enter — enter Cấp 1 (idempotent; requires Cấp 0 graduated). */
export function useEnterCap1() {
  const invalidate = useInvalidateCap1()
  return useMutation<Cap1Progress, unknown, void>({
    mutationFn: cap1Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap1/task — nhiệm vụ ⑤'s view-log (idempotent recompute). */
export function useCompleteCap1Task() {
  const invalidate = useInvalidateCap1()
  return useMutation<Cap1Progress, unknown, number>({
    mutationFn: (taskNo) => cap1Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/** POST /cap1/kehoach — records the Form Kế hoạch for a BUY fill. */
export function useRecordKehoach() {
  const invalidate = useInvalidateCap1()
  return useMutation<OrderKehoach, unknown, KehoachInput>({
    mutationFn: cap1Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** POST /cap1/ketso — Kết sổ for a SELL fill. */
export function useRecordKetso() {
  const invalidate = useInvalidateCap1()
  return useMutation<OrderKetso, unknown, KetsoInput>({
    mutationFn: cap1Api.recordKetso,
    onSuccess: invalidate,
  })
}

/** POST /cap1/graduate — graduate to Cấp 2 (only when 6/6 nhiệm vụ done). */
export function useGraduateCap1() {
  const invalidate = useInvalidateCap1()
  return useMutation<Cap1Progress, unknown, void>({
    mutationFn: cap1Api.graduate,
    onSuccess: invalidate,
  })
}
