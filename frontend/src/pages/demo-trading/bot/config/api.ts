import { api, ApiError } from "@/lib/api"

import { currentRevisionOf, newIdempotencyKey } from "../api"
import type {
  IndicatorConfig,
  SaveSharedConfigResult,
  SharedConfigState,
  TechnicalRegistry,
} from "./types"

export { newIdempotencyKey }

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export async function fetchSharedConfig(signal?: AbortSignal): Promise<SharedConfigState> {
  return unwrap<SharedConfigState>(await api<unknown>("/strategy/shared-config", { signal }))
}

export async function fetchTechnicalRegistry(signal?: AbortSignal): Promise<TechnicalRegistry> {
  return unwrap<TechnicalRegistry>(await api<unknown>("/strategy/registry/technical", { signal }))
}

/** Replaces only the listed indicators; every other saved indicator is kept by the server. */
export async function patchSharedConfig(body: {
  expected_revision: number
  idempotency_key: string
  indicators: Record<string, IndicatorConfig>
}): Promise<SaveSharedConfigResult> {
  return unwrap<SaveSharedConfigResult>(
    await api<unknown>("/strategy/shared-config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

export type ConfigFieldError = { path: string; message: string }

export type SaveOutcome =
  | { ok: true; result: SaveSharedConfigResult }
  | { ok: false; reason: "conflict"; currentRevision: number | null; message: string; retryable: false }
  | { ok: false; reason: "locked" | "invalid" | "error"; message: string; errors: ConfigFieldError[]; retryable: boolean }

export const CONFLICT_MESSAGE = "Cấu hình đã được lưu ở tab hoặc thiết bị khác."

/** True when the backend has the strategy routes switched off (404 FEATURE_DISABLED). */
export function isFeatureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === "FEATURE_DISABLED"
}

export function isRevisionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "REVISION_CONFLICT"
}

/** Validation details forwarded by the API (`details` array of `{path,message}`). */
export function configFieldErrors(error: unknown): ConfigFieldError[] {
  if (!(error instanceof ApiError)) return []
  const source = Array.isArray(error.details)
    ? error.details
    : error.details && typeof error.details === "object" && Array.isArray((error.details as { errors?: unknown }).errors)
      ? (error.details as { errors: unknown[] }).errors
      : []
  return source.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const { path, message } = item as { path?: unknown; message?: unknown }
    if (typeof message !== "string") return []
    return [{ path: Array.isArray(path) ? path.join(".") : typeof path === "string" ? path : "", message }]
  })
}

/** Server error that belongs to one param field of one side (path `…<side>.params.<key>`). */
export function fieldErrorFor(errors: ConfigFieldError[], side: "buy" | "sell", key: string): string | null {
  const suffix = `${side}.params.${key}`
  return errors.find((error) => error.path === suffix || error.path.endsWith(`.${suffix}`))?.message ?? null
}

export function saveOutcomeFromError(error: unknown): SaveOutcome {
  if (isRevisionConflict(error)) {
    return { ok: false, reason: "conflict", currentRevision: currentRevisionOf(error), message: CONFLICT_MESSAGE, retryable: false }
  }
  const message = error instanceof Error && error.message ? error.message : "Không lưu được cấu hình."
  if (error instanceof ApiError && error.status === 403 && error.code === "CAPABILITY_LOCKED") {
    return { ok: false, reason: "locked", message: "Hoàn thành bài kiểm tra 8/8 của chỉ báo này để bật.", errors: [], retryable: false }
  }
  if (error instanceof ApiError && (error.status === 422 || error.status === 400)) {
    return { ok: false, reason: "invalid", message, errors: configFieldErrors(error), retryable: false }
  }
  // Anything else (network, 5xx, 429) may have been applied: a retry reuses the idempotency key.
  return { ok: false, reason: "error", message, errors: [], retryable: true }
}
