import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `POST /cap0/kehoach` — persisting the Cấp 0 Kế hoạch chip at BUY time
 * (spec §10, Task 1's endpoint). Two things are being pinned here:
 *
 *  1. Inside Cấp 0, a filled BUY with a picked chip records `{order_id,
 *     ly_do_doi_thuong}` — otherwise the Kết sổ's `Lý do mua` row is blank for
 *     everyone and a reload loses the chip entirely.
 *  2. ★★ The write is **NOT FATAL**. It runs AFTER the order has already
 *     filled, so an exception escaping into `handleSubmit`'s `catch` would
 *     swallow the `onOrderFilled` bus chain — no cấp's Kết sổ opens on the
 *     later sell and Cấp 0 becomes ungraduatable again. That is the exact bug
 *     fixed in `7a057a3`; the wrapper is `ghiKehoachKhongChiMang`.
 *
 * Harness mirrors `TradingPanel.cap0Gate.test.tsx` (real `@/features/cap0`
 * module, mocked ky client) so the POST is observed on the wire, not against a
 * hook double.
 */

// The terminal's symbol lives outside the panel and can change WITHOUT
// unmounting it, so the chip-scoping describe below drives it through this ref
// + a `rerender()` (the panel re-reads it every render, same as the real
// `SymbolProvider`).
const { symbolRef } = vi.hoisted(() => ({ symbolRef: { current: "VNM" } }))
vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: symbolRef.current, setSymbol: vi.fn() }),
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
const placeOrderMock = vi.fn(() =>
  Promise.resolve({
    id: "0e1b7c4a-1111-2222-3333-444455556666",
    symbol: "VNM",
    side: "BUY",
    quantity: 100,
    price: 62400,
    total: 6_240_000,
    status: "FILLED",
  }),
)
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: placeOrderMock, isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
// Premium TRUE so the last describe (no `Cap0Provider` at all) still reaches a
// rendered order form — `GatedOrderEntry` ungates on `isPremium || isCap0Active`,
// and the Cấp 0 describes above are ungated by the provider either way.
vi.mock("@/features/premium", () => ({
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))
const { messageError, messageSuccess } = vi.hoisted(() => ({
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
}))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: messageSuccess, warning: vi.fn(), error: messageError },
  }
})

const get = vi.fn()
const post = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: vi.fn(),
  },
  unwrap: <T,>(r: T) => r,
}))

import { TradingPanel } from "./TradingPanel"
import { Cap0Provider, useCap0Events, type Cap0OrderEvent } from "@/features/cap0"

/** Records every `onOrderFilled` the panel pushes onto the Cấp 0 bus. */
function BusSpy({ onFill }: { onFill: (e: Cap0OrderEvent) => void }) {
  const { registerHandlers } = useCap0Events()
  React.useEffect(() => {
    registerHandlers({ onOrderFilled: onFill })
  }, [registerHandlers, onFill])
  return null
}

function renderInCap0(onFill = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // A FRESH element each time: React bails out of re-rendering a referentially
  // identical one, so reusing a single `tree` would silently never re-read the
  // symbol.
  const tree = () => (
    <QueryClientProvider client={client}>
      <Cap0Provider>
        <TradingPanel />
        <BusSpy onFill={onFill} />
      </Cap0Provider>
    </QueryClientProvider>
  )
  const view = render(tree())
  // Re-renders the same tree — the panel is never unmounted, exactly as when
  // the shared terminal switches mã underneath it.
  return { onFill, rerender: () => view.rerender(tree()) }
}

/** Picks a chip then submits the BUY — the whole nhiệm vụ ① happy path. */
function buyWithReason(chip = "Công ty tôi biết") {
  fireEvent.click(screen.getByText(chip))
  fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
}

describe("TradingPanel — POST /cap0/kehoach at BUY time", () => {
  beforeEach(() => {
    placeOrderMock.mockClear()
    get.mockReset()
    post.mockReset()
    messageError.mockReset()
    messageSuccess.mockReset()
    get.mockReturnValue({ json: () => Promise.resolve(null) })
    post.mockReturnValue({ json: () => Promise.resolve({}) })
  })

  it("records the picked chip against the filled order id", async () => {
    renderInCap0()
    buyWithReason("Người quen giới thiệu")

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("cap0/kehoach", {
        json: {
          order_id: "0e1b7c4a-1111-2222-3333-444455556666",
          // The verbatim §4 label — Task 1's endpoint accepts it as-is, so
          // `PlanBlock`'s own chip strings need no mapping table.
          ly_do_doi_thuong: "Người quen giới thiệu",
        },
      }),
    )
  })

  // ★★ The regression that made Cấp 0 ungraduatable (`7a057a3`): a throwing
  // kehoach POST inside `handleSubmit`'s `try` aborts everything after it —
  // the Cấp 1-8 `onOrderFilled` chain, the form reset, and the success toast —
  // and reports a FILLED order as a failure.
  //
  // The load-bearing assertion is the success toast: it is the LAST statement
  // of the `try`, so it can only fire if the whole chain below the kehoach
  // POST survived. (`onFill` alone would not bite — Cấp 0's own bus event is
  // dispatched before the POST.)
  it("★★ a FAILING kehoach POST does not abort the rest of handleSubmit", async () => {
    post.mockReturnValue({ json: () => Promise.reject(new Error("500 boom")) })
    const onFill = vi.fn()
    renderInCap0(onFill)
    buyWithReason()

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(messageSuccess).toHaveBeenCalledWith(
        expect.stringContaining("Đặt lệnh MUA VNM thành công"),
      ),
    )
    // ...a successful order is never reported to the user as a failure...
    expect(messageError).not.toHaveBeenCalled()
    // ...and Cấp 0's own bus event still reached `Gbar`.
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", side: "buy", quantity: 100 }),
    )
  })

  it("does not POST a kehoach for a SELL", async () => {
    renderInCap0()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(post).not.toHaveBeenCalledWith("cap0/kehoach", expect.anything())
  })
})

