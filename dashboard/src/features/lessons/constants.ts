import { IconBook, IconFile, IconVideoCamera } from "@arco-design/web-react/icon"
import type { CourseLevel, EpisodeContentType } from "./types"

/** Arco icon component per episode content type. */
export const CONTENT_TYPE_ICON: Record<EpisodeContentType, typeof IconBook> = {
  pdf: IconFile,
  video: IconVideoCamera,
  text: IconBook,
}

export const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

/** Arco Tag color names per level. */
export const LEVEL_TAG_COLOR: Record<CourseLevel, string> = {
  beginner: "green",
  intermediate: "arcoblue",
  advanced: "purple",
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

export const PREMIUM_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "free", label: "Miễn phí" },
  { value: "premium", label: "Premium" },
]

/** Gradient placeholders when a course has no thumbnail. */
export const GRADIENTS = [
  "from-blue-600 to-indigo-700",
  "from-emerald-600 to-teal-700",
  "from-violet-600 to-purple-700",
  "from-rose-600 to-pink-700",
  "from-amber-600 to-orange-700",
]

export function getGradient(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  return GRADIENTS[hash % GRADIENTS.length]
}

export const CONTENT_TYPE_LABEL: Record<EpisodeContentType, string> = {
  pdf: "Tài liệu",
  video: "Video",
  text: "Bài đọc",
}
