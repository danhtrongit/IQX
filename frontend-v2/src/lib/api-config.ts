const DEFAULT_API_BASE = "/api/v2"
const DEFAULT_WS_PATH = "/market-data/ws"

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "") || "/"
}

function invalidConfig(name: string, value: string): never {
  // Do not echo the configured URL: malformed values can contain credentials.
  void value
  throw new TypeError(`${name} must be a relative path or an absolute URL with an allowed scheme and no credentials`)
}

function normalizeApiBase(value: string): string {
  const candidate = value.trim()
  if (!candidate) return DEFAULT_API_BASE
  if (candidate.startsWith("//")) invalidConfig("VITE_API_URL", candidate)
  if (candidate.startsWith("/")) return trimTrailingSlash(candidate)
  let url: URL
  try { url = new URL(candidate) } catch { return invalidConfig("VITE_API_URL", candidate) }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    invalidConfig("VITE_API_URL", candidate)
  }
  return trimTrailingSlash(url.toString())
}

/** Base URL for the v2 HTTP API. Relative URLs stay same-origin in production. */
export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_BASE)

function websocketProtocol(): string {
  if (typeof window === "undefined") return "ws:"
  return window.location.protocol === "https:" ? "wss:" : "ws:"
}

function normalizeWsConfig(value: string): string {
  const candidate = value.trim()
  if (candidate.startsWith("//")) invalidConfig("VITE_WS_URL", candidate)
  if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^wss?:\/\//i.test(candidate)) {
    invalidConfig("VITE_WS_URL", candidate)
  }
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) return candidate
  let url: URL
  try { url = new URL(candidate) } catch { return invalidConfig("VITE_WS_URL", candidate) }
  if (!/^wss?:$/.test(url.protocol) || url.username || url.password) invalidConfig("VITE_WS_URL", candidate)
  return url.toString()
}

/** Resolve an absolute or same-origin relative WebSocket endpoint. */
export function resolveWsUrl(value = import.meta.env.VITE_WS_URL?.trim()): string {
  const configured = value?.trim()
  if (configured) {
    const normalized = normalizeWsConfig(configured)
    if (/^wss?:\/\//i.test(normalized)) return normalized
    if (typeof window === "undefined") return normalized
    const url = new URL(normalized, window.location.origin)
    if (url.username || url.password) invalidConfig("VITE_WS_URL", configured)
    url.protocol = websocketProtocol()
    return url.toString()
  }
  return getWebSocketUrl()
}

/** Resolve a path below the configured API v2 WebSocket namespace. */
export function getWebSocketUrl(path = DEFAULT_WS_PATH): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured) return resolveWsUrl(configured)
  const normalized = path.startsWith("/") ? path : `/${path}`
  const endpoint = `${API_BASE}${normalized}`
  if (typeof window === "undefined") {
    if (/^https?:\/\//i.test(endpoint)) {
      const url = new URL(endpoint)
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
      return url.toString()
    }
    return endpoint
  }
  const url = new URL(endpoint, window.location.origin)
  url.protocol = url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : websocketProtocol()
  return url.toString()
}
