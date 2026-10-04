/**
 * Backtest v2 client — `POST/GET /strategy/backtests` (CONTRACTS §4).
 *
 * A run always references a SAVED shared-config revision (`shared_revision`),
 * never the editor draft. Each click sends a fresh idempotency key; the server
 * returns an immutable run (`run_id`) whose snapshot never follows later edits.
 */
import { api as sharedApi, ApiError } from "@/lib/api"

import type {
  AdvancedCapability,
  BacktestRunRequest,
  BacktestRunResponse,
  BacktestRunSummary,
  RunResult,
} from "./types"

type Raw = Record<string, unknown>

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Enveloped routes return `{ data }`; older routes return the resource directly. */
async function unwrap<T>(path: string, options: RequestInit = {}): Promise<T> {
  const payload = await sharedApi<unknown>(path, options)
  const wrapped = record(payload)
  if (wrapped && "data" in wrapped) return wrapped.data as T
  return payload as T
}

/** Stored runs keep `snapshot` next to `result`; fold it into the result. */
function toRunResponse(raw: unknown): BacktestRunResponse {
  const run = record(raw) ?? {}
  const result = (record(run.result) ?? {}) as Partial<RunResult>
  const snapshot = result.snapshot ?? (record(run.snapshot) as RunResult["snapshot"] | null) ?? undefined
  return {
    run_id: text(run.run_id) ?? text(run.id) ?? "",
    status: run.status === "failed" ? "failed" : "succeeded",
    kind: text(run.kind) ?? undefined,
    result: { ...result, ...(snapshot ? { snapshot } : {}) } as RunResult,
    research_result: run.research_result ?? result.research_result,
    system_result: run.system_result ?? result.system_result,
  }
}

export async function runBacktestV2(body: BacktestRunRequest, signal?: AbortSignal): Promise<BacktestRunResponse> {
  const raw = await unwrap<unknown>("/strategy/backtests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  return toRunResponse(raw)
}

export async function getBacktestRun(id: string, signal?: AbortSignal): Promise<BacktestRunResponse> {
  return toRunResponse(await unwrap<unknown>(`/strategy/backtests/${encodeURIComponent(id)}`, { signal }))
}

function toSummary(raw: unknown): BacktestRunSummary | null {
  const run = record(raw)
  if (!run) return null
  const id = text(run.run_id) ?? text(run.id)
  if (!id) return null
  const request = record(run.request) ?? {}
  return {
    run_id: id,
    kind: text(run.kind) ?? "single",
    status: text(run.status) ?? "succeeded",
    shared_revision: finite(run.shared_revision),
    symbol: text(run.symbol) ?? text(request.symbol),
    start: text(run.start) ?? text(request.start),
    end: text(run.end) ?? text(request.end),
    created_at: text(run.created_at),
  }
}

export async function listBacktestRuns(limit = 20, signal?: AbortSignal): Promise<BacktestRunSummary[]> {
  const payload = await unwrap<unknown>(`/strategy/backtests?limit=${limit}`, { signal })
  const container = record(payload)
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(container?.items)
      ? container.items
      : Array.isArray(container?.runs)
        ? container.runs
        : []
  return items.flatMap((item) => {
    const summary = toSummary(item)
    return summary ? [summary] : []
  })
}

/** Lesson that unlocks each advanced capability (CONTRACTS §2). */
export const CAPABILITY_LESSONS: Readonly<Record<string, string>> = {
  sensitivity: "ch02-l14",
  out_of_sample: "ch02-l15",
  walk_forward: "ch02-l16",
  universe: "ch16-l01",
  ranking: "ch16-l02",
  logic_groups: "ch16-l03",
  multi_timeframe: "ch16-l04",
  signal_priority: "ch16-l05",
  reentry_cooldown: "ch16-l06",
  sizing_pct_nav: "ch17-l01",
  sizing_fixed_amount: "ch17-l02",
  max_positions: "ch17-l03",
  stop_loss_pct: "ch17-l04",
  take_profit_pct: "ch17-l05",
  trailing_pct: "ch17-l06",
  max_holding: "ch17-l07",
  portfolio: "ch18-l01",
  correlation: "ch18-l02",
  concentration: "ch18-l03",
  sector_weights: "ch18-l04",
  rebalancing: "ch18-l05",
  portfolio_drawdown: "ch18-l06",
}

export function isCapabilityLocked(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403 && error.code === "CAPABILITY_LOCKED"
}

export type CapabilityLock = {
  capability: string
  lessonId: string | null
  reason: "flag_off" | "not_learned" | null
  message: string
}

/** Lock details of a 403 CAPABILITY_LOCKED; falls back to the requested capability. */
export function capabilityLock(error: ApiError, requested: AdvancedCapability): CapabilityLock {
  // The API error filter only forwards array details; accept both shapes.
  const raw = Array.isArray(error.details) ? error.details[0] : error.details
  const details = record(raw)
  const capability = text(details?.capability) ?? requested
  const reason = details?.reason === "flag_off" || details?.reason === "not_learned" ? details.reason : null
  const lessonId = CAPABILITY_LESSONS[capability] ?? null
  const message =
    reason === "flag_off"
      ? "Tính năng chưa bật trên máy chủ."
      : reason === "not_learned"
        ? `Chưa học bài ${lessonId ?? capability}.`
        : error.message || "Tính năng đang khoá."
  return { capability, lessonId, reason, message }
}
