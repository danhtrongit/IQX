/**
 * Nhãn tiếng Việt và hàm định dạng của màn cấu hình Học viện (spec v4.1 §1.4).
 * Không có hàm nào tự tính số chương hiển thị: số đó luôn do máy chủ trả về.
 */
import { ApiError, errorMessage } from "@/lib/api"

import type { AcademyCatalogChapter, AcademyConfigData, AcademyConfigLogAction, AcademyMode } from "./academy-config-api"

export const ACADEMY_MODE_OPTIONS: { value: AcademyMode; label: string; description: string }[] = [
  { value: "free", label: "Học tự do", description: "Mọi bài, bài thi và Phòng tập đều mở." },
  {
    value: "sequential",
    label: "Học lần lượt",
    description: "Mục sau chỉ mở khi đã đạt mục bắt buộc ngay trước nó.",
  },
]

/** Nhãn ngắn ở bảng: "Tự do" hoặc "Lần lượt". */
export const ACADEMY_MODE_SHORT_LABELS: Record<AcademyMode, string> = {
  free: "Tự do",
  sequential: "Lần lượt",
}

/** Nhãn đầy đủ ở màn sửa, xem trước và thẻ của trưởng nhóm. */
export const ACADEMY_MODE_LABELS: Record<AcademyMode, string> = {
  free: "Học tự do",
  sequential: "Học lần lượt",
}

export const ACADEMY_LOG_ACTION_LABELS: Record<AcademyConfigLogAction, string> = {
  create: "Tạo cấu hình riêng",
  update: "Cập nhật",
  delete: "Về mặc định",
}

/** "11/12 chương". */
export function chapterCountLabel(count: number, total: number): string {
  return `${count}/${total} chương`
}

/** "106 bài học". */
export function lessonTotalLabel(requiredTotal: number): string {
  return `${requiredTotal} bài học`
}

/** "Chương 2 · Thương hiệu cá nhân": số là số đã đánh lại (máy chủ) hoặc số gốc (màn sửa). */
export function chapterLabel(no: number, title: string): string {
  return `Chương ${no} · ${title}`
}

/** "Tự do · 11 chương": tóm tắt một cấu hình trong nhật ký. */
export function configDataSummary(data: AcademyConfigData): string {
  return `${ACADEMY_MODE_SHORT_LABELS[data.mode]} · ${data.chapter_ids.length} chương`
}

/** Tên chương của một mã chương cố định, theo danh mục gốc; mã lạ hiện nguyên mã. */
export function chapterTitleById(catalog: AcademyCatalogChapter[], chapterId: string): string {
  return catalog.find((chapter) => chapter.chapter_id === chapterId)?.title ?? chapterId
}

/** Danh sách mã chương theo thứ tự danh mục gốc, bỏ mã không có trong danh mục. */
export function chapterIdsInCatalogOrder(catalog: AcademyCatalogChapter[], selected: ReadonlySet<string>): string[] {
  return catalog.filter((chapter) => selected.has(chapter.chapter_id)).map((chapter) => chapter.chapter_id)
}

const ERROR_MESSAGES: Record<string, string> = {
  ACADEMY_CONFIG_EXISTS: "Trưởng nhóm này đã có cấu hình riêng. Hãy tải lại danh sách rồi bấm Sửa.",
  ACADEMY_CONFIG_DEFAULT_PROTECTED: "Không xóa được cấu hình mặc định.",
  ACADEMY_CONFIG_INVALID: "Danh sách chương không hợp lệ. Hãy chọn ít nhất một chương trong danh mục.",
  ACADEMY_CONFIG_NOT_FOUND: "Cấu hình này không còn tồn tại. Hãy tải lại danh sách.",
  ACADEMY_LEADER_NOT_FOUND: "Không tìm thấy trưởng nhóm này. Hãy tải lại danh sách.",
}

/** Mã lỗi của máy chủ cho thấy danh sách đang cũ so với dữ liệu thật. */
const STALE_LIST_CODES = new Set(["ACADEMY_CONFIG_EXISTS", "ACADEMY_CONFIG_NOT_FOUND", "ACADEMY_LEADER_NOT_FOUND"])

export function academyConfigErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined
}

/** Lỗi do danh sách đang cũ: làm mới danh sách để người dùng thấy trạng thái thật. */
export function isStaleAcademyConfigError(error: unknown): boolean {
  const code = academyConfigErrorCode(error)
  return code !== undefined && STALE_LIST_CODES.has(code)
}

/** Thông báo tiếng Việt cho lỗi của máy chủ; lỗi lạ giữ nguyên lời của máy chủ. */
export function academyConfigErrorMessage(error: unknown): string {
  const code = academyConfigErrorCode(error)
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  return errorMessage(error)
}
