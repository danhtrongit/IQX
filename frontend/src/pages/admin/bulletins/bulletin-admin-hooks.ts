/**
 * Hook React Query của màn quản trị bản tin. Key nằm dưới `["admin", "market-bulletins", …]`.
 * Lưu, Public và Gỡ đều trả lại chi tiết mới nên ghi thẳng vào cache; Public và Gỡ còn làm mới
 * danh sách và dữ liệu công khai (tab Bản tin, Theo dõi, Bản tin cũ).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { bulletinKeys } from "@/pages/market-workspace/market/bulletin-hooks"

import {
  fetchAdminBulletin,
  fetchAdminBulletins,
  previewAdminBulletin,
  publishAdminBulletin,
  saveAdminBulletinContent,
  unpublishAdminBulletin,
  type AdminBulletinContent,
  type AdminBulletinDetail,
  type PreviewVariant,
} from "./bulletin-admin-api"
import { contentKey } from "./bulletin-admin-format"

export const adminBulletinKeys = {
  all: ["admin", "market-bulletins"] as const,
  list: ["admin", "market-bulletins", "list"] as const,
  detail: (date: string) => ["admin", "market-bulletins", "detail", date] as const,
  preview: (date: string, variant: PreviewVariant, key: string) =>
    ["admin", "market-bulletins", "preview", date, variant, key] as const,
}

export function useAdminBulletins() {
  return useQuery({
    queryKey: adminBulletinKeys.list,
    queryFn: ({ signal }) => fetchAdminBulletins(signal),
    staleTime: 15_000,
  })
}

export function useAdminBulletin(date: string | null) {
  return useQuery({
    queryKey: adminBulletinKeys.detail(date ?? ""),
    queryFn: ({ signal }) => fetchAdminBulletin(date as string, signal),
    enabled: date !== null,
    staleTime: 0,
  })
}

/** Ghi chi tiết mới vào cache và làm mới danh sách (trạng thái, số lỗi, giờ cập nhật). */
function useCommitDetail(date: string) {
  const queryClient = useQueryClient()
  return (detail: AdminBulletinDetail) => {
    queryClient.setQueryData(adminBulletinKeys.detail(date), detail)
    void queryClient.invalidateQueries({ queryKey: adminBulletinKeys.list })
  }
}

export function useSaveBulletinContent(date: string) {
  const commit = useCommitDetail(date)
  return useMutation({
    mutationFn: (content: AdminBulletinContent) => saveAdminBulletinContent(date, content),
    onSuccess: commit,
  })
}

export function usePublishBulletin(date: string) {
  const queryClient = useQueryClient()
  const commit = useCommitDetail(date)
  return useMutation({
    mutationFn: () => publishAdminBulletin(date),
    onSuccess: (detail) => {
      commit(detail)
      void queryClient.invalidateQueries({ queryKey: bulletinKeys.all })
    },
  })
}

export function useUnpublishBulletin(date: string) {
  const queryClient = useQueryClient()
  const commit = useCommitDetail(date)
  return useMutation({
    mutationFn: () => unpublishAdminBulletin(date),
    onSuccess: (detail) => {
      commit(detail)
      void queryClient.invalidateQueries({ queryKey: bulletinKeys.all })
    },
  })
}

/**
 * Trang xem trước theo nội dung đang gõ (đã debounce ở nơi gọi). Giữ ảnh cũ trong lúc dựng ảnh
 * mới để khung không nhấp nháy.
 */
export function useBulletinPreview(date: string, variant: PreviewVariant, content: AdminBulletinContent | null) {
  return useQuery({
    queryKey: adminBulletinKeys.preview(date, variant, content ? contentKey(content) : "none"),
    queryFn: ({ signal }) => previewAdminBulletin(date, variant, content as AdminBulletinContent, signal),
    enabled: content !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
  })
}
