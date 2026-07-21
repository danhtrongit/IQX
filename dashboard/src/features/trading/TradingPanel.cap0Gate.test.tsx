import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

/**
 * Cấp 0 "Sân tập" ungates the order-entry form (spec §2) WITHOUT a premium
 * plan — but only inside a `Cap0Provider` (`Cap0TradingPage`). This file
 * verifies both ends of that OR condition through the real, unmocked
 * `@/features/cap0` module (no cap0 mock here) so the "no provider → still
 * gated" default isn't just asserted against a test double:
 *  - WITHOUT any `Cap0Provider` (i.e. /bieu-do, /co-phieu today) — the
 *    premium gate must stay exactly as it was.
 *  - INSIDE a real `Cap0Provider` — the order form renders even though
 *    `isPremium` is false.
 */

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: vi.fn() }),
}))
const priceData = {
  symbol: "VNM",
  exchange: "HOSE",
  closePrice: 62.4,
  referencePrice: 61.8,
  ceilingPrice: 67.9,
  floorPrice: 59.3,
  priceChange: 0.6,
  percentChange: 0.97,
  totalVolume: 1,
  totalValue: 1,
  foreignBuy: 0,
  foreignSell: 0,
  bid: [],
  ask: [],
}
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: priceData, isLoading: false }),
}))
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: false, setShowAuthModal: vi.fn() }) }))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))

// Real `@/features/cap0` module — Cap0Provider needs `useCap0Progress`
// (react-query + http client), so mock the ky client (same pattern as
// `cap0.test.tsx`) rather than the whole feature.
const get = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: vi.fn(), patch: vi.fn() },
  unwrap: <T,>(r: T) => r,
}))

// `@/features/premium` is mocked per-test (via `vi.doMock` + `vi.resetModules`
// + a dynamic `import`) since `isPremium` needs to vary across tests —
// there is no static top-level import of `TradingPanel`/`Cap0Provider` here
// on purpose.

describe("GatedOrderEntry — Cấp 0 ungate", () => {
  it("keeps the premium gate intact OUTSIDE Cấp 0 (no Cap0Provider), matching today's /bieu-do & /co-phieu behaviour", async () => {
    vi.resetModules()
    vi.doMock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: false, isLoading: false }) }))
    get.mockReturnValue({ json: () => Promise.resolve(null) })
    const { TradingPanel: FreshTradingPanel } = await import("./TradingPanel")
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FreshTradingPanel />
      </QueryClientProvider>,
    )
    expect(screen.getByText("Đặt lệnh Đấu trường ảo yêu cầu gói Premium.")).toBeInTheDocument()
    expect(screen.queryByText("ĐẶT LỆNH MUA")).not.toBeInTheDocument()
  })

  it("ungates the order form INSIDE Cấp 0 (real Cap0Provider) even though isPremium is false", async () => {
    vi.resetModules()
    vi.doMock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: false, isLoading: false }) }))
    get.mockReturnValue({ json: () => Promise.resolve(null) })
    const { TradingPanel: FreshTradingPanel } = await import("./TradingPanel")
    const { Cap0Provider: FreshCap0Provider } = await import("@/features/cap0")
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FreshCap0Provider>
          <FreshTradingPanel />
        </FreshCap0Provider>
      </QueryClientProvider>,
    )
    expect(
      screen.queryByText("Đặt lệnh Đấu trường ảo yêu cầu gói Premium."),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ĐẶT LỆNH MUA")).toBeInTheDocument()
    // The Kế hoạch block comes along with it (buy side, always rendered in `OrderEntry`).
    expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument()
  })

  it("still renders the order form normally when isPremium is true, Cấp 0 or not (unchanged existing behaviour)", async () => {
    vi.resetModules()
    vi.doMock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: true, isLoading: false }) }))
    get.mockReturnValue({ json: () => Promise.resolve(null) })
    const { TradingPanel: FreshTradingPanel } = await import("./TradingPanel")
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FreshTradingPanel />
      </QueryClientProvider>,
    )
    expect(screen.getByText("ĐẶT LỆNH MUA")).toBeInTheDocument()
  })
})
