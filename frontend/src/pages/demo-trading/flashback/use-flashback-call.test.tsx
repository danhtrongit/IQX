/**
 * Hook `useFlashbackCall` với socket phòng giả: nghe đúng các loại thông điệp, gửi qua socket, dọn khi unmount hoặc socket
 * dừng, chạy được dưới StrictMode (effect chạy hai lần).
 */
import { StrictMode, type ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FakeAudioContext, FakePeerConnection, FakeStream, FakeTrack } from "./flashback-call-fakes"
import { useFlashbackCall } from "./use-flashback-call"
import type { RoomSocketHandle } from "./use-flashback-room-socket"

const mocks = vi.hoisted(() => ({
  socket: null as unknown,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock("./use-flashback-room-socket", () => ({ useFlashbackRoomSocket: () => mocks.socket }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

type Handler = (message: Record<string, unknown>) => void

function createSocket(overrides: Partial<RoomSocketHandle> = {}) {
  const handlers = new Map<string, Set<Handler>>()
  const sent: Record<string, unknown>[] = []
  const subscribe = vi.fn((type: string, handler: Handler) => {
    const set = handlers.get(type) ?? new Set<Handler>()
    set.add(handler)
    handlers.set(type, set)
    return () => set.delete(handler)
  })
  const socket = {
    status: "ready",
    ready: true,
    userId: "u1",
    roomState: null,
    generation: 1,
    closeReason: null,
    send: (message: Record<string, unknown>) => (sent.push(message), true),
    subscribe,
    ...overrides,
  } as unknown as RoomSocketHandle
  const emit = (message: Record<string, unknown>) => {
    for (const handler of handlers.get(String(message.type)) ?? []) handler(message)
  }
  return { socket, sent, emit, handlers, subscribe }
}

const tracks: FakeTrack[] = []
const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

beforeEach(() => {
  tracks.length = 0
  FakePeerConnection.all = []
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection)
  vi.stubGlobal("MediaStream", FakeStream)
  vi.stubGlobal("AudioContext", FakeAudioContext)
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        const track = new FakeTrack(constraints.video ? "video" : "audio")
        tracks.push(track)
        return new FakeStream([track])
      },
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, "mediaDevices")
})

const roomState = { type: "room:state", roomId: "123456", images: [], call: [], iceServers: [] }

function render(socket: RoomSocketHandle, wrapper?: typeof strict) {
  mocks.socket = socket
  return renderHook(() => useFlashbackCall({ roomId: "123456", userId: "u1", userName: "Tôi" }), { wrapper })
}

describe("useFlashbackCall", () => {
  it("nghe đủ các loại thông điệp của cuộc gọi; có room:state kèm call thì bật thanh gọi", () => {
    const fake = createSocket()
    const { result } = render(fake.socket)
    expect([...fake.handlers.keys()].sort()).toEqual(
      ["call:joined", "call:media", "call:peer-joined", "call:peer-left", "room:closed", "room:state", "rtc:signal"].sort(),
    )
    expect(result.current.supported).toBe(false)
    act(() => fake.emit(roomState))
    expect(result.current.supported).toBe(true)
    expect(result.current.status).toBe("idle")
  })

  it("room:state đã có sẵn lúc hook bắt đầu nghe (kết nối dùng chung với chat) vẫn được nạp", () => {
    const fake = createSocket({ roomState: roomState as unknown as RoomSocketHandle["roomState"] })
    const { result } = render(fake.socket)
    expect(result.current.supported).toBe(true)
  })

  it("vào gọi gửi call:join qua socket; unmount thì báo rời, dừng track, đóng kết nối và bỏ đăng ký", async () => {
    const fake = createSocket()
    const { result, unmount } = render(fake.socket)
    act(() => fake.emit(roomState))
    await act(async () => result.current.join())
    expect(result.current.status).toBe("joined")
    expect(fake.sent).toEqual([{ type: "call:join", roomId: "123456", media: { audio: true, video: false, screen: false } }])
    act(() => fake.emit({ type: "call:joined", roomId: "123456", peers: [{ userId: "u2", name: "Minh", media: { audio: true, video: false, screen: false } }] }))
    expect(FakePeerConnection.all).toHaveLength(1)
    unmount()
    expect(fake.sent.at(-1)).toEqual({ type: "call:leave", roomId: "123456" })
    expect(FakePeerConnection.all.every((pc) => pc.closed)).toBe(true)
    expect(tracks.every((track) => track.readyState === "ended")).toBe(true)
    expect([...fake.handlers.values()].every((set) => set.size === 0)).toBe(true)
  })

  it("StrictMode: effect chạy hai lần mà vẫn vào gọi được và vẫn dọn khi unmount", async () => {
    const fake = createSocket()
    const { result, unmount } = render(fake.socket, strict)
    act(() => fake.emit(roomState))
    await act(async () => result.current.join())
    await waitFor(() => expect(result.current.status).toBe("joined"))
    unmount()
    expect(fake.sent.at(-1)).toEqual({ type: "call:leave", roomId: "123456" })
    expect(tracks.every((track) => track.readyState === "ended")).toBe(true)
  })

  it("socket dừng hẳn (bị mời ra, phòng đóng): dọn ngay, không chờ", async () => {
    const fake = createSocket()
    const { result, rerender } = render(fake.socket)
    act(() => fake.emit(roomState))
    await act(async () => result.current.join())
    expect(result.current.status).toBe("joined")
    mocks.socket = { ...fake.socket, ready: false, status: "closed", closeReason: "room-closed" }
    rerender()
    await waitFor(() => expect(result.current.status).toBe("idle"))
    expect(tracks.every((track) => track.readyState === "ended")).toBe(true)
  })

  it("thông báo của máy gọi đi qua toast tiếng Việt", async () => {
    const fake = createSocket()
    const { result } = render(fake.socket)
    act(() => fake.emit(roomState))
    await act(async () => result.current.join())
    act(() =>
      fake.emit({ type: "call:joined", roomId: "123456", peers: [{ userId: "u2", name: "Minh", media: { audio: false, video: false, screen: true } }] }),
    )
    await act(async () => result.current.toggleScreen())
    expect(mocks.toast.warning).toHaveBeenCalledWith("Minh đang chia sẻ màn hình. Đợi bạn ấy dừng rồi chia sẻ.")
  })
})
