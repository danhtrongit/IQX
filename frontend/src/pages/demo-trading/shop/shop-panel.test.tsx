import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ShopPanel } from "./shop-panel"
import { apiError, createShopBackend, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("../journey/mascot-2d/Mascot2DStage", () => ({
  Mascot2DStage: ({ mascotId }: { mascotId: string }) => <div data-testid="mascot-2d" data-mascot={mascotId} />,
}))

let backend: ShopBackend
const onNavigate = vi.fn()

function setup(options: BackendOptions = {}, before?: (server: ShopBackend) => void) {
  backend = createShopBackend(options)
  before?.(backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderWithProviders(<ShopPanel onNavigate={onNavigate} />)
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  onNavigate.mockReset()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

describe("Shop panel", () => {
  it("lists its sections in the approved order", async () => {
    setup({ balance: 500, lessons: 5 })
    await screen.findByTestId("shop-balance")
    await screen.findByText("5 bài đã hoàn thành")
    const text = document.querySelector("aside, section")?.parentElement?.textContent ?? document.body.textContent ?? ""
    const order = ["Xu của bạn", "500", "5 bài đã hoàn thành", "Lịch sử xu", "Đang sử dụng", "Đã sở hữu", "Vào Học viện"].map((label) => text.indexOf(label))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("takes the completed-lesson count from the Học viện progress, not from the coin balance", async () => {
    setup({ balance: 1_000, lessons: 3 })
    await waitFor(() => expect(screen.getByTestId("shop-lessons-done").textContent).toBe("3 bài đã hoàn thành"))
    expect(screen.getByTestId("shop-balance").textContent).toBe("1.000")
  })

  it("shows the active mascot with the live renderer and the owned list with one switch button per other mascot", async () => {
    setup({ owned: ["bach_ho", "thanh_long"], active: "thanh_long" })
    const active = await screen.findByTestId("shop-active")
    expect(within(active).getByTestId("shop-active-name").textContent).toBe("Thanh Long")
    expect(within(active).getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("thanh_long")
    expect(within(active).getByText("Đang sử dụng")).toBeTruthy()

    const rows = within(screen.getByTestId("shop-owned-list")).getAllByRole("listitem")
    expect(rows.map((row) => row.getAttribute("data-shop-owned"))).toEqual(["bach_ho", "thanh_long"])
    expect(within(rows[0]).getByRole("button", { name: "Sử dụng Bạch Hổ" })).toBeTruthy()
    expect(within(rows[1]).queryByRole("button")).toBeNull()
    expect(within(rows[1]).getByText("Đang dùng")).toBeTruthy()
    expect(screen.getByText("2 / 5")).toBeTruthy()
  })

  it("switches from the owned list through the same flow as the cards", async () => {
    const user = userEvent.setup()
    setup({ owned: ["bach_ho", "thanh_long"], active: "bach_ho" })
    await user.click(await screen.findByRole("button", { name: "Sử dụng Thanh Long" }))
    await waitFor(() => expect(within(screen.getByTestId("shop-active")).getByTestId("shop-active-name").textContent).toBe("Thanh Long"))
    expect(backend.callsTo("PUT", "/shop/active-mascot")[0].body).toEqual({ mascot_id: "thanh_long", expected_revision: 1 })
  })

  it("Vào Học viện only navigates; Xem trong Bot opens the Bot tool; neither writes anything", async () => {
    const user = userEvent.setup()
    setup({ balance: 300, lessons: 3 })
    await screen.findByTestId("shop-balance")
    await user.click(screen.getByRole("button", { name: /Vào Học viện/ }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith("academy")
    await user.click(screen.getByRole("button", { name: /Xem trong Bot/ }))
    expect(onNavigate).toHaveBeenLastCalledWith("bot")
    expect(backend.calls.filter((call) => call.method !== "GET")).toEqual([])
    expect(backend.state.balance).toBe(300)
  })

  it("opens the coin history from the wallet card", async () => {
    const user = userEvent.setup()
    setup({ balance: 100, lessons: 1, ledger: [{ id: "a", seq: 1, kind: "lesson_first_completion", delta: 100, balance_after: 100, created_at: "2026-10-08T02:00:00.000Z", label: { lesson_key: null, lesson_id: "ch01-l01", mascot_id: null, mascot_name: null } }] })
    await screen.findByTestId("shop-balance")
    await user.click(screen.getByRole("button", { name: /Lịch sử xu/ }))
    const dialog = await screen.findByRole("dialog", { name: "Lịch sử xu" })
    expect(await within(dialog).findByText("Hoàn thành bài RSI")).toBeTruthy()
  })

  it("closes the history with Escape and puts keyboard focus back on the button that opened it", async () => {
    const user = userEvent.setup()
    setup({ balance: 100, lessons: 1 })
    await screen.findByTestId("shop-balance")
    const opener = screen.getByRole("button", { name: /Lịch sử xu/ })
    opener.focus()
    await user.keyboard("{Enter}")
    await screen.findByRole("dialog", { name: "Lịch sử xu" })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it("when the Shop read fails every shop region says so and none shows 0 xu or an owned list", async () => {
    const user = userEvent.setup()
    setup({ balance: 900 }, (server) => {
      server.intercept((call) => call.path === "/shop", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    })
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3))
    expect(screen.queryByTestId("shop-balance")).toBeNull()
    expect(screen.queryByTestId("shop-owned-list")).toBeNull()
    expect(screen.queryByTestId("shop-active")).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b0 xu|\b0\b.*xu/)

    await user.click(within(screen.getAllByRole("alert")[0]).getByRole("button", { name: "Thử lại" }))
    expect((await screen.findByTestId("shop-balance")).textContent).toBe("900")
  })

  it("a failed progress read does not hide the balance and is not shown as 0 lessons", async () => {
    const user = userEvent.setup()
    setup({ balance: 400, lessons: 4 }, (server) => {
      server.intercept((call) => call.path === "/academy/progress", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    })
    expect((await screen.findByTestId("shop-balance")).textContent).toBe("400")
    const done = await screen.findByTestId("shop-lessons-done")
    await waitFor(() => expect(done.textContent).toContain("Chưa tải được số bài"))
    expect(done.textContent).not.toContain("0 bài")
    await user.click(within(done).getByRole("button"))
    await waitFor(() => expect(screen.getByTestId("shop-lessons-done").textContent).toBe("4 bài đã hoàn thành"))
  })
})
