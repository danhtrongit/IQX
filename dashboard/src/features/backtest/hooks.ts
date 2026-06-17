import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePremiumStatus } from "@/features/premium"
import { backtestApi } from "./api"
import { backtestKeys } from "./keys"
import type { RunRequest, StrategyConfig } from "./types"

/** Factor library + risk presets + templates (Premium endpoint). */
export function useCatalog() {
  const { isPremium } = usePremiumStatus()
  return useQuery({
    queryKey: backtestKeys.catalog,
    queryFn: backtestApi.getCatalog,
    enabled: isPremium,
    staleTime: 60 * 60_000,
  })
}

/** Lazy backtest run — a mutation triggered by the "Chạy backtest" button. */
export function useRunBacktest() {
  return useMutation({
    mutationFn: (req: RunRequest) => backtestApi.run(req),
  })
}

/** Saved strategies + CRUD. */
export function useStrategies() {
  const { isPremium } = usePremiumStatus()
  return useQuery({
    queryKey: backtestKeys.strategies,
    queryFn: backtestApi.listStrategies,
    enabled: isPremium,
    staleTime: 60_000,
  })
}

export function useSaveStrategy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; symbol?: string | null; config: StrategyConfig }) =>
      backtestApi.createStrategy(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: backtestKeys.strategies }),
  })
}

export function useDeleteStrategy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => backtestApi.deleteStrategy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: backtestKeys.strategies }),
  })
}
