import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
// Module-scoped spy (not a fresh `vi.fn()` per hook call) so tests can assert
// whether a submitted BUY actually reached `placeOrder.mutateAsync` — this is
// how "reason-gate does not fire outside Cấp 0" gets proven, rather than just
// asserted against the gate's own internal state.
const placeOrderMock = vi.fn(() =>
  Promise.resolve({ symbol: "VNM", side: "BUY", quantity: 100, price: 62400, total: 6_240_000, status: "FILLED" }),
)
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: placeOrderMock, isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: false, setShowAuthModal: vi.fn() }) }))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))

// Spy on `Message.{success,warning,error}` (same pattern as `gbar.test.tsx`)
// — a real submitted BUY calls `Message.success`, which reaches into
// Arco's toast portal (`ReactDOM.render`) and isn't happy in jsdom; keep the
// rest of the library real and just stub the toast calls.
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  }
})

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

/**
 * ★ `COLD_IMPORT_TIMEOUT` — these three tests each `vi.resetModules()` and then
 * dynamically `import("./TradingPanel")`, so every one of them pays for a COLD
 * transform of the panel's whole module graph. That graph has grown with every
 * cấp (it now reaches Cấp 0 … Cấp 8's blocks), and under a fully parallel
 * `vitest run` the transform alone can pass vitest's 5s default — the file then
 * fails with "Test timed out in 5000ms" while passing in isolation. The waits
 * inside the tests are unchanged (`waitFor` keeps its own default); this only
 * stops a cold module transform from being reported as a product failure.
 */
const COLD_IMPORT_TIMEOUT = 30_000

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
  }, COLD_IMPORT_TIMEOUT)

  it("ungates the order form INSIDE Cấp 0 (real Cap0Provider) even though isPremium is false", async () => {
    vi.resetModules()
    placeOrderMock.mockClear()
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
    // The Kế hoạch block + its reason-gate are Cấp 0-only (`isCap0Active`) —
    // inside the real `Cap0Provider` it renders, and (with no
    // `task_1_done_at` in the mocked progress) the reason chip is required.
    expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(placeOrderMock).not.toHaveBeenCalled())
  }, COLD_IMPORT_TIMEOUT)

  it("renders the order form normally when isPremium is true and NO Cap0Provider — no Kế hoạch block, and a BUY submits WITHOUT picking a reason (no scope leak into normal trading)", async () => {
    vi.resetModules()
    placeOrderMock.mockClear()
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
    // (a) No Cap0Provider → `isCap0Active` is false → the Kế hoạch block must
    // NOT render on /bieu-do & /co-phieu.
    expect(screen.queryByText("KẾ HOẠCH")).not.toBeInTheDocument()
    // (b) No reason chip was picked (there's no chip to pick), yet the buy
    // must reach `placeOrder.mutateAsync` — the reason-gate must not fire.
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", side: "buy", quantity: 100 }),
    )
  }, COLD_IMPORT_TIMEOUT)
})
