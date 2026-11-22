import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "@/pages/demo-trading/bot/test-render"
import { callsTo, createFakeApi, createWorld, type World } from "@/pages/demo-trading/bot/test-support"
import type { NotificationItem } from "@/pages/notifications/api"

import { NotificationBell } from "./notification-bell"

const mocks = vi.hoisted(() => ({ api: vi.fn(), auth: { isAuthenticated: true } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.auth.isAuthenticated ? { id: "user-1" } : null, isAuthenticated: mocks.auth.isAuthenticated, isLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("@/pages/demo-trading/bot/test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})

const item = (partial: Partial<NotificationItem> & Pick<NotificationItem, "id" | "type">): NotificationItem => ({
  trade_date: "2026-11-06",
  title: partial.type === "bot_trades" ? "Bot giao dịch · phiên 06/11" : "Bản tin cuối phiên 06/11",
  body: partial.type === "bot_trades" ? "Mua HPG, FPT · Bán VNM (hết thời gian giữ)" : "VN-Index 1.755,61 (−0,63%) · 14 mã trong 3 bộ lọc",
  link: partial.type === "bot_trades" ? "/luyen-tap?tool=bot&bot_tab=lich-su" : "/thi-truong?bt=ban-tin&date=2026-11-06",
  read_at: null,
  created_at: "2026-11-06T12:30:00Z",
  ...partial,
})

let world: World

beforeEach(() => {
  mocks.auth.isAuthenticated = true
  world = createWorld({
    notifications: [
      item({ id: "00000000-0000-4000-8000-000000000001", type: "bot_trades" }),
      item({ id: "00000000-0000-4000-8000-000000000002", type: "bulletin" }),
      item({ id: "00000000-0000-4000-8000-000000000003", type: "bulletin", trade_date: "2026-11-05", title: "Bản tin cuối phiên 05/11", read_at: "2026-11-05T13:00:00Z" }),
    ],
  })
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

describe("Header bell (v2.0 §8.3)", () => {
  it("is not shown to a guest", () => {
    mocks.auth.isAuthenticated = false
    renderBot(<NotificationBell />)
    expect(screen.queryByTestId("notification-bell")).toBeNull()
  })

  it("shows the unread count and hides it at 0", async () => {
    renderBot(<NotificationBell />)
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("2")
    expect(screen.getByRole("button", { name: "Thông báo, 2 chưa đọc" })).toBeTruthy()
    expect(callsTo(world, "GET", "/me/notifications/unread-count")).toHaveLength(1)
  })

  it("lists the newest 50 with title, one line and the unread dot; a click marks it read and opens Bot › Lịch sử (T09)", async () => {
    const user = userEvent.setup()
    renderBot(<NotificationBell />, "/chien-luoc")
    await user.click(await screen.findByTestId("notification-bell"))
    const list = await screen.findByRole("list", { name: "Danh sách thông báo" })
    expect(callsTo(world, "GET", "/me/notifications")[0]!.query).toBe("?limit=50")
    const entries = within(list).getAllByRole("button")
    expect(entries).toHaveLength(3)
    expect(entries[0]!.textContent).toContain("Bot giao dịch · phiên 06/11")
    expect(entries[0]!.textContent).toContain("Mua HPG, FPT · Bán VNM (hết thời gian giữ)")
    expect(within(entries[0]!).getByLabelText("Chưa đọc")).toBeTruthy()
    expect(within(entries[2]!).queryByLabelText("Chưa đọc")).toBeNull()

    await user.click(entries[0]!)
    await waitFor(() => expect(callsTo(world, "POST", "/me/notifications/read")).toHaveLength(1))
    expect(callsTo(world, "POST", "/me/notifications/read")[0]!.body).toEqual({ id: "00000000-0000-4000-8000-000000000001" })
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=bot&bot_tab=lich-su")
    await waitFor(() => expect(screen.getByTestId("notification-badge").textContent).toBe("1"))
  })

  it("a bulletin opens its link; Đánh dấu đã đọc marks all and hides the count", async () => {
    const user = userEvent.setup()
    renderBot(<NotificationBell />)
    await user.click(await screen.findByTestId("notification-bell"))
    await user.click(await screen.findByRole("button", { name: "Đánh dấu đã đọc" }))
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull())
    expect(callsTo(world, "POST", "/me/notifications/read")[0]!.body).toEqual({ all: true })
    const list = screen.getByRole("list", { name: "Danh sách thông báo" })
    await user.click(within(list).getAllByRole("button")[1]!)
    expect(screen.getByTestId("location").textContent).toBe("/thi-truong?bt=ban-tin&date=2026-11-06")
    expect(callsTo(world, "POST", "/me/notifications/read")).toHaveLength(1)
  })

  it("Cài đặt thông báo opens the Bot panel on the THÔNG BÁO card (T10)", async () => {
    const user = userEvent.setup()
    renderBot(<NotificationBell />, "/chien-luoc")
    await user.click(await screen.findByTestId("notification-bell"))
    await user.click(await screen.findByRole("button", { name: "Cài đặt thông báo" }))
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=bot&focus=thong-bao")
  })

  it("says so when there is nothing", async () => {
    world.notifications = []
    const user = userEvent.setup()
    renderBot(<NotificationBell />)
    await user.click(await screen.findByTestId("notification-bell"))
    expect(await screen.findByText("Chưa có thông báo.")).toBeTruthy()
    expect(screen.queryByTestId("notification-badge")).toBeNull()
  })
})
