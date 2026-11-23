/**
 * Real-time presence, movement, and live query invalidation WebSocket client
 * for Khu Văn phòng (`/api/v2/office/ws`, JSON text frames).
 *
 * Mirrors `trading-floor/net/socket.ts`:
 * - Resolves `/office/ws` cleanly even when `VITE_WS_URL` targets `/market-data/ws`
 * - First-frame JWT auth `{ type: 'auth', token }` (never puts token in URL)
 * - 25s app heartbeat (`ping`/`pong`), 55s dead-connection sweep
 * - Exponential backoff reconnect (`1s..15s` + jitter); stops cleanly on `4401`, `4403`, `4429`
 * - Throttles outbound `state` frames to `100ms` while moving, immediate on stop/facing change
 */
import type { QueryClient } from "@tanstack/react-query"

import { getAccessToken, getWebSocketUrl, resolveWsUrl } from "@/lib/api"
import { notificationKeys } from "@/pages/notifications/api.ts"

import { invalidateOfficeScope } from "./hooks.ts"
import type {
  OfficeFacing,
  OfficeOnlinePeer,
  OfficeRole,
  OfficeSelfStatePayload,
  OfficeSyncScope,
} from "./types.ts"
import { resolveOfficeAvatarId } from "./utils.ts"

export const OFFICE_SOCKET_PATH = "/office/ws"
export const OFFICE_CLOSE_AUTH = 4401
export const OFFICE_CLOSE_FORBIDDEN = 4403
export const OFFICE_CLOSE_TOO_MANY = 4429

export const OFFICE_PING_MS = 25_000
export const OFFICE_DEAD_AFTER_MS = 55_000
export const OFFICE_BACKOFF_BASE_MS = 1_000
export const OFFICE_BACKOFF_MAX_MS = 15_000
export const OFFICE_STATE_THROTTLE_MS = 100

const OPEN_STATE = 1

const VALID_FACINGS: ReadonlySet<string> = new Set([
  "up",
  "down",
  "left",
  "right",
])
const VALID_SYNC_SCOPES: ReadonlySet<string> = new Set([
  "tasks",
  "attendance",
  "proposals",
  "meetings",
  "documents",
  "members",
  "leaderboard",
  "notifications",
])

export type OfficeSocketStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "online"
  | "reconnecting"
  | "closed"

