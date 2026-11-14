/**
 * WebSocket of the trading floor (`/api/v2/trading-floor/ws`, JSON text frames).
 *
 * Same handshake as Flashback: the first message is `{type:'auth', token}` (the token never goes in
 * the URL), the server answers `ready` or closes with 4401. After that the socket sends and
 * receives plain `{type, ...}` objects (see `ServerMessage`).
 *
 * - Reconnects with backoff 1 s, 2 s, 4 s ... up to 15 s, with jitter. A 4401 close first refreshes
 *   the session with an authenticated request.
 * - Application ping every 25 s; 55 s without hearing anything counts as a dead connection.
 * - `on(type, handler)` handlers stay registered across reconnects and `stop()`/`start()`; each
 *   registration returns its own unsubscribe. The `ready` message is dispatched to handlers too, so
 *   the presence layer can say `hello` after every (re)connect.
 */
import { getAccessToken, getWebSocketUrl, resolveWsUrl } from "@/lib/api"

import { Store } from "../bridge.ts"
import { floorApi } from "./api.ts"
import type {
  ClientMessage,
  ServerMessage,
  ServerMessageOf,
  ServerMessageType,
} from "./types.ts"

export const FLOOR_SOCKET_PATH = "/trading-floor/ws"
/**
 * Address of the floor socket. When `VITE_WS_URL` points at the market data channel, `getWebSocketUrl`
 * would return that channel whatever the path, so the floor path replaces its `/market-data/ws` tail
 * (same rule as the Flashback room socket).
 */
export function floorSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (!configured) return getWebSocketUrl(FLOOR_SOCKET_PATH)
  try {
    const url = new URL(resolveWsUrl())
    url.pathname =
      url.pathname.replace(/\/market-data\/ws\/?$/, "") + FLOOR_SOCKET_PATH
    return url.toString()
  } catch {
    return getWebSocketUrl(FLOOR_SOCKET_PATH)
  }
}

/** Close code the server uses for a missing or bad token. */
export const CLOSE_AUTH = 4401
/** The account opened more sockets than the server keeps: this (oldest) one was replaced. */
export const CLOSE_TOO_MANY = 4429

export type FloorSocketStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "online"
  | "reconnecting"
  | "closed"

export interface WebSocketLike {
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface FloorSocketOptions {
  getToken?: () => string | null
  /** Refreshes the session when the server closes with 4401. */
  refreshAuth?: () => Promise<unknown>
  createSocket?: (url: string) => WebSocketLike
  url?: () => string
  random?: () => number
}

export const PING_MS = 25_000
export const DEAD_AFTER_MS = 55_000
export const BACKOFF_BASE_MS = 1_000
export const BACKOFF_MAX_MS = 15_000
const MAX_AUTH_RETRIES = 3
const OPEN = 1

type Handler = (message: ServerMessage) => void

/** Anything with a string `type` that is not a known message, for forward compatibility. */
type UnknownMessage = { type: string; [key: string]: unknown }

export function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  )
}

export class FloorSocketClient {
  readonly status = new Store<FloorSocketStatus>("idle")
  private userId: string | null = null
  private readonly getToken: () => string | null
  private readonly refreshAuth: () => Promise<unknown>
  private readonly createSocket: (url: string) => WebSocketLike
  private readonly url: () => string
  private readonly random: () => number
  private readonly handlers = new Map<string, Set<Handler>>()
  private socket: WebSocketLike | null = null
  private attempt = 0
  private authFailures = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private lastHeard = 0
  private stopped = true
  private everReady = false
  private readonly onBrowserOnline = (): void => {
    if (this.status.get() === "reconnecting") this.connectNow()
  }

