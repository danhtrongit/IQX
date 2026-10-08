import { useCallback, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"

import {
  applyUniverseList,
  botKeys,
  cancelUniversePending,
  fetchSavedLists,
  fetchUniverse,
  invalidSymbolsOf,
  isApiError,
  messageOf,
  newIdempotencyKey,
  revertUniverseToVn30,
} from "../api"
import type { InvalidSymbol, SavedList, UniverseMutationResult, UniverseState } from "../types"

export function useBotUniverse() {
  const { user, isAuthenticated } = useAuth()
  return useQuery<UniverseState>({
    queryKey: botKeys.universe(user?.id),
    queryFn: ({ signal }) => fetchUniverse(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 15_000,
  })
}

export function useSavedLists(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery<SavedList[]>({
    queryKey: botKeys.lists(user?.id),
    queryFn: ({ signal }) => fetchSavedLists(signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 0,
  })
}

export type UniverseOutcome =
  | { ok: true; state: UniverseState; request: UniverseMutationResult["request"] }
  | {
      ok: false
      reason: "conflict" | "invalid_symbols" | "locked" | "not_found" | "already" | "error"
      message: string
      invalid: InvalidSymbol[]
    }

const CONFLICT_COPY = "Nguồn mua đã được thay đổi ở nơi khác. Đã tải lại bản mới nhất; hãy kiểm tra rồi thao tác lại."

function failure(
  reason: Extract<UniverseOutcome, { ok: false }>["reason"],
  message: string,
  invalid: InvalidSymbol[] = [],
): UniverseOutcome {
  return { ok: false, reason, message, invalid }
}

export type UniverseActions = {
  busy: boolean
  apply: (listId: string, symbols: readonly string[]) => Promise<UniverseOutcome>
  revertToVn30: () => Promise<UniverseOutcome>
  cancelPending: () => Promise<UniverseOutcome>
}

/**
 * The three writes of the buy source. Each sends the revision token of the state the
 * user is looking at, so a change made elsewhere answers 409 and nothing is overwritten.
 * A 409/422 never auto-retries: the state is refetched and the user decides again.
 */
export function useUniverseActions(): UniverseActions {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const run = useCallback(
    async (
      fingerprintOf: (revision: number) => string,
      call: (revision: number, key: string) => Promise<UniverseMutationResult>,
    ): Promise<UniverseOutcome> => {
      const universeKey = botKeys.universe(userId)
      const current = queryClient.getQueryData<UniverseState>(universeKey)
      if (!current) return failure("error", "Chưa tải được nguồn mua hiện tại. Vui lòng thử lại.")
      const fingerprint = fingerprintOf(current.revision)
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() }
      setBusy(true)
      try {
        const result = await call(current.revision, attempt.current.key)
        attempt.current = null
        queryClient.setQueryData<UniverseState>(universeKey, result.state)
        void queryClient.invalidateQueries({ queryKey: botKeys.overview(userId) })
        void queryClient.invalidateQueries({ queryKey: botKeys.positions(userId) })
        return { ok: true, state: result.state, request: result.request }
      } catch (error) {
        const refetch = () => void queryClient.invalidateQueries({ queryKey: universeKey })
        if (isApiError(error, 409)) {
          attempt.current = null
          refetch()
          if (error.code === "ALREADY_VN30") return failure("already", error.message)
          if (error.code === "PENDING_ALREADY_EFFECTIVE") return failure("already", error.message)
          if (error.code === "REVISION_CONFLICT") return failure("conflict", CONFLICT_COPY)
          return failure("error", messageOf(error))
        }
        if (isApiError(error, 422, "UNIVERSE_SYMBOLS_INVALID")) {
          attempt.current = null
          return failure("invalid_symbols", error.message, invalidSymbolsOf(error))
        }
        if (isApiError(error, 403)) {
          attempt.current = null
          return failure("locked", messageOf(error, "Bạn chưa mở chỉ tiêu cần thiết để áp dụng danh mục này."))
        }
        if (isApiError(error, 404, "LIST_NOT_FOUND")) {
          attempt.current = null
          void queryClient.invalidateQueries({ queryKey: botKeys.lists(userId) })
          return failure("not_found", error.message)
        }
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) attempt.current = null
        return failure("error", messageOf(error))
      } finally {
        setBusy(false)
      }
    },
    [queryClient, userId],
  )

  const apply = useCallback(
    (listId: string, symbols: readonly string[]) => {
      const selected = [...new Set(symbols)].sort()
      return run(
        (revision) => JSON.stringify(["apply", listId, selected, revision]),
        (revision, key) =>
          applyUniverseList({ list_id: listId, symbols: [...symbols], expected_revision: revision, idempotency_key: key }),
      )
    },
    [run],
  )
  const revertToVn30 = useCallback(
    () =>
      run(
        (revision) => JSON.stringify(["vn30", revision]),
        (revision, key) => revertUniverseToVn30({ expected_revision: revision, idempotency_key: key }),
      ),
    [run],
  )
  const cancelPending = useCallback(
    () =>
      run(
        (revision) => JSON.stringify(["cancel", revision]),
        (revision) => cancelUniversePending({ expected_revision: revision }),
      ),
    [run],
  )

  return { busy, apply, revertToVn30, cancelPending }
}