/**
 * ★★ MỘT CHIP CHỈ NÓI VỀ ĐÚNG MỘT LỆNH — và về đúng mã nó được chọn cho.
 *
 * `reason` used to be plain unscoped `useState`, and the post-fill reset block
 * lives inside the `isCap1Active` branch, so nothing ever cleared it. Once
 * nhiệm vụ ① is done `requireReasonBeforeOrder` goes false, so nothing
 * re-prompts either: the next BUY silently wrote a `cap0_order_kehoach` row
 * carrying a chip the user picked for a DIFFERENT order — and the chip is now
 * persisted, not transient. Same rule every other cấp already follows in this
 * file via `useLuaChonTheoMa`.
 */
describe("TradingPanel — the Cấp 0 chip is bound to ONE order and ONE mã", () => {
  const TASK1_DONE_PROGRESS = {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 250_000_000,
    // ★ Task ① done → `requireReasonBeforeOrder` false → a chip-less second BUY
    // is NOT blocked. That is exactly why a leftover chip is dangerous here.
    task_1_done_at: "2026-07-21T01:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task4_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
  }

  beforeEach(() => {
    symbolRef.current = "VNM"
    placeOrderMock.mockClear()
    get.mockReset()
    post.mockReset()
    messageError.mockReset()
    messageSuccess.mockReset()
    get.mockImplementation((url: string) => ({
      json: () =>
        Promise.resolve(String(url).startsWith("cap0/progress") ? TASK1_DONE_PROGRESS : null),
    }))
    post.mockReturnValue({ json: () => Promise.resolve({}) })
  })

  it("★ does not re-file a spent chip against the NEXT order", async () => {
    renderInCap0()
    await waitFor(() => expect(screen.getByText("Thử cho biết")).toBeInTheDocument())

    buyWithReason("Thử cho biết")
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("cap0/kehoach", {
        json: {
          order_id: "0e1b7c4a-1111-2222-3333-444455556666",
          ly_do_doi_thuong: "Thử cho biết",
        },
      }),
    )

    // Second BUY, chips untouched — the user made no new declaration.
    post.mockClear()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(2))
    expect(post).not.toHaveBeenCalledWith("cap0/kehoach", expect.anything())
  })

  it("★ clears the chip's selected state on screen once the order fills", async () => {
    renderInCap0()
    await waitFor(() => expect(screen.getByText("Thử cho biết")).toBeInTheDocument())

    buyWithReason("Thử cho biết")
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    // The chip must not still read as "chosen" for the next, undeclared order.
    await waitFor(() =>
      expect(screen.getByText("Thử cho biết").className).not.toContain("cap0-chip--on"),
    )
  })

  it("★ a chip picked for one mã never follows the user to another mã", async () => {
    const { rerender } = renderInCap0()
    await waitFor(() => expect(screen.getByText("Giá đang tăng")).toBeInTheDocument())
    fireEvent.click(screen.getByText("Giá đang tăng"))
    expect(screen.getByText("Giá đang tăng").className).toContain("cap0-chip--on")

    // Terminal switches mã underneath the panel (no unmount).
    symbolRef.current = "HPG"
    rerender()
    // (`.cap0-plan-q` splits the symbol into its own text node, so read the
    // rendered question off the element rather than through a text matcher.)
    expect(document.querySelector(".cap0-plan-q")?.textContent).toBe("Vì sao bạn chọn HPG?")
    expect(screen.getByText("Giá đang tăng").className).not.toContain("cap0-chip--on")

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(post).not.toHaveBeenCalledWith("cap0/kehoach", expect.anything())
  })
})

describe("TradingPanel — POST /cap0/kehoach never leaks outside Cấp 0", () => {
  beforeEach(() => {
    symbolRef.current = "VNM"
    placeOrderMock.mockClear()
    get.mockReset()
    post.mockReset()
    get.mockReturnValue({ json: () => Promise.resolve(null) })
    post.mockReturnValue({ json: () => Promise.resolve({}) })
  })

  // No `Cap0Provider` → `isCap0Active` false → no Kế hoạch block, no chip, and
  // nothing may be written to a Cấp 0 table from /bieu-do or /co-phieu.
  it("★ a normal BUY on the shared terminal writes no cap0 kehoach row", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TradingPanel />
      </QueryClientProvider>,
    )
    expect(screen.queryByText("KẾ HOẠCH")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(post).not.toHaveBeenCalledWith("cap0/kehoach", expect.anything())
  })
})
