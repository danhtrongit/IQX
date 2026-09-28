/**
 * React Query hooks cho trang Chiến lược (`/chien-luoc`).
 *
 * - Khoá dữ liệu nằm trong namespace `strategy` và dữ liệu RIÊNG TƯ (chiến lược
 *   đã lưu, cảnh báo, sự kiện, Telegram) khoá theo `user.id`, nên không rò rỉ
 *   giữa các tài khoản dù cache có sống qua lần đăng nhập khác.
 * - Mọi endpoint đều premium-gated ở server, nên hook chỉ chạy khi `isPremium`;
 *   gói hết hạn giữa phiên sẽ trả 403 và UI báo đúng lỗi đó.
 * - Mutation của cảnh báo invalidate tiền tố `rules`; chiến lược invalidate
 *   tiền tố `strategies`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import {
  createRule,
  createStrategy,
  createTelegramLink,
  deleteRule,
  deleteStrategy,
  fetchCatalog,
  fetchEvents,
  fetchRules,
  fetchSignals,
  fetchStrategies,
  fetchTelegramStatus,
  runBacktest,
  unlinkTelegram,
  updateRule,
} from "./api"
import type {
  AlertEvent,
  AlertSignal,
  Catalog,
  CreateRuleBody,
  RunRequest,
  SavedStrategy,
  StrategyConfig,
  TelegramStatus,
  UpdateRuleBody,
  UserAlertRule,
} from "./types"

export const strategyKeys = {
  all: ["strategy"] as const,
  catalog: ["strategy", "backtest", "catalog"] as const,
  strategies: (userId?: string) => ["strategy", "backtest", "strategies", userId] as const,
  signals: ["strategy", "alerts", "signals"] as const,
  rules: (userId?: string) => ["strategy", "alerts", "rules", userId] as const,
  events: (userId?: string) => ["strategy", "alerts", "events", userId] as const,
  telegram: (userId?: string) => ["strategy", "alerts", "telegram", userId] as const,
}

/* ── Backtest ────────────────────────────────────────────────────────────── */

/** Thư viện chỉ tiêu + mẫu + preset rủi ro — dữ liệu tham chiếu, cache 1 giờ. */
export function useBacktestCatalog() {
  const { isPremium } = useAuth()
  return useQuery<Catalog>({
    queryKey: strategyKeys.catalog,
    enabled: isPremium,
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: 60 * 60_000,
  })
}

/** Chạy backtest — mutation theo nút "Chạy backtest", không tự chạy lại. */
export function useRunBacktest() {
  const { user } = useAuth()
  return useMutation({
    mutationKey: ["strategy", "backtest", "run", user?.id],
    mutationFn: (request: RunRequest) => runBacktest(request),
  })
}

export function useSavedStrategies() {
  const { user, isPremium } = useAuth()
  return useQuery<SavedStrategy[]>({
    queryKey: strategyKeys.strategies(user?.id),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => fetchStrategies(signal),
    staleTime: 60_000,
  })
}

export function useSaveStrategy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; symbol?: string | null; config: StrategyConfig }) =>
      createStrategy(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy", "backtest"] }),
  })
}

export function useDeleteStrategy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteStrategy(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy", "backtest"] }),
  })
}

/* ── Cảnh báo ────────────────────────────────────────────────────────────── */

export function useAlertSignals() {
  const { isPremium } = useAuth()
  return useQuery<AlertSignal[]>({
    queryKey: strategyKeys.signals,
    enabled: isPremium,
    queryFn: ({ signal }) => fetchSignals(signal),
    staleTime: 60 * 60_000,
  })
}

export function useAlertRules() {
  const { user, isPremium } = useAuth()
  return useQuery<UserAlertRule[]>({
    queryKey: strategyKeys.rules(user?.id),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => fetchRules(signal),
    staleTime: 30_000,
  })
}

export function useAlertEvents() {
  const { user, isPremium } = useAuth()
  return useQuery<AlertEvent[]>({
    queryKey: strategyKeys.events(user?.id),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => fetchEvents(signal),
    staleTime: 30_000,
  })
}

export function useTelegramStatus() {
  const { user, isPremium } = useAuth()
  return useQuery<TelegramStatus>({
    queryKey: strategyKeys.telegram(user?.id),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => fetchTelegramStatus(signal),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRuleBody) => createRule(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy", "alerts"] }),
  })
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { id: string } & UpdateRuleBody) =>
      updateRule(body.id, {
        name: body.name,
        combination: body.combination,
        isEnabled: body.isEnabled,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy", "alerts"] }),
  })
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy", "alerts"] }),
  })
}

export function useTelegramLink() {
  return useMutation({ mutationFn: () => createTelegramLink() })
}

export function useTelegramUnlink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unlinkTelegram(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy", "alerts"] }),
  })
}
