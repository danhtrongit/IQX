import { API_BASE } from "@/lib/api-config"

export { API_BASE, getWebSocketUrl, resolveWsUrl } from "@/lib/api-config"

export const ACCESS_TOKEN_KEY = "iqx.v2.access_token"
export const REFRESH_TOKEN_KEY = "iqx.v2.refresh_token"
export const REMEMBER_KEY = "iqx.v2.remember"

type TokenPair = { access_token: string; refresh_token: string; token_type: string }
type ErrorEnvelope = {
  error?: {
    code?: unknown
    message?: unknown
    details?: unknown
    request_id?: unknown
    requestId?: unknown
    retry_after?: unknown
    retryAfter?: unknown
  }
  detail?: unknown
  message?: unknown
  code?: unknown
  details?: unknown
  request_id?: unknown
  requestId?: unknown
  retry_after?: unknown
  retryAfter?: unknown
}

export type ApiErrorOptions = {
  code?: string
  details?: unknown
  requestId?: string
  retryAfter?: number | string
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown
  readonly requestId?: string
  readonly retryAfter?: number | string

  constructor(message: string, status: number, codeOrOptions?: string | ApiErrorOptions, options?: ApiErrorOptions) {
    super(message)
    this.name = "ApiError"
    this.status = status
    const values = typeof codeOrOptions === "string" ? { ...options, code: codeOrOptions } : codeOrOptions
    this.code = values?.code
    this.details = values?.details
    this.requestId = values?.requestId
    this.retryAfter = values?.retryAfter
  }
}

function tokenStorage(): Storage {
  if (sessionStorage.getItem(REFRESH_TOKEN_KEY)) return sessionStorage
  if (localStorage.getItem(REFRESH_TOKEN_KEY)) return localStorage
  return localStorage.getItem(REMEMBER_KEY) === "true" ? localStorage : sessionStorage
}

let tokenEpoch = 0

type AuthBroadcastMessage =
  | {
      type: "tokens"
      source: string
      requestId?: string
      previousRefreshToken: string
      tokens: TokenPair
      remember: boolean
    }
  | {
      type: "refresh-state-request"
      source: string
      requestId: string
      previousRefreshToken: string
    }
  | {
      type: "clear"
      source: string
      refreshTokens: string[]
    }

const authBroadcastSource = Math.random().toString(36).slice(2)
let authBroadcast: BroadcastChannel | null = null
const refreshLineage = new Set<string>()
const recoveryWaiters = new Map<string, () => void>()

function persistTokens(tokens: TokenPair, remember: boolean): void {
  const target = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  other.removeItem(ACCESS_TOKEN_KEY)
  other.removeItem(REFRESH_TOKEN_KEY)
  target.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
  target.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
  localStorage.setItem(REMEMBER_KEY, String(remember))
  tokenEpoch += 1
}

function persistClear(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(REMEMBER_KEY)
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  tokenEpoch += 1
}

function postAuthMessage(message: AuthBroadcastMessage): void {
  try { authBroadcast?.postMessage(message) } catch { /* closed/unavailable channel */ }
}

