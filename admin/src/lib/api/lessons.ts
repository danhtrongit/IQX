import { api, uploadFile } from "./client"
import { adaptPage, type BackendPaginated, type PaginatedResult } from "./types"

export type CourseLevel = "beginner" | "intermediate" | "advanced"
export type EpisodeContentType = "pdf" | "video" | "text"

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

export interface CourseDetail extends CourseRow { episodes: Episode[] }
export interface CourseListParams { page: number; pageSize: number; category?: string; level?: CourseLevel; isPremium?: boolean; isPublished?: boolean; search?: string }
export interface CourseCreatePayload { slug: string; title: string; description?: string; level: CourseLevel; category: string; isPremium: boolean }
export type CourseUpdatePayload = Partial<CourseCreatePayload & { isPublished: boolean }>
export interface EpisodeCreatePayload { title: string; description?: string; contentType: EpisodeContentType; markdownBody?: string; sortOrder?: number }
export type EpisodeUpdatePayload = Partial<Pick<EpisodeCreatePayload, "title" | "description" | "markdownBody" | "sortOrder"> & { isPublished: boolean }>
export interface ReorderItem { episodeId: string; sortOrder: number }

interface BackendCourseRow {
  id: string; slug: string; title: string; description: string | null; thumbnail_url: string | null; level: string; category: string; is_premium: boolean; is_published: boolean; total_episodes: number; total_duration_seconds: number; created_at: string; updated_at: string
}
interface BackendEpisode {
  id: string; course_id: string; title: string; description: string | null; content_type: string; file_url: string | null; markdown_body: string | null; duration_seconds: number | null; file_size_bytes: number | null; sort_order: number; is_published: boolean; created_at: string; updated_at: string
}
interface BackendCourseDetail extends BackendCourseRow { episodes: BackendEpisode[] }

function adaptCourseRow(raw: BackendCourseRow): CourseRow {
  return { id: raw.id, slug: raw.slug, title: raw.title, description: raw.description, thumbnailUrl: raw.thumbnail_url, level: raw.level as CourseLevel, category: raw.category, isPremium: raw.is_premium, isPublished: raw.is_published, totalEpisodes: raw.total_episodes, totalDurationSeconds: raw.total_duration_seconds, createdAt: raw.created_at, updatedAt: raw.updated_at }
}
function adaptEpisode(raw: BackendEpisode): Episode {
  return { id: raw.id, courseId: raw.course_id, title: raw.title, description: raw.description, contentType: raw.content_type as EpisodeContentType, fileUrl: raw.file_url, markdownBody: raw.markdown_body, durationSeconds: raw.duration_seconds, fileSizeBytes: raw.file_size_bytes, sortOrder: raw.sort_order, isPublished: raw.is_published, createdAt: raw.created_at, updatedAt: raw.updated_at }
}
function adaptCourseDetail(raw: BackendCourseDetail): CourseDetail {
  return { ...adaptCourseRow(raw), episodes: raw.episodes.map(adaptEpisode) }
}

export const lessonsApi = {
  list: async (params: CourseListParams): Promise<PaginatedResult<CourseRow>> => {
    const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
    if (params.search) qs.set("search", params.search)
    if (params.category) qs.set("category", params.category)
    if (params.level) qs.set("level", params.level)
    if (params.isPremium !== undefined) qs.set("is_premium", String(params.isPremium))
    if (params.isPublished !== undefined) qs.set("is_published", String(params.isPublished))
    return adaptPage(await api.get(`admin/lessons/courses?${qs}`).json<BackendPaginated<BackendCourseRow>>(), adaptCourseRow)
  },
  get: async (id: string): Promise<CourseDetail> => adaptCourseDetail(await api.get(`admin/lessons/courses/${id}`).json<BackendCourseDetail>()),
  create: async (payload: CourseCreatePayload): Promise<CourseDetail> => adaptCourseDetail(await api.post("admin/lessons/courses", { json: { slug: payload.slug, title: payload.title, description: payload.description, level: payload.level, category: payload.category, is_premium: payload.isPremium } }).json<BackendCourseDetail>()),
  update: async (id: string, payload: CourseUpdatePayload): Promise<CourseDetail> => adaptCourseDetail(await api.patch(`admin/lessons/courses/${id}`, { json: courseBody(payload) }).json<BackendCourseDetail>()),
  delete: async (id: string): Promise<void> => { await api.delete(`admin/lessons/courses/${id}`) },
  uploadThumbnail: (courseId: string, file: File, onProgress: (pct: number) => void, signal?: AbortSignal) => uploadFile(`admin/lessons/courses/${courseId}/thumbnail`, file, onProgress, signal),
  createEpisode: async (courseId: string, payload: EpisodeCreatePayload): Promise<Episode> => adaptEpisode(await api.post(`admin/lessons/courses/${courseId}/episodes`, { json: episodeCreateBody(payload) }).json<BackendEpisode>()),
  updateEpisode: async (id: string, payload: EpisodeUpdatePayload): Promise<Episode> => adaptEpisode(await api.patch(`admin/lessons/episodes/${id}`, { json: episodeUpdateBody(payload) }).json<BackendEpisode>()),
  deleteEpisode: async (id: string): Promise<void> => { await api.delete(`admin/lessons/episodes/${id}`) },
  uploadEpisodeFile: (episodeId: string, file: File, onProgress: (pct: number) => void, signal?: AbortSignal) => uploadFile(`admin/lessons/episodes/${episodeId}/file`, file, onProgress, signal),
  reorder: async (courseId: string, items: ReorderItem[]): Promise<void> => {
    await api.post(`admin/lessons/courses/${courseId}/reorder`, { json: items.map((it) => ({ episode_id: it.episodeId, sort_order: it.sortOrder })) })
  },
}

function courseBody(payload: CourseUpdatePayload) {
  const body: Record<string, unknown> = {}
  if (payload.slug !== undefined) body.slug = payload.slug
  if (payload.title !== undefined) body.title = payload.title
  if (payload.description !== undefined) body.description = payload.description
  if (payload.level !== undefined) body.level = payload.level
  if (payload.category !== undefined) body.category = payload.category
  if (payload.isPremium !== undefined) body.is_premium = payload.isPremium
  if (payload.isPublished !== undefined) body.is_published = payload.isPublished
  return body
}

function episodeCreateBody(payload: EpisodeCreatePayload) {
  return { title: payload.title, description: payload.description, content_type: payload.contentType, markdown_body: payload.markdownBody, sort_order: payload.sortOrder }
}

function episodeUpdateBody(payload: EpisodeUpdatePayload) {
  const body: Record<string, unknown> = {}
  if (payload.title !== undefined) body.title = payload.title
  if (payload.description !== undefined) body.description = payload.description
  if (payload.markdownBody !== undefined) body.markdown_body = payload.markdownBody
  if (payload.sortOrder !== undefined) body.sort_order = payload.sortOrder
  if (payload.isPublished !== undefined) body.is_published = payload.isPublished
  return body
}
