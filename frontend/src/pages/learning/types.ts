/**
 * Kiểu dữ liệu cho khu "Bài học" của người học (camelCase phía giao diện).
 *
 * Hình dạng snake_case của backend nằm trong `api.ts` — chỉ tầng đó biết wire
 * format, phần còn lại của trang dùng các kiểu dưới đây.
 */

export type CourseLevel = string
export type EpisodeContentType = string

/** `CourseResponse` — thẻ khoá học trong danh mục. */
export interface CourseCard {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnailUrl: string | null
  level: CourseLevel
  category: string
  isPremium: boolean
  totalEpisodes: number
  totalDurationSeconds: number
}

/** `EpisodeBrief` — bài học trong danh sách, không kèm nội dung. */
export interface EpisodeBrief {
  id: string
  title: string
  description: string | null
  contentType: EpisodeContentType
  durationSeconds: number | null
  sortOrder: number
}

/** `CourseDetailResponse` — chi tiết khoá học kèm danh sách bài học. */
export interface CourseDetail extends CourseCard {
  episodes: EpisodeBrief[]
}

/** `EpisodeContent` — nội dung đầy đủ, nằm sau cổng đăng nhập/Premium. */
export interface EpisodeContent {
  id: string
  courseId: string
  title: string
  description: string | null
  contentType: EpisodeContentType
  fileUrl: string | null
  markdownBody: string | null
  durationSeconds: number | null
  sortOrder: number
}

/** `ProgressRow` — tiến độ của người dùng cho một bài học. */
export interface ProgressRow {
  episodeId: string
  completedAt: string | null
  lastPositionSeconds: number | null
}

export interface CatalogParams {
  page: number
  pageSize: number
  category?: string
  level?: CourseLevel
  isPremium?: boolean
  search?: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SaveProgressPayload {
  completed?: boolean
  lastPositionSeconds?: number
}
