/**
 * Strategy alerts (`/api/v2/strategy/alerts`): conditions pinned from one saved shared-config
 * revision or one backtest run, checked at the end of each completed session, history on the web
 * only. Every call goes through the generated contract. The legacy Telegram/preset alerts keep
 * their own untouched client in `legacy/`.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

export type AlertList = ApiResponseFor<"GET /api/v2/strategy/alerts">
export type StrategyAlert = AlertList["items"][number]
export type AlertDetail = ApiResponseFor<"GET /api/v2/strategy/alerts/{alertId}">
export type AlertVersion = AlertDetail["versions"][number]
export type AlertStatus = StrategyAlert["status"]
export type AlertEventPage = ApiResponseFor<"GET /api/v2/strategy/alerts/events">
export type AlertEvent = AlertEventPage["items"][number]
export type AlertCreateBody = ApiRequestFor<"POST /api/v2/strategy/alerts">["body"]
export type AlertUpdateBody = ApiRequestFor<"PATCH /api/v2/strategy/alerts/{alertId}">["body"]
export type AlertSourcePreview = ApiResponseFor<"POST /api/v2/strategy/alerts/source-preview">
export type AlertSourceInput = ApiRequestFor<"POST /api/v2/strategy/alerts/source-preview">["body"]["source"]
export type AlertScopeInput = NonNullable<AlertCreateBody>["scope"]
export type AlertSide = "buy" | "sell"

export const EVENT_PAGE_SIZE = 25

export const alertKeys = {
  all: ["strategy", "alerts"] as const,
  list: (userId: string | undefined) => ["strategy", "alerts", "list", userId] as const,
  detail: (userId: string | undefined, id: string) => ["strategy", "alerts", "detail", userId, id] as const,
  events: (userId: string | undefined, side: AlertSide | "all", offset: number) =>
    ["strategy", "alerts", "events", userId, side, offset] as const,
  eventsAll: (userId: string | undefined) => ["strategy", "alerts", "events", userId] as const,
  preview: (userId: string | undefined, source: string) => ["strategy", "alerts", "preview", userId, source] as const,
}

export function listAlerts(signal?: AbortSignal): Promise<AlertList> {
  return requestOperation("GET /api/v2/strategy/alerts", {}, { signal })
}

export function getAlert(alertId: string, signal?: AbortSignal): Promise<AlertDetail> {
  return requestOperation("GET /api/v2/strategy/alerts/{alertId}", { path: { alertId } }, { signal })
}

export function createAlert(body: AlertCreateBody): Promise<AlertDetail> {
  return requestOperation("POST /api/v2/strategy/alerts", { body })
}

export function updateAlert(alertId: string, body: AlertUpdateBody): Promise<AlertDetail> {
  return requestOperation("PATCH /api/v2/strategy/alerts/{alertId}", { path: { alertId }, body })
}

export async function deleteAlert(alertId: string): Promise<void> {
  await requestOperation("DELETE /api/v2/strategy/alerts/{alertId}", { path: { alertId } })
}

export function previewAlertSource(source: AlertSourceInput, signal?: AbortSignal): Promise<AlertSourcePreview> {
  return requestOperation("POST /api/v2/strategy/alerts/source-preview", { body: { source } }, { signal })
}

export function listAlertEvents(
  query: { side?: AlertSide; offset: number; limit: number },
  signal?: AbortSignal,
): Promise<AlertEventPage> {
  return requestOperation("GET /api/v2/strategy/alerts/events", { query }, { signal })
}

/** Shared-config revisions of the account (the "saved config" an alert may pin). */
export function listConfigRevisions(limit: number, signal?: AbortSignal) {
  return requestOperation("GET /api/v2/strategy/shared-config/revisions", { query: { limit } }, { signal })
}

/** Succeeded backtest runs an alert may pin ("cấu hình của kết quả kiểm thử"). */
export function listRunsForAlerts(limit: number, signal?: AbortSignal) {
  return requestOperation("GET /api/v2/strategy/backtests", { query: { limit } }, { signal })
}
