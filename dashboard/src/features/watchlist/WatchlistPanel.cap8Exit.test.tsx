import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Cap8Provider } from "@/features/cap8/Cap8Context"

type ExitModalProps = { onClose: () => void; symbol: string | null; visible: boolean }

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
vi.mock("@/features/cap7/Cap7PortfolioAnalysisPanel", () => ({ Cap7PortfolioAnalysisPanel: () => null }))
vi.mock("@/features/cap8/ExitModalCap8", () => ({
  ExitModalCap8: ({ symbol, visible }: ExitModalProps) =>
    visible ? <div data-testid="cap8-exit-modal">{symbol}</div> : null,
}))

import { WatchlistPanel } from "./WatchlistPanel"

beforeEach(() => {
  mocks.rowSelect.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("Holdings Level 8 exit control", () => {
  it("does not leak the Sell control outside the active Level 8 provider", () => {
    render(<WatchlistPanel onRowSelect={mocks.rowSelect} />)
    fireEvent.click(screen.getByText("Nắm giữ"))
    expect(screen.queryByRole("button", { name: "Bán" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-exit-modal")).not.toBeInTheDocument()
  })

  it("opens the Level 8 exit modal without selecting the holding row", () => {
    render(
      <Cap8Provider>
        <WatchlistPanel onRowSelect={mocks.rowSelect} />
      </Cap8Provider>,
    )
    fireEvent.click(screen.getByText("Nắm giữ"))
    fireEvent.click(screen.getByRole("button", { name: "Bán" }))

    expect(mocks.rowSelect).not.toHaveBeenCalled()
    expect(screen.getByTestId("cap8-exit-modal")).toHaveTextContent("HPG")
  })
})
