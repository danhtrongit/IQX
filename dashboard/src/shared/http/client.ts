import ky, { type KyInstance, HTTPError } from "ky"

/**
 * The single HTTP client for the whole dashboard.
 * - Injects the bearer access token on every request.
 * - On 401, transparently refreshes the token once (deduped) and retries.
 * - On refresh failure, clears tokens and dispatches `auth:logout`.
 *
 * All feature API modules MUST import `api` from here — there is exactly one
 * HTTP client (the old raw-fetch market client has been folded in).
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

const ACCESS_TOKEN_KEY = "accessToken"
const REFRESH_TOKEN_KEY = "refreshToken"
export const AUTH_LOGOUT_EVENT = "auth:logout"

let _accessToken: string | null = localStorage.getItem(ACCESS_TOKEN_KEY)

export function getAccessToken(): string | null {
  return _accessToken
}

export function setAccessToken(token: string | null): void {
  _accessToken = token
  if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token)
  else localStorage.removeItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
  else localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function clearAuthTokens(): void {
  setAccessToken(null)
  setRefreshToken(null)
}

let refreshTokenPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  if (refreshTokenPromise) return refreshTokenPromise

  refreshTokenPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false
    try {
      // POST /auth/refresh { refresh_token } → { access_token, refresh_token, token_type }
      const res = await ky
        .post(`${API_BASE}/auth/refresh`, { json: { refresh_token: refreshToken } })
        .json<{ access_token: string; refresh_token: string; token_type: string }>()
      setAccessToken(res.access_token)
      setRefreshToken(res.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshTokenPromise = null
    }
  })()

  return refreshTokenPromise
}

export const api: KyInstance = ky.create({
  prefixUrl: API_BASE,
  timeout: 15000,
  retry: 0,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = getAccessToken()
        if (token) request.headers.set("Authorization", `Bearer ${token}`)
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status === 401) {
          const refreshed = await tryRefreshToken()
          if (!refreshed) {
            clearAuthTokens()
            window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT))
            return
          }
          const token = getAccessToken()
          if (token) request.headers.set("Authorization", `Bearer ${token}`)
          return ky(request)
        }
      },
    ],
  },
})

/** Backend envelope for all market-data endpoints. */
export interface MarketDataResponse<T> {
  data: T
  meta?: {
    source?: string
    source_priority?: number
    fallback_used?: boolean
    as_of?: string
    raw_endpoint?: string
  }
}

/** Unwrap the `{ data, meta }` envelope, tolerating already-unwrapped payloads. */
export function unwrap<T>(res: MarketDataResponse<T> | T): T {
  if (res && typeof res === "object" && "data" in (res as object)) {
    return (res as MarketDataResponse<T>).data
  }
  return res as T
}

/** Extract a human-readable (Vietnamese-friendly) message from any thrown error. */
export async function getErrorMessage(
  err: unknown,
  fallback = "Đã xảy ra lỗi. Vui lòng thử lại.",
): Promise<string> {
  if (err instanceof HTTPError) {
    try {
      const body = (await err.response.json()) as {
        detail?: string | Array<{ msg?: string }>
        message?: string | Array<{ msg?: string }>
      }
      const detail = body?.detail ?? body?.message
      if (typeof detail === "string") return detail
      if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
    } catch {
      /* response body not JSON */
    }
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
