import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IMAGE_NOT_SUPPORTED, type ChatImageItem } from "./chat-image"
import { FlashbackChatBox } from "./flashback-chat"
import type { FlashbackChatMessage } from "./flashback-api"
import type { ChatApi } from "./flashback-context"

const mocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

const at = (second: number) => new Date(Date.UTC(2026, 10, 6, 10, 0, second)).toISOString()

const message = (id: string, second: number, text: string): FlashbackChatMessage =>
  ({ id, user_id: "b", name: "Bình", is_me: false, waiting: true, phien: 0, text, created_at: at(second) }) as FlashbackChatMessage

const image = (id: string, second: number, extra: Partial<ChatImageItem> = {}): ChatImageItem => ({
  id,
  clientId: null,
  userId: "b",
  name: "Bình",
  isMe: false,
  url: `blob:test/${id}`,
  width: 800,
  height: 600,
  sentAt: at(second),
  status: "sent",
  ...extra,
})

function makeChat(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    enabled: true,
    messages: [],
    muted: [],
    unread: 0,
    open: true,
    setOpen: vi.fn(),
    send: vi.fn(async () => true),
    sendBusy: false,
    setMuted: vi.fn(),
    report: vi.fn(),
    images: [],
    imagesReady: true,
    imageBusy: false,
    sendImage: vi.fn(async () => true),
    dismissImage: vi.fn(),
    ...overrides,
  }
}

const png = () => new File([new Uint8Array(10)], "a.png", { type: "image/png" })
const list = () => screen.getByTestId("flashback-chat-messages")
const chatInput = () => screen.getByRole("textbox", { name: "Nhập tin nhắn" })

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
})

describe("chat có ảnh: hiện trong luồng", () => {
  it("ảnh xen với tin chữ theo thời gian", () => {
    const chat = makeChat({
      messages: [message("m1", 10, "tin một"), message("m2", 30, "tin hai")],
      images: [image("i1", 20), image("i2", 40, { isMe: true, userId: "me", name: "" })],
    })
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const rows = Array.from(list().querySelectorAll("li")).map(
      (row) => row.getAttribute("data-testid") + ":" + (row.textContent ?? "").slice(0, 12),
    )
    expect(rows[0]).toContain("flashback-chat-message")
    expect(rows[1]).toContain("flashback-chat-image")
    expect(rows[2]).toContain("flashback-chat-message")
    expect(rows[3]).toContain("flashback-chat-image")
    const mine = screen.getAllByTestId("flashback-chat-image")[1]!
    expect(mine.getAttribute("data-me")).toBe("true")
    expect(within(mine).getByRole("img", { name: "Ảnh của bạn" }).getAttribute("src")).toBe("blob:test/i2")
  })

  it("chỉ có ảnh thì không hiện 'Chưa có tin nhắn'", () => {
    render(<FlashbackChatBox chat={makeChat({ images: [image("i1", 5)] })} inMatch={false} />)
    expect(screen.queryByText("Chưa có tin nhắn")).toBeNull()
    expect(screen.getAllByTestId("flashback-chat-image")).toHaveLength(1)
  })

  it("ảnh của người khác có tên người gửi; menu tên có Tắt tiếng", async () => {
    const chat = makeChat({ images: [image("i1", 5)] })
    const user = userEvent.setup()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    await user.click(within(list()).getByRole("button", { name: "Bình" }))
    await user.click(await screen.findByRole("menuitem", { name: "Tắt tiếng Bình" }))
    expect(chat.setMuted).toHaveBeenCalledWith("b", "Bình", true)
  })

  it("đang gửi có chữ và vòng quay; gửi lỗi có thông báo và nút Bỏ", async () => {
    const chat = makeChat({
      images: [
        image("s", 5, { isMe: true, userId: "me", name: "", status: "sending" }),
        image("f", 6, { isMe: true, userId: "me", name: "", status: "failed", error: "Ảnh quá lớn, tối đa 1,5 MB sau khi nén" }),
      ],
    })
    const user = userEvent.setup()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const [sending, failed] = screen.getAllByTestId("flashback-chat-image")
    expect(within(sending!).getByText("Đang gửi ảnh…")).toBeTruthy()
    expect(sending!.getAttribute("data-status")).toBe("sending")
    expect(within(failed!).getByRole("alert").textContent).toContain("Ảnh quá lớn, tối đa 1,5 MB sau khi nén")
    await user.click(within(failed!).getByRole("button", { name: "Bỏ" }))
    expect(chat.dismissImage).toHaveBeenCalledWith("f")
  })
})

