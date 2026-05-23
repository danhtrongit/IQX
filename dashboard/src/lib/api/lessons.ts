import { api } from "@/lib/api"

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

export interface CourseDetail extends CourseCard {
  episodes: EpisodeBrief[]
  progressSummary?: { completed: number; total: number; percent: number } | null
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

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ── Snake-case backend shapes ──

interface BackendCourseCard {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnail_url: string | null
  level: CourseLevel
  category: string
  is_premium: boolean
  total_episodes: number
  total_duration_seconds: number
}

interface BackendEpisodeBrief {
  id: string
  title: string
  description: string | null
  content_type: EpisodeContentType
  duration_seconds: number | null
  sort_order: number
}

interface BackendProgressSummary {
  completed: number
  total: number
  percent: number
}

interface BackendCourseDetail extends BackendCourseCard {
  episodes: BackendEpisodeBrief[]
  progress_summary?: BackendProgressSummary | null
}

interface BackendEpisodeContent {
  id: string
  course_id: string
  title: string
  description: string | null
  content_type: EpisodeContentType
  file_url: string | null
  markdown_body: string | null
  duration_seconds: number | null
  sort_order: number
}

interface BackendProgressRow {
  episode_id: string
  completed_at: string | null
  last_position_seconds: number | null
}

interface BackendPaginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── Adapters ──

function adaptCourseCard(raw: BackendCourseCard): CourseCard {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    thumbnailUrl: raw.thumbnail_url,
    level: raw.level,
    category: raw.category,
    isPremium: raw.is_premium,
    totalEpisodes: raw.total_episodes,
    totalDurationSeconds: raw.total_duration_seconds,
  }
}

function adaptEpisodeBrief(raw: BackendEpisodeBrief): EpisodeBrief {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    contentType: raw.content_type,
    durationSeconds: raw.duration_seconds,
    sortOrder: raw.sort_order,
  }
}

function adaptCourseDetail(raw: BackendCourseDetail): CourseDetail {
  return {
    ...adaptCourseCard(raw),
    episodes: (raw.episodes || []).map(adaptEpisodeBrief),
    progressSummary: raw.progress_summary ?? null,
  }
}

function adaptEpisodeContent(raw: BackendEpisodeContent): EpisodeContent {
  return {
    id: raw.id,
    courseId: raw.course_id,
    title: raw.title,
    description: raw.description,
    contentType: raw.content_type,
    fileUrl: raw.file_url,
    markdownBody: raw.markdown_body,
    durationSeconds: raw.duration_seconds,
    sortOrder: raw.sort_order,
  }
}

function adaptProgressRow(raw: BackendProgressRow): ProgressRow {
  return {
    episodeId: raw.episode_id,
    completedAt: raw.completed_at,
    lastPositionSeconds: raw.last_position_seconds,
  }
}

// ── API ──

export const lessonsApi = {
  listCourses: async (params: CatalogParams): Promise<PaginatedResult<CourseCard>> => {
    const searchParams: Record<string, string | number | boolean> = {
      page: params.page,
      page_size: params.pageSize,
    }
    if (params.category) searchParams.category = params.category
    if (params.level) searchParams.level = params.level
    if (params.isPremium !== undefined) searchParams.is_premium = params.isPremium
    if (params.search) searchParams.search = params.search

    const raw = await api
      .get("lessons/courses", { searchParams })
      .json<BackendPaginated<BackendCourseCard>>()

    return {
      items: (raw.items || []).map(adaptCourseCard),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  getCourse: async (slug: string): Promise<CourseDetail> => {
    const raw = await api
      .get(`lessons/courses/${slug}`)
      .json<BackendCourseDetail>()
    return adaptCourseDetail(raw)
  },

  getEpisodeContent: async (id: string): Promise<EpisodeContent> => {
    const raw = await api
      .get(`lessons/episodes/${id}/content`)
      .json<BackendEpisodeContent>()
    return adaptEpisodeContent(raw)
  },

  saveProgress: async (
    id: string,
    payload: { completed?: boolean; lastPositionSeconds?: number }
  ): Promise<void> => {
    const body: Record<string, boolean | number | undefined> = {}
    if (payload.completed !== undefined) body.completed = payload.completed
    if (payload.lastPositionSeconds !== undefined)
      body.last_position_seconds = payload.lastPositionSeconds

    await api.post(`lessons/episodes/${id}/progress`, { json: body })
  },

  getMyProgress: async (courseId: string): Promise<ProgressRow[]> => {
    const raw = await api
      .get("lessons/me/progress", { searchParams: { course_id: courseId } })
      .json<BackendProgressRow[]>()
    return (raw || []).map(adaptProgressRow)
  },
}
