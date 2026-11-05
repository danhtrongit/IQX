/**
 * Kết nối WebSocket theo phòng của Flashback (`/api/v2/flashback/ws`, giao thức ở
 * `room-socket-protocol.ts`), dùng chung cho chat ảnh và cuộc gọi.
 *
 * - Mỗi phòng chỉ có MỘT kết nối: `useFlashbackRoomSocket(code)` ở nhiều nơi cùng nhận một đối tượng,
 *   kết nối đóng khi nơi dùng cuối cùng gỡ ra.
 * - Tự xác thực (`auth` bằng access token, không đặt token trong URL), tự `room:join`, tự kết nối lại
 *   với backoff 1s, 2s, 4s... tối đa 15s (có jitter). Mỗi lần vào phòng xong server gửi lại
 *   `room:state` nên người nghe `room:state` (hoặc `generation` trong snapshot) biết để dựng lại
 *   trạng thái, ví dụ gửi lại `call:join`.
 * - Không kết nối lại khi bị mời ra (4403), phòng đóng (4410 hoặc `room:closed`) hoặc server từ chối
 *   vào phòng; token hết hạn (4401) thì làm mới phiên rồi thử lại vài lần.
 * - Ping ứng dụng mỗi 25 giây; im lặng quá 55 giây thì coi là chết và kết nối lại.
 *
 * API cho các phần khác:
 *   const socket = useFlashbackRoomSocket(roomCode)     // roomCode null thì không kết nối
 *   socket.status / socket.ready / socket.generation / socket.roomState
 *   socket.send({ type: "call:join", roomId, media })   // true nếu đã gửi, false nếu chưa sẵn sàng
 *   useEffect(() => socket.subscribe("image", handler), [socket.subscribe])
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"

import { getAccessToken } from "@/lib/api"
import { getWebSocketUrl, resolveWsUrl } from "@/lib/api-config"

import { fetchMyRoom } from "./flashback-api"
import {
  CLOSE_AUTH,
  CLOSE_LEFT_ROOM,
  CLOSE_ROOM_CLOSED,
  ROOM_SOCKET_PATH,
  isServerMessage,
  type AuthMessage,
  type ClientMessage,
  type PingMessage,
  type RoomJoinMessage,
  type RoomStateMessage,
  type ServerMessage,
  type ServerMessageOf,
  type ServerMessageType,
} from "./room-socket-protocol"

export type RoomSocketStatus = "idle" | "connecting" | "authenticating" | "joining" | "ready" | "reconnecting" | "closed"

/** Vì sao kết nối đã dừng hẳn (không còn tự kết nối lại). */
export type RoomSocketCloseReason = "left-room" | "room-closed" | "rejected" | "auth" | "stopped"

export type RoomSocketSnapshot = {
  readonly status: RoomSocketStatus
  readonly userId: string | null
  /** `room:state` mới nhất của lần vào phòng hiện tại. */
  readonly roomState: RoomStateMessage | null
  /** Tăng 1 mỗi lần vào phòng xong (kể cả sau khi kết nối lại). */
  readonly generation: number
  readonly closeReason: RoomSocketCloseReason | null
  /** Mã lỗi vào phòng khi `closeReason` là "rejected". */
  readonly errorCode: string | null
}

/** Thông điệp ứng dụng được phép gửi; `auth`, `room:join` và `ping` do kết nối tự lo. */
export type OutgoingMessage = Exclude<ClientMessage, AuthMessage | RoomJoinMessage | PingMessage>

