import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WatchlistPanel } from "./WatchlistPanel"
import { WATCHLIST_TAB_STORAGE_KEY } from "./tabStorage"

const { cancelOrder, getOrders, getPortfolio, messageError } = vi.hoisted(() => ({
  cancelOrder: vi.fn(), getOrders: vi.fn(), getPortfolio: vi.fn(), messageError: vi.fn(),
}))
vi.mock("@arco-design/web-react", async (original) => ({
  ...await original<typeof import("@arco-design/web-react")>(),
  Message: { success: vi.fn(), error: messageError },
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))
vi.mock("@/features/market-data", () => ({ usePrices: () => ({ priceMap: {} }), prevSessionChangePct: () => 0 }))
vi.mock("./hooks", () => ({
  useWatchlist: () => ({ data: [], isLoading: false }),
  useAddToWatchlist: () => ({}), useRemoveFromWatchlist: () => ({}),
  useSparkline: () => ({ data: [] }), useSymbolInfo: () => ({ data: null }),
}))
vi.mock("@/features/trading/api", () => ({ tradingApi: { cancelOrder, getOrders, getPortfolio } }))
vi.mock("@/features/trading", async () => ({ ...(await import("@/features/trading/hooks")) }))
vi.mock("@/features/portfolio-manager", () => ({ PortfolioAnalysisButton: () => null }))
vi.mock("@/features/navigation/StockLogo", () => ({ StockLogo: () => null }))
vi.mock("@/features/cap0/hooks", () => ({ useCap0Progress: () => ({ data: null }) }))

const pending = {
  id: "pending-vnm", symbol: "VNM", side: "BUY", quantity: 100,
  price: 60000, total: 6000000, status: "PENDING", createdAt: "2026-09-09T12:30:00Z",
}

function mount(tab: string) {
  window.localStorage.setItem(WATCHLIST_TAB_STORAGE_KEY, tab)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><WatchlistPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  getPortfolio.mockResolvedValue({ positions: [], balance: 99990805, totalAssets: 99990805, pnl: 0, pnlPercent: -0.009195 })
  getOrders.mockResolvedValue([pending, { ...pending, id: "filled-vnm", status: "FILLED" }])
  cancelOrder.mockResolvedValue(undefined)
})

describe("Demo Trading production regressions", () => {
  it("uses the return's own sign and color when fees reduce NAV but unrealized P&L is zero", async () => {
    mount("holdings")
    const performance = await screen.findByText("-0.01%")
    expect(performance).toHaveClass("text-down")
    expect(screen.queryByText("+-0.01%")).not.toBeInTheDocument()
  })

  it("shows Vietnam time and cancels only the selected pending order, then refreshes history", async () => {
    mount("history")
    expect(await screen.findAllByText(/19:30/)).toHaveLength(2)
    const buttons = screen.getAllByRole("button", { name: "Hủy lệnh VNM" })
    expect(buttons).toHaveLength(1)
    getOrders.mockResolvedValue([{ ...pending, status: "CANCELLED" }])
    fireEvent.click(buttons[0])
    await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith("pending-vnm"))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Hủy lệnh VNM" })).not.toBeInTheDocument())
    expect(getOrders.mock.calls.length).toBeGreaterThan(1)
  })

  it("keeps the pending order visible if cancellation fails", async () => {
    cancelOrder.mockRejectedValue(new Error("Không thể hủy lệnh"))
    mount("history")
    fireEvent.click(await screen.findByRole("button", { name: "Hủy lệnh VNM" }))
    await waitFor(() => expect(cancelOrder).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(messageError).toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "Hủy lệnh VNM" })).toBeInTheDocument()
  })
})
