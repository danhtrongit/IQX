import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }) }))
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: { symbol: "HPG", exchange: "HOSE", closePrice: 28.45, referencePrice: 27.8, ceilingPrice: 29.75, floorPrice: 25.85, priceChange: 0.65, percentChange: 2.34, totalVolume: 1, totalValue: 1, foreignBuy: 0, foreignSell: 0, bid: [], ask: [] }, isLoading: false }),
}))
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: undefined }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: false, setShowAuthModal: vi.fn() }) }))
vi.mock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: false, isLoading: false }) }))
vi.mock("@/features/watchlist", () => ({ useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }), useSymbolInfo: () => ({ data: undefined }) }))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
import { TradingPanel } from "./TradingPanel"

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe("TradingPanel hideHeader", () => {
  it("omits the StockHeader symbol button when hideHeader is set", () => {
    const { rerender } = renderWithClient(<TradingPanel />)
    // Default: StockHeader renders the symbol as a button
    expect(screen.getAllByText("HPG").length).toBeGreaterThan(0)
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TradingPanel hideHeader />
      </QueryClientProvider>,
    )
    // With hideHeader, the StockHeader's exchange Tag ("HOSE") is gone
    expect(screen.queryByText("HOSE")).not.toBeInTheDocument()
  })
})
