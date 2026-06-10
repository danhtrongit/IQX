/** Lessons / courses domain types (UI camelCase). */

export type CourseLevel = "beginner" | "intermediate" | "advanced"
export type EpisodeContentType = "pdf" | "video" | "text"

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

export interface EpisodeBrief {
  id: string
  title: string
  description: string | null
  contentType: EpisodeContentType
  durationSeconds: number | null
  sortOrder: number
}

export interface ProgressSummary {
  completed: number
  total: number
  percent: number
}

export interface CourseDetail extends CourseCard {
  episodes: EpisodeBrief[]
  progressSummary?: ProgressSummary | null
}

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