function ensureAuthBroadcast(): BroadcastChannel | null {
  if (authBroadcast) return authBroadcast
  if (typeof BroadcastChannel === "undefined") return null
  try {
    const channel = new BroadcastChannel("iqx.auth.tokens")
    ;(channel as BroadcastChannel & { unref?: () => void }).unref?.()
    channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      const message = event.data
      if (!message || message.source === authBroadcastSource) return
      if (message.type === "refresh-state-request") {
        const current = getRefreshToken()
        if (current && current !== message.previousRefreshToken && refreshLineage.has(message.previousRefreshToken)) {
          postAuthMessage({
            type: "tokens",
            source: authBroadcastSource,
            requestId: message.requestId,
            previousRefreshToken: message.previousRefreshToken,
            tokens: {
              access_token: getAccessToken() ?? "",
              refresh_token: current,
              token_type: "bearer",
            },
            remember: localStorage.getItem(REMEMBER_KEY) === "true",
          })
        }
        return
      }
      if (message.type === "tokens") {
        const current = getRefreshToken()
        if (
          current !== message.previousRefreshToken
          || !message.tokens
          || !message.tokens.access_token
          || !message.tokens.refresh_token
          || typeof message.remember !== "boolean"
        ) return
        refreshLineage.add(current)
        refreshLineage.add(message.tokens.refresh_token)
        // Keep the receiving tab's persistence mode. A remember=false tab
        // must never persist a peer's rotation into shared localStorage.
        const rememberLocally = !sessionStorage.getItem(REFRESH_TOKEN_KEY)
          && !!localStorage.getItem(REFRESH_TOKEN_KEY)
        persistTokens(message.tokens, rememberLocally)
        if (message.requestId) recoveryWaiters.get(message.requestId)?.()
        return
      }
      const current = getRefreshToken()
      if (Array.isArray(message.refreshTokens) && message.refreshTokens.every(item => typeof item === "string") && current && message.refreshTokens.includes(current)) {
        persistClear()
        refreshLineage.clear()
        if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:session-cleared"))
      }
    }
    authBroadcast = channel
    const current = getRefreshToken()
    if (current) refreshLineage.add(current)
    return channel
  } catch { return null }
}

function recoverPeerRefresh(previousRefreshToken: string): Promise<void> {
  const channel = ensureAuthBroadcast()
  if (!channel) return Promise.resolve()
  const requestId = `${authBroadcastSource}:${Math.random().toString(36).slice(2)}`
  return new Promise(resolve => {
    const timer: { id?: ReturnType<typeof setTimeout> } = {}
    const finish = () => {
      if (timer.id) clearTimeout(timer.id)
      recoveryWaiters.delete(requestId)
      resolve()
    }
    recoveryWaiters.set(requestId, finish)
    timer.id = setTimeout(finish, 50)
    postAuthMessage({
      type: "refresh-state-request",
      source: authBroadcastSource,
      requestId,
      previousRefreshToken,
    })
  })
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(ACCESS_TOKEN_KEY)
}

function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function saveTokens(tokens: TokenPair, remember: boolean): void {
  // Login/account switching is local authority. Do not broadcast these new
  // credentials into a cloned session in another tab.
  refreshLineage.clear()
  persistTokens(tokens, remember)
  refreshLineage.add(tokens.refresh_token)
  ensureAuthBroadcast()
}

function rotateTokens(tokens: TokenPair, remember: boolean, previousRefreshToken: string): void {
  persistTokens(tokens, remember)
  refreshLineage.add(previousRefreshToken)
  refreshLineage.add(tokens.refresh_token)
  ensureAuthBroadcast()
  postAuthMessage({ type: "tokens", source: authBroadcastSource, previousRefreshToken, tokens, remember })
}

export function clearTokens(): void {
  const current = getRefreshToken()
  const refreshTokens = current ? [...refreshLineage, current] : [...refreshLineage]
  persistClear()
  refreshLineage.clear()
  ensureAuthBroadcast()
  if (refreshTokens.length) postAuthMessage({ type: "clear", source: authBroadcastSource, refreshTokens })
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function retryValue(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) return value
  return undefined
}

function safeDetailMessage(detail: unknown): string | undefined {
  if (typeof detail === "string" && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item === "object" ? stringValue((item as { msg?: unknown }).msg) : undefined))
      .filter((item): item is string => !!item)
    if (messages.length) return messages.join(" · ")
  }
  if (detail && typeof detail === "object") {
    const objectDetail = detail as { msg?: unknown; message?: unknown }
    return stringValue(objectDetail.msg) ?? stringValue(objectDetail.message)
  }
  return undefined
}

