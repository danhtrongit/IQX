/**
 * React Query hooks for Học viện.
 *
 * Curriculum/lesson/progress are private per account → query keys include
 * `user.id`. The shared Buy/Sell config controller treats 404 FEATURE_DISABLED
 * (BOT_SHARED_CONFIG / STRATEGY_V2 off) as "hide config controls"; the academy
 * itself keeps working.
 */
import { useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import {
  getSharedConfig,
  getTechnicalRegistry,
  isFeatureDisabled,
  isRevisionConflict,
  newIdempotencyKey,
  saveSharedConfig,
  type IndicatorConfig,
  type SaveSharedConfigResult,
  type SharedConfigState,
  type TechnicalRegistry,
} from "@/lib/shared-config"

import { getCurriculum, getLesson, type Curriculum, type LessonDetail } from "./api"
import { configFieldErrors, type ConfigFieldError } from "./config-draft"

export const academyKeys = {
  all: ["academy"] as const,
  curriculum: (userId: string | null) => ["academy", "curriculum", userId ?? "anonymous"] as const,
  lesson: (userId: string | null, lessonId: string) => ["academy", "lesson", userId ?? "anonymous", lessonId] as const,
  sharedConfig: (userId: string | null) => ["academy", "shared-config", userId ?? "anonymous"] as const,
  registry: (userId: string | null) => ["academy", "technical-registry", userId ?? "anonymous"] as const,
} as const

export function useCurriculum() {
  const { user, isAuthenticated } = useAuth()
  return useQuery<Curriculum>({
    queryKey: academyKeys.curriculum(user?.id ?? null),
    queryFn: ({ signal }) => getCurriculum(undefined, signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  })
}

export function useLesson(lessonId: string | undefined) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<LessonDetail>({
    queryKey: academyKeys.lesson(user?.id ?? null, lessonId ?? ""),
    queryFn: ({ signal }) => getLesson(lessonId as string, signal),
    enabled: isAuthenticated && !!lessonId,
    retry: false,
    staleTime: 60_000,
  })
}

/** Refresh progress/grant-dependent data after a quiz submit. */
export function useInvalidateAcademyProgress() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: academyKeys.all })
  }, [queryClient])
}

export type ConfigAvailability = "loading" | "ready" | "disabled" | "premium_required" | "error"

export type SaveIndicatorOutcome =
  | { ok: true; result: SaveSharedConfigResult }
  | { ok: false; reason: "conflict"; currentRevision: number | null; message: string }
  | { ok: false; reason: "invalid"; errors: ConfigFieldError[]; message: string }
  | { ok: false; reason: "locked" | "error"; message: string }

export type AcademyConfigController = {
  availability: ConfigAvailability
  state: SharedConfigState | undefined
  registry: TechnicalRegistry | undefined
  errorMessage: string | null
  saving: boolean
  saveIndicator: (indicatorId: string, config: IndicatorConfig) => Promise<SaveIndicatorOutcome>
  reload: () => Promise<SharedConfigState | undefined>
}

function availabilityOf(error: unknown): ConfigAvailability {
  if (isFeatureDisabled(error)) return "disabled"
  if (error instanceof ApiError && error.status === 403) return "premium_required"
  return "error"
}

function currentRevisionOf(error: ApiError): number | null {
  const details = error.details
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const value = (details as { current_revision?: unknown }).current_revision
    if (typeof value === "number") return value
  }
  if (Array.isArray(details)) {
    for (const item of details) {
      const value = item && typeof item === "object" ? (item as { current_revision?: unknown }).current_revision : undefined
      if (typeof value === "number") return value
    }
  }
  return null
}

function saveOutcome(error: unknown): SaveIndicatorOutcome {
  if (isRevisionConflict(error)) {
    return {
      ok: false,
      reason: "conflict",
      currentRevision: currentRevisionOf(error as ApiError),
      message: "Cấu hình đã được lưu ở tab hoặc thiết bị khác.",
    }
  }
  if (error instanceof ApiError && error.status === 403 && error.code === "CAPABILITY_LOCKED") {
    return { ok: false, reason: "locked", message: "Hoàn thành bài kiểm tra 8/8 của chỉ báo này để bật." }
  }
  if (error instanceof ApiError && (error.status === 422 || error.status === 400)) {
    return { ok: false, reason: "invalid", errors: configFieldErrors(error), message: errorMessage(error) }
  }
  return { ok: false, reason: "error", message: errorMessage(error) }
}

/** Shared config + technical registry for the academy sidebar and config panel. */
export function useAcademyConfig(): AcademyConfigController {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const configQuery = useQuery<SharedConfigState>({
    queryKey: academyKeys.sharedConfig(userId),
    queryFn: ({ signal }) => getSharedConfig(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 15_000,
  })
  const registryQuery = useQuery<TechnicalRegistry>({
    queryKey: academyKeys.registry(userId),
    queryFn: ({ signal }) => getTechnicalRegistry(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 60_000,
  })
  const mutation = useMutation({
    mutationFn: (body: { expected_revision: number; indicators: Record<string, IndicatorConfig> }) =>
      saveSharedConfig({ ...body, idempotency_key: newIdempotencyKey() }),
  })

  const failure = configQuery.error ?? registryQuery.error
  const availability: ConfigAvailability = failure
    ? availabilityOf(failure)
    : configQuery.data && registryQuery.data ? "ready" : "loading"
  const state = configQuery.data
  const mutateAsync = mutation.mutateAsync

  const saveIndicator = useCallback(async (indicatorId: string, config: IndicatorConfig): Promise<SaveIndicatorOutcome> => {
    const key = academyKeys.sharedConfig(userId)
    const latest = queryClient.getQueryData<SharedConfigState>(key)
    if (!latest) return { ok: false, reason: "error", message: "Chưa tải được cấu hình đã lưu." }
    try {
      const result = await mutateAsync({ expected_revision: latest.saved_revision, indicators: { [indicatorId]: config } })
      queryClient.setQueryData<SharedConfigState>(key, previous => previous && {
        ...previous,
        saved_revision: result.revision,
        config: result.config,
        config_hash: result.config_hash,
        effective_session: result.effective_session,
        status: result.status,
      })
      void queryClient.invalidateQueries({ queryKey: key })
      return { ok: true, result }
    } catch (error) {
      return saveOutcome(error)
    }
  }, [mutateAsync, queryClient, userId])

  const refetchConfig = configQuery.refetch
  const reload = useCallback(async () => (await refetchConfig()).data, [refetchConfig])

  return {
    availability,
    state,
    registry: registryQuery.data,
    errorMessage: failure && availability === "error" ? errorMessage(failure) : null,
    saving: mutation.isPending,
    saveIndicator,
    reload,
  }
}
