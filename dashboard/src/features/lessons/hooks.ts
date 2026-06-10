import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { lessonsApi } from "./api"
import { lessonsKeys } from "./keys"
import type {
  CatalogParams,
  CourseDetail,
  EpisodeContent,
  PaginatedResult,
  CourseCard,
  ProgressRow,
  SaveProgressPayload,
} from "./types"

/** Paginated course catalog with filters. */
export function useCourses(params: CatalogParams) {
  return useQuery<PaginatedResult<CourseCard>>({
    queryKey: lessonsKeys.courses(params),
    queryFn: () => lessonsApi.listCourses(params),
    staleTime: 60_000,
  })
}

/** A single course (public) by slug, with its episode list. */
export function useCourse(slug: string | undefined) {
  return useQuery<CourseDetail>({
    queryKey: lessonsKeys.course(slug ?? ""),
    queryFn: () => lessonsApi.getCourse(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
  })
}

/**
 * Episode content. May reject with 401 (unauthenticated) or 403 (premium
 * required); we do NOT retry so the viewer can inspect the error and gate.
 */
export function useEpisodeContent(id: string | undefined) {
  return useQuery<EpisodeContent>({
    queryKey: lessonsKeys.episodeContent(id ?? ""),
    queryFn: () => lessonsApi.getEpisodeContent(id as string),
    enabled: !!id,
    retry: false,
    staleTime: 30_000,
  })
}

/** Current user's progress rows for a course (enabled only when signed in). */
export function useMyProgress(courseId: string | undefined) {
  const { isAuthenticated } = useAuth()
  return useQuery<ProgressRow[]>({
    queryKey: lessonsKeys.progress(courseId ?? ""),
    queryFn: () => lessonsApi.getMyProgress(courseId as string),
    enabled: !!courseId && isAuthenticated,
    staleTime: 30_000,
  })
}

/** Save episode progress (position update or mark-complete). */
export function useTrackProgress(courseId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveProgressPayload }) =>
      lessonsApi.saveProgress(id, payload),
    onSuccess: () => {
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: lessonsKeys.progress(courseId) })
      }
    },
  })
}