export interface WebSocketLike {
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type RoomSocketOptions = {
  roomId: string
  getToken?: () => string | null
  /** Làm mới phiên đăng nhập khi server đóng 4401. */
  refreshAuth?: () => Promise<unknown>
  createSocket?: (url: string) => WebSocketLike
  url?: string
  random?: () => number
}

const OPEN = 1
export const PING_MS = 25_000
export const DEAD_AFTER_MS = 55_000
export const BACKOFF_BASE_MS = 1_000
export const BACKOFF_MAX_MS = 15_000
const MAX_AUTH_RETRIES = 3

const INITIAL: RoomSocketSnapshot = {
  status: "idle",
  userId: null,
  roomState: null,
  generation: 0,
  closeReason: null,
  errorCode: null,
}

/** Địa chỉ WebSocket của phòng: cùng nguồn gốc với kênh dữ liệu thị trường nếu `VITE_WS_URL` được đặt. */
export function roomSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (!configured) return getWebSocketUrl(ROOM_SOCKET_PATH)
  const base = resolveWsUrl()
  try {
    const url = new URL(base)
    url.pathname = url.pathname.replace(/\/market-data\/ws\/?$/, "") + ROOM_SOCKET_PATH
    return url.toString()
  } catch {
    return getWebSocketUrl(ROOM_SOCKET_PATH)
  }
}

type Handler = (message: ServerMessage) => void

export class RoomSocketClient {
  readonly roomId: string
  private readonly getToken: () => string | null
  private readonly refreshAuth: () => Promise<unknown>
  private readonly createSocket: (url: string) => WebSocketLike
  private readonly random: () => number
  private readonly url: string

  private socket: WebSocketLike | null = null
  private snapshot: RoomSocketSnapshot = INITIAL
  private readonly statusListeners = new Set<() => void>()
  private readonly handlers = new Map<string, Set<Handler>>()
  private attempt = 0
  private authFailures = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private lastHeard = 0
  private stopped = false
  private started = false
  private readonly onOnline = () => {
    if (this.snapshot.status === "reconnecting") this.connectNow()
  }

