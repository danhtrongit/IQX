import { ApiError, errorMessage } from "@/lib/api"

export { errorMessage }

/** `STRATEGY_V2_ENABLED=false` answers 404 FEATURE_DISABLED on every v2 strategy route. */
export function isFeatureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === "FEATURE_DISABLED"
}

/** A tool the account has not unlocked (lesson quiz 8/8) or whose plan is missing. */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}

export function isCapabilityLocked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === "CAPABILITY_LOCKED"
}

export function isApiError(error: unknown, status?: number, code?: string): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status) && (code === undefined || error.code === code)
}

/** Never retry a request that cannot change its answer (feature off, access, validation). */
export function retryUnlessFinal(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) return false
  return failureCount < 2
}

/** `details` of an API error as an array of plain objects (the API forwards arrays or one object). */
export function errorDetails(error: unknown): Record<string, unknown>[] {
  if (!(error instanceof ApiError)) return []
  const details = error.details
  const list = Array.isArray(details) ? details : details && typeof details === "object" ? [details] : []
  return list.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
}

/** `[{ path, message }]` validation details (path as dotted text). */
export function fieldErrors(error: unknown): { path: string; message: string }[] {
  return errorDetails(error).flatMap((item) => {
    const message = item.message
    if (typeof message !== "string") return []
    const path = item.path
    return [{ path: Array.isArray(path) ? path.join(".") : typeof path === "string" ? path : "", message }]
  })
}

export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
