import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ImageMessage, RoomImage, RoomStateMessage } from "./room-socket-protocol"

const fake = vi.hoisted(() => {
  type Handler = (message: Record<string, unknown>) => void
  const handlers = new Map<string, Set<Handler>>()
  const watchers = new Set<() => void>()
  const store = {
    ready: true,
    roomState: null as unknown,
    sent: [] as Array<Record<string, unknown>>,
    sendResult: true,
  }
  let snapshot = { ready: store.ready, roomState: store.roomState }
  return {
    store,
    reset() {
      handlers.clear()
      store.ready = true
      store.roomState = null
      store.sent = []
      store.sendResult = true
      snapshot = { ready: true, roomState: null }
    },
    getSnapshot: () => snapshot,
    watch(listener: () => void) {
      watchers.add(listener)
      return () => watchers.delete(listener)
    },
    update(patch: Partial<{ ready: boolean; roomState: unknown }>) {
      Object.assign(store, patch)
      snapshot = { ready: store.ready, roomState: store.roomState }
      for (const watcher of [...watchers]) watcher()
    },
    subscribe(type: string, handler: Handler) {
      const set = handlers.get(type) ?? new Set<Handler>()
      set.add(handler)
      handlers.set(type, set)
      return () => set.delete(handler)
    },
    emit(type: string, message: Record<string, unknown>) {
      for (const handler of [...(handlers.get(type) ?? [])]) handler({ type, ...message })
    },
    send(message: Record<string, unknown>) {
      if (!store.sendResult) return false
      store.sent.push(message)
      return true
    },
  }
})

const mocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("./use-flashback-room-socket", async () => {
  const React = await import("react")
  return {
    useFlashbackRoomSocket: () => {
      const snap = React.useSyncExternalStore(fake.watch, fake.getSnapshot)
      return { ...snap, subscribe: fake.subscribe, send: fake.send }
    },
  }
})
vi.mock("./chat-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-image")>()),
  compressImage: vi.fn(async () => ({
    blob: new Blob([new Uint8Array(10)], { type: "image/webp" }),
    mime: "image/webp",
    width: 100,
    height: 50,
  })),
  blobToBase64: vi.fn(async () => "QUJD"),
}))

import { compressImage, ChatImageError, IMAGE_TOO_FAST } from "./chat-image"
import { IMAGE_OFFLINE, IMAGE_SEND_FAILED, MAX_IMAGES, SEND_TIMEOUT_MS, useChatImages } from "./use-chat-images"

const ROOM = "123456"
const ME = "me"
const png = new File([new Uint8Array(10)], "a.png", { type: "image/png" })
const NO_MUTED: ReadonlySet<string> = new Set()

const serverImage = (id: string, userId: string, extra: Partial<RoomImage> = {}): RoomImage => ({
  id,
  clientId: null,
  roomId: ROOM,
  userId,
  name: userId === ME ? "Tôi" : `Người ${userId}`,
  mime: "image/webp",
  data: "QUJD",
  width: 10,
  height: 10,
  sentAt: new Date().toISOString(),
  ...extra,
})

const roomState = (images: RoomImage[]): RoomStateMessage => ({ type: "room:state", roomId: ROOM, images, call: [], iceServers: [] })

let counter = 0
let created: string[] = []
let revoked: string[] = []

function setup(props: Partial<Parameters<typeof useChatImages>[0]> = {}) {
  return renderHook(
    (hookProps: Parameters<typeof useChatImages>[0]) => useChatImages(hookProps),
    { initialProps: { roomCode: ROOM, enabled: true, userId: ME, mutedIds: NO_MUTED, watching: true, ...props } },
  )
}

const act$ = async (fn: () => void | Promise<void>) => {
  await act(async () => {
    await fn()
  })
}

