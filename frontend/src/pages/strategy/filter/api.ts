/**
 * Bộ lọc client: screener metrics/run/results, saved filters (definition 3.0), saved lists and
 * result snapshots, all through the generated contract.
 *
 * Three different saves, never mixed: a filter (criteria only, re-resolved at each run), a list
 * (the symbols and the evidence of one result) and a result snapshot (the rows frozen). Lists and
 * snapshots are always created from a result the SERVER holds (`run_id`): symbols are never
 * client-supplied.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor } from "@/lib/contract-types"

import type {
  FilterDefinition,
  ResultPage,
  ResultSnapshot,
  ResultSnapshotSummary,
  RunResult,
  SavedFilter,
  SavedList,
  ScreenerMetric,
  Selection,
} from "./types"

export const RESULT_PAGE_SIZE = 50

export function getScreenerMetrics(signal?: AbortSignal): Promise<ScreenerMetric[]> {
  return requestOperation("GET /api/v2/strategy/screener/metrics", {}, { signal })
}

export function runScreener(definition: FilterDefinition, signal?: AbortSignal): Promise<RunResult> {
  return requestOperation("POST /api/v2/strategy/screener/run", { body: definition }, { signal })
}

export function getResultPage(
  resultId: string,
  query: { offset: number; limit: number; passedOnly: boolean },
  signal?: AbortSignal,
): Promise<ResultPage> {
  return requestOperation(
    "GET /api/v2/strategy/screener/results/{resultId}",
    { path: { resultId }, query: { offset: query.offset, limit: query.limit, passed_only: query.passedOnly } },
    { signal },
  )
}

/* ── Saved filters ───────────────────────────────────────────────────────── */

export async function listFilters(signal?: AbortSignal): Promise<SavedFilter[]> {
  return (await requestOperation("GET /api/v2/strategy/filters", {}, { signal })).items
}

export function createFilter(body: { name: string; definition: FilterDefinition; idempotency_key?: string }) {
  return requestOperation("POST /api/v2/strategy/filters", { body })
}

/** A new version of an existing filter (an unchanged definition keeps the current version). */
export function updateFilter(id: string, body: { name: string; definition: FilterDefinition }) {
  return requestOperation("PUT /api/v2/strategy/filters/{filterId}", { path: { filterId: id }, body })
}

export async function deleteFilter(id: string): Promise<void> {
  await requestOperation("DELETE /api/v2/strategy/filters/{filterId}", { path: { filterId: id } })
}

/* ── Saved lists ("Danh mục đã lưu") ─────────────────────────────────────── */

/** Lists the user saved on purpose; internal lists made only for "Áp dụng cho Bot" are not included. */
export async function listLists(signal?: AbortSignal): Promise<SavedList[]> {
  return (await requestOperation("GET /api/v2/strategy/lists", {}, { signal })).items
}

export function getList(id: string, signal?: AbortSignal): Promise<SavedList> {
  return requestOperation("GET /api/v2/strategy/lists/{listId}", { path: { listId: id } }, { signal })
}

/** 409 `LIST_IN_USE_BY_BOT` while the Bot uses the list as an effective or pending buy source. */
export async function deleteList(id: string): Promise<void> {
  await requestOperation("DELETE /api/v2/strategy/lists/{listId}", { path: { listId: id } })
}

type FromResultBody = ApiRequestFor<"POST /api/v2/strategy/lists/from-result">["body"]

export function createListFromResult(input: {
  name: string
  runId: string
  selection: Selection
  visibility: "saved" | "internal"
  filterId?: string
  filterVersion?: number
  idempotencyKey?: string
}): Promise<SavedList> {
  const body: FromResultBody = {
    name: input.name,
    run_id: input.runId,
    selection: input.selection,
    visibility: input.visibility,
    ...(input.filterId ? { filter_id: input.filterId, ...(input.filterVersion ? { filter_version: input.filterVersion } : {}) } : {}),
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  }
  return requestOperation("POST /api/v2/strategy/lists/from-result", { body })
}

/* ── Result snapshots ("Kết quả đã lưu") ─────────────────────────────────── */

export async function listSnapshots(signal?: AbortSignal): Promise<ResultSnapshotSummary[]> {
  return (await requestOperation("GET /api/v2/strategy/result-snapshots", {}, { signal })).items
}

export function getSnapshot(id: string, signal?: AbortSignal): Promise<ResultSnapshot> {
  return requestOperation("GET /api/v2/strategy/result-snapshots/{snapshotId}", { path: { snapshotId: id } }, { signal })
}

export function createSnapshot(input: {
  name: string
  runId: string
  selection: Selection
  filterId?: string
  filterVersion?: number
  idempotencyKey?: string
}): Promise<ResultSnapshot> {
  return requestOperation("POST /api/v2/strategy/result-snapshots", {
    body: {
      name: input.name,
      run_id: input.runId,
      selection: input.selection,
      visibility: "saved",
      ...(input.filterId ? { filter_id: input.filterId, ...(input.filterVersion ? { filter_version: input.filterVersion } : {}) } : {}),
      ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    },
  })
}

export async function deleteSnapshot(id: string): Promise<void> {
  await requestOperation("DELETE /api/v2/strategy/result-snapshots/{snapshotId}", { path: { snapshotId: id } })
}
