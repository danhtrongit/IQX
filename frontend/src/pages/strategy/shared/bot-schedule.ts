/**
 * Lịch phiên of the Bot (spec Bot và Chiến lược v2.0 §5.3, §6; PLAN §6.2): which strategy and
 * version the last session ran and the next session will run, the due-position impact of a
 * change (§6.5) and the three writes that only ever touch the unlocked next-session row.
 *
 * hand-typed per PLAN §6; switch to generated types after contracts regen.
 *
 * Shared by the Bot panel (Dùng, Giữ như phiên gần nhất, Cập nhật IQX) and the Backtest
 * (Dùng chiến lược này cho Bot, Lưu và áp dụng phiên tới).
 */
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api, ApiError } from "@/lib/api"

import { errorDetails } from "./errors"
import type { StrategyContent } from "./strategy-diff"

export type StrategySource = "iqx" | "user"

/** A schedule row with a strategy. `version_label`: `bản 08/11 13:47` (mine) or `v3` (IQX). */
export type ScheduleStrategy = {
  session_date: string
  source: StrategySource
  id: string
  name: string
  version: number
  version_label: string
  /** IQX strategy hidden by the admin: it keeps running, without Dùng (§7.2, Q15). */
  hidden: boolean
  content: StrategyContent
}

/** A schedule row without a strategy (Chưa chọn chiến lược, §5.6). */
export type ScheduleEmpty = { session_date: string; source: null }

export type ScheduleEntry = ScheduleStrategy | ScheduleEmpty

export type NextScheduleEntry = ScheduleEntry & {
  /** Mine: the latest version at the cutoff (§6.1). False after "Giữ như phiên gần nhất" or for IQX. */
  follow_latest: boolean
  /** ISO time after which this row is locked and the next session moves on (§6.4). */
  cutoff_at: string | null
}

export type BotSchedule = {
  /** `null` before the Bot ran any session. */
  last: ScheduleEntry | null
  next: NextScheduleEntry
  /** The IQX strategy of the next session has a newer published version (§5.3). */
  iqx_update: { latest_version: number; content: StrategyContent } | null
}

/** A position that becomes due at the next session because Giữ tối đa drops (§6.5). */
export type DuePosition = { symbol: string; counted: number; sell_session: string }

export type ScheduleImpact = { next_session: string; n_current: number; n_new: number; positions: DuePosition[] }

/** What the next session should run: mine follows its latest version, IQX pins `version`. */
export type ScheduleTarget = { source: StrategySource; id: string; version?: number }

/** The race guards every schedule write sends (§6.4, §6.5). */
export type ScheduleGuard = { expected_next_session: string; confirm_due_positions?: string[] }

export const SCHEDULE_ERRORS = {
  locked: "SCHEDULE_SESSION_LOCKED",
  hidden: "IQX_TEMPLATE_HIDDEN",
  dueChanged: "DUE_POSITIONS_CHANGED",
  dueRequired: "DUE_CONFIRM_REQUIRED",
  notFound: "STRATEGY_NOT_FOUND",
} as const

/* ── Wire ───────────────────────────────────────────────────────────────── */

const json = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) })

export function fetchBotSchedule(signal?: AbortSignal): Promise<BotSchedule> {
  return api<BotSchedule>("/bot/schedule", { signal })
}

export function fetchScheduleImpact(target: ScheduleTarget, signal?: AbortSignal): Promise<ScheduleImpact> {
  const query = new URLSearchParams({ source: target.source, id: target.id })
  if (target.version !== undefined) query.set("version", String(target.version))
  return api<ScheduleImpact>(`/bot/schedule/next/impact?${query}`, { signal })
}

/** `PUT /bot/schedule/next`: the next session runs `target` (mine: `follow_latest`, IQX: pinned). */
export function putScheduleNext(target: ScheduleTarget, guard: ScheduleGuard): Promise<BotSchedule> {
  return api<BotSchedule>("/bot/schedule/next", json({ ...target, ...guard }))
}

/** `POST /bot/schedule/next/keep-last`: the next session copies the last one, version pinned. */
export function keepLastSchedule(guard: ScheduleGuard): Promise<BotSchedule> {
  return api<BotSchedule>("/bot/schedule/next/keep-last", { method: "POST", body: JSON.stringify(guard) })
}

export const scheduleKeys = {
  schedule: (userId: string | undefined) => ["bot", "schedule", userId] as const,
  impact: (userId: string | undefined, target: ScheduleTarget | null, nextSession: string | undefined) =>
    ["bot", "schedule", userId, "impact", target?.source ?? null, target?.id ?? null, target?.version ?? null, nextSession ?? null] as const,
  /** Every Bot read a schedule write can change (schedule, strategy lists, version tags). */
  affected: [["bot"], ["strategy", "strategies"], ["strategy", "iqx-templates"]] as const,
}

/** The Bot schedule of the signed-in account. */
export function useBotSchedule(enabled = true) {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: scheduleKeys.schedule(user?.id),
    queryFn: ({ signal }) => fetchBotSchedule(signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 15_000,
  })
}

/** Positions that would be due at the next session if `target` ran it (empty when Giữ tối đa does not drop). */
export function useScheduleImpact(target: ScheduleTarget | null, nextSession: string | undefined) {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: scheduleKeys.impact(user?.id, target, nextSession),
    queryFn: ({ signal }) => fetchScheduleImpact(target as ScheduleTarget, signal),
    enabled: isAuthenticated && target !== null,
    retry: false,
    staleTime: 0,
  })
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

