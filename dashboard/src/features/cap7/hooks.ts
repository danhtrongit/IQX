import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap7Api } from "./api"
import { cap7Keys } from "./keys"
import type {
  Cap7Progress,
  ChamCap7,
  KehoachInputCap7,
  OrderKehoachCap7,
  PhienCap7,
  ThachThucCap7,
} from "./types"

/**
 * Current user's Cấp 7 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (mirrors `cap6/hooks.ts`). `data` is `null` when the
 * user hasn't entered Cấp 7 yet. `enabled` lets callers outside the Cấp 7 shell
 * pass their own `isCap7Active` so this never fires elsewhere.
 */
export function useCap7Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap7Progress | null>({
    queryKey: cap7Keys.progress(),
    queryFn: cap7Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 7 query — used by every mutation. */
function useInvalidateCap7() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap7Keys.all })
}

/** POST /cap7/enter — enter Cấp 7 (idempotent; requires Cấp 6 graduated). */
export function useEnterCap7() {
  const invalidate = useInvalidateCap7()
  return useMutation<Cap7Progress, unknown, void>({
    mutationFn: cap7Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap7/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap7Task() {
  const invalidate = useInvalidateCap7()
  return useMutation<Cap7Progress, unknown, number>({
    mutationFn: (taskNo) => cap7Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/**
 * GET /cap7/phien — `trong_phien` **from the SERVER clock** + every threshold
 * the reading block renders (`quy_tac`).
 *
 * `refetchInterval` (2 min) exists for one concrete reason: the buy panel can
 * sit open across 11:30 or 14:45, and a stale `trong_phien` would keep offering
 * a guess UI over a book that has stopped moving. `refetchOnWindowFocus` catches
 * the user who comes back to the tab after lunch.
 *
 * `retry: false` so the 404 "chưa vào Cấp 7" surfaces immediately and the block
 * can degrade honestly instead of hanging.
 */
export function usePhienCap7(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<PhienCap7>({
    queryKey: cap7Keys.phien(),
    queryFn: cap7Api.getPhien,
    enabled: isAuthenticated && enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

/** POST /cap7/kehoach — records the bước đọc lực for a BUY fill. */
export function useRecordKehoachCap7() {
  const invalidate = useInvalidateCap7()
  return useMutation<OrderKehoachCap7, unknown, KehoachInputCap7>({
    mutationFn: cap7Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** POST /cap7/cham — chấm các lệnh đã tới hạn (idempotent, an toàn gọi lại). */
export function useChamCap7() {
  const invalidate = useInvalidateCap7()
  return useMutation<ChamCap7, unknown, void>({
    mutationFn: cap7Api.cham,
    onSuccess: invalidate,
  })
}

/** GET /cap7/thach-thuc — the 3 sub-conditions of nhiệm vụ ③ (§C12c). */
export function useThachThucCap7(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap7>({
    queryKey: cap7Keys.thachThuc(),
    queryFn: cap7Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap7/graduate — graduate to Cấp 8 (only when 3/3 nhiệm vụ done). */
export function useGraduateCap7() {
  const invalidate = useInvalidateCap7()
  return useMutation<Cap7Progress, unknown, void>({
    mutationFn: cap7Api.graduate,
    onSuccess: invalidate,
  })
}
