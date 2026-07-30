import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap3Api } from "./api"
import { cap3Keys } from "./keys"
import type {
  Cap3Progress,
  KehoachInputCap3,
  KhauViLoai,
  OrderKehoachCap3,
  ThachThucCap3,
} from "./types"

/**
 * Current user's Cấp 3 progress. `staleTime: 0` so it always refetches after
 * a mutation invalidates it (mirrors `cap2/hooks.ts#useCap2Progress`). `data`
 * is `null` when the user hasn't entered Cấp 3 yet.
 *
 * `enabled` (default `true`) lets callers OUTSIDE the Cấp 3 shell (e.g.
 * `TradingPanel`, shared with /bieu-do & /co-phieu) pass their own
 * `isCap3Active` so this query never fires outside Cấp 3.
 */
export function useCap3Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap3Progress | null>({
    queryKey: cap3Keys.progress(),
    queryFn: cap3Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 3 query (progress + thách thức) — used by every mutation. */
function useInvalidateCap3() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap3Keys.all })
}

/** POST /cap3/enter — enter Cấp 3 (idempotent; requires Cấp 2 graduated). */
export function useEnterCap3() {
  const invalidate = useInvalidateCap3()
  return useMutation<Cap3Progress, unknown, void>({
    mutationFn: cap3Api.enter,
    onSuccess: invalidate,
  })
}

/** POST /cap3/khau-vi — đặt/đổi khẩu vị rủi ro (hồ sơ). */
export function useSetKhauVi() {
  const invalidate = useInvalidateCap3()
  return useMutation<Cap3Progress, unknown, KhauViLoai>({
    mutationFn: cap3Api.setKhauVi,
    onSuccess: invalidate,
  })
}

/** PATCH /cap3/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap3Task() {
  const invalidate = useInvalidateCap3()
  return useMutation<Cap3Progress, unknown, number>({
    mutationFn: (taskNo) => cap3Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/** POST /cap3/kehoach — records the quản lý vốn commitment for a BUY fill. */
export function useRecordKehoachCap3() {
  const invalidate = useInvalidateCap3()
  return useMutation<OrderKehoachCap3, unknown, KehoachInputCap3>({
    mutationFn: cap3Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** GET /cap3/thach-thuc — the 3 sub-conditions of nhiệm vụ ③ (§C12c). */
export function useThachThuc(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap3>({
    queryKey: cap3Keys.thachThuc(),
    queryFn: cap3Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
  })
}

/** POST /cap3/graduate — graduate to Cấp 4 (only when 3/3 nhiệm vụ done). */
export function useGraduateCap3() {
  const invalidate = useInvalidateCap3()
  return useMutation<Cap3Progress, unknown, void>({
    mutationFn: cap3Api.graduate,
    onSuccess: invalidate,
  })
}
