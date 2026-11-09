/**
 * Hook React Query của trang "Phân tích thị trường". Dữ liệu đổi nhiều nhất vào lúc quản trị
 * Public bản tin (sau phiên), nên thời gian tươi ngắn và làm mới khi quay lại tab.
 */
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api"

import {
  fetchBulletinArchive,
  fetchBulletinByDate,
  fetchLatestBulletin,
  fetchTracking,
  type TrackingSlot,
} from "./bulletin-api"

export const bulletinKeys = {
  all: ["market", "bulletin"] as const,
  latest: ["market", "bulletin", "latest"] as const,
  byDate: (date: string) => ["market", "bulletin", "date", date] as const,
  archive: ["market", "bulletin", "archive"] as const,
  tracking: (slot: TrackingSlot | null) => ["market", "bulletin", "tracking", slot ?? "all"] as const,
}

const STALE_MS = 60_000

/** Ngày chưa Public (404) là trạng thái chờ, không thử lại. */
function retryUnlessNotFound(count: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status === 404) return false
  return count < 2
}

/** Bản tin của một ngày, hoặc bản mới nhất khi `date` là null. */
export function useBulletin(date: string | null) {
  return useQuery({
    queryKey: date ? bulletinKeys.byDate(date) : bulletinKeys.latest,
    queryFn: async ({ signal }) => (date ? fetchBulletinByDate(date, signal) : fetchLatestBulletin(signal)),
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    retry: retryUnlessNotFound,
  })
}

/** "Bản tin cũ": trang đầu 15 dòng, mỗi lần Xem thêm 20 dòng. */
export function useBulletinArchive() {
  return useInfiniteQuery({
    queryKey: bulletinKeys.archive,
    queryFn: ({ pageParam, signal }) => fetchBulletinArchive(pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    staleTime: STALE_MS,
  })
}

export function useTracking(slot: TrackingSlot | null) {
  return useQuery({
    queryKey: bulletinKeys.tracking(slot),
    queryFn: ({ signal }) => fetchTracking(slot, signal),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  })
}
