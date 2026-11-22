/**
 * Bot v2.0 reads (spec Bot và Chiến lược v2.0 §5, PLAN §6.2): the strategies the Bot can pick and
 * the v2 fields of positions, closed trades and journal sessions.
 *
 * hand-typed per PLAN §6; switch to generated types after contracts regen.
 *
 * The schedule (Lịch phiên) and its writes live in `pages/strategy/shared/bot-schedule.ts`
 * because the Backtest uses them too.
 */
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"

import { botKeys } from "./api"
import { fetchTechnicalRegistry } from "./config/api"
import type { BotPosition, BotSession, BotTrade } from "./types"

export type IqxStrategyOption = {
  id: string
  slug: string
  name: string
  version: number
  universe_label: string
  max_holding: number
  /** Hidden by the admin; listed only while the last or next session uses it (no Dùng). */
  hidden: boolean
  on_bot: { last: boolean; next: boolean }
}

export type MyStrategyOption = {
  id: string
  name: string
  latest_version: number
  latest_saved_at: string
  on_bot: { last: boolean; next: boolean }
}

export type StrategyOptions = { iqx: IqxStrategyOption[]; mine: MyStrategyOption[] }

export function fetchStrategyOptions(signal?: AbortSignal): Promise<StrategyOptions> {
  return api<StrategyOptions>("/bot/strategy-options", { signal })
}

export const botV2Keys = {
  strategyOptions: (userId: string | undefined) => ["bot", "strategy-options", userId] as const,
}

export function useStrategyOptions() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: botV2Keys.strategyOptions(user?.id),
    queryFn: ({ signal }) => fetchStrategyOptions(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 15_000,
  })
}

/** Indicator names for "Xem khác biệt"; the diff falls back to row ids when this read fails. */
export function useIndicatorRegistry(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: botKeys.registry(user?.id),
    queryFn: ({ signal }) => fetchTechnicalRegistry(signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/* ── v2 fields of the existing reads ────────────────────────────────────── */

export type SellState = "t2_wait" | "sellable" | "due" | "due_unfilled"

/** `GET /bot/positions` item with the §6.2 fields (all optional until the server sends them). */
export type BotPositionV2 = BotPosition & {
  entry_session?: string | null
  anchor_session?: string | null
  anchor_reason?: "entry" | "policy_cutover" | null
  sellable_from_session?: string | null
  /** Sessions counted from the anchor (for the due date). */
  counted?: number | null
  /** Sessions really held since entry ("Thực giữ"). */
  held?: number | null
  max_holding?: number | null
  due_session?: string | null
  sell_state?: SellState | null
  /** Reason of `due_unfilled` (e.g. `Tạm ngừng giao dịch`). */
  sell_state_detail?: string | null
  entry_universe_label?: string | null
}

export type ExitReason = "indicator" | "max_holding" | "legacy"

/** `GET /bot/trades` item with the §6.2 fields. */
export type BotTradeV2 = BotTrade & {
  exit_reason?: ExitReason | null
  exit_reasons?: ExitReason[] | null
  max_holding_at_exit?: number | null
  strategy_label?: string | null
  version_label?: string | null
}

export type SessionCounters = {
  buys?: number
  sells?: number
  skipped_buys?: number
  time_exits?: number
  t2_blocked?: number
  due_unfilled?: number
  universe_empty?: boolean
}

/** `GET /bot/journal/sessions` item with the §6.2 fields. */
export type BotSessionV2 = BotSession & {
  strategy_label?: string | null
  version_label?: string | null
  universe_label?: string | null
  universe_count?: number | null
  summary?: string | null
  counters?: SessionCounters | null
}
