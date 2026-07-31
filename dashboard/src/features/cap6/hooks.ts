import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap6Api } from "./api"
import { cap6Keys } from "./keys"
import type {
  Cap6Progress,
  GoiYCap6,
  KehoachInputCap6,
  OrderKehoachCap6,
  ThachThucCap6,
} from "./types"

/**
 * Current user's Cấp 6 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (mirrors `cap5/hooks.ts`). `data` is `null` when the
 * user hasn't entered Cấp 6 yet. `enabled` lets callers outside the Cấp 6 shell
 * pass their own `isCap6Active` so this never fires elsewhere.
 */
export function useCap6Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap6Progress | null>({
    queryKey: cap6Keys.progress(),
    queryFn: cap6Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 6 query — used by every mutation. */
function useInvalidateCap6() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap6Keys.all })
}

/** POST /cap6/enter — enter Cấp 6 (idempotent; requires Cấp 5 graduated). */
export function useEnterCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, void>({
    mutationFn: cap6Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap6/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap6Task() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, number>({
    mutationFn: (taskNo) => cap6Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/**
 * GET /cap6/goi-y?symbol= — the kiểu cổ phiếu + its trọng số gợi ý + the "vì
 * sao" (spec §4/§5). `enabled` is how `DoiChieuBlock` avoids requesting a
 * suggestion for a symbol whose lớp do NOT conflict (no bước Đối chiếu → no
 * request). `retry: false` so the 404 "chưa vào Cấp 6" surfaces immediately and
 * the block can degrade instead of hanging.
 */
export function useGoiYCap6(symbol: string | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<GoiYCap6>({
    queryKey: cap6Keys.goiY(symbol ?? "none"),
    queryFn: () => cap6Api.getGoiY(symbol as string),
    enabled: isAuthenticated && enabled && !!symbol,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap6/kehoach — records the bước Đối chiếu for a BUY fill. */
export function useRecordKehoachCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<OrderKehoachCap6, unknown, KehoachInputCap6>({
    mutationFn: cap6Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** GET /cap6/thach-thuc — the 3 sub-conditions of nhiệm vụ ③ (§C12c). */
export function useThachThucCap6(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap6>({
    queryKey: cap6Keys.thachThuc(),
    queryFn: cap6Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap6/graduate — graduate to Cấp 7 (only when 3/3 nhiệm vụ done). */
export function useGraduateCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, void>({
    mutationFn: cap6Api.graduate,
    onSuccess: invalidate,
  })
}
