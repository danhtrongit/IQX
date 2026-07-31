import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap5Api } from "./api"
import { cap5Keys } from "./keys"
import type {
  Cap5Progress,
  ChamDungNgoaiResult,
  DungNgoaiInput,
  DungNgoaiList,
  KetsoInputCap5,
  OrderKetsoCap5,
  ThachThucCap5,
  VerdictGoiY,
} from "./types"

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

/** PATCH /cap5/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap5Task() {
  const invalidate = useInvalidateCap5()
  return useMutation<Cap5Progress, unknown, number>({
    mutationFn: (taskNo) => cap5Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/**
 * GET /cap5/verdict/{orderId} — the SUGGESTED verdict + its provenance signals
 * (spec §4). Only fires with a real order id; the Kết sổ step renders
 * `signals` verbatim (§C12c).
 */
export function useVerdictGoiY(orderId: string | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<VerdictGoiY>({
    queryKey: cap5Keys.verdict(orderId ?? "none"),
    queryFn: () => cap5Api.getVerdict(orderId as string),
    enabled: isAuthenticated && enabled && !!orderId,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap5/ketso — persist the settled verdict (server derives `o_4`). */
export function useRecordKetsoCap5() {
  const invalidate = useInvalidateCap5()
  return useMutation<OrderKetsoCap5, unknown, KetsoInputCap5>({
    mutationFn: cap5Api.recordKetso,
    onSuccess: invalidate,
  })
}

/** POST /cap5/dung-ngoai — log a "tôi đứng ngoài mã này" decision. */
export function useDungNgoai() {
  const invalidate = useInvalidateCap5()
  return useMutation<DungNgoaiList, unknown, DungNgoaiInput>({
    mutationFn: cap5Api.logDungNgoai,
    onSuccess: invalidate,
  })
}

/** GET /cap5/dung-ngoai — nhật ký đứng ngoài (khối ⑬); scores due items on read. */
export function useDanhSachDungNgoai(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<DungNgoaiList>({
    queryKey: cap5Keys.dungNgoai(),
    queryFn: cap5Api.getDungNgoai,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap5/dung-ngoai/cham — trigger the scoring routine explicitly. */
export function useChamDungNgoai() {
  const invalidate = useInvalidateCap5()
  return useMutation<ChamDungNgoaiResult, unknown, void>({
    mutationFn: cap5Api.chamDungNgoai,
    onSuccess: invalidate,
  })
}

/** GET /cap5/thach-thuc — the 3 sub-conditions of nhiệm vụ ③. */
export function useThachThucCap5(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap5>({
    queryKey: cap5Keys.thachThuc(),
    queryFn: cap5Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap5/graduate — graduate to Cấp 6 (only when 3/3 nhiệm vụ done). */
export function useGraduateCap5() {
  const invalidate = useInvalidateCap5()
  return useMutation<Cap5Progress, unknown, void>({
    mutationFn: cap5Api.graduate,
    onSuccess: invalidate,
  })
}
