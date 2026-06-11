/**
 * Realtime market-data WebSocket client.
 *
 * Connects to the backend `/api/v1/market-data/ws` endpoint, manages a
 * ref-counted set of (symbol, channel) subscriptions, auto-reconnects with
 * backoff, and dispatches normalized messages to registered listeners.
 *
 * The provider uses this to replace the 5s price-board polling; when the WS
 * cannot connect it falls back to polling (handled in the provider).
 */

export type RealtimeChannel = "tick" | "orderbook" | "ohlc"

export interface TickMessage {
  type: "tick"
  symbol: string
  price: number // VND tuyệt đối (đã ×1000 ở backend)
  volume: number
  side: "B" | "S" | "unknown"
  total_volume: number
  time: string | null
  degraded?: boolean
}

export interface OrderBookMessage {
  type: "orderbook"
  symbol: string
  bids: { price: number; volume: number }[]
  asks: { price: number; volume: number }[]
  time: string | null
}

export interface OhlcMessage {
  type: "ohlc"
  symbol: string
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  last_updated: number
}

export type RealtimeMessage = TickMessage | OrderBookMessage | OhlcMessage
type Listener = (msg: RealtimeMessage) => void

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

function buildWsUrl(): string {
  // Absolute API base (rare) → swap http(s) for ws(s).
  if (/^https?:\/\//.test(API_BASE)) {
    return API_BASE.replace(/^http/, "ws").replace(/\/$/, "") + "/market-data/ws"
  }
  // Relative base (default "/api/v1") → use current origin, proxied in dev.
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  const base = API_BASE.startsWith("/") ? API_BASE : `/${API_BASE}`
  return `${proto}://${window.location.host}${base}/market-data/ws`
}

export class RealtimeClient {
  private ws: WebSocket | null = null
  private url = buildWsUrl()
  private listeners = new Map<string, Set<Listener>>() // key: `${channel}:${SYMBOL}`
  private refCount = new Map<string, number>() // key: `${channel}:${SYMBOL}`
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private intentionalClose = false
  private onStatusChange?: (connected: boolean) => void

  constructor(opts?: { onStatusChange?: (connected: boolean) => void }) {
    this.onStatusChange = opts?.onStatusChange
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    this.intentionalClose = false
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.onStatusChange?.(true)
      // Re-subscribe everything we still care about.
      this.resync()
      this.startPing()
    }

    this.ws.onmessage = (ev) => {
      let msg: RealtimeMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      const anyMsg = msg as unknown as { type?: string; symbol?: string }
      if (!anyMsg.type || !anyMsg.symbol) return
      const channel = anyMsg.type === "orderbook" ? "orderbook" : anyMsg.type
      const key = `${channel}:${anyMsg.symbol.toUpperCase()}`
      const set = this.listeners.get(key)
      if (set) for (const fn of set) fn(msg)
    }

    this.ws.onclose = () => {
      this.onStatusChange?.(false)
      this.stopPing()
      if (!this.intentionalClose) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will follow; reconnect handled there.
    }
  }

  disconnect(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.stopPing()
    this.ws?.close()
    this.ws = null
  }

  /** Subscribe a listener to (symbol, channel). Returns an unsubscribe fn. */
  on(symbol: string, channel: RealtimeChannel, fn: Listener): () => void {
    const sym = symbol.toUpperCase()
    const key = `${channel}:${sym}`
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(fn)

    const prev = this.refCount.get(key) || 0
    this.refCount.set(key, prev + 1)
    if (prev === 0) this.send({ action: "subscribe", symbols: [sym], channels: [channel] })

    return () => {
      const s = this.listeners.get(key)
      s?.delete(fn)
      const count = this.refCount.get(key) || 0
      if (count <= 1) {
        this.refCount.delete(key)
        this.listeners.delete(key)
        this.send({ action: "unsubscribe", symbols: [sym], channels: [channel] })
      } else {
        this.refCount.set(key, count - 1)
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  // ── internals ───────────────────────────────────
  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  private resync(): void {
    // Group active subscriptions by channel and re-send.
    const byChannel: Record<string, string[]> = {}
    for (const key of this.refCount.keys()) {
      const [channel, sym] = key.split(":")
      ;(byChannel[channel] ||= []).push(sym)
    }
    for (const [channel, symbols] of Object.entries(byChannel)) {
      if (symbols.length) this.send({ action: "subscribe", symbols, channels: [channel] })
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectAttempts += 1
    const delay = Math.min(30000, 1000 * 2 ** (this.reconnectAttempts - 1))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => this.send({ action: "ping" }), 30000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}
