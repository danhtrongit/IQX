export interface TokenProvider { getAccessToken(): Promise<string | null> | string | null; clear?(): Promise<void> | void }
export interface ApiClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch; tokenProvider?: TokenProvider }
export type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown; idempotencyKey?: string }
export interface ApiErrorOptions { code?: string; details?: unknown; requestId?: string; retryAfter?: string | number }
export class ApiError extends Error {
  readonly status: number; readonly code?: string; readonly details?: unknown; readonly requestId?: string; readonly retryAfter?: string | number
  constructor(message: string, status: number, options: ApiErrorOptions = {}) { super(message); this.name = "ApiError"; this.status = status; Object.assign(this, options) }
}
type ErrorPayload = { error?: { code?: unknown; message?: unknown; details?: unknown; request_id?: unknown; requestId?: unknown; retry_after?: unknown; retryAfter?: unknown }; detail?: unknown; message?: unknown; code?: unknown; details?: unknown; request_id?: unknown; requestId?: unknown }
function detailMessage(detail: unknown): string | undefined { if (typeof detail === "string") return detail; if (Array.isArray(detail)) { const first = detail[0] as { msg?: unknown } | undefined; return typeof first?.msg === "string" ? first.msg : undefined } return undefined }
export async function parseApiError(response: Response): Promise<ApiError> { let data: ErrorPayload = {}; try { data = await response.clone().json() as ErrorPayload } catch {} const nested = data.error ?? {}; const message = (typeof nested.message === "string" ? nested.message : undefined) ?? detailMessage(data.detail) ?? (typeof data.message === "string" ? data.message : undefined) ?? "Request failed"; return new ApiError(message, response.status, { code: typeof nested.code === "string" ? nested.code : typeof data.code === "string" ? data.code : undefined, details: nested.details ?? data.details, requestId: String(nested.request_id ?? nested.requestId ?? data.request_id ?? data.requestId ?? "") || undefined, retryAfter: (nested.retry_after ?? nested.retryAfter ?? response.headers.get("Retry-After") ?? undefined) as string | number | undefined }) }
export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? ""; const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis); const provider = options.tokenProvider
  return async function request<T = unknown>(path: string, init: RequestOptions = {}): Promise<T> {
    const url = baseUrl
      ? new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`)
      : undefined
    const headers = new Headers(init.headers); if (init.body !== undefined && !(init.body instanceof FormData)) { headers.set("Content-Type", "application/json") }
    const token = await provider?.getAccessToken(); if (token) headers.set("Authorization", `Bearer ${token}`); if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey)
    const body = init.body === undefined || init.body instanceof FormData || typeof init.body === "string" ? init.body : JSON.stringify(init.body)
    const response = await fetcher(url?.toString() ?? path, { ...init, headers, body })
    if (!response.ok) throw await parseApiError(response); if (response.status === 204 || response.status === 205) return undefined as T
    const text = await response.text(); if (!text) return undefined as T; try { return JSON.parse(text) as T } catch { return text as T }
  }
}
export type OperationMap = Record<string, { request: unknown; response: unknown }>
export function createOperationClient<M extends OperationMap>(client: ReturnType<typeof createApiClient>) { return async <K extends keyof M>(operation: K, request: M[K]["request"], options?: RequestOptions): Promise<M[K]["response"]> => client<M[K]["response"]>(String(operation).replace(/^\w+\s+/, ""), { ...options, ...(request as object) } as RequestOptions) }
// Keep this import extensionless so Metro can resolve the shared TypeScript
// source from the pnpm workspace in native development builds.
export { queryKeys, routes } from "../../domain/src/index"
