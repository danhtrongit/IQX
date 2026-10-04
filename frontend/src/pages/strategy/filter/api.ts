/**
 * REST client của tab Bộ lọc (bot-v2) — `.pi/botv2/CONTRACTS.md` §5.
 *
 * - `GET  /strategy/screener/metrics` — 42 chỉ tiêu registry + cờ learned/supported
 * - `POST /strategy/screener/run` — chạy định nghĩa bộ lọc (filter.schema.json)
 * - `GET/POST /strategy/filters`, `GET/PUT/DELETE /strategy/filters/{id}` — bộ lọc
 *   đã lưu, mỗi lần PUT tạo phiên bản mới
 * - `GET/POST /strategy/lists`, `GET/DELETE /strategy/lists/{id}` — danh sách tĩnh
 *
 * Premium + cờ `STRATEGY_V2_ENABLED`: cờ tắt → 404 `FEATURE_DISABLED`; điều kiện
 * trên chỉ tiêu chưa học → 403 `CAPABILITY_LOCKED`.
 */
import { api as sharedApi, ApiError } from "@/lib/api"

import type {
  CreateListBody,
  FilterDefinition,
  SavedFilter,
  SavedList,
  ScreenerMetric,
  ScreenerRunResult,
} from "./types"

type Raw = Record<string, unknown>

/** Route v2 trả tài nguyên trong `data`; chấp nhận cả payload trần. */
async function unwrap<T>(path: string, options: RequestInit = {}): Promise<T> {
  const payload = await sharedApi<unknown>(path, options)
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function rows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const wrapped = record(payload)
  if (!wrapped) return []
  const items = wrapped.items ?? wrapped.data
  return Array.isArray(items) ? items : []
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function definitionOf(raw: Raw): FilterDefinition | null {
  const direct = record(raw.definition)
  if (direct) return direct as unknown as FilterDefinition
  const current = record(raw.current)
  const nested = current ? record(current.definition) : null
  if (nested) return nested as unknown as FilterDefinition
  const versions = Array.isArray(raw.versions) ? raw.versions.map(record).filter((v): v is Raw => !!v) : []
  const latest = versions.reduce<Raw | null>(
    (best, version) => (best === null || (num(version.version) ?? 0) > (num(best.version) ?? 0) ? version : best),
    null,
  )
  const fromVersion = latest ? record(latest.definition) : null
  return fromVersion ? (fromVersion as unknown as FilterDefinition) : null
}

function toSavedFilter(payload: unknown): SavedFilter | null {
  const raw = record(payload)
  const id = raw ? str(raw.id) : null
  if (!raw || !id) return null
  return {
    id,
    name: str(raw.name) ?? "Bộ lọc",
    current_version: num(raw.current_version) ?? num(raw.version) ?? 1,
    definition: definitionOf(raw),
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
  }
}

function toSavedList(payload: unknown): SavedList | null {
  const raw = record(payload)
  const id = raw ? str(raw.id) : null
  if (!raw || !id) return null
  return {
    id,
    name: str(raw.name) ?? "Danh sách",
    filter_id: str(raw.filter_id),
    filter_version: num(raw.filter_version),
    tickers: Array.isArray(raw.tickers) ? raw.tickers.filter((t): t is string => typeof t === "string") : [],
    as_of: str(raw.as_of) ?? "",
    data_source: str(raw.data_source) ?? "",
    scope: (record(raw.scope) as SavedList["scope"]) ?? null,
    created_at: str(raw.created_at),
  }
}

function required<T>(value: T | null, message: string): T {
  if (value === null) throw new ApiError(message, 502, { code: "INVALID_RESPONSE" })
  return value
}

function jsonBody(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }
}

/* ── Screener ─────────────────────────────────────────────────────────── */

export async function getScreenerMetrics(signal?: AbortSignal): Promise<ScreenerMetric[]> {
  const payload = await unwrap<unknown>("/strategy/screener/metrics", { signal })
  const list = Array.isArray(payload) ? payload : (record(payload)?.metrics ?? rows(payload))
  return (Array.isArray(list) ? list : []) as ScreenerMetric[]
}

export function runScreener(definition: FilterDefinition, signal?: AbortSignal): Promise<ScreenerRunResult> {
  return unwrap<ScreenerRunResult>("/strategy/screener/run", jsonBody("POST", definition, signal))
}

/* ── Bộ lọc đã lưu ────────────────────────────────────────────────────── */

export async function listFilters(signal?: AbortSignal): Promise<SavedFilter[]> {
  const payload = await unwrap<unknown>("/strategy/filters", { signal })
  return rows(payload).flatMap((item) => {
    const filter = toSavedFilter(item)
    return filter ? [filter] : []
  })
}

export async function getFilter(id: string, signal?: AbortSignal): Promise<SavedFilter> {
  const payload = await unwrap<unknown>(`/strategy/filters/${encodeURIComponent(id)}`, { signal })
  return required(toSavedFilter(payload), "Máy chủ trả về bộ lọc không hợp lệ.")
}

export async function createFilter(body: { name: string; definition: FilterDefinition }): Promise<SavedFilter> {
  const payload = await unwrap<unknown>("/strategy/filters", jsonBody("POST", body))
  return required(toSavedFilter(payload), "Máy chủ trả về bộ lọc không hợp lệ.")
}

/** `PUT /strategy/filters/{id}` — tạo phiên bản mới của bộ lọc. */
export async function updateFilter(
  id: string,
  body: { name: string; definition: FilterDefinition },
): Promise<SavedFilter> {
  const payload = await unwrap<unknown>(`/strategy/filters/${encodeURIComponent(id)}`, jsonBody("PUT", body))
  return required(toSavedFilter(payload), "Máy chủ trả về bộ lọc không hợp lệ.")
}

export async function deleteFilter(id: string): Promise<void> {
  await sharedApi<unknown>(`/strategy/filters/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/* ── Danh sách tĩnh ───────────────────────────────────────────────────── */

export async function listLists(signal?: AbortSignal): Promise<SavedList[]> {
  const payload = await unwrap<unknown>("/strategy/lists", { signal })
  return rows(payload).flatMap((item) => {
    const list = toSavedList(item)
    return list ? [list] : []
  })
}

export async function getList(id: string, signal?: AbortSignal): Promise<SavedList> {
  const payload = await unwrap<unknown>(`/strategy/lists/${encodeURIComponent(id)}`, { signal })
  return required(toSavedList(payload), "Máy chủ trả về danh sách không hợp lệ.")
}

export async function createList(body: CreateListBody): Promise<SavedList> {
  const payload = await unwrap<unknown>("/strategy/lists", jsonBody("POST", body))
  return required(toSavedList(payload), "Máy chủ trả về danh sách không hợp lệ.")
}

export async function deleteList(id: string): Promise<void> {
  await sharedApi<unknown>(`/strategy/lists/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/* ── Lỗi đặc thù ──────────────────────────────────────────────────────── */

export function isCapabilityLocked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === "CAPABILITY_LOCKED"
}
