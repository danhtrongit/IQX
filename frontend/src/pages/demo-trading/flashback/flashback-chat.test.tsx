/**
 * Flashback v2.4: chat phòng (§3), khung Lợi nhuận (§2), khoá 5 giây ở cửa sổ kết quả (§4), Sẵn sàng (§5).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceFrameContext, type WorkspaceFrameState } from "@/components/layout/workspace-frame-context"

import { FlashbackMain } from "./flashback-main"
import { formatSignedPercent, profitPercent, roomReadiness } from "./flashback-model"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import {
  HOA,
  ME,
  MINH,
  ROOM_CODE,
  createFlashbackBackend,
  type BackendOptions,
  type FlashbackBackend,
} from "./flashback-test-support"
import type { FlashbackRoom } from "./flashback-api"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  openAuth: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, openAuth: mocks.openAuth }),
}))
vi.mock("../shop/use-shop", () => ({ useShopState: () => ({ data: { wallet: { balance: 5_000 } } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: FlashbackBackend

function setup(options: BackendOptions) {
  backend = createFlashbackBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return backend
}

const desktopFrame: WorkspaceFrameState = {
  open: false,
  overlay: false,
  railBar: false,
  collapsed: false,
  panelId: "panel",
  panelLabel: "Flashback",
  setOpen: vi.fn(),
  revealPanel: vi.fn(),
}

function renderGame(frame: WorkspaceFrameState = desktopFrame) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceFrameContext.Provider value={frame}>
        <FlashbackProvider>
          <FlashbackMain />
          <FlashbackPanel />
        </FlashbackProvider>
      </WorkspaceFrameContext.Provider>
    </QueryClientProvider>,
  )
}

const playing: BackendOptions = { room: { status: "playing", owner: ME, members: [ME, MINH] } }
const waiting: BackendOptions = { room: { status: "waiting", owner: ME, members: [ME, MINH] } }

const messages = () => screen.getByTestId("flashback-chat-messages")
const chatInput = () => screen.getByRole("textbox", { name: "Nhập tin nhắn" })
const pollOnce = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2_100)
  })

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  vi.mocked(desktopFrame.revealPanel).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Flashback v2.4: chat ở phòng chờ (§3.2, §3.3)", () => {
  it("khung chat luôn mở; gửi bằng nút, hiện n/200 khi gõ, tối đa 200 ký tự, tin của mình có nhãn Phòng chờ", async () => {
    setup(waiting)
    const user = userEvent.setup()
    renderGame()
    await screen.findByTestId("flashback-chat")
    expect(screen.queryByText("Tin của người đi trước hiện khi bạn tới cùng phiên")).toBeNull()
    expect(chatInput().getAttribute("maxlength")).toBe("200")
    expect(screen.getByTestId("flashback-chat-count").textContent).toBe("")

    await user.type(chatInput(), "Chào cả phòng")
    expect(screen.getByTestId("flashback-chat-count").textContent).toBe("13/200")
    await user.click(screen.getByRole("button", { name: "Gửi" }))

    const row = await within(messages()).findByTestId("flashback-chat-message")
    expect(row.getAttribute("data-me")).toBe("true")
    expect(row.textContent).toContain("Phòng chờ")
    expect(row.textContent).toContain("Chào cả phòng")
    expect((chatInput() as HTMLInputElement).value).toBe("")
  })

  it("Enter gửi tin; gửi tiếp trong 2 giây bị chặn ở máy và báo đúng câu", async () => {
    setup(waiting)
    const user = userEvent.setup()
    renderGame()
    await screen.findByTestId("flashback-chat")
    await user.type(chatInput(), "một{Enter}")
    await within(messages()).findByText("một")
    await user.type(chatInput(), "hai{Enter}")
    expect(mocks.toast.info).toHaveBeenCalledWith("Từ từ thôi 😄 Mỗi 2 giây một tin.")
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/chat`)).toHaveLength(1)
    // Chữ đang gõ không mất để gửi lại sau.
    expect((chatInput() as HTMLInputElement).value).toBe("hai")
  })

  it("câu nhanh bấm là gửi luôn", async () => {
    setup(waiting)
    const user = userEvent.setup()
    renderGame()
    const quick = within(await screen.findByTestId("flashback-chat-quick"))
    for (const text of ["Chơi đẹp!", "Gồng thôi 💪", "Cẩn thận nhé", "Ngon!", "GG 🤝", "😂", "🚀", "📉"])
      expect(quick.getByRole("button", { name: text })).toBeTruthy()
    await user.click(quick.getByRole("button", { name: "Ngon!" }))
    await waitFor(() =>
      expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/chat`)[0]?.body).toEqual({ text: "Ngon!" }),
    )
  })

  it("tắt tiếng: tin của họ biến mất, bỏ được; báo cáo gửi đúng id tin", async () => {
    setup(waiting)
    backend.rivalChats(MINH, "tin của Minh")
    const user = userEvent.setup()
    renderGame()
    await within(await screen.findByTestId("flashback-chat")).findByText("tin của Minh")

    await user.click(within(messages()).getByRole("button", { name: "Minh" }))
    await user.click(await screen.findByRole("menuitem", { name: "Báo cáo tin nhắn" }))
    await waitFor(() =>
      expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/chat/report`)[0]?.body).toEqual({ message_id: "chat-1" }),
    )
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã gửi báo cáo cho quản trị.")

    await user.click(within(messages()).getByRole("button", { name: "Minh" }))
    await user.click(await screen.findByRole("menuitem", { name: "Tắt tiếng Minh" }))
    await waitFor(() => expect(within(messages()).queryByText("tin của Minh")).toBeNull())
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã tắt tiếng Minh. Chỉ bạn không thấy tin của họ.")

    await user.click(screen.getByRole("button", { name: "Bỏ tắt tiếng" }))
    await within(messages()).findByText("tin của Minh")
  })

  it("chủ phòng tắt chat: không có khung chat và không hỏi chat nữa", async () => {
    setup({ room: { ...waiting.room, chatEnabled: false } })
    renderGame()
    await screen.findByTestId("flashback-room-id")
    expect(screen.queryByTestId("flashback-chat")).toBeNull()
    // Lúc mới vào có thể hỏi một lần để biết phòng tắt chat; server trả rỗng và máy thôi hỏi.
    await waitFor(() => expect(screen.getByTestId("flashback-room-summary")).toBeTruthy())
    expect(backend.callsTo("GET", `/flashback/rooms/${ROOM_CODE}/chat`).length).toBeLessThanOrEqual(1)
  })
})

describe("Flashback v2.4: chat trong ván (§3.2, §3.4)", () => {
  it("tin của người đi trước chỉ hiện khi mình tới cùng phiên; số chưa đọc đúng và về 0 khi mở khung", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ ...playing, match: { step: 14 } })
    backend.rivalChats(MINH, "chào", 0)
    renderGame()
    await screen.findByTestId("flashback-clock")
    await pollOnce()
    expect(screen.queryByTestId("flashback-chat-unread")).toBeNull()

    backend.rivalChats(MINH, "Bollinger thắt lại rồi kìa", 15)
    await pollOnce()
    // Chưa tới phiên 15: không có gì báo hiệu, kể cả số tin chưa đọc.
    expect(screen.queryByTestId("flashback-chat-unread")).toBeNull()
    expect(document.body.textContent).not.toContain("Bollinger")

    await act(async () => {
      fireEvent.click(screen.getByTestId("flashback-next"))
      await vi.advanceTimersByTimeAsync(50)
    })
    const toggle = screen.getByTestId("flashback-chat-toggle")
    await waitFor(() => expect(within(toggle).getByTestId("flashback-chat-unread").textContent).toBe("1"))
    expect(within(screen.getByTestId("flashback-chat-mobile")).getByTestId("flashback-chat-unread").textContent).toBe("1")

    fireEvent.click(toggle)
    expect(desktopFrame.revealPanel).toHaveBeenCalled()
    const box = within(await screen.findByTestId("flashback-chat"))
    expect(box.getByText("Tin của người đi trước hiện khi bạn tới cùng phiên")).toBeTruthy()
    expect(box.getByText("Phiên 15")).toBeTruthy()
    expect(box.getByText("Bollinger thắt lại rồi kìa")).toBeTruthy()
    expect(screen.queryByTestId("flashback-chat-unread")).toBeNull()

    fireEvent.click(box.getByRole("button", { name: "Đóng chat" }))
    expect(screen.queryByTestId("flashback-chat")).toBeNull()
  })

  it("điện thoại: thanh đáy có nút Chat, bấm thì mở khung kéo từ dưới lên; không có nút Chat khi phòng tắt chat", async () => {
    const phone = { ...desktopFrame, overlay: true }
    setup(playing)
    const { unmount } = renderGame(phone)
    await screen.findByTestId("flashback-clock")
    const button = await screen.findByTestId("flashback-chat-mobile")
    expect(screen.queryByTestId("flashback-chat")).toBeNull()
    fireEvent.click(button)
    const sheet = await screen.findByTestId("flashback-chat")
    expect(sheet.parentElement?.className).toContain("h-[72dvh]")
    expect(desktopFrame.revealPanel).not.toHaveBeenCalled()
    unmount()

    setup({ room: { ...playing.room, chatEnabled: false } })
    renderGame(phone)
    await screen.findByTestId("flashback-clock")
    expect(screen.queryByTestId("flashback-chat-mobile")).toBeNull()
    expect(screen.queryByTestId("flashback-chat-toggle")).toBeNull()
  })
})

describe("Flashback v2.4: khung Lợi nhuận (§2)", () => {
  it("tính từ tổng tài sản, làm tròn 2 chữ số, không bao giờ −0,00%", () => {
    expect(profitPercent(10_234_000, 10_000_000)).toBe(2.34)
    expect(profitPercent(9_766_000, 10_000_000)).toBe(-2.34)
    expect(profitPercent(9_999_999, 10_000_000)).toBe(0)
    expect(Object.is(profitPercent(9_999_999, 10_000_000), -0)).toBe(false)
    expect(formatSignedPercent(profitPercent(9_999_999, 10_000_000))).toBe("0,00%")
    expect(formatSignedPercent(profitPercent(10_234_000, 10_000_000))).toBe("+2,34%")
    expect(formatSignedPercent(profitPercent(9_766_000, 10_000_000))).toBe("−2,34%")
  })

  it("ô đổi màu theo dấu; thanh người chơi vẫn không có % của ai", async () => {
    setup({ ...playing, match: { cash: 10_500_000 } })
    renderGame()
    const profit = await screen.findByTestId("flashback-profit")
    expect(profit.textContent).toBe("+5,00%")
    expect(profit.className).toContain("text-price-up")
    const bar = screen.getByTestId("flashback-player-list")
    expect(bar.textContent).not.toContain("%")
  })
})

describe("Flashback v2.4: cửa sổ kết quả khoá 5 giây (§4)", () => {
  const ended: BackendOptions = {
    ...playing,
    match: { status: "ended", finished: true, step: 30, rivals: [{ person: MINH, pnl: 2, finished: true }] },
  }

  it("Về sảnh, Chơi lại đếm lùi đúng 5 giây; Xem lại biểu đồ bấm được ngay; mở lại không khoá thêm", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    setup(ended)
    renderGame()
    await vi.waitFor(() => screen.getByTestId("flashback-result"))
    const dialog = () => within(screen.getByTestId("flashback-result"))

    const lobby = () => dialog().getByRole("button", { name: /^Về sảnh/ })
    const again = () => dialog().getByRole("button", { name: /^Chơi lại/ })
    expect(lobby().textContent).toBe("Về sảnh (5)")
    expect(again().textContent).toBe("Chơi lại (5)")
    expect(lobby().hasAttribute("disabled")).toBe(true)
    expect(again().hasAttribute("disabled")).toBe(true)
    expect(screen.getByTestId("flashback-result-lock").textContent).toBe(
      "Xem kết quả và chat với cả phòng. Sau 5 giây mới về sảnh hoặc chơi lại được.",
    )
    expect(dialog().getByRole("button", { name: "Xem lại biểu đồ" }).hasAttribute("disabled")).toBe(false)
    expect(screen.getByTestId("flashback-result-chat").hasAttribute("disabled")).toBe(false)

    const tick = () =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
    for (let second = 0; second < 4; second += 1) await tick()
    expect(lobby().textContent).toBe("Về sảnh (1)")
    expect(lobby().hasAttribute("disabled")).toBe(true)

    await tick()
    expect(lobby().textContent).toBe("Về sảnh")
    expect(lobby().hasAttribute("disabled")).toBe(false)
    expect(again().hasAttribute("disabled")).toBe(false)
    expect(screen.queryByTestId("flashback-result-lock")).toBeNull()

    // Đóng rồi mở lại không bắt chờ thêm.
    fireEvent.click(dialog().getByRole("button", { name: "Xem lại biểu đồ" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    fireEvent.click(screen.getByTestId("flashback-next"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(lobby().textContent).toBe("Về sảnh")
    expect(lobby().hasAttribute("disabled")).toBe(false)
  })

  it("Chat với phòng: đóng cửa sổ, mở khung chat, nút đáy thành Xem kết quả", async () => {
    setup(ended)
    const user = userEvent.setup()
    renderGame()
    await screen.findByTestId("flashback-result")
    await user.click(await screen.findByTestId("flashback-result-chat"))
    await screen.findByTestId("flashback-chat")
    await waitFor(() => expect(screen.queryByTestId("flashback-result")).toBeNull())
    expect(screen.getByTestId("flashback-next").textContent).toBe("Xem kết quả")
  })

  it("phòng tắt chat: cửa sổ kết quả không có nút Chat với phòng", async () => {
    setup({ ...ended, room: { ...ended.room, chatEnabled: false } })
    renderGame()
    await screen.findByTestId("flashback-result")
    expect(screen.queryByTestId("flashback-result-chat")).toBeNull()
  })
})

describe("Flashback v2.4: chữ của phòng chờ (§5)", () => {
  const member = (id: string, owner: boolean, ready: boolean, me = false) =>
    ({ user_id: id, is_owner: owner, ready: owner || ready, is_me: me }) as FlashbackRoom["members"][number]
  const room = (members: FlashbackRoom["members"]) => ({ max_players: 4, members }) as FlashbackRoom

  it("chủ phòng: chờ người, tất cả sẵn sàng, chỉ có mình", () => {
    const pending = roomReadiness(room([member("a", true, true, true), member("b", false, true), member("c", false, false)]))
    expect(pending.summary).toBe("3/4 người · 1/2 sẵn sàng")
    expect(pending.startLabel).toBe("Bắt đầu (chờ 1 người)")
    expect(pending.ownerHint).toBe("Mọi người sẵn sàng thì mới bắt đầu được.")

    const all = roomReadiness(room([member("a", true, true, true), member("b", false, true)]))
    expect(all.startLabel).toBe("Bắt đầu")
    expect(all.ownerHint).toBe("Tất cả đã sẵn sàng.")

    const alone = roomReadiness(room([member("a", true, true, true)]))
    expect(alone.summary).toBe("1/4 người · 0/0 sẵn sàng")
    expect(alone.ownerHint).toBe("Chỉ có bạn: ván chơi một mình, không cược.")
  })

  it("người chơi: ba dòng gợi ý theo trạng thái", () => {
    expect(roomReadiness(room([member("a", true, true), member("b", false, false, true)])).playerHint).toBe(
      "Bấm Sẵn sàng để chủ phòng bắt đầu được.",
    )
    expect(
      roomReadiness(room([member("a", true, true), member("b", false, true, true), member("c", false, false), member("d", false, false)])).playerHint,
    ).toBe("Chờ 2 người khác sẵn sàng, rồi chủ phòng bắt đầu.")
    expect(roomReadiness(room([member("a", true, true), member("b", false, true, true)])).playerHint).toBe(
      "Chờ chủ phòng bắt đầu.",
    )
  })

  it("thẻ người chưa sẵn sàng có nhãn đỏ, người mới vào làm nút Bắt đầu khoá lại", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ room: { status: "waiting", owner: ME, members: [ME, MINH], ready: [MINH.user_id] } })
    renderGame()
    await screen.findByTestId("flashback-room-id")
    const start = () => screen.getByRole("button", { name: /^Bắt đầu/ })
    expect(start().hasAttribute("disabled")).toBe(false)
    expect(screen.queryByTestId("flashback-unready-badge")).toBeNull()

    backend.addMember(HOA)
    await pollOnce()
    await waitFor(() => expect(start().textContent).toBe("Bắt đầu (chờ 1 người)"))
    expect(start().hasAttribute("disabled")).toBe(true)
    expect(screen.getByTestId("flashback-unready-badge").textContent).toBe("Chưa sẵn sàng")
  })
})
