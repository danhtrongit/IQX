import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  acquireRoomSocket,
  BACKOFF_MAX_MS,
  DEAD_AFTER_MS,
  PING_MS,
  resetRoomSocketsForTest,
  RoomSocketClient,
  roomSocketUrl,
  useFlashbackRoomSocket,
  type WebSocketLike,
} from "./use-flashback-room-socket"
import type { RoomStateMessage, ServerMessage } from "./room-socket-protocol"

vi.mock("./flashback-api", () => ({ fetchMyRoom: vi.fn(async () => ({})) }))

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = []
  readyState = 0
  sent: Array<Record<string, unknown>> = []
  closedWith: { code?: number; reason?: string } | null = null
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.all.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>)
  }

  close(code?: number, reason?: string) {
    this.closedWith = { code, reason }
    this.readyState = 3
  }

  open() {
    this.readyState = 1
    this.onopen?.({})
  }

  receive(message: ServerMessage | Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }

  of(type: string) {
    return this.sent.filter((message) => message.type === type)
  }
}

const ROOM = "123456"
const STATE: RoomStateMessage = { type: "room:state", roomId: ROOM, images: [], call: [], iceServers: [{ urls: "stun:x" }] }

function make(overrides: Partial<ConstructorParameters<typeof RoomSocketClient>[0]> = {}) {
  return new RoomSocketClient({
    roomId: ROOM,
    getToken: () => "tok",
    refreshAuth: vi.fn(async () => undefined),
    createSocket: (url) => new FakeSocket(url),
    url: "ws://test/api/v2/flashback/ws",
    random: () => 0.5,
    ...overrides,
  })
}

/** Mở kết nối, xác thực và vào phòng xong. */
function ready(client: RoomSocketClient) {
  client.start()
  const socket = FakeSocket.all.at(-1)!
  socket.open()
  socket.receive({ type: "ready", userId: "u1" })
  socket.receive(STATE)
  return socket
}

beforeEach(() => {
  FakeSocket.all = []
  vi.useFakeTimers()
})

afterEach(() => {
  resetRoomSocketsForTest()
  vi.useRealTimers()
})

describe("RoomSocketClient: xác thực và vào phòng", () => {
  it("gửi auth bằng token (không đặt token trong URL), nhận ready rồi room:join rồi room:state", () => {
    const client = make()
    client.start()
    const socket = FakeSocket.all[0]!
    expect(socket.url).not.toContain("tok")
    expect(client.getSnapshot().status).toBe("connecting")
    socket.open()
    expect(socket.sent).toEqual([{ type: "auth", token: "tok" }])
    expect(client.getSnapshot().status).toBe("authenticating")
    socket.receive({ type: "ready", userId: "u1" })
    expect(socket.sent.at(-1)).toEqual({ type: "room:join", roomId: ROOM })
    expect(client.getSnapshot()).toMatchObject({ status: "joining", userId: "u1" })
    socket.receive(STATE)
    expect(client.getSnapshot()).toMatchObject({ status: "ready", generation: 1, roomState: STATE })
  })

  it("không có token thì không kết nối", () => {
    const client = make({ getToken: () => null })
    client.start()
    expect(FakeSocket.all).toHaveLength(0)
    expect(client.getSnapshot()).toMatchObject({ status: "closed", closeReason: "auth" })
  })

  it("room:state của phòng khác bị bỏ qua", () => {
    const client = make()
    client.start()
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.receive({ type: "ready", userId: "u1" })
    socket.receive({ ...STATE, roomId: "999999" })
    expect(client.getSnapshot().status).toBe("joining")
  })
})

describe("RoomSocketClient: subscribe và send", () => {
  it("subscribe nhận đúng loại thông điệp; huỷ đăng ký thì thôi nhận", () => {
    const client = make()
    const socket = ready(client)
    const seen: string[] = []
    const stop = client.subscribe("call:peer-joined", (message) => seen.push(message.userId))
    const others: string[] = []
    client.subscribe("call:peer-left", (message) => others.push(message.userId))
    socket.receive({ type: "call:peer-joined", userId: "b", name: "B", media: { audio: true, video: false, screen: false } })
    socket.receive({ type: "call:peer-left", userId: "c" })
    stop()
    socket.receive({ type: "call:peer-joined", userId: "d", name: "D", media: { audio: false, video: false, screen: false } })
    expect(seen).toEqual(["b"])
    expect(others).toEqual(["c"])
  })

  it("send chỉ gửi khi đã vào phòng xong", () => {
    const client = make()
    client.start()
    const socket = FakeSocket.all[0]!
    const message = { type: "call:leave", roomId: ROOM } as const
    expect(client.send(message)).toBe(false)
    socket.open()
    expect(client.send(message)).toBe(false)
    socket.receive({ type: "ready", userId: "u1" })
    expect(client.send(message)).toBe(false)
    socket.receive(STATE)
    expect(client.send(message)).toBe(true)
    expect(socket.sent.at(-1)).toEqual(message)
  })

  it("thông điệp hỏng hoặc không phải chuỗi bị bỏ qua, không làm sập kết nối", () => {
    const client = make()
    const socket = ready(client)
    socket.onmessage?.({ data: "{không phải json" })
    socket.onmessage?.({ data: new ArrayBuffer(4) })
    socket.onmessage?.({ data: JSON.stringify([1, 2]) })
    expect(client.getSnapshot().status).toBe("ready")
  })
})

