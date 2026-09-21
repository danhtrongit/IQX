import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap2Api } from "./api"
import { cap2Keys } from "./keys"
import type {
  Cap2ActiveAlerts,
  Cap2Analysis,
  Cap2AlertActionInput,
  Cap2AlertActionResult,
  Cap2PreBuyAlertInput,
  Cap2PreBuyAlertResult,
  Cap2Progress,
  Cap2TradeHistoryList,
  DiemKyLuat,
  DiemKyLuatHistory,
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

export function useCap2Trades(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap2TradeHistoryList>({
    queryKey: cap2Keys.trades(),
    queryFn: cap2Api.getTrades,
    enabled: isAuthenticated && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export function useCap2Analysis(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap2Analysis>({
    queryKey: cap2Keys.analysis(),
    queryFn: cap2Api.getAnalysis,
    enabled: isAuthenticated && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

/** Server-authoritative alert inbox. Reading it atomically claims at most two
 * important impressions for the session, with nhồi lệnh priority. */
export function useCap2ActiveAlerts(sessionDate?: string, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap2ActiveAlerts>({
    queryKey: cap2Keys.activeAlerts(sessionDate),
    queryFn: () => cap2Api.getActiveAlerts(sessionDate),
    enabled: isAuthenticated && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

/** Pre-submit seam for the shared order entry. It must run before POSTing a
 * BUY; checking after a fill cannot offer a real cancel/proceed decision. */
export function useCheckCap2PreBuyAlert() {
  const invalidate = useInvalidateCap2()
  return useMutation<Cap2PreBuyAlertResult, unknown, Cap2PreBuyAlertInput>({
    mutationFn: cap2Api.checkPreBuyAlert,
    onSuccess: invalidate,
  })
}

export function useActOnCap2Alert() {
  const invalidate = useInvalidateCap2()
  return useMutation<Cap2AlertActionResult, unknown, Cap2AlertActionInput>({
    mutationFn: cap2Api.actOnAlert,
    onSuccess: invalidate,
  })
}

export function useDiemKyLuatHistory(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<DiemKyLuatHistory>({
    queryKey: cap2Keys.diemKyLuatHistory(),
    queryFn: cap2Api.getDiemKyLuatHistory,
    enabled: isAuthenticated && enabled,
    staleTime: 30_000,
    retry: false,
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
