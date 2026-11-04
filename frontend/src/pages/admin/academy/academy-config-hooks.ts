/**
 * Hook React Query của màn cấu hình Học viện. Key nằm dưới `["admin", "academy-configs", …]`.
 * Tạo, lưu và xoá làm mới danh sách và nhật ký (số người dùng áp dụng và nhật ký đều đổi);
 * không có cập nhật lạc quan vì cấu hình đổi quyền học ngay của người dùng. Xem trước không
 * nằm trong số bị làm mới: kết quả chỉ phụ thuộc cách học và danh sách chương đã chọn.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  createAcademyConfig,
  deleteAcademyConfig,
  fetchAcademyConfigLogs,
  fetchAcademyConfigs,
  previewAcademyConfig,
  saveAcademyConfig,
  type AcademyConfigDraft,
  type AcademyConfigItem,
} from "./academy-config-api"
import { academyConfigErrorMessage, isStaleAcademyConfigError } from "./academy-config-format"

export const academyConfigKeys = {
  all: ["admin", "academy-configs"] as const,
  list: ["admin", "academy-configs", "list"] as const,
  preview: (mode: AcademyConfigDraft["mode"], chapterIds: readonly string[]) =>
    ["admin", "academy-configs", "preview", mode, [...chapterIds]] as const,
  logsAll: ["admin", "academy-configs", "logs"] as const,
  logs: (id: string) => ["admin", "academy-configs", "logs", id] as const,
}

export function useAcademyConfigs() {
  return useQuery({
    queryKey: academyConfigKeys.list,
    queryFn: ({ signal }) => fetchAcademyConfigs(signal),
    staleTime: 30_000,
  })
}

/**
 * Xem trước chương trình của nhóm theo bản nháp. Giữ kết quả cũ trong lúc tải kết quả mới để
 * danh sách không nhấp nháy; không gọi khi chưa chọn chương nào.
 */
export function useAcademyConfigPreview(draft: AcademyConfigDraft) {
  const enabled = draft.chapter_ids.length > 0
  return useQuery({
    queryKey: academyConfigKeys.preview(draft.mode, draft.chapter_ids),
    queryFn: ({ signal }) => previewAcademyConfig(draft, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useAcademyConfigLogs(id: string) {
  return useQuery({
    queryKey: academyConfigKeys.logs(id),
    queryFn: ({ signal }) => fetchAcademyConfigLogs(id, signal),
    staleTime: 15_000,
  })
}

/** Làm mới danh sách và mọi nhật ký sau một thay đổi. */
function useRefreshAcademyConfigs() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: academyConfigKeys.list }),
      queryClient.invalidateQueries({ queryKey: academyConfigKeys.logsAll }),
    ])
}

/** Lỗi cũ danh sách (đã có, không còn, không tìm thấy) thì làm mới để màn hình khớp máy chủ. */
function useFailureHandler() {
  const queryClient = useQueryClient()
  return (error: unknown) => {
    toast.error(academyConfigErrorMessage(error))
    if (isStaleAcademyConfigError(error)) {
      void queryClient.invalidateQueries({ queryKey: academyConfigKeys.list })
    }
  }
}

export function useCreateAcademyConfig() {
  const refresh = useRefreshAcademyConfigs()
  const onFailure = useFailureHandler()
  return useMutation({
    mutationFn: (input: AcademyConfigDraft & { leader_id: string }) => createAcademyConfig(input),
    onSuccess: async (item: AcademyConfigItem) => {
      await refresh()
      toast.success(`Đã tạo cấu hình riêng cho ${item.name}`)
    },
    onError: onFailure,
  })
}

export function useSaveAcademyConfig() {
  const refresh = useRefreshAcademyConfigs()
  const onFailure = useFailureHandler()
  return useMutation({
    mutationFn: (input: { id: string; draft: AcademyConfigDraft }) => saveAcademyConfig(input.id, input.draft),
    onSuccess: async (item: AcademyConfigItem) => {
      await refresh()
      toast.success(`Đã lưu cấu hình ${item.name}`)
    },
    onError: onFailure,
  })
}

export function useDeleteAcademyConfig() {
  const refresh = useRefreshAcademyConfigs()
  const onFailure = useFailureHandler()
  return useMutation({
    mutationFn: (id: string) => deleteAcademyConfig(id),
    onSuccess: async (item: AcademyConfigItem) => {
      await refresh()
      toast.success(`${item.name} đã về cấu hình mặc định`)
    },
    onError: onFailure,
  })
}