export interface OfficeWebSocketLike {
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

interface RawServerPeer {
  peerId: string
  userId: string
  role: OfficeRole
  name: string
  avatar?: string | null
  avatarColor?: string | null
  accentColor?: string
  deskIndex?: number | null
  x: number
  y: number
  facing?: string
  moving?: boolean
}

export interface CreateOfficeSocketOptions {
  queryClient?: QueryClient
  userId?: string
  getToken?: () => string | null
  createSocket?: (url: string) => OfficeWebSocketLike
  url?: () => string
  random?: () => number
  onStatusChange?: (status: OfficeSocketStatus) => void
  onWelcome?: (
    self: OfficeOnlinePeer,
    peers: OfficeOnlinePeer[],
    onlineCount: number
  ) => void
  onPeersChange?: (peers: OfficeOnlinePeer[], onlineCount: number) => void
  onSync?: (scope: OfficeSyncScope) => void
  onNotification?: (payload: Record<string, unknown>) => void
  onError?: (code: string, message: string) => void
}

export interface OfficeSocketHandle {
  start: () => void
  stop: () => void
  sendState: (state: OfficeSelfStatePayload) => boolean
  getStatus: () => OfficeSocketStatus
  getPeers: () => OfficeOnlinePeer[]
  getOnlineCount: () => number
}

/**
 * Resolves `/api/v2/office/ws` respecting `VITE_WS_URL` (stripping trailing `/market-data/ws`
 * just like `floorSocketUrl()`).
 */
export function officeSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (!configured) return getWebSocketUrl(OFFICE_SOCKET_PATH)
  try {
    const url = new URL(resolveWsUrl())
    url.pathname =
      url.pathname.replace(/\/market-data\/ws\/?$/, "") + OFFICE_SOCKET_PATH
    return url.toString()
  } catch {
    return getWebSocketUrl(OFFICE_SOCKET_PATH)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseFacing(value: unknown): OfficeFacing {
  return typeof value === "string" && VALID_FACINGS.has(value)
    ? (value as OfficeFacing)
    : "down"
}

function parsePeer(raw: unknown): OfficeOnlinePeer | null {
  const obj = asRecord(raw) as Partial<RawServerPeer> | null
  if (
    !obj ||
    typeof obj.userId !== "string" ||
    typeof obj.name !== "string" ||
    typeof obj.x !== "number" ||
    typeof obj.y !== "number"
  ) {
    return null
  }
  const role: OfficeRole = obj.role === "boss" ? "boss" : "staff"
  return {
    peerId: typeof obj.peerId === "string" ? obj.peerId : obj.userId,
    userId: obj.userId,
    name: obj.name,
    role,
    avatarId: resolveOfficeAvatarId(
      obj.userId,
      obj.avatar ?? null,
      obj.name,
      role === "boss"
    ),
    avatarColor: typeof obj.avatarColor === "string" ? obj.avatarColor : null,
    accentColor:
      typeof obj.accentColor === "string" && obj.accentColor
        ? obj.accentColor
        : role === "boss"
          ? "#B7791F"
          : "#1D6FE8",
    deskIndex: typeof obj.deskIndex === "number" ? obj.deskIndex : null,
    x: obj.x,
    y: obj.y,
    facing: parseFacing(obj.facing),
    moving: obj.moving === true,
  }
}

export function createOfficeSocket(
  options: CreateOfficeSocketOptions = {}
): OfficeSocketHandle {
  const getToken = options.getToken ?? getAccessToken
  const createSocket =
    options.createSocket ??
    ((u: string) => new WebSocket(u) as unknown as OfficeWebSocketLike)
  const resolveUrl = options.url ?? officeSocketUrl
  const random = options.random ?? Math.random

  let status: OfficeSocketStatus = "idle"
  let socket: OfficeWebSocketLike | null = null
  let stopped = true
  let everWelcome = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let lastHeardMs = 0

  let selfUserId: string | null = options.userId ?? null
  let onlineCount = 0
  const peersByConn = new Map<string, OfficeOnlinePeer>()

  let lastSentAtMs = 0
  let lastSentFacing: OfficeFacing = "down"
  let lastSentMoving = false

  const setStatus = (next: OfficeSocketStatus): void => {
    if (status === next) return
    status = next
    options.onStatusChange?.(next)
  }

  /** Deduplicates multi-tab connections per userId and excludes local self. */
  const snapshotPeers = (): OfficeOnlinePeer[] => {
    const byUser = new Map<string, OfficeOnlinePeer>()
    for (const peer of peersByConn.values()) {
      if (selfUserId && peer.userId === selfUserId) continue
      byUser.set(peer.userId, peer)
    }
    return [...byUser.values()]
  }

  const emitPeers = (): void => {
    options.onPeersChange?.(snapshotPeers(), onlineCount)
  }

  const clearTimers = (): void => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (pingTimer) clearInterval(pingTimer)
    reconnectTimer = null
    pingTimer = null
  }

  const detach = (code: number, reason: string): void => {
    const active = socket
    socket = null
    if (!active) return
    active.onopen = active.onmessage = active.onclose = active.onerror = null
    try {
      active.close(code, reason)
    } catch {
      // Socket already closed.
    }
  }

  const sendRaw = (payload: Record<string, unknown>): boolean => {
    if (!socket || socket.readyState !== OPEN_STATE) return false
    try {
      socket.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  const invalidateNotifications = (): void => {
    const qc = options.queryClient
    if (!qc) return
    const uid = selfUserId ?? options.userId
    if (uid) {
      void qc.invalidateQueries({ queryKey: notificationKeys.all(uid) })
      void qc.invalidateQueries({ queryKey: notificationKeys.unread(uid) })
      void qc.invalidateQueries({ queryKey: notificationKeys.list(uid) })
    } else {
      void qc.invalidateQueries({ queryKey: ["notifications"] })
    }
  }

  const handleMessage = (rawData: unknown): void => {
    if (typeof rawData !== "string") return
    let parsed: unknown
    try {
      parsed = JSON.parse(rawData)
    } catch {
      return
    }
    const msg = asRecord(parsed)
    if (!msg || typeof msg.type !== "string") return

    switch (msg.type) {
      case "pong":
        return

      case "welcome": {
        const selfPeer = parsePeer(msg.self)
        if (!selfPeer) return
        selfUserId = selfPeer.userId
        peersByConn.clear()
        if (Array.isArray(msg.peers)) {
          for (const item of msg.peers) {
            const p = parsePeer(item)
            if (p && p.peerId) peersByConn.set(p.peerId, p)
          }
        }
        onlineCount =
          typeof msg.onlineCount === "number"
            ? msg.onlineCount
            : snapshotPeers().length + 1
        attempt = 0
        everWelcome = true
        lastSentAtMs = 0
        setStatus("online")
        const list = snapshotPeers()
        options.onWelcome?.(selfPeer, list, onlineCount)
        options.onPeersChange?.(list, onlineCount)
        return
      }

      case "peer:join": {
        const peer = parsePeer(msg.peer)
        if (!peer) return
        if (peer.peerId) peersByConn.set(peer.peerId, peer)
        if (typeof msg.onlineCount === "number") {
          onlineCount = msg.onlineCount
        }
        emitPeers()
        return
      }

      case "peer:state": {
        const peerId = typeof msg.peerId === "string" ? msg.peerId : null
        const userId = typeof msg.userId === "string" ? msg.userId : null
        const x = typeof msg.x === "number" ? msg.x : null
        const y = typeof msg.y === "number" ? msg.y : null
        if (x === null || y === null) return

        const existing =
          (peerId ? peersByConn.get(peerId) : undefined) ??
          (userId
            ? [...peersByConn.values()].find((p) => p.userId === userId)
            : undefined)
        if (!existing) return
        const updated: OfficeOnlinePeer = {
          ...existing,
          x,
          y,
          facing: parseFacing(msg.facing ?? existing.facing),
          moving: msg.moving === true,
        }
        peersByConn.set(updated.peerId ?? updated.userId, updated)
        emitPeers()
        return
      }

      case "peer:leave": {
        const peerId = typeof msg.peerId === "string" ? msg.peerId : null
        const userId = typeof msg.userId === "string" ? msg.userId : null
        if (peerId) {
          peersByConn.delete(peerId)
        } else if (userId) {
          for (const [key, peer] of [...peersByConn]) {
            if (peer.userId === userId) peersByConn.delete(key)
          }
        }
        if (typeof msg.onlineCount === "number") {
          onlineCount = msg.onlineCount
        }
        emitPeers()
        return
      }

      case "office:sync": {
        const scope =
          typeof msg.scope === "string" && VALID_SYNC_SCOPES.has(msg.scope)
            ? (msg.scope as OfficeSyncScope)
            : null
        if (!scope) return
        if (scope === "notifications") {
          invalidateNotifications()
        } else if (options.queryClient) {
          invalidateOfficeScope(
            options.queryClient,
            scope,
            selfUserId ?? options.userId
          )
        }
        options.onSync?.(scope)
        return
      }

      case "office:notification": {
        invalidateNotifications()
        options.onNotification?.(msg)
        return
      }

      case "error": {
        const code = typeof msg.code === "string" ? msg.code : "ERROR"
        const message =
          typeof msg.message === "string" ? msg.message : "Lỗi kết nối"
        options.onError?.(code, message)
        return
      }
    }
  }

  const scheduleReconnect = (): void => {
    if (stopped) return
    const delay = Math.min(
      OFFICE_BACKOFF_MAX_MS,
      OFFICE_BACKOFF_BASE_MS * 2 ** attempt
    )
    attempt += 1
    const jittered = Math.round(delay * (0.75 + random() * 0.5))
    setStatus("reconnecting")
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => connectNow(), jittered)
  }

  const handleClosed = (code: number): void => {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = null
    if (stopped) return
    if (
      code === OFFICE_CLOSE_AUTH ||
      code === OFFICE_CLOSE_FORBIDDEN ||
      code === OFFICE_CLOSE_TOO_MANY
    ) {
      stopped = true
      setStatus("closed")
      return
    }
    scheduleReconnect()
  }

  const startHeartbeat = (): void => {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (!socket) return
      if (Date.now() - lastHeardMs > OFFICE_DEAD_AFTER_MS) {
        detach(4000, "ping timeout")
        handleClosed(4000)
        return
      }
      sendRaw({ type: "ping" })
    }, OFFICE_PING_MS)
  }

