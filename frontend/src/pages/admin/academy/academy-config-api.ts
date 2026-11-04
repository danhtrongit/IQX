/**
 * Lớp dữ liệu của màn quản trị "Học viện" (spec v4.1 §1.4, §8.3): cấu hình Học viện theo
 * trưởng nhóm. Chỉ quản trị viên được tạo, sửa, xoá; mọi request đi qua `requestOperation`.
 *
 * Kiểu lấy thẳng từ contract sinh (giữ tên trường snake_case của máy chủ). Số chương hiển thị
 * (`display_no`) do máy chủ đánh lại liên tục từ 1: client không bao giờ tự tính, mọi chỗ cần số
 * đã đánh lại đều đọc từ kết quả xem trước.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type AcademyConfigListResponse = ApiResponseFor<"GET /api/v2/admin/academy-configs">
export type AcademyConfigItem = AcademyConfigListResponse["items"][number]
/** Một chương của danh mục gốc 12 chương: thứ tự và số gốc (`no`), dùng ở màn sửa. */
export type AcademyCatalogChapter = AcademyConfigListResponse["catalog_chapters"][number]
export type AcademyMode = AcademyConfigItem["mode"]

export type AcademyConfigPreview = ApiResponseFor<"POST /api/v2/admin/academy-configs/preview">
/** Chương trong chương trình của người học: số đã đánh lại. */
export type AcademyProgramChapter = AcademyConfigPreview["chapters"][number]
export type AcademyPreviewWarning = AcademyConfigPreview["warnings"][number]

export type AcademyConfigLogsResponse = ApiResponseFor<"GET /api/v2/admin/academy-configs/{id}/logs">
export type AcademyConfigLog = AcademyConfigLogsResponse["items"][number]
export type AcademyConfigLogAction = AcademyConfigLog["action"]
export type AcademyConfigData = NonNullable<AcademyConfigLog["before"]>

/** Nội dung một cấu hình: cách học và các chương được học. */
export type AcademyConfigDraft = { mode: AcademyMode; chapter_ids: string[] }

export const ACADEMY_LOG_LIMIT = 50

export function fetchAcademyConfigs(signal?: AbortSignal): Promise<AcademyConfigListResponse> {
  return requestOperation("GET /api/v2/admin/academy-configs", {}, { signal })
}

/** Xem trước chương trình của nhóm: máy chủ đánh lại số chương, không lưu gì. */
export function previewAcademyConfig(draft: AcademyConfigDraft, signal?: AbortSignal): Promise<AcademyConfigPreview> {
  return requestOperation(
    "POST /api/v2/admin/academy-configs/preview",
    { body: { mode: draft.mode, chapter_ids: draft.chapter_ids } },
    { signal },
  )
}

/** "Tạo cấu hình riêng" cho một trưởng nhóm chưa có cấu hình riêng. */
export function createAcademyConfig(input: AcademyConfigDraft & { leader_id: string }): Promise<AcademyConfigItem> {
  return requestOperation("POST /api/v2/admin/academy-configs", {
    body: { leader_id: input.leader_id, mode: input.mode, chapter_ids: input.chapter_ids },
  })
}

/** Lưu cấu hình mặc định hoặc cấu hình riêng; áp dụng ngay cho mọi người dùng của nó. */
export function saveAcademyConfig(id: string, draft: AcademyConfigDraft): Promise<AcademyConfigItem> {
  return requestOperation("PUT /api/v2/admin/academy-configs/{id}", {
    path: { id },
    body: { mode: draft.mode, chapter_ids: draft.chapter_ids },
  })
}

/** "Về mặc định": xoá cấu hình riêng của trưởng nhóm. Cấu hình mặc định không xoá được. */
export function deleteAcademyConfig(id: string): Promise<AcademyConfigItem> {
  return requestOperation("DELETE /api/v2/admin/academy-configs/{id}", { path: { id } })
}

/** Nhật ký thay đổi của một cấu hình, mới nhất trước (spec §1.3). */
export function fetchAcademyConfigLogs(id: string, signal?: AbortSignal): Promise<AcademyConfigLogsResponse> {
  return requestOperation(
    "GET /api/v2/admin/academy-configs/{id}/logs",
    { path: { id }, query: { limit: ACADEMY_LOG_LIMIT } },
    { signal },
  )
}
