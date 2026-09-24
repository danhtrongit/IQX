/**
 * Adapter API cho quản trị bài học — mười endpoint của `AdminLessonsController`
 * (`/api/v2/admin/lessons/*`, chỉ vai trò `admin`):
 *
 * - `GET    admin/lessons/courses` — danh sách kèm cả khoá chưa xuất bản.
 * - `POST   admin/lessons/courses` — tạo khoá học (409 khi slug đã dùng).
 * - `GET    admin/lessons/courses/:id` — chi tiết + bài học (có `file_url`).
 * - `PATCH  admin/lessons/courses/:id` — cập nhật từng phần.
 * - `DELETE admin/lessons/courses/:id` — **xoá mềm**: đặt `is_published=false`.
 * - `POST   admin/lessons/courses/:id/thumbnail` — multipart, trường `file`.
 * - `POST   admin/lessons/courses/:id/episodes` — tạo bài học.
 * - `PATCH  admin/lessons/episodes/:id` — cập nhật bài học.
 * - `DELETE admin/lessons/episodes/:id` — xoá cứng kèm tệp trên đĩa.
 * - `POST   admin/lessons/episodes/:id/file` — multipart PDF/video.
 * - `POST   admin/lessons/courses/:id/reorder` — thân `{ items: [...] }`.
 *
 * Mọi lời gọi JSON đi qua `api()` dùng chung (token + refresh + `ApiError`).
 * Hai endpoint tải tệp dùng XHR để có tiến trình phần trăm, nhưng vẫn lấy token
 * từ `getAccessToken()` của cùng module đó — không có phiên đăng nhập riêng.
 */
import { api, apiUpload } from "@/lib/api"
import type { LegacyCourseResponse, LegacyEpisodeAdminBrief } from "@/lib/generated/backend-v2"

import type {
  CourseCreatePayload,
  CourseDetail,
  CourseLevel,
  CourseListParams,
  CourseRow,
  CourseUpdatePayload,
  Episode,
  EpisodeContentType,
  EpisodeCreatePayload,
  EpisodeUpdatePayload,
  PaginatedResult,
  ReorderItem,
} from "./types"

/**
 * Gốc API cho upload multipart. JSON dùng `api()`; XHR không thể dùng lại
 * `apiResponse`, nên phải giữ cùng cấu hình canonical v2 và token phiên.
 */
export { API_BASE as ADMIN_API_BASE } from "@/lib/api-config"

/* ── Hình dạng trên đường truyền (snake_case) ────────────────────────────── */

type RawCourse = Pick<LegacyCourseResponse, "id" | "slug" | "title" | "description" | "thumbnail_url" | "level" | "category" | "is_premium" | "is_published" | "total_episodes" | "total_duration_seconds" | "created_at" | "updated_at">

type RawEpisode = Pick<LegacyEpisodeAdminBrief, "id" | "title" | "description" | "content_type" | "file_url" | "duration_seconds" | "file_size_bytes" | "sort_order" | "is_published" | "created_at" | "updated_at"> & {
  course_id: string
  markdown_body: string | null
}

interface RawCourseDetail extends RawCourse {
  episodes: RawEpisode[]
}

interface RawPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/* ── Chuyển đổi snake_case → camelCase ───────────────────────────────────── */

