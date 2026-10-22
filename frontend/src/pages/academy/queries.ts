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
  fetchItem,
  fetchNotes,
  fetchProgress,
  resumeAttempt,
  type CatalogResponse,
  type HistoryResponse,
  type ItemResponse,
  type NotesResponse,
  type ProgressResponse,
  type ResumeResponse,
  type SubmitResult,
} from "./api"

export const academyKeys = {
  all: ["academy"] as const,
  catalog: ["academy", "catalog"] as const,
  progress: (userId: string | undefined) => ["academy", "progress", userId] as const,
  item: (userId: string | undefined, itemId: string) => ["academy", "item", userId, itemId] as const,
  resume: (userId: string | undefined, lessonId: string) => ["academy", "resume", userId, lessonId] as const,
  history: (userId: string | undefined, lessonId: string) => ["academy", "history", userId, lessonId] as const,
  notes: (userId: string | undefined, itemId: string) => ["academy", "notes", userId, itemId] as const,
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
 * - `["flashback"]`       Flashback: unlocked technical indicators (`flashbackKeys`)
 */
export const COMPLETION_DEPENDENT_ROOTS: readonly QueryKey[] = [
  ["shop"],
  ["bot"],
  ["practice"],
  ["strategy"],
  ["flashback"],
]

/**
 * After a graded submit (passed or not): resume and history of the item change. A pass also moves
 * progress, the item itself (state, reward), the next item (it may just have opened) and every query
 * root that depends on completions, coins or grants. Safe to call after a committed response only.
 */
export function invalidateAfterSubmit(
  queryClient: QueryClient,
  userId: string | undefined,
  itemId: string,
  result: Pick<SubmitResult, "passed" | "completion" | "next_item_id">,
): void {
  void queryClient.invalidateQueries({ queryKey: academyKeys.resume(userId, itemId) })
  void queryClient.invalidateQueries({ queryKey: academyKeys.history(userId, itemId) })
  void queryClient.invalidateQueries({ queryKey: academyKeys.item(userId, itemId) })
  if (!result.passed && !result.completion.completed) return
  void queryClient.invalidateQueries({ queryKey: academyKeys.progress(userId) })
  if (result.next_item_id) void queryClient.invalidateQueries({ queryKey: academyKeys.item(userId, result.next_item_id) })
  for (const queryKey of COMPLETION_DEPENDENT_ROOTS) void queryClient.invalidateQueries({ queryKey })
}

export function useAcademyCatalog() {
  const { isAuthenticated } = useAuth()
  return useQuery<CatalogResponse>({
    queryKey: academyKeys.catalog,
    queryFn: ({ signal }) => fetchCatalog(signal),
    enabled: isAuthenticated,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

export function useAcademyProgress() {
  const { user, isAuthenticated } = useAuth()
  return useQuery<ProgressResponse>({
    queryKey: academyKeys.progress(user?.id),
    queryFn: ({ signal }) => fetchProgress(signal),
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  })
}

export function useAcademyItem(lessonId: string | null) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<ItemResponse>({
    queryKey: academyKeys.item(user?.id, lessonId ?? ""),
    queryFn: ({ signal }) => fetchItem(lessonId as string, signal),
    enabled: isAuthenticated && !!lessonId,
    staleTime: 60_000,
    retry: false,
  })
}

/** Workpads, checklists and roleplay scores of the account for one item (only items with interactive blocks). */
export function useAcademyNotes(itemId: string, enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<NotesResponse>({
    queryKey: academyKeys.notes(user?.id, itemId),
    queryFn: ({ signal }) => fetchNotes(itemId, signal),
    enabled: isAuthenticated && enabled,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/** The learner's latest open attempt of a quiz lesson, if any (read only; never starts an attempt). */
export function useAcademyResume(lessonId: string | null, enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<ResumeResponse>({
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
  return useQuery<HistoryResponse>({
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
