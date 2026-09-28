/**
 * Nhãn + lựa chọn bộ lọc cho khu "Bài học".
 *
 * Đây là module dữ liệu thuần: tra bảng (`MAP[value] ?? value`) để giá trị lạ
 * của server vẫn hiển thị nguyên văn thay vì bị che.
 */
import type { CourseLevel, EpisodeContentType } from "./types"

export const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

export const CONTENT_TYPE_LABEL: Record<EpisodeContentType, string> = {
  pdf: "Tài liệu",
  video: "Video",
  text: "Bài đọc",
}

export const LEVEL_OPTIONS: { value: CourseLevel | "all"; label: string }[] = [
  { value: "all", label: "Tất cả cấp độ" },
  { value: "beginner", label: "Cơ bản" },
  { value: "intermediate", label: "Trung cấp" },
  { value: "advanced", label: "Nâng cao" },
]

export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả chủ đề" },
  { value: "phan-tich-ky-thuat", label: "Phân tích kỹ thuật" },
  { value: "phan-tich-co-ban", label: "Phân tích cơ bản" },
  { value: "tai-chinh-doanh-nghiep", label: "Tài chính doanh nghiệp" },
  { value: "quan-ly-rui-ro", label: "Quản lý rủi ro" },
  { value: "tam-ly-dau-tu", label: "Tâm lý đầu tư" },
  { value: "chung-khoan-co-ban", label: "Chứng khoán cơ bản" },
]

export const PREMIUM_OPTIONS: { value: "all" | "free" | "premium"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "free", label: "Miễn phí" },
  { value: "premium", label: "Premium" },
]

/** Số khoá học mỗi trang của danh mục (`page_size` backend cho phép tối đa 100). */
export const CATALOG_PAGE_SIZE = 12
