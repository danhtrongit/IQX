import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, scheduledFixture, scheduleFixture, type World } from "../test-support"
import { BotPanel } from "./bot-panel"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

let world: World

const norm = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ").trim()

beforeEach(() => {
  world = createWorld()
  world.strategyOptions = {
    iqx: [
      { id: "iqx-1", slug: "xu-huong", name: "Theo xu hướng", version: 2, universe_label: "VN30", max_holding: 30, hidden: false, on_bot: { last: true, next: false } },
      { id: "iqx-2", slug: "dao-chieu", name: "Bắt đảo chiều", version: 1, universe_label: "VN30", max_holding: 30, hidden: false, on_bot: { last: false, next: false } },
      { id: "iqx-3", slug: "an-di", name: "Đã ẩn đang dùng", version: 1, universe_label: "VN30", max_holding: 30, hidden: true, on_bot: { last: false, next: false } },
      { id: "iqx-4", slug: "an", name: "Đã ẩn không dùng", version: 1, universe_label: "VN30", max_holding: 30, hidden: true, on_bot: { last: false, next: false } },
    ],
    mine: [{ id: "u-1", name: "RSI + SMA20", latest_version: 3, latest_saved_at: "2026-11-08T06:47:00Z", on_bot: { last: false, next: true } }],
  }
  world.strategyOptions.iqx[2]!.on_bot = { last: true, next: false }
  world.schedule = scheduleFixture({
    last: scheduledFixture({ id: "iqx-1", name: "Theo xu hướng", source: "iqx", version: 2, version_label: "v2" }),
    next: { ...scheduledFixture({ id: "u-1", name: "RSI + SMA20" }), session_date: "2026-11-09", follow_latest: true, cutoff_at: null },
  })
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockReset())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

const rowOf = (name: string) => screen.getAllByTestId("strategy-row").find((row) => row.textContent?.includes(name))!

describe("Bot panel (v2.0 §5.4, B01/B02/B08)", () => {
  it("lists CHIẾN LƯỢC IQX and CHIẾN LƯỢC CỦA TÔI with tags, Chi tiết links and Dùng only where allowed; nothing of the old Bot", async () => {
    renderBot(<BotPanel />)
    const iqx = await screen.findByRole("region", { name: "Chiến lược IQX" })
    expect(within(iqx).getAllByTestId("strategy-row")).toHaveLength(3)
    expect(norm(iqx)).toContain("Tham khảo để học, không phải khuyến nghị đầu tư.")
    expect(within(iqx).queryByText("Đã ẩn không dùng")).toBeNull()

    const running = rowOf("Theo xu hướng")
    expect(norm(running)).toContain("IQX")
    expect(norm(running)).toContain("Đang chạy")
    expect(within(running).getByRole("link", { name: "Chi tiết Theo xu hướng" }).getAttribute("href")).toBe("/chien-luoc?tab=backtest&mode=iqx&iqx=iqx-1")
    expect(within(running).getByRole("button", { name: "Dùng Theo xu hướng" })).toBeTruthy()

    const hidden = rowOf("Đã ẩn đang dùng")
    expect(norm(hidden)).toContain("IQX đã ngừng cung cấp")
    expect(within(hidden).queryByRole("button", { name: /Dùng/ })).toBeNull()

    const mine = rowOf("RSI + SMA20")
    expect(norm(mine)).toContain("Từ phiên Thứ 2 09/11")
    expect(within(mine).queryByRole("button", { name: /Dùng/ })).toBeNull()
    expect(within(mine).getByRole("link", { name: "Chi tiết RSI + SMA20" }).getAttribute("href")).toBe("/chien-luoc?tab=backtest&mode=chi-bao&strategy=u-1")
    expect(screen.getByRole("link", { name: "Tạo chiến lược trong Backtest" }).getAttribute("href")).toBe("/chien-luoc?tab=backtest&mode=chi-bao&strategy=new")

    for (const gone of ["Danh mục mua mới", "Giới hạn nắm giữ", "Luyện tập", "Cấu hình", "Tìm chỉ báo"]) expect(screen.queryByText(new RegExp(gone, "i"))).toBeNull()
  })

  it("Dùng asks «Đổi chiến lược của Bot?», then PUTs the next session with the race guard and toasts (B02)", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    await user.click(await screen.findByRole("button", { name: "Dùng Bắt đảo chiều" }))
    const dialog = await screen.findByRole("dialog", { name: "Đổi chiến lược của Bot?" })
    expect(norm(dialog)).toContain("Từ phiên Thứ 2 09/11, Bot dùng Chiến lược IQX · Bắt đảo chiều.")
    expect(norm(dialog)).toContain("Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.")
    const confirm = within(dialog).getByRole("button", { name: "Dùng cho Bot" })
    await waitFor(() => expect(confirm).toHaveProperty("disabled", false))
    expect(callsTo(world, "GET", "/bot/schedule/next/impact")[0]?.query).toBe("?source=iqx&id=iqx-2&version=1")
    await user.click(confirm)
    await waitFor(() => expect(callsTo(world, "PUT", "/bot/schedule/next")).toHaveLength(1))
    expect(callsTo(world, "PUT", "/bot/schedule/next")[0]!.body).toEqual({ source: "iqx", id: "iqx-2", version: 1, expected_next_session: "2026-11-09" })
    expect(mocks.toast.success).toHaveBeenCalledWith("Bot dùng Chiến lược IQX · Bắt đảo chiều từ phiên Thứ 2 09/11.")
    await waitFor(() => expect(within(rowOf("Bắt đảo chiều")).queryByRole("button", { name: /Dùng/ })).toBeNull())
  })

  it("Hủy and Escape write nothing (V02)", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    const use = await screen.findByRole("button", { name: "Dùng Bắt đảo chiều" })
    await user.click(use)
    await screen.findByRole("dialog", { name: "Đổi chiến lược của Bot?" })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(callsTo(world, "PUT", "/bot/schedule/next")).toHaveLength(0)
  })
})

