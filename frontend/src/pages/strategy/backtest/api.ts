/**
 * Backtest client (`/api/v2/strategy/backtests`): one symbol, a saved shared-config revision,
 * and an immutable stored run. Percent values of the result are already percentage points.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

export type RunRequest = ApiRequestFor<"POST /api/v2/strategy/backtests">["body"]
export type RunResponse = ApiResponseFor<"GET /api/v2/strategy/backtests/{id}">
export type RunResult = NonNullable<RunResponse["result"]>
export type RunSnapshot = NonNullable<RunResponse["snapshot"]>
export type RunSummary = ApiResponseFor<"GET /api/v2/strategy/backtests">["items"][number]
export type TradesPage = ApiResponseFor<"GET /api/v2/strategy/backtests/{id}/trades">
export type ClosedTrade = TradesPage["items"][number]
export type OpenPosition = NonNullable<TradesPage["open_position"]>
export type PendingOrder = TradesPage["pending_orders"][number]
export type ConditionEvidence = NonNullable<ClosedTrade["entry_conditions"]>
export type Execution = "next_open" | "same_close"
export type FeePreset = "standard" | "none"

export const TRADES_PAGE_SIZE = 25
/** One run is synchronous on the server; past this the page stops waiting and says so. */
export const RUN_TIMEOUT_MS = 120_000

export const backtestKeys = {
  all: ["strategy", "backtest"] as const,
  runs: (userId: string | undefined) => ["strategy", "backtest", "runs", userId] as const,
  trades: (userId: string | undefined, runId: string, page: number) => ["strategy", "backtest", "trades", userId, runId, page] as const,
}

export function runBacktest(body: RunRequest, signal?: AbortSignal): Promise<RunResponse> {
  return requestOperation("POST /api/v2/strategy/backtests", { body }, { signal })
}

export function getRun(id: string, signal?: AbortSignal): Promise<RunResponse> {
  return requestOperation("GET /api/v2/strategy/backtests/{id}", { path: { id } }, { signal })
}

export async function listRuns(limit: number, signal?: AbortSignal): Promise<RunSummary[]> {
  return (await requestOperation("GET /api/v2/strategy/backtests", { query: { limit } }, { signal })).items
}

/** One page of the complete trade history; `total` counts the whole run, not the page. */
export function getTrades(id: string, page: number, signal?: AbortSignal): Promise<TradesPage> {
  return requestOperation(
    "GET /api/v2/strategy/backtests/{id}/trades",
    { path: { id }, query: { offset: page * TRADES_PAGE_SIZE, limit: TRADES_PAGE_SIZE } },
    { signal },
  )
}
