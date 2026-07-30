import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap4Api } from "./api"
import { cap4Keys } from "./keys"
import type {
  Cap4Progress,
  KehoachInputCap4,
  OrderKehoachCap4,
  ThachThucCap4,
  VuKhiDiemMuCap4,
} from "./types"

/**
 * Current user's Cấp 4 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (mirrors `cap3/hooks.ts#useCap3Progress`). `data` is
 * `null` when the user hasn't entered Cấp 4 yet.
 *
 * `enabled` (default `true`) lets callers OUTSIDE the Cấp 4 shell pass their
 * own `isCap4Active` so this query never fires outside Cấp 4.
 */
export function useCap4Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap4Progress | null>({
    queryKey: cap4Keys.progress(),
    queryFn: cap4Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 4 query (progress + vũ khí/điểm mù + thách thức). */
function useInvalidateCap4() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap4Keys.all })
}

/** POST /cap4/enter — enter Cấp 4 (idempotent; requires Cấp 3 graduated). */
export function useEnterCap4() {
  const invalidate = useInvalidateCap4()
  return useMutation<Cap4Progress, unknown, void>({
    mutationFn: cap4Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap4/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap4Task() {
  const invalidate = useInvalidateCap4()
  return useMutation<Cap4Progress, unknown, number>({
    mutationFn: (taskNo) => cap4Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/** POST /cap4/kehoach — records the khối "Đọc 5 lớp" for a BUY fill. */
export function useRecordKehoachCap4() {
  const invalidate = useInvalidateCap4()
  return useMutation<OrderKehoachCap4, unknown, KehoachInputCap4>({
    mutationFn: cap4Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** GET /cap4/vu-khi-diem-mu — per-lớp REAL win rate (spec §7 khối ⑨). */
export function useVuKhiDiemMu(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<VuKhiDiemMuCap4>({
    queryKey: cap4Keys.vuKhiDiemMu(),
    queryFn: cap4Api.getVuKhiDiemMu,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
  })
}

/** GET /cap4/thach-thuc — the 3 sub-conditions of nhiệm vụ ③ (§C12c). */
export function useThachThucCap4(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap4>({
    queryKey: cap4Keys.thachThuc(),
    queryFn: cap4Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
  })
}

/** POST /cap4/graduate — graduate to Cấp 5 (only when 3/3 nhiệm vụ done). */
export function useGraduateCap4() {
  const invalidate = useInvalidateCap4()
  return useMutation<Cap4Progress, unknown, void>({
    mutationFn: cap4Api.graduate,
    onSuccess: invalidate,
  })
}
