/**
 * Wire layer of the Bot tool.
 *
 * Everything here is a plain read or an explicit user write: nothing starts a
 * Bot run, places an order or advances a session. Saving a source or a
 * configuration only records a revision that becomes effective from a later
 * trading session.
 */
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"

import type {
  BotOverview,
  BotPositions,
  BotSessionDecisionsPage,
  BotSessionsPage,
  BotTradesPage,
  InvalidSymbol,
  SavedList,
  UniverseMutationResult,
  UniverseState,
} from "./types"

/** The v2 API answers with the bare object; a `{ data }` envelope is tolerated. */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

/** Closed trades per page of the Lịch sử tab. */
export const TRADES_PAGE_SIZE = 30
/** Sessions per page of the Nhật ký tab. */
export const SESSIONS_PAGE_SIZE = 30
/** Decisions per page of one expanded session (the server maximum). */
export const DECISIONS_PAGE_SIZE = 100

export const botKeys = {
  all: ["bot"] as const,
  overview: (userId: string | undefined) => ["bot", "overview", userId] as const,
  positions: (userId: string | undefined) => ["bot", "positions", userId] as const,
  trades: (userId: string | undefined) => ["bot", "trades", userId] as const,
  sessions: (userId: string | undefined) => ["bot", "sessions", userId] as const,
  sessionDecisions: (userId: string | undefined, session: string) => ["bot", "sessions", userId, session] as const,
  universe: (userId: string | undefined) => ["bot", "universe", userId] as const,
  lists: (userId: string | undefined) => ["bot", "lists", userId] as const,
  registry: (userId: string | undefined) => ["bot", "config", "registry", userId] as const,
  sharedConfig: (userId: string | undefined) => ["bot", "config", "state", userId] as const,
}

export async function fetchOverview(signal?: AbortSignal): Promise<BotOverview> {
  return unwrap<BotOverview>(await requestOperation("GET /api/v2/bot", {}, { signal }))
}

export async function fetchPositions(signal?: AbortSignal): Promise<BotPositions> {
  return unwrap<BotPositions>(await requestOperation("GET /api/v2/bot/positions", {}, { signal }))
}

/** Closed round trips (a buy and the sell that closed it), newest first, one cursor page at a time. */
export async function fetchTrades(cursor: string | null, signal?: AbortSignal): Promise<BotTradesPage> {
  const query = { limit: TRADES_PAGE_SIZE, ...(cursor ? { cursor } : {}) }
  return unwrap<BotTradesPage>(await requestOperation("GET /api/v2/bot/trades", { query }, { signal }))
}

/** One row per trading session, newest first, one cursor page at a time. */
export async function fetchJournalSessions(cursor: string | null, signal?: AbortSignal): Promise<BotSessionsPage> {
  const query = { limit: SESSIONS_PAGE_SIZE, ...(cursor ? { cursor } : {}) }
  return unwrap<BotSessionsPage>(await requestOperation("GET /api/v2/bot/journal/sessions", { query }, { signal }))
}

/** The decisions of one session, executed ones first. */
export async function fetchSessionDecisions(session: string, cursor: string | null, signal?: AbortSignal): Promise<BotSessionDecisionsPage> {
  const query = { limit: DECISIONS_PAGE_SIZE, ...(cursor ? { cursor } : {}) }
  return unwrap<BotSessionDecisionsPage>(
    await requestOperation("GET /api/v2/bot/journal/sessions/{session}", { path: { session }, query }, { signal }),
  )
}

export async function fetchUniverse(signal?: AbortSignal): Promise<UniverseState> {
  return unwrap<UniverseState>(await requestOperation("GET /api/v2/bot/universe", {}, { signal }))
}

export async function fetchSavedLists(signal?: AbortSignal): Promise<SavedList[]> {
  const payload = unwrap<{ items?: SavedList[] }>(
    await requestOperation("GET /api/v2/strategy/lists", {}, { signal }),
  )
  return payload.items ?? []
}

export function applyUniverseList(body: {
  list_id: string
  symbols: string[]
  expected_revision: number
  idempotency_key: string
}): Promise<UniverseMutationResult> {
  return requestOperation("POST /api/v2/bot/universe/apply-list", { body }).then((payload) =>
    unwrap<UniverseMutationResult>(payload),
  )
}

export function revertUniverseToVn30(body: {
  expected_revision: number
  idempotency_key: string
}): Promise<UniverseMutationResult> {
  return requestOperation("POST /api/v2/bot/universe/revert-vn30", { body }).then((payload) =>
    unwrap<UniverseMutationResult>(payload),
  )
}

export function cancelUniversePending(body: { expected_revision: number }): Promise<UniverseMutationResult> {
  return requestOperation("POST /api/v2/bot/universe/pending/cancel", { body }).then((payload) =>
    unwrap<UniverseMutationResult>(payload),
  )
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/* ── Error helpers ──────────────────────────────────────────────────────── */

export function isApiError(error: unknown, status?: number, code?: string): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status) && (code === undefined || error.code === code)
}

/** `current_revision` from a 409 body, wherever the envelope put it. */
export function currentRevisionOf(error: unknown): number | null {
  if (!(error instanceof ApiError)) return null
  const details = error.details
  const candidates = Array.isArray(details) ? details : details && typeof details === "object" ? [details] : []
  for (const item of candidates) {
    const value = item && typeof item === "object" ? (item as { current_revision?: unknown }).current_revision : undefined
    if (typeof value === "number") return value
  }
  return null
}

/** `[{ symbol, reason }]` of a 422 `UNIVERSE_SYMBOLS_INVALID`; empty for any other error. */
export function invalidSymbolsOf(error: unknown): InvalidSymbol[] {
  if (!(error instanceof ApiError) || error.code !== "UNIVERSE_SYMBOLS_INVALID" || !Array.isArray(error.details)) return []
  return error.details.flatMap((item): InvalidSymbol[] => {
    if (!item || typeof item !== "object") return []
    const { symbol, reason } = item as { symbol?: unknown; reason?: unknown }
    return typeof symbol === "string" ? [{ symbol, reason: typeof reason === "string" ? reason : "" }] : []
  })
}

export function messageOf(error: unknown, fallback = "Không thực hiện được. Vui lòng thử lại."): string {
  return error instanceof Error && error.message ? error.message : fallback
}
