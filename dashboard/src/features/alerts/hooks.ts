import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePremiumStatus } from "@/features/premium"
import { alertsApi } from "./api"
import type { Combination, CreateRuleBody } from "./types"

const keys = {
  signals: ["alerts", "signals"] as const,
  rules: ["alerts", "rules"] as const,
  events: ["alerts", "events"] as const,
  telegram: ["alerts", "telegram"] as const,
}

export function useSignals() {
  const { isPremium } = usePremiumStatus()
  return useQuery({ queryKey: keys.signals, queryFn: alertsApi.getSignals, enabled: isPremium, staleTime: 60 * 60_000 })
}

export function useRules() {
  const { isPremium } = usePremiumStatus()
  return useQuery({ queryKey: keys.rules, queryFn: alertsApi.getRules, enabled: isPremium, staleTime: 30_000 })
}

export function useEvents() {
  const { isPremium } = usePremiumStatus()
  return useQuery({ queryKey: keys.events, queryFn: alertsApi.getEvents, enabled: isPremium, staleTime: 30_000 })
}

export function useTelegramStatus() {
  const { isPremium } = usePremiumStatus()
  return useQuery({
    queryKey: keys.telegram,
    queryFn: alertsApi.telegramStatus,
    enabled: isPremium,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
}

export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRuleBody) => alertsApi.createRule(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
  })
}

export function useUpdateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; combination?: Combination; is_enabled?: boolean } }) =>
      alertsApi.updateRule(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => alertsApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
  })
}

export function useTelegramLink() {
  return useMutation({ mutationFn: () => alertsApi.telegramLink() })
}

export function useTelegramUnlink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => alertsApi.telegramUnlink(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.telegram }),
  })
}
