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

/** One capability the account lacks (403 `CAPABILITY_LOCKED` `details[]`). */
export type LockedCapability = { capability: string; reason: string; indicator: string | null }

export type SaveOutcome =
  | { ok: true; result: SaveSharedConfigResult }
  | { ok: false; reason: "conflict"; currentRevision: number | null; message: string; retryable: false }
  | {
      ok: false
      reason: "locked" | "invalid" | "error"
      /** The API error code (`CONFIG_INVALID`, `SIDE_REQUIRED`, `CAPABILITY_LOCKED`…), when it sent one. */
      code: string | null
      message: string
      errors: ConfigFieldError[]
      locked: LockedCapability[]
      retryable: boolean
    }

export const CONFLICT_MESSAGE = "Cấu hình đã được lưu ở tab hoặc thiết bị khác."

/** True when the backend has the strategy routes switched off (404 FEATURE_DISABLED). */
export function isFeatureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === "FEATURE_DISABLED"
}

export function isRevisionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "REVISION_CONFLICT"
}

function detailItems(error: ApiError): unknown[] {
  const { details } = error
  if (Array.isArray(details)) return details
  if (details && typeof details === "object" && Array.isArray((details as { errors?: unknown }).errors)) return (details as { errors: unknown[] }).errors
  return []
}

/** Validation details forwarded by the API (`details` array of `{path,message}`: 422 `CONFIG_INVALID` / `SIDE_REQUIRED`). */
export function configFieldErrors(error: unknown): ConfigFieldError[] {
  if (!(error instanceof ApiError)) return []
  return detailItems(error).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const { path, message } = item as { path?: unknown; message?: unknown }
    if (typeof message !== "string") return []
    return [{ path: Array.isArray(path) ? path.join(".") : typeof path === "string" ? path : "", message }]
  })
}

/** `[{ capability, reason, indicator }]` of a 403 `CAPABILITY_LOCKED`; empty for any other error. */
export function lockedCapabilitiesOf(error: unknown): LockedCapability[] {
  if (!(error instanceof ApiError) || error.code !== "CAPABILITY_LOCKED") return []
  return detailItems(error).flatMap((item): LockedCapability[] => {
    if (!item || typeof item !== "object") return []
    const { capability, reason, indicator } = item as { capability?: unknown; reason?: unknown; indicator?: unknown }
    return typeof capability === "string"
      ? [{ capability, reason: typeof reason === "string" ? reason : "", indicator: typeof indicator === "string" ? indicator : null }]
      : []
  })
}

/** Server error that belongs to one param field of one side (path `…<side>.params.<key>`). */
export function fieldErrorFor(errors: ConfigFieldError[], side: "buy" | "sell", key: string): string | null {
  const suffix = `${side}.params.${key}`
  return errors.find((error) => error.path === suffix || error.path.endsWith(`.${suffix}`))?.message ?? null
}

/** Server errors that belong to the rules (operators) of one side (path `…<side>.rules…`). */
export function ruleErrorsFor(errors: ConfigFieldError[], side: "buy" | "sell"): ConfigFieldError[] {
  return errors.filter((error) => sideOfError(error) === side && /(?:^|\.)(?:buy|sell)\.rules(?:\.|$)/.test(error.path))
}

/** The side a server error points at (`…<side>.params…` / `…<side>.rules…` / `…<side>`), if any. */
export function sideOfError(error: ConfigFieldError): "buy" | "sell" | null {
  const match = /(?:^|\.)(buy|sell)(?:\.|$)/.exec(error.path)
  return match ? (match[1] as "buy" | "sell") : null
}

const LOCKED_FALLBACK = "Hoàn thành bài kiểm tra 8/8 của chỉ báo này để bật."

function lockedMessage(locked: LockedCapability[], nameOf: ((id: string) => string | undefined) | undefined): string {
  const names = [...new Set(locked.filter((item) => item.reason === "not_learned" && item.indicator).map((item) => nameOf?.(item.indicator as string) ?? (item.indicator as string)))]
  if (names.length === 0) return LOCKED_FALLBACK
  return `Hoàn thành bài kiểm tra 8/8 của chỉ báo ${names.join(", ")} để bật.`
}

/**
 * Maps a failed save to what the form shows: a 409 keeps the draft and names the newest
 * revision, a 422 carries field-level `{path,message}`, a 403 names the locked indicator.
 * `nameOf` turns an indicator id into its display name.
 */
export function saveOutcomeFromError(error: unknown, nameOf?: (id: string) => string | undefined): SaveOutcome {
  if (isRevisionConflict(error)) {
    return { ok: false, reason: "conflict", currentRevision: currentRevisionOf(error), message: CONFLICT_MESSAGE, retryable: false }
  }
  const code = error instanceof ApiError ? (error.code ?? null) : null
  const message = error instanceof Error && error.message ? error.message : "Không lưu được cấu hình."
  if (error instanceof ApiError && error.status === 403 && error.code === "CAPABILITY_LOCKED") {
    const locked = lockedCapabilitiesOf(error)
    return { ok: false, reason: "locked", code, message: lockedMessage(locked, nameOf), errors: [], locked, retryable: false }
  }
  if (error instanceof ApiError && (error.status === 422 || error.status === 400)) {
    return { ok: false, reason: "invalid", code, message, errors: configFieldErrors(error), locked: [], retryable: false }
  }
  // Anything else (network, 5xx, 429) may have been applied: a retry reuses the idempotency key.
  return { ok: false, reason: "error", code, message, errors: [], locked: [], retryable: true }
}
