import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BACKOFF_MAX_MS,
  CLOSE_AUTH,
  DEAD_AFTER_MS,
  FloorSocketClient,
  floorSocketUrl,
  PING_MS,
  type WebSocketLike,
} from "./socket.ts"

class FakeSocket implements WebSocketLike {
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  sent: unknown[] = []
  closedWith: number | null = null

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(code?: number): void {
    this.closedWith = code ?? 1005
    this.readyState = 3
  }
  /** Test helpers: what the browser does. */
  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }
  receive(message: unknown): void {
    this.onmessage?.({
      data: typeof message === "string" ? message : JSON.stringify(message),
    })
  }
  drop(code = 1006): void {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

function setup(overrides: { token?: string | null } = {}) {
  const sockets: FakeSocket[] = []
  const urls: string[] = []
  const refreshAuth = vi.fn(() => Promise.resolve())
  const client = new FloorSocketClient({
    getToken: () => (overrides.token === undefined ? "tok" : overrides.token),
    refreshAuth,
    url: () => "wss://example.test/api/v2/trading-floor/ws",
    // Jitter factor 1.0, so delays are exactly 1 s, 2 s, 4 s ...
    random: () => 0.5,
    createSocket: (url) => {
      urls.push(url)
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
  })
  const latest = (): FakeSocket => sockets[sockets.length - 1]!
  /** Opens the latest socket and completes the handshake. */
  const goOnline = (userId = "u1"): FakeSocket => {
    const s = latest()
    s.open()
    s.receive({ type: "ready", userId })
    return s
  }
  return { client, sockets, urls, latest, goOnline, refreshAuth }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("FloorSocketClient handshake and dispatch", () => {
  it("sends auth first, goes online on ready and dispatches by type", () => {
    const { client, latest } = setup()
    const ready = vi.fn()
    const match = vi.fn()
    client.on("ready", ready)
    client.on("chat:match", match)

    client.start()
    expect(client.status.get()).toBe("connecting")
    latest().open()
    expect(client.status.get()).toBe("authenticating")
    expect(latest().sent).toEqual([{ type: "auth", token: "tok" }])
    expect(client.send({ type: "ping" })).toBe(false)

    latest().receive({ type: "ready", userId: "u1" })
    expect(client.status.get()).toBe("online")
    expect(client.currentUserId).toBe("u1")
    expect(ready).toHaveBeenCalledWith({ type: "ready", userId: "u1" })

    latest().receive({
      type: "chat:match",
      event: { state: "matched", convId: "c9" },
    })
    expect(match).toHaveBeenCalledWith({
      type: "chat:match",
      event: { state: "matched", convId: "c9" },
    })
  })

  it("sends client messages as JSON once online", () => {
    const { client, goOnline } = setup()
    client.start()
    const socket = goOnline()
    expect(client.send({ type: "emote", text: "👍" })).toBe(true)
    expect(socket.sent[socket.sent.length - 1]).toEqual({
      type: "emote",
      text: "👍",
    })
  })

  it("ignores binary frames, bad JSON and messages without a type", () => {
    const { client, latest, goOnline } = setup()
    const any = vi.fn()
    client.on("peer:join", any)
    client.start()
    goOnline()
    latest().receive("not json")
    latest().receive({ nothing: true })
    latest().onmessage?.({ data: new ArrayBuffer(4) })
    expect(any).not.toHaveBeenCalled()
    expect(client.status.get()).toBe("online")
  })

  it("stops delivering to a handler after its unsubscribe", () => {
    const { client, latest, goOnline } = setup()
    const handler = vi.fn()
    const off = client.on("peer:leave", handler)
    client.start()
    goOnline()
    latest().receive({ type: "peer:leave", id: "a" })
    off()
    latest().receive({ type: "peer:leave", id: "b" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("does not connect without a token", () => {
    const { client, sockets } = setup({ token: null })
    client.start()
    expect(sockets).toHaveLength(0)
    expect(client.status.get()).toBe("closed")
  })
})

describe("FloorSocketClient reconnect", () => {
  it("backs off 1 s, 2 s, 4 s ... capped at 15 s, and resets after ready", async () => {
    const { client, sockets, latest, goOnline } = setup()
    client.start()
    goOnline()

    latest().drop()
    expect(client.status.get()).toBe("reconnecting")
    await vi.advanceTimersByTimeAsync(999)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)

    latest().drop()
    await vi.advanceTimersByTimeAsync(1999)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(3)

    // Keep failing until the cap.
    for (let i = 0; i < 6; i++) {
      latest().drop()
      await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS)
    }
    const before = sockets.length
    latest().drop()
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS - 1)
    expect(sockets).toHaveLength(before)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(before + 1)

    // A successful handshake resets the delay to 1 s.
    goOnline()
    latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(before + 2)
  })

  it("re-dispatches ready after a reconnect so hello can be sent again", async () => {
    const { client, goOnline, latest } = setup()
    const ready = vi.fn()
    client.on("ready", ready)
    client.start()
    goOnline()
    latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    goOnline()
    expect(ready).toHaveBeenCalledTimes(2)
  })

  it("refreshes the session on a 4401 close, then retries; gives up after 3 failures", async () => {
    const { client, sockets, latest, refreshAuth } = setup()
    client.start()
    latest().open()
    latest().drop(CLOSE_AUTH)
    expect(client.status.get()).toBe("reconnecting")
    expect(refreshAuth).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(2)

    for (let i = 0; i < 2; i++) {
      latest().open()
      latest().drop(CLOSE_AUTH)
      await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS)
    }
    expect(refreshAuth).toHaveBeenCalledTimes(3)
    expect(sockets).toHaveLength(4)

    latest().open()
    latest().drop(CLOSE_AUTH)
    expect(client.status.get()).toBe("closed")
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS * 2)
    expect(sockets).toHaveLength(4)
  })
})

describe("FloorSocketClient keepalive and stop", () => {
  it("pings every 25 s while the server keeps answering", async () => {
    const { client, latest, goOnline } = setup()
    client.start()
    const socket = goOnline()
    await vi.advanceTimersByTimeAsync(PING_MS)
    expect(socket.sent).toContainEqual({ type: "ping" })
    socket.receive({ type: "pong" })
    await vi.advanceTimersByTimeAsync(PING_MS)
    expect(latest()).toBe(socket)
    expect(client.status.get()).toBe("online")
  })

  it("treats 55 s of silence as a dead connection and reconnects", async () => {
    const { client, sockets, goOnline } = setup()
    client.start()
    const first = goOnline()
    await vi.advanceTimersByTimeAsync(DEAD_AFTER_MS + PING_MS)
    expect(first.closedWith).toBe(4000)
    expect(client.status.get()).toBe("reconnecting")
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(2)
  })

  it("stop() closes the socket, stops reconnecting and keeps handlers for the next start", async () => {
    const { client, sockets, latest, goOnline } = setup()
    const join = vi.fn()
    client.on("peer:leave", join)
    client.start()
    const first = goOnline()
    client.stop()
    expect(first.closedWith).toBe(1000)
    expect(client.status.get()).toBe("closed")
    expect(client.currentUserId).toBeNull()
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS * 2)
    expect(sockets).toHaveLength(1)

    client.start()
    expect(sockets).toHaveLength(2)
    goOnline()
    latest().receive({ type: "peer:leave", id: "x" })
    expect(join).toHaveBeenCalledTimes(1)
  })
})

describe("floorSocketUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("puts the floor path under the API namespace by default", () => {
    vi.stubEnv("VITE_WS_URL", "")
    vi.stubEnv("VITE_API_URL", "")
    expect(new URL(floorSocketUrl()).pathname).toBe("/api/v2/trading-floor/ws")
  })

  it("replaces the market data tail when VITE_WS_URL names that channel", () => {
    vi.stubEnv("VITE_WS_URL", "wss://iqx.example/api/v2/market-data/ws")
    expect(floorSocketUrl()).toBe("wss://iqx.example/api/v2/trading-floor/ws")
    vi.stubEnv("VITE_WS_URL", "/api/v2/market-data/ws")
    expect(new URL(floorSocketUrl()).pathname).toBe("/api/v2/trading-floor/ws")
  })
})
