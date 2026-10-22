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
  fetchFlashbackRounds,
  fetchFlashbackSuspects,
  revealFlashbackRound,
  setFlashbackPaused,
} from "./flashback-api"

export const flashbackKeys = {
  rounds: ["admin", "flashback", "rounds"] as const,
  alerts: ["admin", "flashback", "alerts"] as const,
  suspects: ["admin", "flashback", "suspects"] as const,
  pause: ["admin", "flashback", "pause"] as const,
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

/** Flashback đang tạm dừng hay không, theo máy chủ. */
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
