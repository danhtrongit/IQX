/**
 * Realtime market-data WebSocket client (bảng giá).
 *
 * Talks to the backend gateway at the configured `/api/v2/market-data/ws`
 * (`REALTIME_WS_PATH`), which relays the KRX/DNSE feed:
 *
 *   → `{"action":"subscribe","symbols":["FPT"],"channels":["tick","orderbook"]}`
 *   → `{"action":"unsubscribe",…}` / `{"action":"ping"}`
 *   ← `{"type":"tick"|"orderbook"|"index",…}` / `{"type":"pong"}` / `{"type":"error"}`
 *
 * (Un)subscriptions are ref-counted and flushed as a net delta per channel, so
 * switching board tabs costs a handful of frames instead of hundreds and an
 * unsubscribe+subscribe pair for the same symbol cancels out. When the socket
 * cannot connect (or the backend runs with `REALTIME_ENABLED=false`, which
 * closes with 1013) the provider falls back to REST polling — the board never
 * depends on the socket being up.
 */

import { getWebSocketUrl } from "@/lib/api-config"

export type RealtimeChannel = "tick" | "orderbook" | "index"

/** Matched trade. `price` is VND absolute (the backend already ×1000 của DNSE). */
export interface TickMessage {
  type: "tick"
  symbol: string
  price: number
  volume: number
  side: "B" | "S" | "unknown"
  total_volume: number
  time: string | null
}

/** Price depth: up to 3 bid/ask levels, `price` in VND absolute. */
export interface OrderBookMessage {
  type: "orderbook"
  symbol: string
  bids: { price: number; volume: number }[]
  asks: { price: number; volume: number }[]
  time: string | null
}

/** Market index snapshot (điểm chỉ số — never scaled to VND). */
export interface IndexMessage {
  type: "index"
  code: string
  value: number
  change: number
  change_percent: number
  total_volume: number
  total_value: number
  advances: number
  declines: number
  nochange: number
  time: string | null
}

export type RealtimeMessage = TickMessage | OrderBookMessage | IndexMessage

type Listener = (message: RealtimeMessage) => void

const MAX_RECONNECT_ATTEMPTS = 8

function sourceEpoch(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) {
    const numeric = Number(value)
    return Number.isFinite(numeric)
      ? numeric > 1e12
        ? numeric
        : numeric * 1000
      : null
  }
  const parsed = Date.parse(value.replace(" ", "T"))
  return Number.isNaN(parsed) ? null : parsed
}

export class RealtimeClient {
  private ws: WebSocket | null = null
  private readonly url = getWebSocketUrl("/market-data/ws")
  private readonly listeners = new Map<string, Set<Listener>>() // `${channel}:${SYMBOL}`
  private readonly refCount = new Map<string, number>()
  private reconnectAttempts = 0
  private reconnectTimer: number | null = null
  private pingTimer: number | null = null
  private flushTimer: number | null = null
  private intentionalClose = false
  private readonly pendingOps = new Map<string, number>()
  /** Last source timestamp delivered for each channel/symbol. */
  private readonly latestFrameAt = new Map<string, number>()
  private readonly onStatusChange?: (connected: boolean) => void