  constructor(options: RoomSocketOptions) {
    this.roomId = options.roomId
    this.getToken = options.getToken ?? getAccessToken
    this.refreshAuth = options.refreshAuth ?? (() => fetchMyRoom())
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike)
    this.url = options.url ?? roomSocketUrl()
    this.random = options.random ?? Math.random
  }

  // ---------------------------------------------------------------- API công khai

  readonly getSnapshot = (): RoomSocketSnapshot => this.snapshot

  readonly subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /** Đăng ký nhận một loại thông điệp từ server; trả hàm huỷ đăng ký. */
  readonly subscribe = <T extends ServerMessageType>(type: T, handler: (message: ServerMessageOf<T>) => void): (() => void) => {
    const set = this.handlers.get(type) ?? new Set<Handler>()
    set.add(handler as Handler)
    this.handlers.set(type, set)
    return () => {
      set.delete(handler as Handler)
    }
  }

  /** Gửi một thông điệp; false nếu chưa vào phòng xong (không xếp hàng, người gọi tự xử lý). */
  readonly send = (message: OutgoingMessage): boolean => {
    const socket = this.socket
    if (!socket || socket.readyState !== OPEN || this.snapshot.status !== "ready") return false
    try {
      socket.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.stopped = false
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline)
    this.connectNow()
  }

  /** Dừng hẳn và đóng kết nối (người dùng rời phòng hoặc không còn ai dùng). */
  close(): void {
    this.stopped = true
    this.started = false
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline)
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      try {
        socket.close(1000, "client closed")
      } catch {
        // Đã đóng.
      }
    }
    this.handlers.clear()
    this.set({ status: "closed", closeReason: "stopped", roomState: null })
  }

  // ---------------------------------------------------------------- nội bộ

  private set(patch: Partial<RoomSocketSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of [...this.statusListeners]) listener()
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.reconnectTimer = null
    this.pingTimer = null
  }

  private connectNow(): void {
    if (this.stopped) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const token = this.getToken()
    if (!token) {
      this.set({ status: "closed", closeReason: "auth" })
      return
    }
    this.set({ status: this.attempt === 0 && this.snapshot.generation === 0 ? "connecting" : "reconnecting", closeReason: null, errorCode: null })
    let socket: WebSocketLike
    try {
      socket = this.createSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket) return
      this.lastHeard = Date.now()
      this.set({ status: "authenticating" })
      this.raw({ type: "auth", token })
      this.startPing()
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      this.lastHeard = Date.now()
      this.onMessage(event.data)
    }
    socket.onerror = () => {
      // `onclose` luôn theo sau và lo việc kết nối lại.
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.onClosed(event.code)
    }
  }

  private raw(message: AuthMessage | RoomJoinMessage | PingMessage): void {
    try {
      this.socket?.send(JSON.stringify(message))
    } catch {
      // Đã đóng: onclose sẽ lo.
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      const socket = this.socket
      if (!socket) return
      if (Date.now() - this.lastHeard > DEAD_AFTER_MS) {
        // Kết nối chết im lặng: bỏ và kết nối lại.
        this.socket = null
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
        try {
          socket.close(4000, "ping timeout")
        } catch {
          // Đã đóng.
        }
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
    switch (message.type) {
      case "ready":
        this.authFailures = 0
        this.set({ status: "joining", userId: message.userId })
        this.raw({ type: "room:join", roomId: this.roomId })
        break
      case "room:state":
        if (message.roomId !== this.roomId) return
        this.attempt = 0
        this.set({ status: "ready", roomState: message, generation: this.snapshot.generation + 1 })
        break
      case "room:closed":
        this.stopFor("room-closed")
        break
      case "error":
        // Server từ chối vào phòng (không phải thành viên, phòng không còn): không thử lại.
        if (this.snapshot.status === "joining") {
          if (message.code === "NOT_IN_ROOM" || message.code === "ROOM_NOT_FOUND") {
            this.set({ errorCode: String(message.code) })
            this.stopFor("rejected")
          } else this.dropAndRetry()
        }
        break
      default:
        break
    }
    const set = this.handlers.get(message.type)
    if (set) for (const handler of [...set]) handler(message)
  }

  /** Lỗi tạm thời khi vào phòng: bỏ kết nối này và thử lại theo backoff. */
  private dropAndRetry(): void {
    const socket = this.socket
    this.socket = null
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      try {
        socket.close(4000, "join failed")
      } catch {
        // Đã đóng.
      }
    }
    this.scheduleReconnect()
  }

  /** Dừng hẳn, không kết nối lại. */
  private stopFor(reason: RoomSocketCloseReason): void {
    this.stopped = true
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      try {
        socket.close(1000, reason)
      } catch {
        // Đã đóng.
      }
    }
    this.set({ status: "closed", closeReason: reason, roomState: null })
  }

  private onClosed(code: number): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    if (this.stopped) return
    if (code === CLOSE_LEFT_ROOM) return this.stopFor("left-room")
    if (code === CLOSE_ROOM_CLOSED) return this.stopFor("room-closed")
    if (code === CLOSE_AUTH) {
      this.authFailures += 1
      if (this.authFailures > MAX_AUTH_RETRIES) return this.stopFor("auth")
      // Token có thể đã hết hạn: một yêu cầu có xác thực sẽ làm mới phiên rồi mới thử lại.
      this.set({ status: "reconnecting", roomState: null })
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
    this.set({ status: "reconnecting", roomState: null })
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connectNow(), jittered)
  }
}

// ------------------------------------------------------------------ dùng chung theo phòng

type Lease = { client: RoomSocketClient; refs: number; closeTimer: ReturnType<typeof setTimeout> | null }
const registry = new Map<string, Lease>()
const registryListeners = new Set<() => void>()
const notifyRegistry = () => {
  for (const listener of [...registryListeners]) listener()
}
const subscribeRegistry = (listener: () => void) => {
  registryListeners.add(listener)
  return () => registryListeners.delete(listener)
}

/** Thời gian chờ trước khi đóng kết nối không còn ai dùng (tránh đóng mở lại khi React dựng lại). */
const RELEASE_GRACE_MS = 400

