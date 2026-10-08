import { useCallback, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"

import { botKeys, messageOf } from "../api"
import {
  fetchSharedConfig,
  fetchTechnicalRegistry,
  isFeatureDisabled,
  newIdempotencyKey,
  patchSharedConfig,
  saveOutcomeFromError,
  type SaveOutcome,
} from "./api"
import type { IndicatorConfig, SharedConfigState, TechnicalIndicator, TechnicalRegistry } from "./types"

export type ConfigAvailability = "loading" | "ready" | "disabled" | "locked" | "error"

export type BotConfigController = {
  availability: ConfigAvailability
  errorMessage: string | null
  state: SharedConfigState | undefined
  registry: TechnicalRegistry | undefined
  /** Indicators in registry order. */
  indicators: TechnicalIndicator[]
  /** Indicator ids the user has learned (quiz 8/8). */
  granted: ReadonlySet<string>
  saving: boolean
  /**
   * Saves one indicator. `expectedRevision` is the revision the caller's draft was based on
   * (the newest cached one when omitted); a newer saved revision answers 409.
   */
  save: (indicatorId: string, config: IndicatorConfig, expectedRevision?: number) => Promise<SaveOutcome>
  /** Re-reads the saved config (used after a 409). Resolves with the newest state. */
  reload: () => Promise<SharedConfigState | undefined>
  retry: () => void
}

function availabilityOf(error: unknown): ConfigAvailability {
  if (isFeatureDisabled(error)) return "disabled"
  if (error instanceof ApiError && error.status === 403) return "locked"
  return "error"
}

/**
 * Registry + saved shared config of the signed-in account, and the one write that
 * changes it. A save sends only the edited indicator with `expected_revision` and an
 * idempotency key; a retry of the very same payload after a transport failure reuses
 * its key so the server cannot apply it twice.
 */
export function useBotConfig(): BotConfigController {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const stateKey = useMemo(() => botKeys.sharedConfig(userId), [userId])

  const stateQuery = useQuery<SharedConfigState>({
    queryKey: stateKey,
    queryFn: ({ signal }) => fetchSharedConfig(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 15_000,
  })
  const registryQuery = useQuery<TechnicalRegistry>({
    queryKey: botKeys.registry(userId),
    queryFn: ({ signal }) => fetchTechnicalRegistry(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const mutation = useMutation({
    mutationFn: (body: { expected_revision: number; idempotency_key: string; indicators: Record<string, IndicatorConfig> }) =>
      patchSharedConfig(body),
  })
  const { mutateAsync } = mutation

  const save = useCallback(
    async (indicatorId: string, config: IndicatorConfig, expectedRevision?: number): Promise<SaveOutcome> => {
      const latest = queryClient.getQueryData<SharedConfigState>(stateKey)
      if (!latest) return { ok: false, reason: "error", message: "Chưa tải được cấu hình đã lưu.", errors: [], retryable: false }
      const expected = expectedRevision ?? latest.saved_revision
      const fingerprint = JSON.stringify([expected, indicatorId, config])
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() }
      try {
        const result = await mutateAsync({
          expected_revision: expected,
          idempotency_key: attempt.current.key,
          indicators: { [indicatorId]: config },
        })
        attempt.current = null
        queryClient.setQueryData<SharedConfigState>(stateKey, (previous) =>
          previous && {
            ...previous,
            saved_revision: result.revision,
            config: result.config,
            config_hash: result.config_hash,
            effective_session: result.effective_session,
            status: result.status,
          },
        )
        void queryClient.invalidateQueries({ queryKey: stateKey })
        void queryClient.invalidateQueries({ queryKey: botKeys.overview(userId) })
        return { ok: true, result }
      } catch (error) {
        const outcome = saveOutcomeFromError(error)
        if (!outcome.ok && !outcome.retryable) attempt.current = null
        if (!outcome.ok && outcome.reason === "conflict") void queryClient.invalidateQueries({ queryKey: stateKey })
        return outcome
      }
    },
    [mutateAsync, queryClient, stateKey, userId],
  )

  const refetch = stateQuery.refetch
  const reload = useCallback(async () => (await refetch()).data, [refetch])
  const refetchRegistry = registryQuery.refetch
  const retry = useCallback(() => {
    void refetch()
    void refetchRegistry()
  }, [refetch, refetchRegistry])

  const failure = stateQuery.error ?? registryQuery.error
  const availability: ConfigAvailability = failure
    ? availabilityOf(failure)
    : stateQuery.data && registryQuery.data
      ? "ready"
      : "loading"

  const granted = useMemo<ReadonlySet<string>>(() => {
    const ids = new Set<string>(stateQuery.data?.granted_indicators ?? [])
    for (const indicator of registryQuery.data?.indicators ?? []) if (indicator.learned) ids.add(indicator.id)
    return ids
  }, [stateQuery.data, registryQuery.data])

  return {
    availability,
    errorMessage: failure && availability === "error" ? messageOf(failure) : null,
    state: stateQuery.data,
    registry: registryQuery.data,
    indicators: registryQuery.data?.indicators ?? [],
    granted,
    saving: mutation.isPending,
    save,
    reload,
    retry,
  }
}