describe("THÔNG BÁO card (v2.0 §8.2, T08)", () => {
  it("defaults: master on, both types on, Trên web always on, Email off", async () => {
    renderBot(<BotPanel />)
    const card = await screen.findByRole("region", { name: "Thông báo" })
    await waitFor(() => expect(within(card).getByRole("switch", { name: "Bật thông báo" }).getAttribute("aria-checked")).toBe("true"))
    expect(within(card).getByRole("switch", { name: "Bản tin cuối phiên" }).getAttribute("aria-checked")).toBe("true")
    expect(within(card).getByRole("switch", { name: "Bot giao dịch" }).getAttribute("aria-checked")).toBe("true")
    expect(within(card).getByRole("button", { name: "Trên web" })).toHaveProperty("disabled", true)
    expect(within(card).getByRole("button", { name: "Email" }).getAttribute("aria-pressed")).toBe("false")
  })

  it("turning both types off turns the master off; turning the master on again turns both on", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    const card = await screen.findByRole("region", { name: "Thông báo" })
    await user.click(await within(card).findByRole("switch", { name: "Bản tin cuối phiên" }))
    await waitFor(() => expect(callsTo(world, "PUT", "/me/notification-settings")).toHaveLength(1))
    await user.click(within(card).getByRole("switch", { name: "Bot giao dịch" }))
    await waitFor(() => expect(callsTo(world, "PUT", "/me/notification-settings")).toHaveLength(2))
    expect(callsTo(world, "PUT", "/me/notification-settings")[1]!.body).toEqual({ enabled: false, types: { bulletin: false, bot_trades: false }, channels: { email: false } })
    await waitFor(() => expect(within(card).getByRole("switch", { name: "Bản tin cuối phiên" })).toHaveProperty("disabled", true))
    await user.click(within(card).getByRole("switch", { name: "Bật thông báo" }))
    await waitFor(() => expect(callsTo(world, "PUT", "/me/notification-settings")).toHaveLength(3))
    expect(callsTo(world, "PUT", "/me/notification-settings")[2]!.body).toEqual({ enabled: true, types: { bulletin: true, bot_trades: true }, channels: { email: false } })
  })

  it("without a verified email, Email is locked with «Chưa có email» (T08)", async () => {
    world.notificationSettings = { ...world.notificationSettings, email_available: false }
    renderBot(<BotPanel />)
    const card = await screen.findByRole("region", { name: "Thông báo" })
    await waitFor(() => expect(within(card).getByRole("button", { name: "Email" })).toHaveProperty("disabled", true))
    expect(within(card).getByText("Chưa có email")).toBeTruthy()
  })

  it("`focus=thong-bao` (bell → Cài đặt thông báo) scrolls to the card and drops the parameter (T10)", async () => {
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    renderBot(<BotPanel />, "/luyen-tap?tool=bot&focus=thong-bao")
    await screen.findByRole("region", { name: "Thông báo" })
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("focus"))
    expect(scroll).toHaveBeenCalled()
  })
})
