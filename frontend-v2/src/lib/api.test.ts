import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  ApiError,
  api,
  apiResponse,
  apiUpload,
  clearTokens,
  saveTokens,
  getWebSocketUrl,
  resolveWsUrl,
} from "./api"

function response(body: unknown, init: ResponseInit = {}): Response {
  const payload = init.status === 204 || init.status === 205 ? null : typeof body === "string" ? body : JSON.stringify(body)
  return new Response(payload, init)
}

describe("v2 api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearTokens()
  })

  it("uses the v2 base and preserves raw 204 and CSV responses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response("", { status: 204 }))
      .mockResolvedValueOnce(response("symbol,price\nVCB,90"))

    await expect(api<void>("/example")).resolves.toBeUndefined()
    const csv = await apiResponse("/export")
    await expect(csv.text()).resolves.toContain("symbol,price")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v2/example")
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v2/export")
  })

  it("parses the v2 error envelope and legacy detail fallback", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({
        error: { code: "RATE_LIMITED", message: "Quá nhiều yêu cầu", details: [{ field: "x" }] },
        request_id: "req-v2",
      }, { status: 429, headers: { "Retry-After": "3" } }))
      .mockResolvedValueOnce(response({ detail: [{ msg: "Email không hợp lệ" }] }, { status: 422 }))

    await expect(api("/one")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      details: [{ field: "x" }],
      requestId: "req-v2",
      retryAfter: "3",
      message: "Quá nhiều yêu cầu",
    } satisfies Partial<ApiError>)
    await expect(api("/two")).rejects.toMatchObject({ status: 422, message: "Email không hợp lệ" })
  })

  it("single-flights concurrent 401 refreshes and retries both requests", async () => {
    saveTokens({ access_token: "old-access", refresh_token: "old-refresh", token_type: "bearer" }, true)
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({}, { status: 401 }))
      .mockResolvedValueOnce(response({}, { status: 401 }))
      .mockResolvedValueOnce(response({ access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer" }))
      .mockResolvedValueOnce(response({ ok: 1 }))
      .mockResolvedValueOnce(response({ ok: 2 }))

    const [one, two] = await Promise.all([api<{ ok: number }>("/one"), api<{ ok: number }>("/two")])
    expect(one.ok).toBe(1)
    expect(two.ok).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("new-access")
  })

  it("does not clear a session on transient refresh failure", async () => {
    saveTokens({ access_token: "old-access", refresh_token: "old-refresh", token_type: "bearer" }, true)
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({}, { status: 401 }))
      .mockResolvedValueOnce(response({ error: { code: "UPSTREAM", message: "Tạm thời lỗi" } }, { status: 503 }))

    await expect(api("/one")).rejects.toMatchObject({ status: 503, code: "UPSTREAM" })
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("old-access")
  })

  it("refuses absolute URLs outside the configured API origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    await expect(apiResponse("https://evil.example.test/private")).rejects.toThrow(/origin/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not refresh after a late 401 when another request already rotated the token", async () => {
    saveTokens({ access_token: "old-access", refresh_token: "old-refresh", token_type: "bearer" }, true)
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        saveTokens({ access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer" }, true)
        return response({}, { status: 401 })
      })
      .mockResolvedValueOnce(response({ ok: 1 }))

    await expect(api<{ ok: number }>("/late")).resolves.toEqual({ ok: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer new-access")
  })

  it("turns malformed successful JSON into a typed API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response("not-json"))
    await expect(api("/malformed")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" })
  })

  it("resolves relative and absolute WebSocket URLs without downgrading an HTTPS API", () => {
    expect(resolveWsUrl("/socket")).toBe(`ws://${window.location.host}/socket`)
    expect(resolveWsUrl("wss://stream.example.test/socket")).toBe("wss://stream.example.test/socket")
    expect(() => resolveWsUrl("javascript:alert(1)")).toThrow(/allowed scheme/)
    expect(() => resolveWsUrl("https://user:secret@stream.example.test/socket")).toThrow(/allowed scheme/)
    expect(getWebSocketUrl("market-data/ws")).toBe(`ws://${window.location.host}/api/v2/market-data/ws`)
  })

  it("uses an absolute VITE_API_URL for the default WebSocket namespace", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v2")
    vi.resetModules()
    const config = await import("./api-config")
    expect(config.getWebSocketUrl()).toBe("wss://api.example.test/api/v2/market-data/ws")
    vi.unstubAllEnvs()
  })

  it("uploads FormData through XHR and preserves a 204 response", async () => {
    saveTokens({ access_token: "upload-access", refresh_token: "upload-refresh", token_type: "bearer" }, true)
    const progress: number[] = []
    class FakeXHR {
      upload: { onprogress?: (event: ProgressEvent) => void } = {}
      status = 204
      statusText = "No Content"
      responseText = ""
      headers: Record<string, string> = {}
      body: unknown
      open() {}
      setRequestHeader(name: string, value: string) { this.headers[name] = value }
      getAllResponseHeaders() { return "" }
      send(body: unknown) {
        this.body = body
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 } as ProgressEvent)
        queueMicrotask(() => this.onload?.())
      }
      onload?: () => void
      onerror?: () => void
      onabort?: () => void
      abort() { this.onabort?.() }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    const response = await apiUpload("/upload", new File(["x"], "x.txt"), value => progress.push(value))
    expect(response.status).toBe(204)
    expect(progress).toEqual([50])
  })

  it("uses the Web Locks API when coordinating a refresh", async () => {
    saveTokens({ access_token: "lock-old", refresh_token: "lock-refresh", token_type: "bearer" }, true)
    const lockRequest = vi.fn(async (name: string, options: unknown, callback: () => Promise<unknown>) => {
      void name
      void options
      return callback()
    })
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: lockRequest } })
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({}, { status: 401 }))
      .mockResolvedValueOnce(response({}, { status: 401 }))
      .mockResolvedValueOnce(response({ access_token: "lock-new", refresh_token: "lock-new-refresh", token_type: "bearer" }))
      .mockResolvedValueOnce(response({ ok: 1 }))
      .mockResolvedValueOnce(response({ ok: 2 }))
    await Promise.all([api("/lock-one"), api("/lock-two")])
    expect(lockRequest).toHaveBeenCalledTimes(1)
  })

  it("accepts a peer refresh rotation only for the cloned predecessor", async () => {
    saveTokens({ access_token: "session-old", refresh_token: "session-refresh", token_type: "bearer" }, false)
    const peer = new BroadcastChannel("iqx.auth.tokens")
    peer.postMessage({
      type: "tokens",
      source: "peer",
      previousRefreshToken: "unrelated-refresh",
      tokens: { access_token: "wrong", refresh_token: "wrong-refresh", token_type: "bearer" },
      remember: true,
    })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe("session-old")
    peer.postMessage({
      type: "tokens",
      source: "peer",
      previousRefreshToken: "session-refresh",
      tokens: { access_token: "session-new", refresh_token: "session-refresh-2", token_type: "bearer" },
      remember: true,
    })
    await new Promise(resolve => setTimeout(resolve, 5))
    peer.close()
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe("session-new")
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull()
  })

  it("refreshes an expired access token before server-side logout", async () => {
    saveTokens({ access_token: "expired-access", refresh_token: "logout-refresh", token_type: "bearer" }, true)
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({}, { status: 401 }))
      .mockResolvedValueOnce(response({ access_token: "logout-access", refresh_token: "logout-refresh-2", token_type: "bearer" }))
      .mockResolvedValueOnce(response({}, { status: 204 }))
    await expect(apiResponse("/auth/logout", { method: "POST" })).resolves.toMatchObject({ status: 204 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[2]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer logout-access")
  })
})