describe("chat có ảnh: xem lớn", () => {
  it("bấm ảnh mở bản lớn; Esc đóng ảnh trước, Esc lần hai mới đóng khung chat", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FlashbackChatBox chat={makeChat({ images: [image("i1", 5)] })} inMatch onClose={onClose} />)
    expect(screen.queryByTestId("flashback-chat-image-large")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Xem ảnh lớn. Ảnh của Bình" }))
    const large = await screen.findByTestId("flashback-chat-image-large")
    expect(large.getAttribute("src")).toBe("blob:test/i1")

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("flashback-chat-image-large")).toBeNull())
    expect(onClose).not.toHaveBeenCalled()

    // Đóng ảnh xong, Esc ở trong khung chat mới đóng chat.
    fireEvent.keyDown(chatInput(), { key: "Escape" })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("nút Đóng ảnh cũng đóng bản lớn", async () => {
    const user = userEvent.setup()
    render(<FlashbackChatBox chat={makeChat({ images: [image("i1", 5)] })} inMatch={false} />)
    await user.click(screen.getByRole("button", { name: "Xem ảnh lớn. Ảnh của Bình" }))
    await user.click(await screen.findByRole("button", { name: "Đóng ảnh" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-chat-image-large")).toBeNull())
  })
})

describe("chat có ảnh: chọn, dán, kéo thả", () => {
  it("nút Gửi ảnh mở hộp chọn tệp; chọn ảnh thì gửi", async () => {
    const chat = makeChat()
    const user = userEvent.setup()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const click = vi.spyOn(HTMLInputElement.prototype, "click")
    await user.click(screen.getByRole("button", { name: "Gửi ảnh" }))
    expect(click).toHaveBeenCalled()
    const input = screen.getByTestId("flashback-chat-file") as HTMLInputElement
    expect(input.accept).toBe("image/*")
    const file = png()
    await user.upload(input, file)
    expect(chat.sendImage).toHaveBeenCalledWith(file)
  })

  it("nút Gửi ảnh bị khoá khi chưa kết nối phòng hoặc đang nén", () => {
    const { rerender } = render(<FlashbackChatBox chat={makeChat({ imagesReady: false })} inMatch={false} />)
    expect((screen.getByRole("button", { name: "Gửi ảnh" }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<FlashbackChatBox chat={makeChat({ imageBusy: true })} inMatch={false} />)
    expect((screen.getByRole("button", { name: "Gửi ảnh" }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<FlashbackChatBox chat={makeChat()} inMatch={false} />)
    expect((screen.getByRole("button", { name: "Gửi ảnh" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("dán ảnh (Ctrl+V hoặc Cmd+V) khi đang ở ô chat thì gửi ảnh và không dán gì vào ô", () => {
    const chat = makeChat()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const file = png()
    const clipboardData = { types: ["Files"], files: [file], items: [{ kind: "file", type: "image/png", getAsFile: () => file }] }
    const prevented = !fireEvent.paste(chatInput(), { clipboardData })
    expect(prevented).toBe(true)
    expect(chat.sendImage).toHaveBeenCalledWith(file)
  })

  it("dán chữ thì để nguyên, không gửi ảnh", () => {
    const chat = makeChat()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const clipboardData = { types: ["text/plain"], files: [], items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] }
    const prevented = !fireEvent.paste(chatInput(), { clipboardData })
    expect(prevented).toBe(false)
    expect(chat.sendImage).not.toHaveBeenCalled()
  })

  it("dán khi focus ở vùng tin nhắn (không phải ô nhập) vẫn gửi được", () => {
    const chat = makeChat({ images: [image("i1", 5)] })
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const file = png()
    fireEvent.paste(screen.getByTestId("flashback-chat"), {
      clipboardData: { types: ["Files"], files: [file], items: [{ kind: "file", type: "image/png", getAsFile: () => file }] },
    })
    expect(chat.sendImage).toHaveBeenCalledWith(file)
  })

  it("kéo tệp vào hiện vùng thả; thả ảnh thì gửi; rời đi thì ẩn vùng thả", () => {
    const chat = makeChat()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    const box = screen.getByTestId("flashback-chat")
    expect(screen.queryByTestId("flashback-chat-dropzone")).toBeNull()
    fireEvent.dragOver(box, { dataTransfer: { types: ["Files"] } })
    expect(screen.getByTestId("flashback-chat-dropzone").textContent).toBe("Thả ảnh để gửi")
    fireEvent.dragLeave(box, { dataTransfer: { types: ["Files"] }, relatedTarget: null })
    expect(screen.queryByTestId("flashback-chat-dropzone")).toBeNull()

    fireEvent.dragOver(box, { dataTransfer: { types: ["Files"] } })
    const file = png()
    fireEvent.drop(box, { dataTransfer: { types: ["Files"], files: [file] } })
    expect(chat.sendImage).toHaveBeenCalledWith(file)
    expect(screen.queryByTestId("flashback-chat-dropzone")).toBeNull()
  })

  it("thả tệp không phải ảnh thì báo lỗi tiếng Việt, không gửi", () => {
    const chat = makeChat()
    render(<FlashbackChatBox chat={chat} inMatch={false} />)
    fireEvent.drop(screen.getByTestId("flashback-chat"), {
      dataTransfer: { types: ["Files"], files: [new File(["x"], "a.pdf", { type: "application/pdf" })] },
    })
    expect(chat.sendImage).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledWith(IMAGE_NOT_SUPPORTED)
  })

  it("kéo chữ (không phải tệp) vào thì bỏ qua", () => {
    render(<FlashbackChatBox chat={makeChat()} inMatch={false} />)
    fireEvent.dragOver(screen.getByTestId("flashback-chat"), { dataTransfer: { types: ["text/plain"] } })
    expect(screen.queryByTestId("flashback-chat-dropzone")).toBeNull()
  })
})
