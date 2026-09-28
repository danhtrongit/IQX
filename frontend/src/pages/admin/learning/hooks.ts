/**
 * React Query hooks cho quản trị bài học.
 *
 * Mọi mutation làm thay đổi danh sách hoặc chi tiết đều invalidate tiền tố
 * `["admin", "lessons"]`: số bài học và tổng thời lượng của khoá được backend
 * tính lại sau mỗi lần thêm/xoá/tải tệp.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import {
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
import { adminLessonKeys } from "./keys"
import type {
  CourseCreatePayload,
  CourseDetail,
  CourseListParams,
  CourseRow,
  CourseUpdatePayload,
  EpisodeCreatePayload,
  EpisodeUpdatePayload,
  PaginatedResult,
  ReorderItem,
} from "./types"

/** Phạm vi dữ liệu riêng của quản trị viên đang đăng nhập. */
function useAdminScope() {
  const { user } = useAuth()
  return user?.id ?? "anonymous"
}

/** Danh sách khoá học (kèm bản nháp) có phân trang + bộ lọc. */
export function useAdminCourses(params: CourseListParams) {
  const scope = useAdminScope()
  return useQuery<PaginatedResult<CourseRow>>({
    queryKey: adminLessonKeys.courses(scope, params),
    queryFn: () => listCourses(params),
    staleTime: 30_000,
  })
}

/** Chi tiết khoá học kèm danh sách bài học. */
export function useAdminCourse(courseId: string | undefined) {
  const scope = useAdminScope()
  return useQuery<CourseDetail>({
    queryKey: adminLessonKeys.course(scope, courseId ?? ""),
    queryFn: () => getCourse(courseId as string),
    enabled: !!courseId,
    staleTime: 30_000,
  })
}

export function useCreateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CourseCreatePayload) => createCourse(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

export function useUpdateCourse(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CourseUpdatePayload) => updateCourse(courseId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

/** `DELETE` của backend là xoá mềm — khoá học chỉ bị ngừng xuất bản. */
export function useUnpublishCourse(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unpublishCourse(courseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

export function useUploadCourseThumbnail(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress: (percent: number) => void }) =>
      uploadCourseThumbnail(courseId, file, onProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

export function useCreateEpisode(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: EpisodeCreatePayload) => createEpisode(courseId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

export function useUpdateEpisode(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ episodeId, payload }: { episodeId: string; payload: EpisodeUpdatePayload }) =>
      updateEpisode(episodeId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
    },
  })
}

export function useDeleteEpisode(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (episodeId: string) => deleteEpisode(episodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

export function useUploadEpisodeFile(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      episodeId,
      file,
      onProgress,
    }: {
      episodeId: string
      file: File
      onProgress: (percent: number) => void
    }) => uploadEpisodeFile(episodeId, file, onProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.all })
    },
  })
}

export function useReorderEpisodes(courseId: string) {
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: ReorderItem[]) => reorderEpisodes(courseId, items),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminLessonKeys.course(scope, courseId) })
    },
  })
}