  constructor(options?: { onStatusChange?: (connected: boolean) => void }) {
    this.onStatusChange = options?.onStatusChange
  }

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    this.intentionalClose = false
    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
      this.ws = socket
    } catch {
      this.scheduleReconnect()
      return
    }

    socket.onopen = () => {
      if (this.ws !== socket) return
      this.reconnectAttempts = 0
      this.onStatusChange?.(true)
      this.resync()
      this.startPing()
    }

    socket.onmessage = (event) => {
      if (this.ws !== socket) return
      let message: RealtimeMessage
      try {
        message = JSON.parse(event.data as string) as RealtimeMessage
      } catch {
        return
      }
      const payload = message as unknown as {
        type?: string
        symbol?: string
        code?: string
        detail?: string
        time?: string | null
      }
      // Server từ chối subscribe (VD: "symbol limit reached") — đừng nuốt im lặng.
      if (payload.type === "error") {
        console.warn("[realtime] server error:", payload.detail)
        return
      }
      // Bản tin chỉ số dùng "code" thay vì "symbol" → fallback để key thành index:CODE.
      const identifier = payload.symbol ?? payload.code
      if (!payload.type || !identifier) return
      const key = `${payload.type}:${identifier.toUpperCase()}`
      const timestamp =
        "time" in payload && typeof payload.time === "string"
          ? sourceEpoch(payload.time)
          : null
      if (timestamp !== null) {
        const previous = this.latestFrameAt.get(key)
        if (previous !== undefined && timestamp < previous) return
        this.latestFrameAt.set(key, timestamp)
      }
      const set = this.listeners.get(key)
      if (set) for (const listener of set) listener(message)
    }

    socket.onclose = () => {
      if (this.ws !== socket) return
      this.onStatusChange?.(false)
      this.stopPing()
      if (!this.intentionalClose) this.scheduleReconnect()
    }

    socket.onerror = () => {
      // onclose will follow; reconnect handled there.
    }
  }

  disconnect(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      // Must reset to null: `scheduleReconnect` early-returns on a stale handle,
      // otherwise a StrictMode remount can never reconnect again.
      this.reconnectTimer = null
    }
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingOps.clear()
    this.latestFrameAt.clear()
    this.stopPing()
    this.ws?.close()
    this.ws = null
  }

  /** Subscribe a listener to (symbol, channel). Returns an unsubscribe fn. */
  on(symbol: string, channel: RealtimeChannel, listener: Listener): () => void {
    const key = `${channel}:${symbol.toUpperCase()}`
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener)

    const previous = this.refCount.get(key) ?? 0
    this.refCount.set(key, previous + 1)
    if (previous === 0) this.queueOp(key, 1)

    return () => {
      this.listeners.get(key)?.delete(listener)
      const count = this.refCount.get(key) ?? 0
      if (count <= 1) {
        this.refCount.delete(key)
        this.listeners.delete(key)
        this.queueOp(key, -1)
      } else {
        this.refCount.set(key, count - 1)
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  private queueOp(key: string, delta: 1 | -1): void {
    const net = (this.pendingOps.get(key) ?? 0) + delta
    if (net === 0) this.pendingOps.delete(key)
    else this.pendingOps.set(key, net)
    if (!this.flushTimer) {
      this.flushTimer = window.setTimeout(() => {
        this.flushTimer = null
        this.flushOps()
      }, 16)
    }
  }

  private flushOps(): void {
    if (this.pendingOps.size === 0) return
    const subscribe: Record<string, string[]> = {}
    const unsubscribe: Record<string, string[]> = {}
    for (const [key, net] of this.pendingOps) {
      const [channel, symbol] = key.split(":")
      if (net > 0) (subscribe[channel] ||= []).push(symbol)
      else (unsubscribe[channel] ||= []).push(symbol)
    }
    this.pendingOps.clear()
    for (const [channel, symbols] of Object.entries(unsubscribe)) {
      this.send({ action: "unsubscribe", symbols, channels: [channel] })
    }
    for (const [channel, symbols] of Object.entries(subscribe)) {
      this.send({ action: "subscribe", symbols, channels: [channel] })
    }
  }

  /** Re-announce every live subscription after a (re)connect. */
  private resync(): void {
    this.pendingOps.clear()
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    const byChannel: Record<string, string[]> = {}
    for (const key of this.refCount.keys()) {
      const [channel, symbol] = key.split(":")
      ;(byChannel[channel] ||= []).push(symbol)
    }
    for (const [channel, symbols] of Object.entries(byChannel)) {
      if (symbols.length)
        this.send({ action: "subscribe", symbols, channels: [channel] })
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
    this.reconnectAttempts += 1
    const delay = Math.min(30_000, 1000 * 2 ** (this.reconnectAttempts - 1))
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = window.setInterval(
      () => this.send({ action: "ping" }),
      30_000
    )
  }

  private stopPing(): void {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}
