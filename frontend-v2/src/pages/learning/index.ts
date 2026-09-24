/**
 * Khu "Bài học" của người học — danh mục, chi tiết khoá học và trình xem bài học.
 *
 * Đăng ký route ở tầng app:
 * - `/bai-hoc` → `CatalogPage`
 * - `/bai-hoc/:slug` → `CourseDetailPage`
 * - `/bai-hoc/:slug/:episodeId` → `EpisodeViewerPage`
 */
export { CatalogPage } from "./catalog-page"
export { CourseDetailPage } from "./course-detail-page"
export { EpisodeViewerPage } from "./episode-viewer-page"

export { EpisodeTypeIcon } from "./components/episode-type-icon"
export { LessonCard } from "./components/lesson-card"
export { MarkdownViewer } from "./components/markdown-viewer"
export { PdfViewer } from "./components/pdf-viewer"
export { VideoPlayer } from "./components/video-player"

export { useCourse, useCourses, useEpisodeContent, useMyProgress, useTrackProgress } from "./hooks"
export { learningKeys } from "./keys"
export {
  fetchCourse,
  fetchCourses,
  fetchEpisodeContent,
  fetchMyProgress,
  saveEpisodeProgress,
} from "./api"
export {
  CATALOG_PAGE_SIZE,
  CATEGORY_OPTIONS,
  CONTENT_TYPE_LABEL,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  PREMIUM_OPTIONS,
} from "./constants"
export { formatDuration } from "./format"

export type {
  CatalogParams,
  CourseCard,
  CourseDetail,
  CourseLevel,
  EpisodeBrief,
  EpisodeContent,
  EpisodeContentType,
  PaginatedResult,
  ProgressRow,
  SaveProgressPayload,
} from "./types"