/** Mượn kết nối của phòng; gọi `release()` khi xong. */
export function acquireRoomSocket(roomId: string, make: () => RoomSocketClient = () => new RoomSocketClient({ roomId })) {
  let lease = registry.get(roomId)
  // Kết nối cũ đã dừng hẳn (bị mời ra, phòng đóng) và không ai giữ: vào lại phòng này thì dựng mới.
  if (lease && lease.refs === 0 && lease.client.getSnapshot().status === "closed") {
    if (lease.closeTimer) clearTimeout(lease.closeTimer)
    lease.client.close()
    registry.delete(roomId)
    lease = undefined
  }
  if (!lease) {
    lease = { client: make(), refs: 0, closeTimer: null }
    registry.set(roomId, lease)
    lease.client.start()
  }
  if (lease.closeTimer) clearTimeout(lease.closeTimer)
  lease.closeTimer = null
  lease.refs += 1
  notifyRegistry()
  const current = lease
  let released = false
  return {
    client: current.client,
    release() {
      if (released) return
      released = true
      current.refs -= 1
      if (current.refs > 0) return
      current.closeTimer = setTimeout(() => {
        if (current.refs > 0 || registry.get(roomId) !== current) return
        registry.delete(roomId)
        current.client.close()
        notifyRegistry()
      }, RELEASE_GRACE_MS)
    },
  }
}

/** Chỉ cho test: bỏ mọi kết nối đang giữ. */
export function resetRoomSocketsForTest(): void {
  for (const lease of registry.values()) {
    if (lease.closeTimer) clearTimeout(lease.closeTimer)
    lease.client.close()
  }
  registry.clear()
  notifyRegistry()
}

const noopSubscribe = () => () => undefined
const getIdle = () => INITIAL
const noopSubscribeMessage = () => () => undefined

export type RoomSocketHandle = {
  status: RoomSocketStatus
  /** Đã vào phòng xong, gửi được. */
  ready: boolean
  userId: string | null
  roomState: RoomStateMessage | null
  generation: number
  closeReason: RoomSocketCloseReason | null
  send: (message: OutgoingMessage) => boolean
  /** Đổi định danh khi đổi phòng nên đặt trong dependency của `useEffect`. */
  subscribe: <T extends ServerMessageType>(type: T, handler: (message: ServerMessageOf<T>) => void) => () => void
}

/**
 * Giữ kết nối của một phòng khi `roomCode` khác null và `enabled`. Nhiều nơi gọi cùng một phòng thì
 * dùng chung một kết nối.
 */
export function useFlashbackRoomSocket(roomCode: string | null, enabled = true): RoomSocketHandle {
  const active = enabled && roomCode !== null
  useEffect(() => {
    if (!active || roomCode === null) return
    return acquireRoomSocket(roomCode).release
  }, [active, roomCode])

  // Kết nối của phòng lấy từ sổ đăng ký (một kết nối cho mọi nơi dùng), nên đổi phòng hay trả kết nối
  // đều làm hook dựng lại theo sổ chứ không giữ bản sao trong state.
  const getClient = useCallback(() => (roomCode === null ? null : (registry.get(roomCode)?.client ?? null)), [roomCode])
  const registered = useSyncExternalStore(subscribeRegistry, getClient)
  const client = active ? registered : null

  const snapshot = useSyncExternalStore(client ? client.subscribeStatus : noopSubscribe, client ? client.getSnapshot : getIdle)
  const send = useCallback((message: OutgoingMessage) => (client ? client.send(message) : false), [client])
  const subscribe = useMemo(
    () => (client ? client.subscribe : (noopSubscribeMessage as RoomSocketHandle["subscribe"])),
    [client],
  )
  return {
    status: snapshot.status,
    ready: snapshot.status === "ready",
    userId: snapshot.userId,
    roomState: snapshot.roomState,
    generation: snapshot.generation,
    closeReason: snapshot.closeReason,
    send,
    subscribe,
  }
}
