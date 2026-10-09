import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OrderPanel } from "./order-panel"

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, isPremium: false, openAuth: vi.fn() },
  account: undefined as unknown,
  portfolio: undefined as unknown,
  place: vi.fn(),
  activate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }))
vi.mock("@/hooks/use-trading", () => ({
  useTradingAccount: () => ({ data: mocks.account }),
  useTradingPortfolio: () => ({ data: mocks.portfolio }),
}))
vi.mock("../market/use-quote", () => ({
  useQuote: () => ({
    isLoading: false,
    data: {
      symbol: "VNM", price: 62_000, reference: 61_500, ceiling: 65_800, floor: 57_200, high: 62_500, low: 61_000, volume: 1_234_500,
      bids: [{ price: 61_900, volume: 1200 }], asks: [{ price: 62_000, volume: 900 }],
    },
  }),
}))
vi.mock("../market/symbol-picker", () => ({
  SymbolPicker: ({ symbol }: { symbol: string }) => <button type="button" role="combobox" aria-label="Đổi mã đang xem">{symbol}</button>,
}))
vi.mock("../portfolio/hooks", () => ({
  useWatchlist: () => ({ data: [] }),
  useAddToWatchlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveFromWatchlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("./use-trading-orders", () => ({
  usePlaceOrder: () => ({ mutateAsync: mocks.place, isPending: false }),
  useActivateAccount: () => ({ mutate: mocks.activate, isPending: false }),
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

const account = {
  id: "acc-1", user_id: "u", status: "active", initial_cash_vnd: 100_000_000, cash_available_vnd: 100_000_000,
  cash_reserved_vnd: 0, cash_pending_vnd: 0, total_cash_vnd: 100_000_000, activated_at: "", reset_at: null, created_at: "",
}

function portfolioWith(sellable: number) {
  return {
    account,
    positions: sellable > 0
      ? [{ symbol: "VNM", quantity_total: sellable, quantity_sellable: sellable, quantity_pending: 0, quantity_reserved: 0, avg_cost_vnd: 60_000, current_price_vnd: 62_000, market_value_vnd: 0, unrealized_pnl_vnd: 0, active_plan_buy_order_id: null, active_original_stop_vnd: null, active_original_take_profit_vnd: null, active_dynamic_stop_vnd: null }]
      : [],
    total_market_value_vnd: 0, nav_vnd: 100_000_000, total_unrealized_pnl_vnd: 0, return_pct: 0, refresh_warnings: [],
  }
}

function renderPanel() {
  const onSymbolChange = vi.fn()
  render(<OrderPanel symbol="VNM" onSymbolChange={onSymbolChange} />)
  return { onSymbolChange, user: userEvent.setup() }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  mocks.auth = { isAuthenticated: true, isLoading: false, isPremium: false, openAuth: vi.fn() }
  mocks.account = account
  mocks.portfolio = portfolioWith(0)
  mocks.place.mockReset()
  mocks.place.mockResolvedValue({ quantity: 100, status: "filled", filled_price_vnd: 62_000, limit_price_vnd: null, gross_amount_vnd: 6_200_000 })
  mocks.activate.mockReset()
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
})

describe("OrderPanel (plain manual order form)", () => {
  it("shows symbol, side, type, price, quantity with 25/50/75/100% helpers and a confirm button, and nothing from the journey", () => {
    renderPanel()
    expect(screen.getByRole("heading", { name: "Đặt lệnh" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "MUA", selected: true })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "BÁN" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Đổi mã đang xem" }).textContent).toBe("VNM")
    expect(screen.getByLabelText("Loại lệnh")).toBeTruthy()
    expect(screen.getByLabelText("Giá đặt (đồng)")).toHaveProperty("disabled", true)
    expect(screen.getByLabelText(/Khối lượng/)).toHaveProperty("value", "100")
    const helpers = within(screen.getByRole("group", { name: "Chọn nhanh khối lượng theo tỷ lệ" })).getAllByRole("button")
    expect(helpers.map((button) => button.textContent)).toEqual(["25%", "50%", "75%", "100%"])
    expect(screen.getByRole("button", { name: "ĐẶT LỆNH MUA" })).toHaveProperty("disabled", false)
    expect(screen.getByText("Tiền khả dụng")).toBeTruthy()
    expect(screen.getByText("CP có thể bán")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/kế hoạch|lý do|cắt lỗ|chốt lời|Cấp \d|Thanh tra|Kết sổ|Sân tập|Hành trình/i)
  })

  it("fills the quantity from cash for a buy with the percent helpers", async () => {
    const { user } = renderPanel()
    const quantity = screen.getByLabelText(/Khối lượng/)
    await user.click(screen.getByRole("button", { name: "100%" }))
    expect((quantity as HTMLInputElement).value).toBe("1600")
    await user.click(screen.getByRole("button", { name: "50%" }))
    expect((quantity as HTMLInputElement).value).toBe("800")
    await user.click(screen.getByRole("button", { name: "25%" }))
    expect((quantity as HTMLInputElement).value).toBe("400")
    await user.click(screen.getByRole("button", { name: "75%" }))
    expect((quantity as HTMLInputElement).value).toBe("1200")
    expect(mocks.place).not.toHaveBeenCalled()
  })

  it("places a market buy only when the confirm button is pressed, with a plain order body", async () => {
    const { user } = renderPanel()
    await user.click(screen.getByRole("button", { name: "ĐẶT LỆNH MUA" }))
    await waitFor(() => expect(mocks.place).toHaveBeenCalledTimes(1))
    expect(mocks.place).toHaveBeenCalledWith({ symbol: "VNM", side: "buy", method: "market", quantity: 100, price: 62_000 })
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1))
  })

  it("keeps the quantity guards and does not send an invalid order", async () => {
    const { user } = renderPanel()
    const quantity = screen.getByLabelText(/Khối lượng/)
    await user.clear(quantity)
    await user.type(quantity, "150")
    await user.click(screen.getByRole("button", { name: "ĐẶT LỆNH MUA" }))
    expect(mocks.toast.warning).toHaveBeenCalledWith("Khối lượng phải là bội số của 100")
    await user.clear(quantity)
    await user.type(quantity, "50")
    await user.click(screen.getByRole("button", { name: "ĐẶT LỆNH MUA" }))
    expect(mocks.toast.warning).toHaveBeenLastCalledWith("Khối lượng tối thiểu là 100 CP")
    expect(mocks.place).not.toHaveBeenCalled()
  })

  it("sells from the sellable position and shows server rejections as errors", async () => {
    mocks.portfolio = portfolioWith(300)
    mocks.place.mockRejectedValueOnce(new Error("Giá đã cũ"))
    const { user } = renderPanel()
    await user.click(screen.getByRole("tab", { name: "BÁN" }))
    expect(screen.getByText("Tối đa: 300")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "100%" }))
    expect((screen.getByLabelText(/Khối lượng/) as HTMLInputElement).value).toBe("300")
    await user.click(screen.getByRole("button", { name: "ĐẶT LỆNH BÁN" }))
    await waitFor(() => expect(mocks.place).toHaveBeenCalledWith({ symbol: "VNM", side: "sell", method: "market", quantity: 300, price: 62_000 }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Giá đã cũ"))
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("asks a visitor to sign in and offers no confirm button", async () => {
    mocks.auth = { isAuthenticated: false, isLoading: false, isPremium: false, openAuth: vi.fn() }
    const { user } = renderPanel()
    expect(screen.queryByRole("button", { name: "ĐẶT LỆNH MUA" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))
    expect(mocks.auth.openAuth).toHaveBeenCalledWith("login")
  })

  it("offers to open the account when the workspace has not created it", async () => {
    mocks.account = null
    const { user } = renderPanel()
    expect(screen.getByRole("button", { name: "ĐẶT LỆNH MUA" })).toHaveProperty("disabled", true)
    await user.click(screen.getByRole("button", { name: "Mở tài khoản Demo Trading" }))
    expect(mocks.activate).toHaveBeenCalledTimes(1)
  })
})
