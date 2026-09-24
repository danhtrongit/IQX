import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RealtimeClient } from "./realtime"

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

describe("RealtimeClient", () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal("WebSocket", FakeWebSocket)
    vi.stubGlobal("getWebSocketUrl", () => "ws://localhost/api/market-data/ws")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("resubscribes active channels after reconnect", () => {
    const client = new RealtimeClient()
    client.on("FPT", "tick", () => {})
    client.connect()
    const first = FakeWebSocket.instances[0]
    first.open()
    expect(first.sent).toContainEqual(
      JSON.stringify({
        action: "subscribe",
        symbols: ["FPT"],
        channels: ["tick"],
      })
    )

    vi.useFakeTimers()
    first.close()
    vi.advanceTimersByTime(1000)
    const second = FakeWebSocket.instances[1]
    second.open()
    expect(second.sent).toContainEqual(
      JSON.stringify({
        action: "subscribe",
        symbols: ["FPT"],
        channels: ["tick"],
      })
    )
    client.disconnect()
  })

  it("drops out-of-order timestamped frames", () => {
    const client = new RealtimeClient()
    const prices: number[] = []
    client.on("FPT", "tick", (message) => {
      if (message.type === "tick") prices.push(message.price)
    })
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.message({
      type: "tick",
      symbol: "FPT",
      price: 120,
      volume: 1,
      total_volume: 1,
      side: "B",
      time: "2026-09-23T10:00:02Z",
    })
    socket.message({
      type: "tick",
      symbol: "FPT",
      price: 110,
      volume: 1,
      total_volume: 1,
      side: "B",
      time: "2026-09-23T10:00:01Z",
    })
    expect(prices).toEqual([120])
    client.disconnect()
  })
})
