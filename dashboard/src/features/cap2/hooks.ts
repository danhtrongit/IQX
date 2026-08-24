import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap2Api } from "./api"
import { cap2Keys } from "./keys"
import type {
  Cap2Progress,
  DiemKyLuat,
  KehoachInputCap2,
  KetsoInputCap2,
  OrderKehoachCap2,
  OrderKetsoCap2,
} from "./types"

/**
 * Current user's Cấp 2 progress. `staleTime: 0` so it always refetches after
 * a mutation invalidates it (mirrors `cap1/hooks.ts#useCap1Progress`). `data`
 * is `null` when the user hasn't entered Cấp 2 yet.
 *
 * `enabled` (default `true`) lets callers OUTSIDE the Cấp 2 shell (e.g.
 * `TradingPanel`, shared with /bieu-do & /co-phieu) pass their own
 * `isCap2Active` so this query never fires outside Cấp 2.
 */
export function useCap2Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap2Progress | null>({
    queryKey: cap2Keys.progress(),
    queryFn: cap2Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 2 query (progress + điểm kỷ luật) — used by every mutation. */
function useInvalidateCap2() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap2Keys.all })
}

/** POST /cap2/enter — enter Cấp 2 (idempotent; requires Cấp 1 graduated). */
export function useEnterCap2() {
  const invalidate = useInvalidateCap2()
  return useMutation<Cap2Progress, unknown, void>({
    mutationFn: cap2Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap2/task — idempotent recompute of nhiệm vụ ① (Cấp 2's only one). */
export function useCompleteCap2Task() {
  const invalidate = useInvalidateCap2()
  return useMutation<Cap2Progress, unknown, number>({
    mutationFn: (taskNo) => cap2Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/** POST /cap2/kehoach — records the SL/TP commitment for a BUY fill. */
export function useRecordKehoachCap2() {
  const invalidate = useInvalidateCap2()
  return useMutation<OrderKehoachCap2, unknown, KehoachInputCap2>({
    mutationFn: cap2Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** POST /cap2/ketso — records the discipline flags for a SELL fill. */
export function useRecordKetsoCap2() {
  const invalidate = useInvalidateCap2()
  return useMutation<OrderKetsoCap2, unknown, KetsoInputCap2>({
    mutationFn: cap2Api.recordKetso,
    onSuccess: invalidate,
  })
}

/** GET /cap2/diem-ky-luat — điểm kỷ luật 0-100 + breakdown for a given day
 * (defaults to today). `enabled` mirrors `useCap2Progress`'s. */
export function useDiemKyLuat(ngay?: string, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<DiemKyLuat>({
    queryKey: cap2Keys.diemKyLuat(ngay),
    queryFn: () => cap2Api.getDiemKyLuat(ngay),
    enabled: isAuthenticated && enabled,
    staleTime: 0,
  })
}

/** POST /cap2/graduate — graduate to Cấp 3 (only when 1/1 nhiệm vụ is done). */
export function useGraduateCap2() {
  const invalidate = useInvalidateCap2()
  return useMutation<Cap2Progress, unknown, void>({
    mutationFn: cap2Api.graduate,
    onSuccess: invalidate,
  })
}
