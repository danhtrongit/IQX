import { api, API_BASE, getAccessToken } from "./client"
import type { PaginatedResult } from "@/hooks/use-paginated-query"

// ── Types ──────────────────────────────────────────────────────────────────

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
}

export type CourseUpdatePayload = Partial<CourseCreatePayload & { isPublished: boolean }>

export interface EpisodeCreatePayload {
  title: string
  description?: string
  contentType: EpisodeContentType
  markdownBody?: string
  sortOrder?: number
}

export type EpisodeUpdatePayload = Partial<
  Pick<EpisodeCreatePayload, "title" | "description" | "markdownBody" | "sortOrder"> & {
    isPublished: boolean
  }
>

export interface ReorderItem {
  episodeId: string
  sortOrder: number
}

// ── Backend raw shapes ─────────────────────────────────────────────────────

interface BackendCourseRow {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnail_url: string | null
  level: string
  category: string
  is_premium: boolean
  is_published: boolean
  total_episodes: number
  total_duration_seconds: number
  created_at: string
  updated_at: string
}

interface BackendEpisode {
  id: string
  course_id: string
  title: string
  description: string | null
  content_type: string
  file_url: string | null
  markdown_body: string | null
  duration_seconds: number | null
  file_size_bytes: number | null
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

interface BackendCourseDetail extends BackendCourseRow {
  episodes: BackendEpisode[]
}

interface BackendPaginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── Adapters ───────────────────────────────────────────────────────────────

function adaptCourseRow(raw: BackendCourseRow): CourseRow {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    thumbnailUrl: raw.thumbnail_url,
    level: raw.level as CourseLevel,
    category: raw.category,
    isPremium: raw.is_premium,
    isPublished: raw.is_published,
    totalEpisodes: raw.total_episodes,
    totalDurationSeconds: raw.total_duration_seconds,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function adaptEpisode(raw: BackendEpisode): Episode {
  return {
    id: raw.id,
    courseId: raw.course_id,
    title: raw.title,
    description: raw.description,
    contentType: raw.content_type as EpisodeContentType,
    fileUrl: raw.file_url,
    markdownBody: raw.markdown_body,
    durationSeconds: raw.duration_seconds,
    fileSizeBytes: raw.file_size_bytes,
    sortOrder: raw.sort_order,
    isPublished: raw.is_published,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function adaptCourseDetail(raw: BackendCourseDetail): CourseDetail {
  return {
    ...adaptCourseRow(raw),
    episodes: raw.episodes.map(adaptEpisode),
  }
}

// ── Upload helper ──────────────────────────────────────────────────────────

export function uploadFile(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_BASE}/${url}`)

    const token = getAccessToken()
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }

    xhr.onload = () => {
      if (xhr.status < 300) {
        resolve(new Response(xhr.responseText, { status: xhr.status }))
      } else {
        let msg = `Upload failed (${xhr.status})`
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string }
          if (body.detail) msg = body.detail
        } catch {
          // ignore
        }
        reject(new Error(msg))
      }
    }

    xhr.onerror = () => reject(new Error("Upload failed"))
    xhr.onabort = () => reject(new Error("Upload cancelled"))

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort())
    }

    const fd = new FormData()
    fd.append("file", file)
    xhr.send(fd)
  })
}

// ── API ────────────────────────────────────────────────────────────────────

export const lessonsApi = {
  // Courses
  list: async (params: CourseListParams): Promise<PaginatedResult<CourseRow>> => {
    const qs = new URLSearchParams()
    qs.set("page", String(params.page))
    qs.set("page_size", String(params.pageSize))
    if (params.search) qs.set("search", params.search)
    if (params.category) qs.set("category", params.category)
    if (params.level) qs.set("level", params.level)
    if (params.isPremium !== undefined) qs.set("is_premium", String(params.isPremium))
    if (params.isPublished !== undefined) qs.set("is_published", String(params.isPublished))

    const raw = await api
      .get(`admin/lessons/courses?${qs.toString()}`)
      .json<BackendPaginated<BackendCourseRow>>()

    return {
      items: raw.items.map(adaptCourseRow),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  get: async (id: string): Promise<CourseDetail> => {
    const raw = await api
      .get(`admin/lessons/courses/${id}`)
      .json<BackendCourseDetail>()
    return adaptCourseDetail(raw)
  },

  create: async (payload: CourseCreatePayload): Promise<CourseDetail> => {
    const raw = await api
      .post("admin/lessons/courses", {
        json: {
          slug: payload.slug,
          title: payload.title,
          description: payload.description,
          level: payload.level,
          category: payload.category,
          is_premium: payload.isPremium,
        },
      })
      .json<BackendCourseDetail>()
    return adaptCourseDetail(raw)
  },

  update: async (id: string, payload: CourseUpdatePayload): Promise<CourseDetail> => {
    const body: Record<string, unknown> = {}
    if (payload.slug !== undefined) body.slug = payload.slug
    if (payload.title !== undefined) body.title = payload.title
    if (payload.description !== undefined) body.description = payload.description
    if (payload.level !== undefined) body.level = payload.level
    if (payload.category !== undefined) body.category = payload.category
    if (payload.isPremium !== undefined) body.is_premium = payload.isPremium
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished

    const raw = await api
      .patch(`admin/lessons/courses/${id}`, { json: body })
      .json<BackendCourseDetail>()
    return adaptCourseDetail(raw)
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`admin/lessons/courses/${id}`)
  },

  uploadThumbnail: (
    courseId: string,
    file: File,
    onProgress: (pct: number) => void,
    signal?: AbortSignal,
  ): Promise<Response> =>
    uploadFile(`admin/lessons/courses/${courseId}/thumbnail`, file, onProgress, signal),

  // Episodes
  createEpisode: async (courseId: string, payload: EpisodeCreatePayload): Promise<Episode> => {
    const raw = await api
      .post(`admin/lessons/courses/${courseId}/episodes`, {
        json: {
          title: payload.title,
          description: payload.description,
          content_type: payload.contentType,
          markdown_body: payload.markdownBody,
          sort_order: payload.sortOrder,
        },
      })
      .json<BackendEpisode>()
    return adaptEpisode(raw)
  },

  updateEpisode: async (id: string, payload: EpisodeUpdatePayload): Promise<Episode> => {
    const body: Record<string, unknown> = {}
    if (payload.title !== undefined) body.title = payload.title
    if (payload.description !== undefined) body.description = payload.description
    if (payload.markdownBody !== undefined) body.markdown_body = payload.markdownBody
    if (payload.sortOrder !== undefined) body.sort_order = payload.sortOrder
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished

    const raw = await api
      .patch(`admin/lessons/episodes/${id}`, { json: body })
      .json<BackendEpisode>()
    return adaptEpisode(raw)
  },

  deleteEpisode: async (id: string): Promise<void> => {
    await api.delete(`admin/lessons/episodes/${id}`)
  },

  uploadEpisodeFile: (
    episodeId: string,
    file: File,
    onProgress: (pct: number) => void,
    signal?: AbortSignal,
  ): Promise<Response> =>
    uploadFile(`admin/lessons/episodes/${episodeId}/file`, file, onProgress, signal),

  reorder: async (courseId: string, items: ReorderItem[]): Promise<void> => {
    await api.post(`admin/lessons/courses/${courseId}/reorder`, {
      json: items.map((it) => ({
        episode_id: it.episodeId,
        sort_order: it.sortOrder,
      })),
    })
  },
}