beforeEach(() => {
  fake.reset()
  counter = 0
  created = []
  revoked = []
  URL.createObjectURL = vi.fn(() => {
    counter += 1
    const url = `blob:test/${counter}`
    created.push(url)
    return url
  })
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  vi.mocked(compressImage).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("nhận ảnh", () => {
  it("room:state dựng danh sách ảnh đã tới lượt mình, mỗi ảnh một object URL", async () => {
    const { result } = setup()
    expect(result.current.images).toEqual([])
    await act$(() => fake.update({ roomState: roomState([serverImage("i1", "b"), serverImage("i2", ME)]) }))
    expect(result.current.images.map((item) => [item.id, item.isMe, item.status])).toEqual([
      ["i1", false, "sent"],
      ["i2", true, "sent"],
    ])
    expect(created).toHaveLength(2)
    expect(result.current.images[0]!.url).toBe("blob:test/1")
  })

  it("ảnh mới từ người khác xuất hiện; trùng id không thêm lần hai", async () => {
    const { result } = setup()
    await act$(() => fake.update({ roomState: roomState([]) }))
    await act$(() => fake.emit("image", { ...serverImage("i1", "b") }))
    await act$(() => fake.emit("image", { ...serverImage("i1", "b") }))
    expect(result.current.images).toHaveLength(1)
    expect(created).toHaveLength(1)
  })

  it("số ảnh chưa đọc chỉ tăng khi khung chat đang đóng, về 0 khi mở khung", async () => {
    const { result, rerender } = setup({ watching: false })
    await act$(() => fake.emit("image", { ...serverImage("i1", "b") }))
    await act$(() => fake.emit("image", { ...serverImage("i2", ME) }))
    await act$(() => fake.emit("image", { ...serverImage("i3", "c") }))
    expect(result.current.imageUnread).toBe(2)
    rerender({ roomCode: ROOM, enabled: true, userId: ME, mutedIds: NO_MUTED, watching: true })
    expect(result.current.imageUnread).toBe(0)
  })

  it("người đã tắt tiếng: ảnh mới không hiện, ảnh đã nhận cũng bị ẩn ngay", async () => {
    const muted = new Set(["b"])
    const { result, rerender } = setup()
    await act$(() => fake.update({ roomState: roomState([serverImage("i1", "b"), serverImage("i2", "c")]) }))
    expect(result.current.images).toHaveLength(2)
    rerender({ roomCode: ROOM, enabled: true, userId: ME, mutedIds: muted, watching: true })
    expect(result.current.images.map((item) => item.id)).toEqual(["i2"])
    await act$(() => fake.emit("image", { ...serverImage("i3", "b") }))
    expect(result.current.images.map((item) => item.id)).toEqual(["i2"])
  })

  it("vào lại phòng (room:state mới) thay danh sách và thu hồi URL của ảnh không còn", async () => {
    const { result } = setup()
    await act$(() => fake.update({ roomState: roomState([serverImage("i1", "b"), serverImage("i2", "b")]) }))
    const [first, second] = result.current.images.map((item) => item.url)
    await act$(() => fake.update({ roomState: roomState([serverImage("i2", "b"), serverImage("i3", "b")]) }))
    expect(result.current.images.map((item) => item.id)).toEqual(["i2", "i3"])
    expect(revoked).toContain(first)
    expect(revoked).not.toContain(second)
  })

  it("giữ tối đa 50 ảnh, bỏ ảnh cũ nhất và thu hồi URL của nó", async () => {
    const { result } = setup()
    await act$(() => fake.update({ roomState: roomState([]) }))
    for (let index = 0; index < MAX_IMAGES + 3; index += 1)
      await act$(() => fake.emit("image", { ...serverImage(`i${index}`, "b") }))
    expect(result.current.images).toHaveLength(MAX_IMAGES)
    expect(result.current.images[0]!.id).toBe("i3")
    expect(revoked).toEqual(["blob:test/1", "blob:test/2", "blob:test/3"])
  })

  it("phòng đóng thì xoá hết ảnh và giải phóng URL", async () => {
    const { result } = setup()
    await act$(() => fake.update({ roomState: roomState([serverImage("i1", "b")]) }))
    await act$(() => fake.emit("room:closed", { roomId: ROOM }))
    expect(result.current.images).toEqual([])
    expect(revoked).toEqual(["blob:test/1"])
  })

  it("rời phòng (gỡ màn) giải phóng mọi object URL", async () => {
    const { unmount } = setup()
    await act$(() => fake.update({ roomState: roomState([serverImage("i1", "b"), serverImage("i2", "c")]) }))
    unmount()
    expect(revoked.sort()).toEqual([...created].sort())
  })

  it("đổi sang phòng khác giải phóng ảnh của phòng cũ", async () => {
    const { result, rerender } = setup()
    await act$(() => fake.update({ roomState: roomState([serverImage("i1", "b")]) }))
    rerender({ roomCode: "654321", enabled: true, userId: ME, mutedIds: NO_MUTED, watching: true })
    expect(result.current.images).toEqual([])
    expect(revoked).toContain("blob:test/1")
  })
})

describe("gửi ảnh", () => {
  it("nén, gửi image:send đúng giao thức, hiện dòng 'đang gửi' rồi chuyển thành đã gửi khi server trả lại", async () => {
    const { result } = setup()
    let ok = false
    await act$(async () => {
      ok = await result.current.sendImage(png)
    })
    expect(ok).toBe(true)
    expect(compressImage).toHaveBeenCalledWith(png)
    expect(fake.store.sent).toHaveLength(1)
    const sent = fake.store.sent[0]!
    expect(sent).toMatchObject({ type: "image:send", roomId: ROOM, mime: "image/webp", data: "QUJD", width: 100, height: 50 })
    const clientId = sent.clientId as string
    expect(typeof clientId).toBe("string")
    expect(result.current.images).toHaveLength(1)
    const pending = result.current.images[0]!
    expect(pending).toMatchObject({ status: "sending", isMe: true, clientId })
    expect(created).toHaveLength(1)

    await act$(() =>
      fake.emit("image", { ...serverImage("srv-1", ME, { clientId, width: 100, height: 50 }) } as Partial<ImageMessage>),
    )
    expect(result.current.images).toHaveLength(1)
    expect(result.current.images[0]).toMatchObject({ id: "srv-1", status: "sent", url: pending.url })
    // Dùng lại bản xem trước, không tạo thêm URL.
    expect(created).toHaveLength(1)
    expect(result.current.imageBusy).toBe(false)
  })

  it("chưa vào phòng xong thì báo lỗi tiếng Việt và không gửi", async () => {
    const { result } = setup()
    await act$(() => fake.update({ ready: false }))
    let ok = true
    await act$(async () => {
      ok = await result.current.sendImage(png)
    })
    expect(ok).toBe(false)
    expect(mocks.toast.error).toHaveBeenCalledWith(IMAGE_OFFLINE)
    expect(fake.store.sent).toHaveLength(0)
    expect(compressImage).not.toHaveBeenCalled()
  })

  it("gửi hai ảnh trong 2 giây thì ảnh sau bị chặn ở máy", async () => {
    const { result } = setup()
    await act$(async () => {
      await result.current.sendImage(png)
    })
    let second = true
    await act$(async () => {
      second = await result.current.sendImage(png)
    })
    expect(second).toBe(false)
    expect(mocks.toast.info).toHaveBeenCalledWith(IMAGE_TOO_FAST)
    expect(fake.store.sent).toHaveLength(1)
  })

  it("server từ chối: dòng ảnh báo đúng lý do server nêu, 'Bỏ' gỡ ảnh và thu hồi URL", async () => {
    const { result } = setup()
    await act$(async () => {
      await result.current.sendImage(png)
    })
    const clientId = fake.store.sent[0]!.clientId as string
    await act$(() => fake.emit("error", { clientId, code: "IMAGE_TOO_FAST", message: "Từ từ thôi, mỗi 2 giây một ảnh" }))
    expect(result.current.images[0]).toMatchObject({ status: "failed", error: "Từ từ thôi, mỗi 2 giây một ảnh" })
    const url = result.current.images[0]!.url
    await act$(() => result.current.dismissImage(clientId))
    expect(result.current.images).toEqual([])
    expect(revoked).toContain(url)
  })

  it("lỗi không có clientId (của việc khác) không đụng tới ảnh đang gửi", async () => {
    const { result } = setup()
    await act$(async () => {
      await result.current.sendImage(png)
    })
    await act$(() => fake.emit("error", { code: "BAD_MESSAGE", message: "x" }))
    expect(result.current.images[0]!.status).toBe("sending")
  })

  it("socket không gửi được thì dòng ảnh chuyển sang lỗi", async () => {
    const { result } = setup()
    fake.store.sendResult = false
    let ok = true
    await act$(async () => {
      ok = await result.current.sendImage(png)
    })
    expect(ok).toBe(false)
    expect(result.current.images[0]).toMatchObject({ status: "failed", error: IMAGE_OFFLINE })
  })

  it("quá 20 giây server không trả lời thì coi là hỏng", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { result } = setup()
    await act$(async () => {
      await result.current.sendImage(png)
    })
    expect(result.current.images[0]!.status).toBe("sending")
    await act$(() => {
      vi.advanceTimersByTime(SEND_TIMEOUT_MS + 10)
    })
    expect(result.current.images[0]).toMatchObject({ status: "failed", error: IMAGE_SEND_FAILED })
  })

  it("ảnh không nén được: báo lỗi của việc nén, không gửi, và cho thử ngay ảnh khác", async () => {
    const { result } = setup()
    vi.mocked(compressImage).mockRejectedValueOnce(new ChatImageError("Không đọc được ảnh này. Hãy thử ảnh khác."))
    let ok = true
    await act$(async () => {
      ok = await result.current.sendImage(png)
    })
    expect(ok).toBe(false)
    expect(mocks.toast.error).toHaveBeenCalledWith("Không đọc được ảnh này. Hãy thử ảnh khác.")
    expect(fake.store.sent).toHaveLength(0)
    await act$(async () => {
      ok = await result.current.sendImage(png)
    })
    expect(ok).toBe(true)
  })

  it("room:state sau khi kết nối lại thay ảnh đã gửi nhưng giữ ảnh đang gửi", async () => {
    const { result } = setup()
    await act$(() => fake.update({ roomState: roomState([serverImage("old", "b")]) }))
    await act$(async () => {
      await result.current.sendImage(png)
    })
    await act$(() => fake.update({ roomState: roomState([serverImage("new", "b")]) }))
    expect(result.current.images.map((item) => [item.id.length > 5 ? "local" : item.id, item.status])).toEqual([
      ["new", "sent"],
      ["local", "sending"],
    ])
  })
})
