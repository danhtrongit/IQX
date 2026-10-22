/**
 * React Query của Flashback (spec v1.1 §2.4 - §2.9).
 *
 * Mọi thay đổi trạng thái lượt chơi đi qua server: bấm "Phiên tiếp" mới nhận nến kế tiếp, đặt
 * lệnh mới nhận lệnh đã khớp. Hook chỉ invalidate lại các query đã lệch.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"
import {
  fetchCurrent,
  fetchIndicators,
  fetchLeaderboard,
  fetchNextBar,
  finishRound,
  joinRound,
  placeOrder,
  saveIndicators,
  type FlashbackLeaderboardScope,
  type FlashbackOrderSide,
} from "./flashback-api"

const NO_USER = ""

export const flashbackKeys = {
  current: (userId: string) => ["flashback", "current", userId] as const,
  leaderboard: (userId: string, scope: FlashbackLeaderboardScope) => ["flashback", "leaderboard", userId, scope] as const,
  indicators: (userId: string) => ["flashback", "indicators", userId] as const,
}

/** Đề đang mở và lượt chơi của người dùng. */
export function useFlashbackCurrent() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackKeys.current(userId),
    enabled: !!userId,
    staleTime: 10_000,
    retry: false,
    queryFn: ({ signal }) => fetchCurrent(signal),
  })
}

/** Bảng xếp hạng của đề hiện tại: "Toàn IQX" hoặc "Nhóm của tôi". */
export function useFlashbackLeaderboard(scope: FlashbackLeaderboardScope, enabled: boolean) {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackKeys.leaderboard(userId, scope),
    enabled: enabled && !!userId,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => fetchLeaderboard(scope, signal),
  })
}

/** Các chỉ báo người dùng đã mở ở Học viện, kèm metadata tham số. */
export function useFlashbackIndicators(enabled: boolean) {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackKeys.indicators(userId),
    enabled: enabled && !!userId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: ({ signal }) => fetchIndicators(signal),
  })
}

/** Tham gia đề: lần đầu miễn phí, từ lần hai trừ 100 xu. */
export function useJoinRound() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useMutation({
    mutationFn: () => joinRound(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.current(userId) })
      void queryClient.invalidateQueries({ queryKey: ["shop"] })
      toast.success(result.first_join ? "Đã tham gia miễn phí" : `Đã tham gia · −${result.fee_xu} xu`)
    },
  })
}

/** Mở nến của phiên tiếp theo. */
export function useNextSession() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useMutation({
    mutationFn: (entryId: string) => fetchNextBar(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.current(userId) })
    },
  })
}

/** Đặt lệnh mua hoặc bán. */
export function usePlaceOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useMutation({
    mutationFn: (input: { entryId: string; side: FlashbackOrderSide; qty: number }) =>
      placeOrder(input.entryId, { side: input.side, qty: input.qty }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.current(userId) })
    },
  })
}

/** Chốt lượt chơi và nhận kết quả cùng hạng tạm thời. */
export function useFinishRound() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useMutation({
    mutationFn: (entryId: string) => finishRound(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.current(userId) })
      void queryClient.invalidateQueries({ queryKey: ["flashback", "leaderboard", userId] })
    },
  })
}

/** Lưu bộ chỉ báo của lượt chơi. */
export function useSaveIndicators() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useMutation({
    mutationFn: (input: { entryId: string; indicators: Parameters<typeof saveIndicators>[1] }) =>
      saveIndicators(input.entryId, input.indicators),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.current(userId) })
    },
  })
}
