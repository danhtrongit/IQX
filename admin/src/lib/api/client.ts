import ky, { HTTPError, type KyInstance } from "ky"
import { feedback } from "@/lib/feedback"

export const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

let accessToken: string | null = sessionStorage.getItem("admin_accessToken")
let refreshTokenPromise: Promise<boolean> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
  if (token) sessionStorage.setItem("admin_accessToken", token)
  else sessionStorage.removeItem("admin_accessToken")
}

export function getAccessToken() {
  return accessToken
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem("admin_refreshToken", token)
  else localStorage.removeItem("admin_refreshToken")
}

export function getRefreshToken() {
  return localStorage.getItem("admin_refreshToken")
}

export const api: KyInstance = ky.create({
  prefix: API_BASE,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = getAccessToken()
        if (token) request.headers.set("Authorization", `Bearer ${token}`)
      },
    ],
    afterResponse: [
      async ({ request, response }) => {
        if (response.status !== 401) return response
        const refreshed = await tryRefreshToken()
        if (!refreshed) {
          setAccessToken(null)
          setRefreshToken(null)
          window.dispatchEvent(new CustomEvent("auth:logout"))
          return response
        }
        const token = getAccessToken()
        if (token) request.headers.set("Authorization", `Bearer ${token}`)
        return ky(request)
      },
    ],
    beforeError: [
      async ({ error }) => {
        const body = error instanceof HTTPError
          ? await error.response.json<{ detail?: string; message?: string }>().catch(() => null)
          : null
        const message = body?.detail ?? body?.message
        if (message) error.message = message
        return error
      },
    ],
  },
})

export async function tryRefreshToken(): Promise<boolean> {
  if (refreshTokenPromise) return refreshTokenPromise
  refreshTokenPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await ky
        .post(`${API_BASE}/auth/refresh`, { json: { refresh_token: refreshToken } })
        .json<{ access_token: string; refresh_token: string }>()
      setAccessToken(res.access_token)
      setRefreshToken(res.refresh_token)
      return true
    } catch (error) {
      feedback.message?.error(error instanceof Error ? error.message : "Phiên đăng nhập đã hết hạn")
      return false
    } finally {
      refreshTokenPromise = null
    }
  })()
  return refreshTokenPromise
}

export async function downloadBlob(path: string, filename: string) {
  const token = getAccessToken()
  const response = await fetch(`${API_BASE}/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error("Xuất tệp thất bại")
  const href = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(href)
}

export function uploadFile(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_BASE}/${url}`)
    const token = getAccessToken()
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status < 300) resolve(new Response(xhr.responseText, { status: xhr.status }))
      else reject(new Error(parseUploadError(xhr.responseText, xhr.status)))
    }
    xhr.onerror = () => reject(new Error("Tải tệp thất bại"))
    xhr.onabort = () => reject(new Error("Đã hủy tải tệp"))
    signal?.addEventListener("abort", () => xhr.abort())
    const formData = new FormData()
    formData.append("file", file)
    xhr.send(formData)
  })
}

function parseUploadError(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { detail?: string }
    return body.detail ?? `Tải tệp thất bại (${status})`
  } catch {
    return `Tải tệp thất bại (${status})`
  }
}
