import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { retryUnlessFinal } from "../shared/errors"
import { backtestKeys, getRun, getTrades, listRuns, RUN_TIMEOUT_MS, runBacktest, type RunRequest, type TradesPage } from "./api"

export function useRuns(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: backtestKeys.runs(user?.id),
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => listRuns(50, signal),
    staleTime: 15_000,
    retry: retryUnlessFinal,
  })
}

/** The full trade history, one server page at a time (a stored run never changes). */
export function useTradesPage(runId: string | null, page: number, seed?: TradesPage) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: backtestKeys.trades(user?.id, runId ?? "", page),
    enabled: !!user && isPremium && !!runId,
    queryFn: ({ signal }) => getTrades(runId as string, page, signal),
    placeholderData: keepPreviousData,
    // The run already carries its first page, so opening a run costs no extra request.
    ...(page === 0 && seed ? { initialData: seed } : {}),
    staleTime: Infinity,
    retry: retryUnlessFinal,
  })
}

/** Run once per click; the server stores the immutable run. Never re-runs by itself. */
export function useRunBacktest() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationKey: ["strategy", "backtest", "run", user?.id],
    mutationFn: (body: RunRequest) => runBacktest(body, AbortSignal.timeout(RUN_TIMEOUT_MS)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backtestKeys.runs(user?.id) }),
  })
}

export function useOpenRun() {
  return useMutation({ mutationFn: (id: string) => getRun(id) })
}
