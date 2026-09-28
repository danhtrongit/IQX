/**
 * Kiểu dữ liệu cho quản trị bài học (`/admin/lessons`) — camelCase phía giao
 * diện, hình dạng snake_case của backend nằm trong `api.ts`.
 */

export type CourseLevel = "beginner" | "intermediate" | "advanced"
export type EpisodeContentType = "pdf" | "video" | "text"

/** `CourseResponse`. */
export interface CourseRow {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnailUrl: string | null
  level: CourseLevel
  category: string
  isPremium: boolean
  isPublished: boolean
  totalEpisodes: number
  totalDurationSeconds: number
  createdAt: string
  updatedAt: string
}

/** `EpisodeAdminBrief` — kèm `fileUrl` để biết bài đã có tệp hay chưa. */
export interface Episode {
  id: string
  courseId: string
  title: string
  description: string | null
  contentType: EpisodeContentType
  fileUrl: string | null
  markdownBody: string | null
  durationSeconds: number | null
  fileSizeBytes: number | null
  sortOrder: number
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

/** `CourseAdminDetailResponse`. */
export interface CourseDetail extends CourseRow {
  episodes: Episode[]
}

export interface CourseListParams {
  page: number
  pageSize: number
  category?: string
  level?: CourseLevel
  isPremium?: boolean
  isPublished?: boolean
  search?: string
}

export interface CourseCreatePayload {
  slug: string
  title: string
  description?: string
  level: CourseLevel
  category: string
  isPremium: boolean
  isPublished: boolean
}

/** `description: null` xoá mô tả (backend nhận `null` cho cột nullable). */
export type CourseUpdatePayload = Partial<Omit<CourseCreatePayload, "description">> & {
  description?: string | null
}

export interface EpisodeCreatePayload {
  title: string
  description?: string
  contentType: EpisodeContentType
  markdownBody?: string
  sortOrder?: number
}

export interface EpisodeUpdatePayload {
  title?: string
  description?: string | null
  markdownBody?: string | null
  sortOrder?: number
  isPublished?: boolean
}

export interface ReorderItem {
  episodeId: string
  sortOrder: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
