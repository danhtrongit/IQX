/**
 * Queries of the Backtest v2 screen. Keys are scoped by user so a logout /
 * account switch never shows another account's saved revision.
 */
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { getSharedConfig, getTechnicalRegistry } from "@/lib/shared-config"

import { listBacktestRuns } from "./api"

export const backtestV2Keys = {
  sharedConfigAll: ["strategy", "v2", "shared-config"] as const,
  runsAll: ["strategy", "v2", "backtests"] as const,
  sharedConfig: (userId: string | null) => ["strategy", "v2", "shared-config", userId] as const,
  registry: (userId: string | null) => ["strategy", "v2", "registry", userId] as const,
  runs: (userId: string | null) => ["strategy", "v2", "backtests", userId] as const,
}

function useUserId(): string | null {
  const { user } = useAuth()
  return user?.id ?? null
}

export function useSharedConfigQuery() {
  const userId = useUserId()
  return useQuery({
    queryKey: backtestV2Keys.sharedConfig(userId),
    queryFn: ({ signal }) => getSharedConfig(signal),
    retry: false,
    staleTime: 30_000,
  })
}

export function useTechnicalRegistryQuery() {
  const userId = useUserId()
  return useQuery({
    queryKey: backtestV2Keys.registry(userId),
    queryFn: ({ signal }) => getTechnicalRegistry(signal),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useBacktestRunsQuery() {
  const userId = useUserId()
  return useQuery({
    queryKey: backtestV2Keys.runs(userId),
    queryFn: ({ signal }) => listBacktestRuns(20, signal),
    retry: false,
    staleTime: 30_000,
  })
}
