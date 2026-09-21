import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Cap8Provider } from "@/features/cap8/Cap8Context"

const mocks = vi.hoisted(() => ({
  rowSelect: vi.fn(),
}))

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }) }))
vi.mock("@/features/market-data", () => ({ usePrices: () => ({ priceMap: {} }), prevSessionChangePct: () => 0 }))
vi.mock("./hooks", () => ({
  useWatchlist: () => ({ data: [], isLoading: false }),
  useAddToWatchlist: () => ({}),
  useRemoveFromWatchlist: () => ({}),
  useSparkline: () => ({ data: [] }),
  useSymbolInfo: () => ({ data: null }),
}))
vi.mock("./api", () => ({ watchlistApi: { validateStock: vi.fn() } }))
vi.mock("@/features/trading", () => ({
  usePortfolio: () => ({
    data: {
      positions: [{
        symbol: "HPG",
        quantity: 100,
        avgBuyPrice: 30000,
        currentPrice: 31000,
        marketValue: 3100000,
        unrealizedPnl: 100000,
      }],
      balance: 1,
      totalAssets: 1,
      pnl: 0,
      pnlPercent: 0,
    },
    isLoading: false,
  }),
  useOrders: () => ({ data: [], isLoading: false }),
}))
vi.mock("@/features/portfolio-manager", () => ({ PortfolioAnalysisButton: () => null }))

import { WatchlistPanel } from "./WatchlistPanel"

beforeEach(() => {
  mocks.rowSelect.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("Holdings — lộ trình hiện hành kết thúc tại Cấp 6", () => {
  it("không hiện công cụ riêng của Cấp 7–8 trong panel dùng chung", () => {
    render(<WatchlistPanel onRowSelect={mocks.rowSelect} />)
    fireEvent.click(screen.getByText("Nắm giữ"))
    expect(screen.queryByRole("button", { name: "Bán" })).not.toBeInTheDocument()
  })

  it("không phục hồi UI Cấp 8 ngay cả khi gặp provider lịch sử", () => {
    render(
      <Cap8Provider>
        <WatchlistPanel onRowSelect={mocks.rowSelect} />
      </Cap8Provider>,
    )
    fireEvent.click(screen.getByText("Nắm giữ"))
    expect(screen.queryByRole("button", { name: "Bán" })).not.toBeInTheDocument()
  })

  it("giữ khả năng chọn mã nắm giữ để người dùng tự bán ở panel đặt lệnh", () => {
    render(
      <Cap8Provider>
        <WatchlistPanel onRowSelect={mocks.rowSelect} />
      </Cap8Provider>,
    )
    fireEvent.click(screen.getByText("Nắm giữ"))
    fireEvent.click(screen.getByText("HPG"))
    expect(mocks.rowSelect).toHaveBeenCalledWith("HPG")
  })
})