async function parseError(response: Response): Promise<ApiError> {
  const raw = await response.text().catch(() => "")
  let payload: ErrorEnvelope = {}
  if (raw) {
    try {
      payload = JSON.parse(raw) as ErrorEnvelope
    } catch {
      // Keep non-JSON proxy errors only when they are short, safe strings.
    }
  }
  const envelope = payload.error && typeof payload.error === "object" ? payload.error : undefined
  const detail = payload.detail
  const details = envelope?.details ?? payload.details ?? detail
  const message = stringValue(envelope?.message)
    ?? safeDetailMessage(detail)
    ?? stringValue(payload.message)
    ?? safeDetailMessage(details)
    ?? (raw && raw.length < 500 ? raw : undefined)
    ?? `Yêu cầu thất bại (${response.status})`
  const requestId = stringValue(envelope?.request_id)
    ?? stringValue(envelope?.requestId)
    ?? stringValue(payload.request_id)
    ?? stringValue(payload.requestId)
    ?? stringValue(response.headers.get("X-Request-ID"))
  const retryAfter = retryValue(envelope?.retry_after)
    ?? retryValue(envelope?.retryAfter)
    ?? retryValue(payload.retry_after)
    ?? retryValue(payload.retryAfter)
    ?? retryValue(response.headers.get("Retry-After"))
  return new ApiError(message, response.status, {
    code: stringValue(envelope?.code) ?? stringValue(payload.code),
    details,
    requestId,
    retryAfter,
  })
}

type RefreshOutcome = "refreshed" | "superseded" | "unavailable"
let refreshPromise: Promise<RefreshOutcome> | null = null

function notifySessionExpired(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:logout"))
}

