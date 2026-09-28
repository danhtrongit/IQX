/**
 * Adapter API cho khu "Bài học" của người học.
 *
 * Năm endpoint của `LessonsController` (backend-v2, `/api/v2/lessons/*`):
 *
 * - `GET  lessons/courses` — danh mục công khai (chỉ khoá đã xuất bản).
 * - `GET  lessons/courses/:slug` — chi tiết + danh sách bài (khách xem được).
 * - `GET  lessons/episodes/:id/content` — nội dung đầy đủ; 401 khi chưa đăng
 *   nhập, 403 khi khoá Premium mà tài khoản chưa có gói (trừ quản trị viên).
 * - `POST lessons/episodes/:id/progress` — lưu vị trí xem / đánh dấu hoàn thành.
 * - `GET  lessons/me/progress?course_id=` — tiến độ của chính người dùng.
 *
 * Mọi lời gọi đi qua `api()` dùng chung (token + refresh + `ApiError`); đường
 * dẫn ở đây tương đối so với `/api/v2`.
 */
import { api } from "@/lib/api"
import type { LegacyCourseResponse, LegacyEpisodeBrief, LegacyEpisodeContent } from "@/lib/generated/backend-v2"

import type {
  CatalogParams,
  CourseCard,
  CourseDetail,
  EpisodeBrief,
  EpisodeContent,
  PaginatedResult,
  ProgressRow,
  SaveProgressPayload,
} from "./types"

/* ── Hình dạng trên đường truyền (snake_case) ────────────────────────────── */

type RawCourse = Pick<LegacyCourseResponse, "id" | "slug" | "title" | "description" | "thumbnail_url" | "level" | "category" | "is_premium" | "total_episodes" | "total_duration_seconds">

type RawEpisodeBrief = Pick<LegacyEpisodeBrief, "id" | "title" | "description" | "content_type" | "duration_seconds" | "sort_order">

interface RawCourseDetail extends RawCourse {
  episodes: RawEpisodeBrief[]
}

type RawEpisodeContent = Pick<LegacyEpisodeContent, "id" | "course_id" | "title" | "description" | "content_type" | "file_url" | "markdown_body" | "duration_seconds" | "sort_order">

interface RawProgressRow {
  episode_id: string
  completed_at: string | null
  last_position_seconds: number | null
}

interface RawPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/* ── Chuyển đổi snake_case → camelCase ───────────────────────────────────── */

export function adaptCourse(raw: RawCourse): CourseCard {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    thumbnailUrl: raw.thumbnail_url,
    // Enum là cột `String` phía backend: giá trị lạ được giữ nguyên văn để
    // không che dữ liệu thật (nhãn hiển thị tự tra bảng `?? value`).
    level: raw.level,
    category: raw.category,
    isPremium: raw.is_premium,
    totalEpisodes: raw.total_episodes,
    totalDurationSeconds: raw.total_duration_seconds,
  }
}

function adaptEpisodeBrief(raw: RawEpisodeBrief): EpisodeBrief {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    contentType: raw.content_type,
    durationSeconds: raw.duration_seconds,
    sortOrder: raw.sort_order,
  }
}

export function adaptCourseDetail(raw: RawCourseDetail | null): CourseDetail | null {
  if (!raw) return null
  return {
    ...adaptCourse(raw),
    episodes: (raw.episodes ?? []).map(adaptEpisodeBrief),
  }
}

export function adaptEpisodeContent(raw: RawEpisodeContent): EpisodeContent {
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

function adaptProgressRow(raw: RawProgressRow): ProgressRow {
  return {
    episodeId: raw.episode_id,
    completedAt: raw.completed_at,
    lastPositionSeconds: raw.last_position_seconds,
  }
}

/* ── API ─────────────────────────────────────────────────────────────────── */

/** `GET /lessons/courses` — danh mục đã xuất bản, mới nhất trước. */
export async function fetchCourses(params: CatalogParams): Promise<PaginatedResult<CourseCard>> {
  const query = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  })
  if (params.category) query.set("category", params.category)
  if (params.level) query.set("level", params.level)
  if (params.isPremium !== undefined) query.set("is_premium", String(params.isPremium))
  if (params.search) query.set("search", params.search)

  const raw = await api<RawPage<RawCourse> | null>(`/lessons/courses?${query}`)
  return {
    items: (raw?.items ?? []).map(adaptCourse),
    total: raw?.total ?? 0,
    page: raw?.page ?? params.page,
    pageSize: raw?.page_size ?? params.pageSize,
    totalPages: raw?.total_pages ?? 0,
  }
}

/** `GET /lessons/courses/{slug}` — 404 khi slug không tồn tại hoặc chưa xuất bản. */
export async function fetchCourse(slug: string): Promise<CourseDetail | null> {
  return adaptCourseDetail(await api<RawCourseDetail | null>(`/lessons/courses/${encodeURIComponent(slug)}`))
}

/** `GET /lessons/episodes/{id}/content` — ném `ApiError` 401/403/404 để cổng chặn xử lý. */
export async function fetchEpisodeContent(episodeId: string): Promise<EpisodeContent> {
  return adaptEpisodeContent(
    await api<RawEpisodeContent>(`/lessons/episodes/${encodeURIComponent(episodeId)}/content`),
  )
}

/** `POST /lessons/episodes/{id}/progress` — server quyết định ghi gì (không bỏ hoàn thành). */
export async function saveEpisodeProgress(
  episodeId: string,
  payload: SaveProgressPayload,
): Promise<ProgressRow> {
  const body: Record<string, boolean | number> = {}
  if (payload.completed !== undefined) body.completed = payload.completed
  if (payload.lastPositionSeconds !== undefined) body.last_position_seconds = payload.lastPositionSeconds

  return adaptProgressRow(
    await api<RawProgressRow>(`/lessons/episodes/${encodeURIComponent(episodeId)}/progress`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  )
}

/** `GET /lessons/me/progress?course_id=` — chỉ dùng khi đã đăng nhập. */
export async function fetchMyProgress(courseId: string): Promise<ProgressRow[]> {
  const query = new URLSearchParams({ course_id: courseId })
  const raw = await api<RawProgressRow[] | null>(`/lessons/me/progress?${query}`)
  return (raw ?? []).map(adaptProgressRow)
}
