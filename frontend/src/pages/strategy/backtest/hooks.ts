import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { botKeys } from "@/pages/demo-trading/bot/api"
import { fetchTechnicalRegistry } from "@/pages/demo-trading/bot/config/api"

import { isFeatureDisabled, retryUnlessFinal } from "../shared/errors"
import {
  deleteStrategy,
  fetchIqxVersions,
  fetchRun,
  fetchRuns,
  fetchStoreMeta,
  fetchStrategies,
  fetchSymbolChart,
  fetchTrades,
  fetchUniverseOptions,
  fetchVersions,
  RUN_TIMEOUT_MS,
  runBacktest,
  type RunRequest,
  type RunView,
  type StrategySource,
} from "./api"

export const strategyKeys = {
  all: ["strategy", "v2"] as const,
  meta: (userId: string | undefined) => ["strategy", "v2", "store-meta", userId] as const,
  universes: (userId: string | undefined) => ["strategy", "v2", "universe-options", userId] as const,
  list: (userId: string | undefined) => ["strategy", "v2", "strategies", userId] as const,
  versions: (userId: string | undefined, id: string) => ["strategy", "v2", "versions", userId, id] as const,
  iqxVersions: (userId: string | undefined, id: string) => ["strategy", "v2", "iqx-versions", userId, id] as const,
  runs: (userId: string | undefined) => ["strategy", "v2", "runs", userId] as const,
  runList: (userId: string | undefined, source: string | null, id: string | null) => ["strategy", "v2", "runs", userId, source, id] as const,
  trades: (userId: string | undefined, runId: string, page: number) => ["strategy", "v2", "trades", userId, runId, page] as const,
  symbol: (userId: string | undefined, runId: string, symbol: string) => ["strategy", "v2", "symbol", userId, runId, symbol] as const,
}

export type Availability = "loading" | "ready" | "disabled" | "locked" | "error"

/** Indicator registry (with the per-user `learned` flag) shared with the Bot cache. */
export function useRegistry() {
  const { user, isAuthenticated } = useAuth()
  const query = useQuery({
    queryKey: botKeys.registry(user?.id),
    queryFn: ({ signal }) => fetchTechnicalRegistry(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const availability: Availability = query.error
    ? isFeatureDisabled(query.error)
      ? "disabled"
      : query.error instanceof ApiError && query.error.status === 403
        ? "locked"
        : "error"
    : query.data
      ? "ready"
      : "loading"
  return { query, availability, indicators: query.data?.indicators ?? [] }
}

export function useStoreMeta() {
  const { user, isPremium } = useAuth()
  return useQuery({ queryKey: strategyKeys.meta(user?.id), enabled: !!user && isPremium, queryFn: ({ signal }) => fetchStoreMeta(signal), staleTime: 5 * 60_000, retry: retryUnlessFinal })
}

export function useUniverseOptions(enabled = true) {
  const { user, isPremium } = useAuth()
  return useQuery({ queryKey: strategyKeys.universes(user?.id), enabled: enabled && !!user && isPremium, queryFn: ({ signal }) => fetchUniverseOptions(signal), staleTime: 60_000, retry: retryUnlessFinal })
}

export function useStrategies(enabled = true) {
  const { user, isPremium } = useAuth()
  return useQuery({ queryKey: strategyKeys.list(user?.id), enabled: enabled && !!user && isPremium, queryFn: ({ signal }) => fetchStrategies(signal), staleTime: 15_000, retry: retryUnlessFinal })
}

export function useVersions(id: string | null) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: strategyKeys.versions(user?.id, id ?? ""),
    enabled: !!id && !!user && isPremium,
    queryFn: ({ signal }) => fetchVersions(id as string, signal),
    staleTime: 15_000,
    retry: retryUnlessFinal,
  })
}

export function useIqxVersions(id: string | null) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: strategyKeys.iqxVersions(user?.id, id ?? ""),
    enabled: !!id && !!user && isPremium,
    queryFn: ({ signal }) => fetchIqxVersions(id as string, signal),
    staleTime: 60_000,
    retry: retryUnlessFinal,
  })
}

export function useRuns(filter: { source: StrategySource | "draft" | null; id: string | null } | null) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: strategyKeys.runList(user?.id, filter?.source ?? null, filter?.id ?? null),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => fetchRuns({ source: filter?.source ?? undefined, id: filter?.id, limit: 50 }, signal),
    staleTime: 10_000,
    retry: retryUnlessFinal,
  })
}

/** The closed trades of a stored run, one server page (20 rows, newest first) at a time. */
export function useTradesPage(runId: string | null, page: number) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: strategyKeys.trades(user?.id, runId ?? "", page),
    enabled: !!user && isPremium && !!runId,
    queryFn: ({ signal }) => fetchTrades(runId as string, page, signal),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: retryUnlessFinal,
  })
}

export function useSymbolChart(run: RunView, symbol: string) {
  const { user } = useAuth()
  return useQuery({ queryKey: strategyKeys.symbol(user?.id, run.run_id, symbol), queryFn: ({ signal }) => fetchSymbolChart(run, symbol, signal), staleTime: Infinity, retry: retryUnlessFinal })
}

/** Run once per click; the server stores the immutable run (every successful run is saved, §4.9). */
export function useRunBacktest(key: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationKey: ["strategy", "v2", "run", key, user?.id],
    mutationFn: (body: RunRequest) => runBacktest(body, AbortSignal.timeout(RUN_TIMEOUT_MS)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: strategyKeys.runs(user?.id) }),
  })
}

export function useOpenRun() {
  return useMutation({ mutationFn: (id: string) => fetchRun(id) })
}

export function useDeleteStrategy() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (id: string) => deleteStrategy(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: strategyKeys.list(user?.id) }),
  })
}

/** After a save: the list, the versions and the Bot (Lịch phiên changes at once, S07). */
export function useRefreshAfterSave() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return (strategyId: string | null) => {
    void queryClient.invalidateQueries({ queryKey: strategyKeys.list(user?.id) })
    if (strategyId) void queryClient.invalidateQueries({ queryKey: strategyKeys.versions(user?.id, strategyId) })
    void queryClient.invalidateQueries({ queryKey: strategyKeys.runs(user?.id) })
    void queryClient.invalidateQueries({ queryKey: ["bot"] })
  }
}
