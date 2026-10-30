/**
 * Khoá cache và các phép cập nhật ảnh chụp ván của Flashback v2.
 *
 * Mọi thay đổi trạng thái ván đi qua server: bấm "Phiên tiếp" mới nhận nến kế tiếp, đặt lệnh mới
 * nhận lệnh đã khớp. Phản hồi của server chứa đủ `me` mới nên màn chơi cập nhật thẳng vào cache,
 * không phải tải lại cả ván sau mỗi thao tác.
 */
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import {
  fetchIndicators,
  type FlashbackFinishResult,
  type FlashbackMatchState,
  type FlashbackMe,
  type FlashbackNextResult,
  type FlashbackSnapshot,
} from "./flashback-api"

const NO_USER = ""

export const flashbackKeys = {
  mine: (userId: string) => ["flashback", "mine", userId] as const,
  rooms: (userId: string, filter: string) => ["flashback", "rooms", userId, filter] as const,
  room: (userId: string, code: string) => ["flashback", "room", userId, code] as const,
  match: (userId: string, matchId: string) => ["flashback", "match", userId, matchId] as const,
  state: (userId: string, matchId: string) => ["flashback", "state", userId, matchId] as const,
  result: (userId: string, matchId: string) => ["flashback", "result", userId, matchId] as const,
  indicators: (userId: string) => ["flashback", "indicators", userId] as const,
}

/** Metadata của đủ 16 chỉ báo: tên, tham số và miền cho phép. */
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

/** Sang phiên tiếp theo: thêm nến mới và thay toàn bộ `me`. */
export function applyNext(snapshot: FlashbackSnapshot, result: FlashbackNextResult): FlashbackSnapshot {
  return {
    ...snapshot,
    played_bars: [...snapshot.played_bars, result.bar],
    my_step: result.me.step,
    my_finished: result.me.finished || snapshot.my_finished,
    me: result.me,
  }
}

/** Đặt lệnh xong: chỉ `me` đổi (tiền mặt, cổ phiếu, lệnh đã khớp). */
export function applyOrder(snapshot: FlashbackSnapshot, me: FlashbackMe): FlashbackSnapshot {
  return { ...snapshot, me }
}

/** Hoàn thành: `me` đã chốt và số người còn đang chơi. */
export function applyFinish(snapshot: FlashbackSnapshot, result: FlashbackFinishResult): FlashbackSnapshot {
  return { ...snapshot, me: result.me, my_finished: true, my_step: result.me.step, playing_count: result.playing_count }
}

/** Cùng phép với `applyFinish` cho trạng thái chung, để thanh người chơi không nháy về số cũ. */
export function applyFinishToState(state: FlashbackMatchState, result: FlashbackFinishResult): FlashbackMatchState {
  return { ...state, my_finished: true, my_step: result.me.step, playing_count: result.playing_count }
}
