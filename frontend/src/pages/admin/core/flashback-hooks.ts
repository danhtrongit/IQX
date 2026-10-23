/**
 * Hook React Query cho màn quản trị Flashback (spec v1.2 §7).
 *
 * Ba danh sách đọc độc lập nên tách cache: bảng đề làm mới nhanh, cảnh báo và
 * tài khoản nghi vấn thay đổi theo nhịp tác vụ của máy chủ. Trạng thái tạm dừng
 * đọc riêng vì nút bật/tắt phải phản ánh đúng máy chủ, không suy đoán từ phiên.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchFlashbackAlerts,
  fetchFlashbackPauseStatus,
  fetchFlashbackRewardHolds,
  fetchFlashbackRounds,
  fetchFlashbackSettings,
  fetchFlashbackSuspects,
  releaseFlashbackRewardHold,
  revealFlashbackRound,
  setFlashbackPaused,
  voidFlashbackRewardHold,
} from "./flashback-api"

export const flashbackKeys = {
  rounds: ["admin", "flashback", "rounds"] as const,
  alerts: ["admin", "flashback", "alerts"] as const,
  suspects: ["admin", "flashback", "suspects"] as const,
  pause: ["admin", "flashback", "pause"] as const,
  rewardHolds: ["admin", "flashback", "reward-holds"] as const,
  settings: ["admin", "flashback", "settings"] as const,
}

export function useFlashbackRounds() {
  return useQuery({
    queryKey: flashbackKeys.rounds,
    queryFn: ({ signal }) => fetchFlashbackRounds(signal),
    staleTime: 30_000,
  })
}

export function useFlashbackAlerts() {
  return useQuery({
    queryKey: flashbackKeys.alerts,
    queryFn: ({ signal }) => fetchFlashbackAlerts(signal),
    staleTime: 60_000,
  })
}

export function useFlashbackSuspects() {
  return useQuery({
    queryKey: flashbackKeys.suspects,
    queryFn: ({ signal }) => fetchFlashbackSuspects(signal),
    staleTime: 60_000,
  })
}

/** Thưởng đang tạm giữ chờ duyệt. */
export function useFlashbackRewardHolds() {
  return useQuery({
    queryKey: flashbackKeys.rewardHolds,
    queryFn: ({ signal }) => fetchFlashbackRewardHolds("held", signal),
    staleTime: 30_000,
  })
}

/** Tham số vận hành chỉ đọc. */
export function useFlashbackSettings() {
  return useQuery({
    queryKey: flashbackKeys.settings,
    queryFn: ({ signal }) => fetchFlashbackSettings(signal),
    staleTime: 5 * 60_000,
  })
}

/** Trả hoặc huỷ một khoản thưởng đang giữ; làm mới danh sách giữ và bảng đề. */
export function useDecideRewardHold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "release" | "void" }) =>
      action === "release" ? releaseFlashbackRewardHold(id) : voidFlashbackRewardHold(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.rewardHolds })
      void queryClient.invalidateQueries({ queryKey: flashbackKeys.rounds })
    },
  })
}

/** Flashback đang tạm dừng hay không, theo máy chủ, kèm quyền quản trị cao nhất. */
export function useFlashbackPauseStatus() {
  return useQuery({
    queryKey: flashbackKeys.pause,
    queryFn: ({ signal }) => fetchFlashbackPauseStatus(signal),
    staleTime: 30_000,
  })
}

/** Tạm dừng hoặc chạy lại Flashback; đề đã mở vẫn chạy tới giờ đóng. */
export function usePauseFlashback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paused: boolean) => setFlashbackPaused(paused),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "flashback"] })
    },
  })
}

/** Xem mã của một đề đã đóng; máy chủ ghi nhật ký mỗi lần xem. */
export function useRevealFlashbackRound() {
  return useMutation({ mutationFn: (id: string) => revealFlashbackRound(id) })
}
