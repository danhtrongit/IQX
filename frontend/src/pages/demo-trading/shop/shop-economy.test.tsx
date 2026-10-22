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
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

describe("Shop: tiến hoá linh thú", () => {
  it("shows the price of the next level and sends the confirmed price to the server", async () => {
    const user = userEvent.setup()
    setup({ balance: 50_000, owned: ["bach_ho", "thanh_long"], active: "bach_ho" })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(screen.getByRole("tab", { name: "Đã sở hữu" }))

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
    await user.click(screen.getByRole("tab", { name: "Đã sở hữu" }))

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
    await user.click(screen.getByRole("tab", { name: "Đã sở hữu" }))
    expect(within(card("thanh_long")).queryByRole("button", { name: /Tiến hoá/ })).toBeNull()
    expect(within(card("thanh_long")).getByText("Cấp 3")).toBeTruthy()
  })
})

describe("Shop: Premium mua bằng xu", () => {
  it("spends 3.000 xu and reports the granted days", async () => {
    const user = userEvent.setup()
    setup({ balance: 10_000 })
    await screen.findByRole("heading", { name: "Linh thú" })

    await user.click(screen.getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Giá Premium").nextElementSibling?.textContent).toBe("3.000 xu")
    expect(within(dialog).getByText("Thời hạn").nextElementSibling?.textContent).toBe("30 ngày")

    await user.click(within(dialog).getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    await waitFor(() => expect(posts("/shop/premium-purchases")).toHaveLength(1))
    const body = posts("/shop/premium-purchases")[0].body as { expected_price_xu: number; idempotency_key: string }
    expect(body.expected_price_xu).toBe(3_000)
    expect(body.idempotency_key).toMatch(/^[A-Za-z0-9._:-]+$/)
    expect(backend.state.balance).toBe(7_000)
    expect(await screen.findByText(/Đã cộng 30 ngày Premium/)).toBeTruthy()
  })

  it("refuses to spend xu the account does not have and says how much is missing", async () => {
    const user = userEvent.setup()
    setup({ balance: 100 })
    await screen.findByRole("heading", { name: "Linh thú" })

    await user.click(screen.getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Chưa đủ xu: bạn có 100 xu, cần 3.000 xu.")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Mua Premium · 3.000 xu" }).hasAttribute("disabled")).toBe(true)
    expect(posts("/shop/premium-purchases")).toHaveLength(0)
    expect(backend.state.balance).toBe(100)
  })

  it("explains the server refusals in Vietnamese", async () => {
    const user = userEvent.setup()
    setup({ balance: 10_000 }, (server) => {
      server.intercept(
        (call) => call.path === "/shop/premium-purchases",
        () => { throw apiError(403, "PHONE_NOT_VERIFIED", "Tài khoản chưa xác thực số điện thoại") },
      )
    })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(screen.getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    expect(
      await within(dialog).findByText("Tài khoản chưa xác thực số điện thoại nên chưa đổi Premium bằng xu được."),
    ).toBeTruthy()
    expect(backend.state.balance).toBe(10_000)
  })

  it("names the 30-day limit when the account already changed Premium recently", async () => {
    const user = userEvent.setup()
    setup({ balance: 10_000 }, (server) => {
      server.intercept(
        (call) => call.path === "/shop/premium-purchases",
        () => { throw apiError(409, "PREMIUM_PURCHASE_LIMIT", "Chỉ đổi Premium bằng xu một lần mỗi 30 ngày") },
      )
    })
    await screen.findByRole("heading", { name: "Linh thú" })
    await user.click(screen.getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Mua Premium · 3.000 xu" }))
    expect(await within(dialog).findByText("Chỉ đổi Premium bằng xu một lần mỗi 30 ngày")).toBeTruthy()
  })
})

describe("Shop: đổi xu với tiền Demo", () => {
  it("shows the rate and exchanges xu to Demo cash with an idempotency key", async () => {
    const user = userEvent.setup()
    setup({ balance: 5_000 })
    await screen.findByRole("heading", { name: "Linh thú" })

    await user.click(screen.getByRole("button", { name: "Đổi xu" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByTestId("exchange-rate").textContent).toContain("1 xu = 10.000 đồng")

    await user.type(within(dialog).getByLabelText("Số xu muốn đổi ra tiền"), "100")
    await user.click(within(dialog).getByRole("button", { name: "Đổi · 100 xu" }))

    await waitFor(() => expect(posts("/shop/demo-exchange")).toHaveLength(1))
    const body = posts("/shop/demo-exchange")[0].body as { direction: string; amount: number; idempotency_key: string }
    expect(body.direction).toBe("xu_to_cash")
    expect(body.amount).toBe(100)
    expect(body.idempotency_key).toMatch(/^[A-Za-z0-9._:-]+$/)
    expect(backend.state.balance).toBe(4_900)
  })

  it("exchanges Demo cash to xu and refuses an amount that is not a multiple of the rate", async () => {
    const user = userEvent.setup()
    setup({ balance: 0, demoCash: 50_000_000 })
    await screen.findByRole("heading", { name: "Linh thú" })

    await user.click(screen.getByRole("button", { name: "Đổi xu" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("tab", { name: "Tiền Demo → xu" }))

    await user.type(within(dialog).getByLabelText("Số tiền Demo muốn đổi thành xu"), "15000")
    expect(within(dialog).getByText("Số tiền đổi phải là bội số của 10.000 đồng.")).toBeTruthy()

    await user.clear(within(dialog).getByLabelText("Số tiền Demo muốn đổi thành xu"))
    await user.type(within(dialog).getByLabelText("Số tiền Demo muốn đổi thành xu"), "20000")
    await user.click(within(dialog).getByRole("button", { name: /Đổi · 20.000/ }))

    await waitFor(() => expect(posts("/shop/demo-exchange")).toHaveLength(1))
    const body = posts("/shop/demo-exchange")[0].body as { direction: string; amount: number }
    expect(body.direction).toBe("cash_to_xu")
    expect(body.amount).toBe(20_000)
    expect(backend.state.balance).toBe(2)
  })
})
