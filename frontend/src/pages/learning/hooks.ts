/**
 * React Query hooks cho khu "Bài học".
 *
 * - `useEpisodeContent` không retry: lỗi 401/403/404 chính là tín hiệu để trang
 *   hiển thị cổng đăng nhập / cổng Premium / "không tìm thấy bài học".
 * - Tiến độ và nội dung bài học là dữ liệu riêng → khoá truy vấn kèm `user.id`
 *   (xem `keys.ts`) nên không rò rỉ giữa các tài khoản.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import {
  fetchCourse,
  fetchCourses,
  fetchEpisodeContent,
  fetchMyProgress,
  saveEpisodeProgress,
} from "./api"
import { learningKeys } from "./keys"
import type {
  CatalogParams,
  CourseCard,
  CourseDetail,
  EpisodeContent,
  PaginatedResult,
  ProgressRow,
  SaveProgressPayload,
} from "./types"

/** Danh mục khoá học có phân trang + bộ lọc. */
export function useCourses(params: CatalogParams) {
  return useQuery<PaginatedResult<CourseCard>>({
    queryKey: learningKeys.courses(params),
    queryFn: () => fetchCourses(params),
    staleTime: 60_000,
  })
}

/** Chi tiết một khoá học theo slug (công khai, khách vẫn xem được). */
export function useCourse(slug: string | undefined) {
  return useQuery<CourseDetail | null>({
    queryKey: learningKeys.course(slug ?? ""),
    queryFn: () => fetchCourse(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
  })
}

/**
 * Nội dung một bài học — chỉ gọi khi đã đăng nhập (khách vãng lai được cổng
 * đăng nhập chặn ngay, không cần một vòng 401 vô ích). Khi đã đăng nhập, lỗi
 * 403 (cần Premium) và 404 (bài không tồn tại) vẫn là tín hiệu để trang dựng
 * cổng tương ứng, nên truy vấn này không retry.
 */
export function useEpisodeContent(episodeId: string | undefined, enabled: boolean) {
  const { user } = useAuth()
  return useQuery<EpisodeContent>({
    queryKey: learningKeys.episodeContent(user?.id ?? null, episodeId ?? ""),
    queryFn: () => fetchEpisodeContent(episodeId as string),
    enabled: !!episodeId && enabled,
    retry: false,
    staleTime: 30_000,
  })
}

/** Tiến độ của người dùng hiện tại trong một khoá học. */
export function useMyProgress(courseId: string | undefined) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<ProgressRow[]>({
    queryKey: learningKeys.progress(user?.id ?? null, courseId ?? ""),
    queryFn: () => fetchMyProgress(courseId as string),
    enabled: !!courseId && isAuthenticated,
    staleTime: 30_000,
  })
}

/** Lưu tiến độ (vị trí xem hoặc đánh dấu hoàn thành). */
export function useTrackProgress(courseId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ episodeId, payload }: { episodeId: string; payload: SaveProgressPayload }) =>
      saveEpisodeProgress(episodeId, payload),
    onSuccess: () => {
      if (!courseId) return
      void queryClient.invalidateQueries({
        queryKey: learningKeys.progress(user?.id ?? null, courseId),
      })
    },
  })
}