export const hasStrategy = (entry: ScheduleEntry | null | undefined): entry is ScheduleStrategy => !!entry && entry.source !== null

/** Same strategy (source and id), any version. */
export function sameStrategy(a: { source: StrategySource | null; id?: string } | null | undefined, b: { source: StrategySource | null; id?: string } | null | undefined): boolean {
  return !!a && !!b && a.source !== null && a.source === b.source && a.id === b.id
}

/** Same strategy and same version: the next session changes nothing (`không đổi`). */
export function sameScheduled(a: ScheduleEntry | null | undefined, b: ScheduleEntry | null | undefined): boolean {
  if (!hasStrategy(a) && !hasStrategy(b)) return true
  return hasStrategy(a) && hasStrategy(b) && sameStrategy(a, b) && a.version === b.version
}

const WEEKDAY = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]

/** `2026-11-09` → `Thứ 2 09/11` (a session date, no time zone shift). */
export function sessionLabel(date: string | null | undefined): string {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null
  if (!match) return "—"
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
  return `${WEEKDAY[day]} ${match[3]}/${match[2]}`
}

/** `2026-11-09` → `09/11`. */
export function dayMonth(date: string | null | undefined): string {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null
  return match ? `${match[3]}/${match[2]}` : "—"
}

/** `{IQX} {tên} · {bản}` without the badge: `RSI + SMA20 · bản 05/11 20:02`, `Theo xu hướng · v2`. */
export function scheduledName(entry: ScheduleStrategy): string {
  return `${entry.name} · ${entry.version_label}`
}

/** `next_session` of a 409 `SCHEDULE_SESSION_LOCKED` (the session the change now applies from). */
export function lockedNextSession(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== SCHEDULE_ERRORS.locked) return null
  for (const item of errorDetails(error)) if (typeof item.next_session === "string") return item.next_session
  return null
}

function asDuePosition(item: unknown): DuePosition | null {
  if (!item || typeof item !== "object") return null
  const { symbol, counted, sell_session } = item as Record<string, unknown>
  if (typeof symbol !== "string") return null
  return { symbol, counted: typeof counted === "number" ? counted : Number(counted ?? 0), sell_session: typeof sell_session === "string" ? sell_session : "" }
}

/**
 * The server's due list from a 409 `DUE_POSITIONS_CHANGED` or a 422 `DUE_CONFIRM_REQUIRED`
 * (`details.positions`, or `details` itself as the list); `null` for any other error or no list.
 */
export function duePositionsOf(error: unknown): DuePosition[] | null {
  if (!(error instanceof ApiError) || (error.code !== SCHEDULE_ERRORS.dueChanged && error.code !== SCHEDULE_ERRORS.dueRequired)) return null
  const details = error.details
  const raw = Array.isArray(details)
    ? details.some((item) => item && typeof item === "object" && Array.isArray((item as { positions?: unknown }).positions))
      ? (details.find((item) => Array.isArray((item as { positions?: unknown })?.positions)) as { positions: unknown[] }).positions
      : details
    : details && typeof details === "object" && Array.isArray((details as { positions?: unknown }).positions)
      ? (details as { positions: unknown[] }).positions
      : null
  if (!raw) return null
  const positions = raw.map(asDuePosition).filter((item): item is DuePosition => item !== null)
  return positions.length > 0 || raw.length === 0 ? positions : null
}

/** `HDB (12 phiên), MSN (31 phiên)` */
export function duePositionsText(positions: readonly DuePosition[]): string {
  return positions.map((position) => `${position.symbol} (${position.counted} phiên)`).join(", ")
}

/* ── Links into the Backtest (Bot "Chi tiết", "Tạo chiến lược trong Backtest") ── */

/** Query of the Backtest deep links; the Backtest reads `mode` (`iqx` | `chi-bao`), `iqx` and `strategy`. */
export const BACKTEST_LINK_PARAMS = { tab: "tab", mode: "mode", iqx: "iqx", strategy: "strategy" } as const

/**
 * `/chien-luoc?tab=backtest&mode=iqx&iqx=<id>` (tab IQX on that strategy),
 * `/chien-luoc?tab=backtest&mode=chi-bao&strategy=<id>` (tab Chỉ báo, latest version) or
 * `/chien-luoc?tab=backtest&mode=chi-bao&strategy=new` (a new strategy).
 */
export function backtestLink(target: { source: StrategySource; id: string } | { source: "new" }): string {
  const query = new URLSearchParams({ tab: "backtest" })
  if (target.source === "iqx") {
    query.set(BACKTEST_LINK_PARAMS.mode, "iqx")
    query.set(BACKTEST_LINK_PARAMS.iqx, target.id)
  } else {
    query.set(BACKTEST_LINK_PARAMS.mode, "chi-bao")
    query.set(BACKTEST_LINK_PARAMS.strategy, target.source === "new" ? "new" : target.id)
  }
  return `/chien-luoc?${query}`
}

export function sameSymbols(a: readonly DuePosition[], b: readonly DuePosition[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a.map((position) => position.symbol))
  return b.every((position) => set.has(position.symbol))
}
