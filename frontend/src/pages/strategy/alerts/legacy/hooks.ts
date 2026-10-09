import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { retryUnlessFinal } from "../../shared/errors"
import {
  createTelegramLink,
  deleteLegacyRule,
  fetchLegacyEvents,
  fetchLegacyRules,
  fetchTelegramStatus,
  setLegacyRuleEnabled,
  unlinkTelegram,
} from "./api"

const root = ["strategy", "alerts-legacy"] as const

/** Every legacy hook only runs once the "Cảnh báo cũ" section is opened (`enabled`). */
export function useLegacyRules(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: [...root, "rules", user?.id],
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => fetchLegacyRules(signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useLegacyEvents(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: [...root, "events", user?.id],
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => fetchLegacyEvents(signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useTelegramStatus(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: [...root, "telegram", user?.id],
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => fetchTelegramStatus(signal),
    staleTime: 10_000,
    retry: retryUnlessFinal,
  })
}

export function useSetLegacyRuleEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => setLegacyRuleEnabled(input.id, input.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: root }),
  })
}

export function useDeleteLegacyRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteLegacyRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: root }),
  })
}

export function useTelegramLink() {
  return useMutation({ mutationFn: () => createTelegramLink() })
}

export function useTelegramUnlink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unlinkTelegram(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: root }),
  })
}