describe("RoomSocketClient: kết nối lại", () => {
  it("mất kết nối thì thử lại với backoff tăng dần rồi vào lại phòng (generation tăng)", () => {
    const client = make()
    const first = ready(client)
    first.drop()
    expect(client.getSnapshot().status).toBe("reconnecting")
    expect(FakeSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(999)
    expect(FakeSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(2)

    // Lần thử thứ hai vẫn hỏng: chờ gấp đôi.
    FakeSocket.all[1]!.drop()
    vi.advanceTimersByTime(1999)
    expect(FakeSocket.all).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(3)

    const third = FakeSocket.all[2]!
    third.open()
    third.receive({ type: "ready", userId: "u1" })
    third.receive(STATE)
    expect(client.getSnapshot()).toMatchObject({ status: "ready", generation: 2 })
    // Vào phòng xong thì backoff về đầu.
    third.drop()
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(4)
  })

  it("backoff tối đa 15 giây", () => {
    const client = make()
    client.start()
    for (let index = 0; index < 8; index += 1) {
      FakeSocket.all.at(-1)!.drop()
      vi.advanceTimersByTime(BACKOFF_MAX_MS)
    }
    const count = FakeSocket.all.length
    FakeSocket.all.at(-1)!.drop()
    vi.advanceTimersByTime(BACKOFF_MAX_MS - 1)
    expect(FakeSocket.all).toHaveLength(count)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(count + 1)
  })

  it.each([
    [4403, "left-room"],
    [4410, "room-closed"],
  ] as const)("mã đóng %i thì dừng hẳn, không kết nối lại", (code, reason) => {
    const client = make()
    const socket = ready(client)
    socket.drop(code)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(client.getSnapshot()).toMatchObject({ status: "closed", closeReason: reason })
  })

  it("room:closed thì dừng hẳn và vẫn báo cho người nghe", () => {
    const client = make()
    const socket = ready(client)
    const closed = vi.fn()
    client.subscribe("room:closed", closed)
    socket.receive({ type: "room:closed", roomId: ROOM })
    expect(closed).toHaveBeenCalledOnce()
    expect(client.getSnapshot()).toMatchObject({ status: "closed", closeReason: "room-closed" })
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it("server từ chối vào phòng (không phải thành viên) thì dừng; lỗi tạm thời thì thử lại", () => {
    const client = make()
    client.start()
    let socket = FakeSocket.all[0]!
    socket.open()
    socket.receive({ type: "ready", userId: "u1" })
    socket.receive({ type: "error", code: "INTERNAL", message: "lỗi" })
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(2)
    socket = FakeSocket.all[1]!
    socket.open()
    socket.receive({ type: "ready", userId: "u1" })
    socket.receive({ type: "error", code: "NOT_IN_ROOM", message: "không ở trong phòng" })
    expect(client.getSnapshot()).toMatchObject({ status: "closed", closeReason: "rejected", errorCode: "NOT_IN_ROOM" })
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(2)
  })

  it("4401: làm mới phiên rồi kết nối lại; quá 3 lần thì bỏ cuộc", async () => {
    const refreshAuth = vi.fn(async () => undefined)
    const client = make({ refreshAuth })
    client.start()
    for (let round = 1; round <= 3; round += 1) {
      FakeSocket.all.at(-1)!.drop(4401)
      await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS)
      expect(refreshAuth).toHaveBeenCalledTimes(round)
      expect(FakeSocket.all).toHaveLength(round + 1)
    }
    FakeSocket.all.at(-1)!.drop(4401)
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS)
    expect(client.getSnapshot()).toMatchObject({ status: "closed", closeReason: "auth" })
    expect(FakeSocket.all).toHaveLength(4)
  })

  it("close() đóng socket, dừng kết nối lại và xoá người nghe", () => {
    const client = make()
    const socket = ready(client)
    const handler = vi.fn()
    client.subscribe("call:peer-left", handler)
    client.close()
    expect(socket.closedWith?.code).toBe(1000)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(client.send({ type: "call:leave", roomId: ROOM })).toBe(false)
  })
})

describe("RoomSocketClient: ping", () => {
  it("gửi ping mỗi 25 giây khi kết nối còn sống", () => {
    const client = make()
    const socket = ready(client)
    vi.advanceTimersByTime(PING_MS)
    expect(socket.of("ping")).toHaveLength(1)
    socket.receive({ type: "pong" })
    vi.advanceTimersByTime(PING_MS)
    expect(socket.of("ping")).toHaveLength(2)
    expect(client.getSnapshot().status).toBe("ready")
  })

  it("im lặng quá 55 giây thì coi là chết và kết nối lại", () => {
    const client = make()
    const socket = ready(client)
    // Không có pong nào về.
    vi.advanceTimersByTime(DEAD_AFTER_MS + PING_MS)
    expect(socket.closedWith?.code).toBe(4000)
    expect(client.getSnapshot().status).toBe("reconnecting")
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(2)
  })
})

describe("acquireRoomSocket: một kết nối mỗi phòng", () => {
  it("nhiều nơi mượn cùng một kết nối; đóng sau khi nơi cuối cùng trả lại", () => {
    const made: RoomSocketClient[] = []
    const factory = () => {
      const client = make()
      made.push(client)
      return client
    }
    const a = acquireRoomSocket(ROOM, factory)
    const b = acquireRoomSocket(ROOM, factory)
    expect(made).toHaveLength(1)
    expect(a.client).toBe(b.client)
    expect(FakeSocket.all).toHaveLength(1)
    a.release()
    a.release()
    vi.advanceTimersByTime(1000)
    expect(a.client.getSnapshot().status).not.toBe("closed")
    b.release()
    vi.advanceTimersByTime(1000)
    expect(a.client.getSnapshot()).toMatchObject({ status: "closed", closeReason: "stopped" })
  })

  it("mượn lại ngay sau khi trả (React dựng lại) thì không đóng kết nối", () => {
    const first = acquireRoomSocket(ROOM, () => make())
    first.release()
    const second = acquireRoomSocket(ROOM, () => make())
    vi.advanceTimersByTime(1000)
    expect(second.client).toBe(first.client)
    expect(second.client.getSnapshot().status).not.toBe("closed")
    expect(FakeSocket.all).toHaveLength(1)
  })

  it("vào lại phòng sau khi bị mời ra thì dựng kết nối mới", () => {
    const first = acquireRoomSocket(ROOM, () => make())
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.receive({ type: "ready", userId: "u1" })
    socket.receive(STATE)
    socket.drop(4403)
    first.release()
    const second = acquireRoomSocket(ROOM, () => make())
    expect(second.client).not.toBe(first.client)
    expect(FakeSocket.all).toHaveLength(2)
  })
})

describe("useFlashbackRoomSocket (React)", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeSocket)
    sessionStorage.setItem("iqx.v2.access_token", "tok-from-storage")
  })
  afterEach(() => {
    sessionStorage.removeItem("iqx.v2.access_token")
    vi.unstubAllGlobals()
  })

  it("địa chỉ là /api/v2/flashback/ws, không có token trong URL", () => {
    expect(roomSocketUrl()).toMatch(/^wss?:\/\/[^/]+\/api\/v2\/flashback\/ws$/)
  })

  it("hai nơi dùng cùng một phòng chung một kết nối; xác thực bằng token trong kho; đóng sau khi cả hai gỡ", () => {
    const first = renderHook(() => useFlashbackRoomSocket(ROOM))
    const second = renderHook(() => useFlashbackRoomSocket(ROOM))
    expect(FakeSocket.all).toHaveLength(1)
    const socket = FakeSocket.all[0]!
    expect(socket.url).not.toContain("tok-from-storage")
    act(() => socket.open())
    expect(socket.sent[0]).toEqual({ type: "auth", token: "tok-from-storage" })
    act(() => socket.receive({ type: "ready", userId: "u1" }))
    act(() => socket.receive(STATE))
    expect(first.result.current).toMatchObject({ status: "ready", ready: true, userId: "u1", generation: 1 })
    expect(second.result.current.ready).toBe(true)

    // Người nghe đăng ký qua hook nhận thông điệp.
    const seen: string[] = []
    second.result.current.subscribe("call:peer-left", (message) => seen.push(message.userId))
    act(() => socket.receive({ type: "call:peer-left", userId: "x" }))
    expect(seen).toEqual(["x"])
    expect(first.result.current.send({ type: "call:leave", roomId: ROOM })).toBe(true)

    first.unmount()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(socket.closedWith).toBeNull()
    second.unmount()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(socket.closedWith?.code).toBe(1000)
  })

  it("không kết nối khi roomCode null, enabled false hoặc chưa đăng nhập", () => {
    renderHook(() => useFlashbackRoomSocket(null))
    renderHook(() => useFlashbackRoomSocket(ROOM, false))
    expect(FakeSocket.all).toHaveLength(0)
    sessionStorage.removeItem("iqx.v2.access_token")
    const { result } = renderHook(() => useFlashbackRoomSocket(ROOM))
    expect(FakeSocket.all).toHaveLength(0)
    expect(result.current).toMatchObject({ ready: false, status: "closed", closeReason: "auth" })
    expect(result.current.send({ type: "call:leave", roomId: ROOM })).toBe(false)
  })

  it("đổi phòng thì chuyển sang kết nối của phòng mới", () => {
    const { result, rerender } = renderHook(({ code }) => useFlashbackRoomSocket(code), { initialProps: { code: ROOM } })
    expect(FakeSocket.all).toHaveLength(1)
    rerender({ code: "654321" })
    expect(FakeSocket.all).toHaveLength(2)
    expect(FakeSocket.all[1]!.url).toContain("/flashback/ws")
    expect(result.current.status).toBe("connecting")
  })
})