  constructor(options: FloorSocketOptions = {}) {
    this.getToken = options.getToken ?? getAccessToken
    this.refreshAuth = options.refreshAuth ?? (() => floorApi.me())
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike)
    this.url = options.url ?? floorSocketUrl
    this.random = options.random ?? Math.random
  }

  /** The account id the server confirmed with `ready`, null while offline. */
  get currentUserId(): string | null {
    return this.userId
  }

  /** Connects when the floor mounts. Calling it again while running does nothing. */
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.attempt = 0
    this.authFailures = 0
    this.everReady = false
    if (typeof window !== "undefined")
      window.addEventListener("online", this.onBrowserOnline)
    this.connectNow()
  }

  /** Closes the connection and stops reconnecting. Handlers stay registered. */
  stop(): void {
    this.stopped = true
    if (typeof window !== "undefined")
      window.removeEventListener("online", this.onBrowserOnline)
    this.clearTimers()
    this.detach(1000, "client closed")
    this.userId = null
    this.status.set("closed")
  }

  /** Subscribes to one message type; returns the unsubscribe. */
  on<T extends ServerMessageType>(
    type: T,
    handler: (message: ServerMessageOf<T>) => void
  ): () => void
  on(type: string, handler: (message: UnknownMessage) => void): () => void
  on(type: string, handler: (message: never) => void): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>()
    set.add(handler as unknown as Handler)
    this.handlers.set(type, set)
    return () => {
      set.delete(handler as unknown as Handler)
    }
  }

  /** Sends a message; false when the socket is not ready (nothing is queued). */
  send(message: ClientMessage): boolean {
    const socket = this.socket
    if (!socket || socket.readyState !== OPEN || this.status.get() !== "online")
      return false
    try {
      socket.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  // ---------- internals ----------

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.reconnectTimer = null
    this.pingTimer = null
  }

  /** Drops the current socket without triggering its close handler. */
  private detach(code: number, reason: string): void {
    const socket = this.socket
    this.socket = null
    if (!socket) return
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
    try {
      socket.close(code, reason)
    } catch {
      // Already closed.
    }
  }

  private connectNow(): void {
    if (this.stopped) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const token = this.getToken()
    if (!token) {
      this.status.set("closed")
      return
    }
    this.status.set(
      this.everReady || this.attempt > 0 ? "reconnecting" : "connecting"
    )
    let socket: WebSocketLike
    try {
      socket = this.createSocket(this.url())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket) return
      this.lastHeard = Date.now()
      this.status.set("authenticating")
      this.raw({ type: "auth", token })
      this.startPing()
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      this.lastHeard = Date.now()
      this.onMessage(event.data)
    }
    // `onclose` always follows and handles the reconnect.
    socket.onerror = () => undefined
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.onClosed(event.code)
    }
  }

  private raw(
    message: { type: "auth"; token: string } | { type: "ping" }
  ): void {
    try {
      this.socket?.send(JSON.stringify(message))
    } catch {
      // Closed: onclose takes over.
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      if (!this.socket) return
      if (Date.now() - this.lastHeard > DEAD_AFTER_MS) {
        // A silently dead connection: drop it and reconnect.
        this.detach(4000, "ping timeout")
        this.onClosed(4000)
        return
      }
      this.raw({ type: "ping" })
    }, PING_MS)
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return
    let message: unknown
    try {
      message = JSON.parse(data)
    } catch {
      return
    }
    if (!isServerMessage(message)) return
    if (message.type === "ready") {
      this.attempt = 0
      this.authFailures = 0
      this.everReady = true
      this.userId = message.userId
      this.status.set("online")
    }
    const set = this.handlers.get(message.type)
    if (set) for (const handler of [...set]) handler(message)
  }

  private onClosed(code: number): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.userId = null
    if (this.stopped) return
    if (code === CLOSE_TOO_MANY) {
      // Tab khác của cùng tài khoản đã thế chỗ: không nối lại, nếu không các tab giành nhau mãi.
      this.stopped = true
      this.status.set("closed")
      return
    }
    if (code === CLOSE_AUTH) {
      this.authFailures += 1
      if (this.authFailures > MAX_AUTH_RETRIES) {
        this.stopped = true
        this.status.set("closed")
        return
      }
      // The token may have expired: an authenticated request refreshes the session before the retry.
      this.status.set("reconnecting")
      void this.refreshAuth()
        .catch(() => undefined)
        .then(() => {
          if (!this.stopped) this.scheduleReconnect()
        })
      return
    }
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt)
    this.attempt += 1
    const jittered = Math.round(delay * (0.75 + this.random() * 0.5))
    this.status.set("reconnecting")
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connectNow(), jittered)
  }
}

/** The floor's one connection. */
export const floorSocket = new FloorSocketClient()
