/**
 * Quản trị bài học — danh sách khoá học và trang sửa khoá học.
 *
 * Đăng ký route ở tầng app (layout `/admin` đã chặn theo vai trò `admin`):
 * - `/admin/lessons` → `CoursesPage`
 * - `/admin/lessons/new` → `CourseEditPage`
 * - `/admin/lessons/:id` → `CourseEditPage`
 */
export { CoursesPage } from "./courses-page"
export { CourseEditPage } from "./course-edit-page"

export { adminLessonKeys } from "./keys"
export {
  createCourse,
  createEpisode,
  deleteEpisode,
  getCourse,
  listCourses,
  reorderEpisodes,
  unpublishCourse,
  updateCourse,
  updateEpisode,
  uploadCourseThumbnail,
  uploadEpisodeFile,
} from "./api"
export {
  useAdminCourse,
  useAdminCourses,
  useCreateCourse,
  useCreateEpisode,
  useDeleteEpisode,
  useReorderEpisodes,
  useUnpublishCourse,
  useUpdateCourse,
  useUpdateEpisode,
  useUploadCourseThumbnail,
  useUploadEpisodeFile,
} from "./hooks"
export {
  CONTENT_TYPE_LABEL,
  CONTENT_TYPE_OPTIONS,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  PUBLISH_OPTIONS,
} from "./constants"
export { formatDuration, formatFileSize, slugify } from "./format"

export type {
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
