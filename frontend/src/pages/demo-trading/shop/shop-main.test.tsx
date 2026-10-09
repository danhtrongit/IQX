import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ShopMain } from "./shop-main"
import { apiError, createShopBackend, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: ShopBackend

function setup(options: BackendOptions = {}) {
  backend = createShopBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-shop-card="${id}"]`) as HTMLElement

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

describe("Shop main: collection", () => {
  it("shows the title, the owned count, both tabs and the four mascots for sale", async () => {
    setup({ balance: 500 })
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
    expect(screen.getByTestId("shop-owned-count").textContent).toBe("1 / 5 đã sở hữu")
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Cửa hàng", "Đã sở hữu"])
    expect(tabs[0].getAttribute("aria-selected")).toBe("true")
    expect(Array.from(document.querySelectorAll("[data-shop-card]")).map((node) => node.getAttribute("data-shop-card"))).toEqual(["thanh_long", "loc_huou", "phung_hoang", "kim_quy"])
  })

  it("draws every card from the renderer's own poster, never a new artwork", async () => {
    setup()
    await screen.findByRole("heading", { name: "Linh thú" })
    const sources = Array.from(document.querySelectorAll<HTMLImageElement>("[data-shop-card] img")).map((img) => img.getAttribute("src"))
    expect(sources).toEqual([
      "/assets/mascots-2d/v2/thanh-long/poster.webp?v=2.0.1",
      "/assets/mascots-2d/v2/loc-huou/poster.webp?v=2.0.1",
      "/assets/mascots-2d/v2/phung-hoang/poster.webp?v=2.0.1",
      "/assets/mascots-2d/v2/kim-quy/poster.webp?v=2.0.1",
    ])
  })

  it.each([
    [499, "Chưa đủ xu", true],
    [500, "Mua", false],
    [501, "Mua", false],
    [0, "Chưa đủ xu", true],
  ])("with %i xu an unowned mascot offers %s (locked: %s) and its price", async (balance, label, locked) => {
    setup({ balance })
    await screen.findByRole("heading", { name: "Linh thú" })
    for (const id of ["thanh_long", "loc_huou", "phung_hoang", "kim_quy"]) {
      const button = within(card(id)).getByRole("button")
      expect(button.textContent).toBe(label)
      expect((button as HTMLButtonElement).disabled).toBe(locked)
      expect(card(id).textContent).toContain("500 xu")
      expect(card(id).getAttribute("data-card-state")).toBe(locked ? "short" : "buy")
    }
  })

  it("a locked card never opens the purchase dialog", async () => {
    const user = userEvent.setup()
    setup({ balance: 499 })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(within(card("thanh_long")).getByRole("button"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(backend.callsTo("POST", "/shop/purchases")).toHaveLength(0)
  })

  it("an owned mascot shows Đã sở hữu with Sử dụng, the selected one shows Đang sử dụng and offers no purchase", async () => {
    setup({ balance: 0, owned: ["bach_ho", "thanh_long", "kim_quy"], active: "kim_quy" })
    await screen.findByRole("heading", { name: "Linh thú" })
    expect(screen.getByTestId("shop-owned-count").textContent).toBe("3 / 5 đã sở hữu")

    const owned = card("thanh_long")
    expect(owned.getAttribute("data-card-state")).toBe("owned")
    expect(within(owned).getByRole("button").textContent).toBe("Sử dụng")
    expect(owned.textContent).toContain("Đã sở hữu")
    expect(owned.textContent).not.toContain("500 xu")

    const wearing = card("kim_quy")
    expect(wearing.getAttribute("data-card-state")).toBe("active")
    const button = within(wearing).getByRole("button") as HTMLButtonElement
    expect(button.textContent).toBe("Đang sử dụng")
    expect(button.disabled).toBe(true)
    expect(wearing.textContent).not.toMatch(/Mua|500 xu/)

    expect(card("loc_huou").getAttribute("data-card-state")).toBe("short")
  })

  it("the Đã sở hữu tab lists Bạch Hổ as the default mascot, without a price, and the owned ones", async () => {
    const user = userEvent.setup()
    setup({ balance: 100, owned: ["bach_ho", "thanh_long"], active: "bach_ho" })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(screen.getByRole("tab", { name: "Đã sở hữu" }))

    expect(Array.from(document.querySelectorAll("[data-shop-card]")).map((node) => node.getAttribute("data-shop-card"))).toEqual(["bach_ho", "thanh_long"])
    const bachHo = card("bach_ho")
    expect(bachHo.textContent).toContain("Linh thú mặc định")
    expect(bachHo.textContent).not.toMatch(/xu/)
    expect(within(bachHo).getByRole("button").textContent).toBe("Đang sử dụng")
    expect(within(card("thanh_long")).getByRole("button").textContent).toBe("Sử dụng")
  })

  it("Bạch Hổ offers Sử dụng when another mascot is selected, never a purchase", async () => {
    const user = userEvent.setup()
    setup({ owned: ["bach_ho", "loc_huou"], active: "loc_huou" })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(screen.getByRole("tab", { name: "Đã sở hữu" }))
    expect(within(card("bach_ho")).getByRole("button").textContent).toBe("Sử dụng")
    expect(card("bach_ho").textContent).toContain("Linh thú mặc định")
  })

  it("carries no stats, rarity or trading advantage", async () => {
    setup({ balance: 500 })
    await screen.findByRole("heading", { name: "Linh thú" })
    expect(document.querySelector("[data-testid=shop-main]")?.textContent).not.toMatch(/hiếm|tỷ lệ thắng|công\/thủ|lợi nhuận|sức mạnh|cấp độ/i)
  })

  it("keeps a balance and a history entry point inside the main view for when the panel is closed", async () => {
    const user = userEvent.setup()
    setup({ balance: 1_250, lessons: 2, ledger: [{ id: "a", seq: 1, kind: "lesson_first_completion", delta: 100, balance_after: 100, created_at: "2026-10-08T02:00:00.000Z", label: { lesson_key: null, lesson_id: "ch01-l01", mascot_id: null, mascot_name: null } }] })
    const strip = await screen.findByTestId("shop-mobile-wallet")
    expect(strip.textContent).toContain("1.250 xu")
    await user.click(within(strip).getByRole("button", { name: "Lịch sử xu" }))
    expect(await screen.findByRole("dialog", { name: "Lịch sử xu" })).toBeTruthy()
  })
})

describe("Shop main: loading and errors are shown per region, never as 0 xu or not owned", () => {
  it("shows a loading skeleton, not a balance, until the server answered", async () => {
    let release: (() => void) | undefined
    backend = createShopBackend()
    mocks.api.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/shop") return new Promise((resolve) => { release = () => resolve(backend.handle(path, init)) })
      return backend.handle(path, init)
    })
    renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
    expect(screen.getByTestId("shop-main-loading")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/0 xu|Mua|Sử dụng/)
    await waitFor(() => expect(release).toBeDefined())
    release?.()
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
  })

  it("on a failed read shows an alert with retry and no 0 xu, no cards, no owned count", async () => {
    const user = userEvent.setup()
    backend = createShopBackend({ balance: 800 })
    backend.intercept((call) => call.path === "/shop", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "Dịch vụ tạm thời không khả dụng") })
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
    renderWithProviders(<ShopMain onNavigate={vi.fn()} />)

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chưa tải được dữ liệu Shop")
    expect(document.body.textContent).not.toMatch(/\b0 xu|đã sở hữu|Mua/)
    expect(document.querySelector("[data-shop-card]")).toBeNull()

    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
    expect(screen.getByTestId("shop-mobile-wallet").textContent).toContain("800 xu")
  })

  it("treats an empty or malformed payload as an error instead of an empty wallet", async () => {
    backend = createShopBackend()
    backend.intercept((call) => call.path === "/shop", () => ({}))
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
    renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
    expect((await screen.findByRole("alert")).textContent).toContain("Chưa tải được dữ liệu Shop")
    expect(document.body.textContent).not.toMatch(/\b0 xu/)
  })

  it("keeps the last confirmed data and says so when a refresh fails", async () => {
    const user = userEvent.setup()
    const view = setup({ balance: 500 })
    await screen.findByRole("heading", { name: "Linh thú" })
    backend.intercept((call) => call.path === "/shop", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    await view.client.refetchQueries({ queryKey: ["shop", "state"] }).catch(() => undefined)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Đang hiển thị dữ liệu đã xác nhận gần nhất")
    expect(card("thanh_long")).toBeTruthy()
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })
})