export function adaptCourse(raw: RawCourse): CourseRow {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    thumbnailUrl: raw.thumbnail_url,
    // Enum là cột `String` phía backend: giá trị lạ giữ nguyên văn để nhãn hiển
    // thị tự tra bảng `?? value`.
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

export function adaptEpisode(raw: RawEpisode): Episode {
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

export function adaptCourseDetail(raw: RawCourseDetail): CourseDetail {
  return {
    ...adaptCourse(raw),
    episodes: (raw.episodes ?? []).map(adaptEpisode),
  }
}

/* ── Thân yêu cầu ────────────────────────────────────────────────────────── */

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

function episodeBody(payload: EpisodeUpdatePayload) {
  const body: Record<string, unknown> = {}
  if (payload.title !== undefined) body.title = payload.title
  if (payload.description !== undefined) body.description = payload.description
  if (payload.markdownBody !== undefined) body.markdown_body = payload.markdownBody
  if (payload.sortOrder !== undefined) body.sort_order = payload.sortOrder
  if (payload.isPublished !== undefined) body.is_published = payload.isPublished
  return body
}

/* ── Tải tệp kèm tiến trình ──────────────────────────────────────────────── */

/** POST multipart qua XHR để báo tiến trình; token lấy từ phiên dùng chung. */
async function uploadFile<Raw, Out>(
  path: string,
  file: File,
  adapt: (raw: Raw) => Out,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Out> {
  const response = await apiUpload(`/${path.replace(/^\/+/, "")}`, file, onProgress, signal)
  const body: Raw = await response.json()
  return adapt(body)
}

/* ── API ─────────────────────────────────────────────────────────────────── */

/** `GET admin/lessons/courses` — mới nhất trước, có cả bản nháp. */
export async function listCourses(params: CourseListParams): Promise<PaginatedResult<CourseRow>> {
  const query = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  })
  if (params.search) query.set("search", params.search)
  if (params.category) query.set("category", params.category)
  if (params.level) query.set("level", params.level)
  if (params.isPremium !== undefined) query.set("is_premium", String(params.isPremium))
  if (params.isPublished !== undefined) query.set("is_published", String(params.isPublished))

  const raw = await api<RawPage<RawCourse>>(`/admin/lessons/courses?${query}`)
  return {
    items: (raw.items ?? []).map(adaptCourse),
    total: raw.total,
    page: raw.page,
    pageSize: raw.page_size,
    totalPages: raw.total_pages,
  }
}

/** `GET admin/lessons/courses/:id` — 404 khi id không tồn tại. */
export async function getCourse(courseId: string): Promise<CourseDetail> {
  return adaptCourseDetail(await api<RawCourseDetail>(`/admin/lessons/courses/${courseId}`))
}

/** `POST admin/lessons/courses` — 409 khi slug đã được dùng. */
export async function createCourse(payload: CourseCreatePayload): Promise<CourseRow> {
  return adaptCourse(
    await api<RawCourse>(`/admin/lessons/courses`, {
      method: "POST",
      body: JSON.stringify(courseBody(payload)),
    }),
  )
}

/** `PATCH admin/lessons/courses/:id` — chỉ gửi trường thay đổi. */
export async function updateCourse(
  courseId: string,
  payload: CourseUpdatePayload,
): Promise<CourseRow> {
  return adaptCourse(
    await api<RawCourse>(`/admin/lessons/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify(courseBody(payload)),
    }),
  )
}

/** `DELETE admin/lessons/courses/:id` — xoá mềm (ngừng xuất bản). */
export async function unpublishCourse(courseId: string): Promise<CourseRow> {
  return adaptCourse(
    await api<RawCourse>(`/admin/lessons/courses/${courseId}`, { method: "DELETE" }),
  )
}

/** `POST admin/lessons/courses/:id/thumbnail` — ảnh jpeg/png/webp, tối đa 5MB. */
export function uploadCourseThumbnail(
  courseId: string,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<CourseRow> {
  return uploadFile<RawCourse, CourseRow>(
    `admin/lessons/courses/${courseId}/thumbnail`,
    file,
    adaptCourse,
    onProgress,
    signal,
  )
}

/** `POST admin/lessons/courses/:id/episodes`. */
export async function createEpisode(
  courseId: string,
  payload: EpisodeCreatePayload,
): Promise<Episode> {
  const body: Record<string, unknown> = {
    title: payload.title,
    content_type: payload.contentType,
  }
  if (payload.description !== undefined) body.description = payload.description
  if (payload.markdownBody !== undefined) body.markdown_body = payload.markdownBody
  if (payload.sortOrder !== undefined) body.sort_order = payload.sortOrder

  return adaptEpisode(
    await api<RawEpisode>(`/admin/lessons/courses/${courseId}/episodes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  )
}

/**
 * `PATCH admin/lessons/episodes/:id` — backend không nhận `content_type`, nên
 * loại nội dung chỉ đặt được lúc tạo.
 */
export async function updateEpisode(
  episodeId: string,
  payload: EpisodeUpdatePayload,
): Promise<Episode> {
  return adaptEpisode(
    await api<RawEpisode>(`/admin/lessons/episodes/${episodeId}`, {
      method: "PATCH",
      body: JSON.stringify(episodeBody(payload)),
    }),
  )
}

/** `DELETE admin/lessons/episodes/:id` — xoá cứng, 204 khi thành công. */
export async function deleteEpisode(episodeId: string): Promise<void> {
  await api<void>(`/admin/lessons/episodes/${episodeId}`, { method: "DELETE" })
}

/** `POST admin/lessons/episodes/:id/file` — PDF ≤ 50MB, MP4/WebM ≤ 500MB. */
export function uploadEpisodeFile(
  episodeId: string,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Episode> {
  return uploadFile<RawEpisode, Episode>(
    `admin/lessons/episodes/${episodeId}/file`,
    file,
    adaptEpisode,
    onProgress,
    signal,
  )
}

/** `POST admin/lessons/courses/:id/reorder` — thân `{ items: [...] }`. */
export async function reorderEpisodes(courseId: string, items: ReorderItem[]): Promise<void> {
  await api<{ message: string }>(`/admin/lessons/courses/${courseId}/reorder`, {
    method: "POST",
    body: JSON.stringify({
      items: items.map((item) => ({ episode_id: item.episodeId, sort_order: item.sortOrder })),
    }),
  })
}