  const connectNow = (): void => {
    if (stopped) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null

    const token = getToken()
    if (!token) {
      setStatus("closed")
      return
    }

    setStatus(everWelcome || attempt > 0 ? "reconnecting" : "connecting")
    let nextSocket: OfficeWebSocketLike
    try {
      nextSocket = createSocket(resolveUrl())
    } catch {
      scheduleReconnect()
      return
    }

    socket = nextSocket
    nextSocket.onopen = () => {
      if (socket !== nextSocket) return
      lastHeardMs = Date.now()
      setStatus("authenticating")
      sendRaw({ type: "auth", token })
      startHeartbeat()
    }
    nextSocket.onmessage = (event) => {
      if (socket !== nextSocket) return
      lastHeardMs = Date.now()
      handleMessage(event.data)
    }
    nextSocket.onerror = () => undefined
    nextSocket.onclose = (event) => {
      if (socket !== nextSocket) return
      socket = null
      handleClosed(event.code)
    }
  }

  const onBrowserOnline = (): void => {
    if (!stopped && status === "reconnecting") {
      connectNow()
    }
  }

  const start = (): void => {
    if (!stopped) return
    stopped = false
    attempt = 0
    everWelcome = false
    if (typeof window !== "undefined") {
      window.addEventListener("online", onBrowserOnline)
    }
    connectNow()
  }

  const stop = (): void => {
    stopped = true
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onBrowserOnline)
    }
    clearTimers()
    detach(1000, "client closed")
    peersByConn.clear()
    onlineCount = 0
    setStatus("closed")
  }

  const sendState = (state: OfficeSelfStatePayload): boolean => {
    if (status !== "online" || !socket || socket.readyState !== OPEN_STATE) {
      return false
    }
    const now = Date.now()
    const stoppedNow = !state.moving && lastSentMoving
    const facingChanged = state.facing !== lastSentFacing
    const startedNow = state.moving && !lastSentMoving
    if (
      !stoppedNow &&
      !facingChanged &&
      !startedNow &&
      now - lastSentAtMs < OFFICE_STATE_THROTTLE_MS
    ) {
      return false
    }
    lastSentAtMs = now
    lastSentFacing = state.facing
    lastSentMoving = state.moving
    return sendRaw({
      type: "state",
      x: Math.round(state.x * 10) / 10,
      y: Math.round(state.y * 10) / 10,
      facing: state.facing,
      moving: state.moving,
    })
  }

  return {
    start,
    stop,
    sendState,
    getStatus: () => status,
    getPeers: snapshotPeers,
    getOnlineCount: () => onlineCount,
  }
}
