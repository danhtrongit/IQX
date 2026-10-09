/**
 * React Query hooks of the Học viện tool.
 *
 * Progress and lesson responses are private per account, so their keys carry the
 * user id (a sign-out never reuses another account's cache). The catalog is the
 * same for everybody. Reads use `retry: false`: a failure is reported with an
 * explicit "Thử lại", never retried into a fake empty state, and a failed
 * refresh keeps the last confirmed data on screen.
 */
import { useCallback } from "react"
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import {
  fetchAttemptHistory,
  fetchCatalog,
  fetchLesson,
  fetchProgress,
  resumeAttempt,
  type AcademyCatalog,
  type AcademyHistory,
  type AcademyLesson,
  type AcademyProgress,
  type AcademyResume,
} from "./api"

export const academyKeys = {
  all: ["academy"] as const,
  catalog: ["academy", "catalog"] as const,
  progress: (userId: string | undefined) => ["academy", "progress", userId] as const,
  lesson: (userId: string | undefined, lessonId: string) => ["academy", "lesson", userId, lessonId] as const,
  resume: (userId: string | undefined, lessonId: string) => ["academy", "resume", userId, lessonId] as const,
  history: (userId: string | undefined, lessonId: string) => ["academy", "history", userId, lessonId] as const,
}

/**
 * Query roots whose data depends on what the learner has completed or earned.
 * After a committed completion every one of them is invalidated so the Bot, the
 * Shop wallet and the Strategy filter see the new grants and coins at once:
 *
 * - `["shop"]`            Shop state (wallet, catalogue: `["shop","state",userId]`, read by the header coin
 *                         chip and the Shop panel), ledger and the Shop's own progress read (shop/shop-model.ts `SHOP_QUERY_ROOT`)
 * - `["bot"]`             Bot tool: overview, shared config and registry, universe (bot/api.ts `botKeys.all`)
 * - `["practice"]`        Mini luyện tập: indicator list and granted flags (`practiceKeys`)
 * - `["strategy"]`        Chiến lược: Bộ lọc metric library, Backtest registry
 */
export const COMPLETION_DEPENDENT_ROOTS: readonly QueryKey[] = [
  ["shop"],
  ["bot"],
  ["practice"],
  ["strategy"],
]

/** Refresh everything that depends on a lesson completion. Safe to call after a committed response only. */
export function invalidateAfterCompletion(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["academy", "progress"] })
  void queryClient.invalidateQueries({ queryKey: ["academy", "lesson"] })
  for (const queryKey of COMPLETION_DEPENDENT_ROOTS) void queryClient.invalidateQueries({ queryKey })
}

/** After a graded submit (passed or not): lesson stats, resume and history change; a pass also moves progress, coins and grants. */
export function invalidateAfterSubmit(queryClient: QueryClient, completed: boolean): void {
  void queryClient.invalidateQueries({ queryKey: ["academy", "resume"] })
  void queryClient.invalidateQueries({ queryKey: ["academy", "history"] })
  if (completed) invalidateAfterCompletion(queryClient)
  else void queryClient.invalidateQueries({ queryKey: ["academy", "lesson"] })
}

export function useAcademyCatalog() {
  const { isAuthenticated } = useAuth()
  return useQuery<AcademyCatalog>({
    queryKey: academyKeys.catalog,
    queryFn: ({ signal }) => fetchCatalog(signal),
    enabled: isAuthenticated,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

export function useAcademyProgress() {
  const { user, isAuthenticated } = useAuth()
  return useQuery<AcademyProgress>({
    queryKey: academyKeys.progress(user?.id),
    queryFn: ({ signal }) => fetchProgress(signal),
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  })
}

export function useAcademyLesson(lessonId: string | null) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<AcademyLesson>({
    queryKey: academyKeys.lesson(user?.id, lessonId ?? ""),
    queryFn: ({ signal }) => fetchLesson(lessonId as string, signal),
    enabled: isAuthenticated && !!lessonId,
    staleTime: 60_000,
    retry: false,
  })
}

/** The learner's latest open attempt of a quiz lesson, if any (read only; never starts an attempt). */
export function useAcademyResume(lessonId: string | null, enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<AcademyResume>({
    queryKey: academyKeys.resume(user?.id, lessonId ?? ""),
    queryFn: ({ signal }) => resumeAttempt(lessonId as string, signal),
    enabled: isAuthenticated && !!lessonId && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Submitted attempts of a quiz lesson, newest first. */
export function useAcademyHistory(lessonId: string | null, enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<AcademyHistory>({
    queryKey: academyKeys.history(user?.id, lessonId ?? ""),
    queryFn: ({ signal }) => fetchAttemptHistory(lessonId as string, 5, signal),
    enabled: isAuthenticated && !!lessonId && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

/** Panel refresh: re-read the catalog and the progress, keeping the confirmed data on failure. */
export function useRefreshAcademy() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: academyKeys.catalog }),
        queryClient.invalidateQueries({ queryKey: ["academy", "progress"] }),
      ]),
    [queryClient],
  )
}
