/**
 * Nhãn hiển thị và giới hạn của biểu mẫu quản trị bài học.
 *
 * Các giới hạn dưới đây sao đúng DTO của backend (`lesson.dto.ts`) để biểu mẫu
 * báo lỗi ngay tại chỗ; máy chủ vẫn là nơi phán quyết cuối cùng.
 */
import type { CourseLevel, EpisodeContentType } from "./types"

export const LEVEL_LABEL: Record<string, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  text: "Văn bản",
  pdf: "PDF",
  video: "Video",
}

export const LEVEL_OPTIONS: { value: CourseLevel; label: string }[] = [
  { value: "beginner", label: "Cơ bản" },
  { value: "intermediate", label: "Trung cấp" },
  { value: "advanced", label: "Nâng cao" },
]

export const CONTENT_TYPE_OPTIONS: { value: EpisodeContentType; label: string }[] = [
  { value: "text", label: "Văn bản" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Video" },
]

export const PUBLISH_OPTIONS: { value: "published" | "draft"; label: string }[] = [
  { value: "published", label: "Đã xuất bản" },
  { value: "draft", label: "Bản nháp" },
]

/** `SLUG_RE` của backend. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MESSAGE =
  "Slug chỉ được chứa chữ thường, số và dấu gạch ngang (phải bắt đầu và kết thúc bằng chữ hoặc số)"
export const SLUG_MAX_LENGTH = 120
export const TITLE_MAX_LENGTH = 200
export const CATEGORY_MAX_LENGTH = 60

/** `MARKDOWN_MAX_BYTES` — 200KB nội dung markdown cho mỗi bài. */
export const MARKDOWN_MAX_BYTES = 200 * 1024
export const MARKDOWN_TOO_LARGE_MESSAGE = "Nội dung markdown quá lớn (tối đa 200KB)"
export const TEXT_REQUIRES_MARKDOWN_MESSAGE = "Nội dung văn bản yêu cầu phần markdown"
export const NON_TEXT_MARKDOWN_MESSAGE = "Chỉ bài văn bản mới có phần markdown"

/** Giới hạn tải tệp của backend (`LESSON_MAX_*`). */
export const THUMBNAIL_MAX_MB = 5
export const PDF_MAX_MB = 50
export const VIDEO_MAX_MB = 500

export const THUMBNAIL_ACCEPT = "image/jpeg,image/png,image/webp"
export const EPISODE_FILE_ACCEPT: Record<EpisodeContentType, string> = {
  pdf: "application/pdf",
  video: "video/mp4,video/webm",
  text: "",
}
