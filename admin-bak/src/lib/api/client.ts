import ky, { type KyInstance } from "ky"

export const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

// Access token stored in sessionStorage (tab-scoped, cleared on close)
let _accessToken: string | null = sessionStorage.getItem("admin_accessToken")

export function setAccessToken(token: string | null) {
  _accessToken = token
  if (token) sessionStorage.setItem("admin_accessToken", token)
  else sessionStorage.removeItem("admin_accessToken")
}

export function getAccessToken() {
  return _accessToken
}

// Refresh token stored in localStorage (survives tab close)
export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem("admin_refreshToken", token)
  else localStorage.removeItem("admin_refreshToken")
}

export function getRefreshToken() {
  return localStorage.getItem("admin_refreshToken")
}

export const api: KyInstance = ky.create({
  prefixUrl: API_BASE,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = getAccessToken()
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status === 401) {
          const refreshed = await tryRefreshToken()
          if (!refreshed) {
            setAccessToken(null)
            setRefreshToken(null)
            window.dispatchEvent(new CustomEvent("auth:logout"))
            return response
          }

          const token = getAccessToken()
          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`)
          }
          return ky(request)
        }
      },
    ],
  },
})

let refreshTokenPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  if (refreshTokenPromise) {
    return refreshTokenPromise
  }

  refreshTokenPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
      const res = await ky
        .post(`${API_BASE}/auth/refresh`, {
          json: { refresh_token: refreshToken },
        })
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
