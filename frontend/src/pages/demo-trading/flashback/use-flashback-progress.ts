/**
 * Cấp, bảng xếp hạng và lịch sử đấu của Flashback (spec v2.1 §2 đến §5).
 *
 * Ba nhóm dữ liệu này chỉ đổi khi một ván kết thúc, nên chúng được tải lại mỗi lần mở sảnh (dữ liệu
 * luôn coi là cũ) và bị đánh dấu cũ ngay khi ván kết thúc (`invalidateFlashbackProgress`), để thẻ
 * cấp, hạng, vương miện và ván vừa chơi hiện ra ngay khi người chơi về sảnh.
 */
import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import {
  fetchHistory,
  fetchHistorySummary,
  fetchLeaderboard,
  fetchMyLevel,
  type FlashbackHistoryDays,
  type FlashbackHistoryFilters,
} from "./flashback-api"
import { LEADERBOARD_LIMIT } from "./flashback-model"

const NO_USER = ""

const ROOT = ["flashback", "progress"] as const

export const flashbackProgressKeys = {
  root: ROOT,
  level: (userId: string) => [...ROOT, "level", userId] as const,
  leaderboard: (userId: string) => [...ROOT, "leaderboard", userId] as const,
  history: (userId: string, filters: FlashbackHistoryFilters) =>
    [...ROOT, "history", userId, filters.result, filters.days, filters.page] as const,
  summary: (userId: string, days: FlashbackHistoryDays) => [...ROOT, "summary", userId, days] as const,
}

/** Đánh dấu cấp, bảng xếp hạng và lịch sử là cũ: lần mở sảnh kế tiếp (hoặc ngay nếu đang mở) tải lại. */
export function invalidateFlashbackProgress(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: flashbackProgressKeys.root })
}

/** Điểm, cấp và hạng của mình (thẻ cấp ở đầu sảnh). */
export function useMyLevel() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackProgressKeys.level(userId),
    enabled: !!userId,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => fetchMyLevel(signal),
  })
}

/** Top 50 toàn hệ thống kèm dòng của mình nếu nằm ngoài top. */
export function useLeaderboard() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackProgressKeys.leaderboard(userId),
    enabled: !!userId,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => fetchLeaderboard(LEADERBOARD_LIMIT, signal),
  })
}

/** Một trang lịch sử đấu của mình theo bộ lọc; đổi bộ lọc thì giữ trang cũ cho tới khi trang mới về. */
export function useFlashbackHistory(filters: FlashbackHistoryFilters) {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackProgressKeys.history(userId, filters),
    enabled: !!userId,
    staleTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchHistory(filters, signal),
  })
}

/** Sáu số tổng kết của lịch sử trong khoảng thời gian đang lọc. */
export function useFlashbackHistorySummary(days: FlashbackHistoryDays) {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: flashbackProgressKeys.summary(userId, days),
    enabled: !!userId,
    staleTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchHistorySummary(days, signal),
  })
}
