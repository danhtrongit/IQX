import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ShopMain } from "./shop-main"
import { ShopPanel } from "./shop-panel"
import { createShopBackend, mascotTab, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("@/hooks/use-trading", () => ({
  useTradingAccount: () => ({ data: { cash_available_vnd: 50_000_000 } }),
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: ShopBackend

function setup(options: BackendOptions = {}, before?: (server: ShopBackend) => void) {
  backend = createShopBackend(options)
  before?.(backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-shop-card="${id}"]`) as HTMLElement
const posts = (prefix: string) => backend.callsTo("POST", prefix)

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

afterEach(() => vi.unstubAllGlobals())

describe("Shop: tiến hoá linh thú", () => {
  it("shows the price of the next level and sends the confirmed price to the server", async () => {
    const user = userEvent.setup()
    setup({ balance: 50_000, owned: ["bach_ho", "thanh_long"], active: "bach_ho" })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(mascotTab("Đã sở hữu"))

    const evolve = within(card("thanh_long")).getByRole("button", { name: "Tiến hoá · 10.000 xu" })
    await user.click(evolve)

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Giá tiến hoá").nextElementSibling?.textContent).toBe("10.000 xu")
    expect(within(dialog).getByText("Tổng chi phí lên cấp 3").nextElementSibling?.textContent).toBe("40.000 xu")
    expect(within(dialog).getByText("Cấp hiện tại").nextElementSibling?.textContent).toBe("Cấp 1")
    expect(within(dialog).getByText("Cấp mới").nextElementSibling?.textContent).toBe("Cấp 2")
    expect(backend.state.balance).toBe(50_000)

    await user.click(within(dialog).getByRole("button", { name: "Tiến hoá · 10.000 xu" }))

    await waitFor(() => expect(posts("/shop/pets/")).toHaveLength(1))
    const body = posts("/shop/pets/")[0].body as { target_level: number; expected_price_xu: number; idempotency_key: string }
    expect(posts("/shop/pets/")[0].path).toBe("/shop/pets/thanh_long/evolve")
    expect(body.target_level).toBe(2)
    expect(body.expected_price_xu).toBe(10_000)
    expect(body.idempotency_key).toMatch(/^[A-Za-z0-9._:-]+$/)
    expect(backend.state.balance).toBe(40_000)
    await waitFor(() => expect(within(card("thanh_long")).getByText("Cấp 2")).toBeTruthy())
  })

  it("a mascot already on level 2 offers the level 3 step at 30.000 xu", async () => {
    const user = userEvent.setup()
    setup({ balance: 90_000, owned: ["bach_ho", "thanh_long"], active: "bach_ho", petLevels: { thanh_long: 2 } })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(mascotTab("Đã sở hữu"))

    await user.click(within(card("thanh_long")).getByRole("button", { name: "Tiến hoá · 30.000 xu" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Giá tiến hoá").nextElementSibling?.textContent).toBe("30.000 xu")

    await user.click(within(dialog).getByRole("button", { name: "Tiến hoá · 30.000 xu" }))
    await waitFor(() => expect(posts("/shop/pets/")).toHaveLength(1))
    expect((posts("/shop/pets/")[0].body as { target_level: number }).target_level).toBe(3)
    expect(backend.state.balance).toBe(60_000)
  })

  it("a mascot on the highest level offers no further step", async () => {
    const user = userEvent.setup()
    setup({ balance: 90_000, owned: ["bach_ho", "thanh_long"], active: "bach_ho", petLevels: { thanh_long: 3 } })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(mascotTab("Đã sở hữu"))
    expect(within(card("thanh_long")).queryByRole("button", { name: /Tiến hoá/ })).toBeNull()
    expect(within(card("thanh_long")).getByText("Cấp 3")).toBeTruthy()
  })
})


describe("Shop without Premium for xu and without the xu ↔ Demo cash exchange (layout v1.3 §7, §8)", () => {
  it("the main view offers only Linh thú and Thẻ nến", async () => {
    setup({ balance: 50_000 })
    await screen.findByRole("heading", { name: "Linh thú" })
    expect(screen.queryByRole("button", { name: /Premium|Đổi xu/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Premium|Đổi xu|tiền Demo/)
    expect(posts("/shop/premium-purchases")).toHaveLength(0)
    expect(posts("/shop/demo-exchange")).toHaveLength(0)
  })

  it("the panel has no Premium block and no exchange link", async () => {
    backend = createShopBackend({ balance: 50_000 })
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
    renderWithProviders(<ShopPanel onNavigate={vi.fn()} />)
    expect((await screen.findByTestId("shop-balance")).textContent).toBe("50.000")
    expect(screen.queryByRole("region", { name: "Premium" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Premium|Đổi xu/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Premium|Đổi xu|tiền Demo/)
  })

  it("still reads a Shop state without the retired Premium and exchange fields", async () => {
    setup({ balance: 50_000 }, (server) => {
      server.intercept((call) => call.path === "/shop" && call.method === "GET", async () => {
        const state = { ...(await server.handle("/shop")) as Record<string, unknown> }
        for (const key of ["premium_price_xu", "premium_duration_days", "exchange"]) delete state[key]
        return state
      })
    })
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
  })
})