async function refreshSession(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return "unavailable"
  if (!refreshPromise) {
    const epoch = tokenEpoch
    const perform = async (): Promise<RefreshOutcome> => {
      const run = async (): Promise<RefreshOutcome> => {
        // Another tab may have rotated the refresh token while this tab waited
        // for the lock. Reuse its access token instead of replaying the old one.
        if (tokenEpoch !== epoch || getRefreshToken() !== refreshToken) {
          return getAccessToken() ? "superseded" : "unavailable"
        }
        const response = await fetch(requestUrl("/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (tokenEpoch !== epoch || getRefreshToken() !== refreshToken) {
          return getAccessToken() ? "superseded" : "unavailable"
        }
        if (response.status === 401) {
          clearTokens()
          notifySessionExpired()
          return "unavailable"
        }
        if (!response.ok) throw await parseError(response)
        let tokens: TokenPair
        try { tokens = (await response.json()) as TokenPair } catch {
          throw new ApiError("Phản hồi làm mới phiên không hợp lệ", 502, { code: "INVALID_TOKEN_RESPONSE" })
        }
        if (!tokens?.access_token || !tokens?.refresh_token) {
          throw new ApiError("Phản hồi làm mới phiên không hợp lệ", 502, { code: "INVALID_TOKEN_RESPONSE" })
        }
        if (tokenEpoch !== epoch || getRefreshToken() !== refreshToken) {
          return getAccessToken() ? "superseded" : "unavailable"
        }
        rotateTokens(tokens, tokenStorage() === localStorage, refreshToken)
        return "refreshed"
      }
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
      if (locks?.request) {
        return locks.request("iqx.auth.refresh", { mode: "exclusive" }, async () => {
          await recoverPeerRefresh(refreshToken)
          return run()
        })
      }
      return run()
    }
    refreshPromise = perform()
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function requestUrl(path: string): string {
  const candidate = path.trim()
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    let url: URL
    try { url = new URL(candidate) } catch { throw new TypeError("Địa chỉ API không hợp lệ") }
    if (url.username || url.password || !/^https?:$/.test(url.protocol)) {
      throw new TypeError("Chỉ cho phép URL API http(s) không chứa thông tin đăng nhập")
    }
    const configured = new URL(API_BASE, typeof window === "undefined" ? "http://localhost" : window.location.origin)
    if (url.origin !== configured.origin) throw new TypeError("Từ chối yêu cầu API tới origin không được cấu hình")
    return url.toString()
  }
  if (candidate.startsWith("//")) throw new TypeError("Đường dẫn API không hợp lệ")
  const suffix = candidate.startsWith("/") ? candidate : `/${candidate}`
  return `${API_BASE}${suffix}`
}

function isAuthRoute(path: string): boolean {
  const pathname = path.split("?", 1)[0]
  return [
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].includes(pathname)
}

async function executeWithSession(path: string, transport: (token: string | null) => Promise<Response>, signal?: AbortSignal): Promise<Response> {
  const initialToken = getAccessToken()
  let requestToken = initialToken
  let response = await transport(requestToken)
  if (response.status === 401 && !isAuthRoute(path) && requestToken) {
    // A refresh in another request/tab may already have completed. Do not
    // replay the rotated refresh token; retry once with the observed token.
    let refreshed = false
    const currentToken = getAccessToken()
    if (currentToken && currentToken !== requestToken) {
      requestToken = currentToken
      response = await transport(requestToken)
      refreshed = true
    } else {
      const outcome = await refreshSession()
      if (outcome === "refreshed" || outcome === "superseded") {
        const nextToken = getAccessToken()
        if (nextToken) {
          requestToken = nextToken
          response = await transport(requestToken)
          refreshed = true
        }
      }
    }
    if ((!refreshed || response.status === 401) && getAccessToken() === requestToken && !signal?.aborted) {
      clearTokens()
      notifySessionExpired()
    }
  }
  if (!response.ok) throw await parseError(response)
  return response
}

export async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const makeRequest = (requestToken: string | null): Promise<Response> => {
    const headers = new Headers(options.headers)
    if (
      options.body
      && !(options.body instanceof FormData)
      && !(options.body instanceof Blob)
      && !(options.body instanceof URLSearchParams)
      && !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json")
    }
    if (requestToken) headers.set("Authorization", `Bearer ${requestToken}`)
    return fetch(requestUrl(path), { ...options, headers })
  }
  return executeWithSession(path, makeRequest, options.signal ?? undefined)
}

/** Multipart upload transport with real XHR progress and shared auth refresh. */
export function apiUpload(path: string, file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<Response> {
  const send = (token: string | null): Promise<Response> => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Đã huỷ tải tệp", "AbortError")); return }
    if (typeof XMLHttpRequest === "undefined") { reject(new Error("Trình duyệt không hỗ trợ tải tệp")); return }
    const xhr = new XMLHttpRequest()
    xhr.open("POST", requestUrl(path))
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress((event.loaded / event.total) * 100) }
    const abort = () => xhr.abort()
    signal?.addEventListener("abort", abort, { once: true })
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort)
      const headers = new Headers()
      const rawHeaders = xhr.getAllResponseHeaders?.() || ""
      rawHeaders.trim().split(/[\r\n]+/).forEach(line => {
        const index = line.indexOf(":")
        if (index > 0) headers.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
      })
      // Response disallows status 0, although XHR may expose it for a failed
      // load that still reaches `onload` in some test doubles/browsers.
      const status = xhr.status === 0 ? 500 : xhr.status
      const payload = status === 204 || status === 205 ? null : xhr.responseText
      resolve(new Response(payload, { status, statusText: xhr.statusText, headers }))
    }
    xhr.onerror = () => { signal?.removeEventListener("abort", abort); reject(new Error("Tải tệp thất bại")) }
    xhr.onabort = () => { signal?.removeEventListener("abort", abort); reject(new DOMException("Đã huỷ tải tệp", "AbortError")) }
    const body = new FormData()
    body.append("file", file)
    xhr.send(body)
  })
  return executeWithSession(path, send, signal)
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, options)
  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  try { return JSON.parse(text) as T } catch {
    throw new ApiError("Phản hồi máy chủ không hợp lệ", 502, { code: "INVALID_RESPONSE" })
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Đã có lỗi xảy ra. Vui lòng thử lại."
}

export type { TokenPair }
