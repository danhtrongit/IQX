import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Progressive hide-by-level (spec v3.0 §8) inside `TradingPanel`/`OrderEntry`:
 *  - Sổ lệnh bid/ask ẩn SUỐT Cấp 0 và Cấp 1 — §8: "Lên Cấp 2 (không hiện ở
 *    Cấp 0 và Cấp 1)". v2.2 opened it on nhiệm vụ ② (tour bảng điện), a whole
 *    level early.
 *  - Ô Giá + dropdown loại lệnh (MP/LO) ẩn cho đến nhiệm vụ ⑤ (tức là xong
 *    nhiệm vụ ①) — UNCHANGED by v3.0.
 *  - Khối Kế hoạch has NO cắt lỗ/chốt lời in any mode, and there is no
 *    "cổng chất lượng 1" any more: v3.0 removes both the field and the gate.
 *  - A NON-Cap0 regression check: outside any `Cap0Provider` (today's
 *    /bieu-do & /co-phieu), nothing from §8 is hidden.
 *
 * Same mocking pattern as `TradingPanel.cap0Gate.test.tsx` — real
 * `@/features/cap0` module, only the ky http client + adjacent
 * hooks/features mocked.
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
  bid: [{ price: 61.8, volume: 100 }],
  ask: [{ price: 62.4, volume: 200 }],
}
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: priceData, isLoading: false }),
}))

const placeOrderMock = vi.fn(() =>
  Promise.resolve({ symbol: "VNM", side: "BUY", quantity: 100, price: 62400, total: 6_240_000, status: "FILLED" }),
)
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: placeOrderMock, isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }) }))
// `isPremium: true` so `GatedOrderEntry` renders the real order form in BOTH
// the outside-Cap0 test (today's normal premium trading) and the inside-
// Cap0 tests (where `isCap0Active` would ungate it anyway) — premium-gating
// itself is already covered by `TradingPanel.cap0Gate.test.tsx`, not this file.
vi.mock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: true, isLoading: false }) }))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))

import { TradingPanel } from "./TradingPanel"
import { Cap0Provider } from "@/features/cap0"

function makeProgress(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 250_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    task1_star_clicked: false,
    task5_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderInCap0(progress: ReturnType<typeof makeProgress> | null) {
  get.mockReturnValue({ json: () => Promise.resolve(progress) })
  patch.mockReturnValue({ json: () => Promise.resolve(makeProgress()) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Cap0Provider>
        <TradingPanel />
      </Cap0Provider>
    </QueryClientProvider>,
  )
}

function renderOutsideCap0() {
  get.mockReturnValue({ json: () => Promise.resolve(null) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TradingPanel />
    </QueryClientProvider>,
  )
}

describe("TradingPanel — hide-by-level (spec §8)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    placeOrderMock.mockClear()
  })

  it("hides sổ lệnh bid/ask AND Ô Giá/dropdown loại lệnh on fresh Cấp 0 progress (no task done yet)", async () => {
    renderInCap0(makeProgress())
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
    expect(screen.queryByText("Giá")).not.toBeInTheDocument()
    expect(screen.queryByText("Lệnh thị trường (MP)")).not.toBeInTheDocument()
  })

  it("reveals Ô Giá + dropdown loại lệnh once task ① is done (nhiệm vụ ⑤ mở) — UNCHANGED by v3.0", async () => {
    renderInCap0(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("Giá")).toBeInTheDocument())

    expect(screen.getByText("Lệnh thị trường (MP)")).toBeInTheDocument()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  // ★ v3.0 §8: sổ lệnh bid/ask opens at Cấp 2, "không hiện ở Cấp 0 và Cấp 1".
  // v2.2 unlocked it on `task_2_done_at` (tour bảng điện) — one level early.
  it("★ keeps sổ lệnh bid/ask hidden after task ② — it opens at Cấp 2, not here", async () => {
    renderInCap0(makeProgress({ task_2_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  it("★ keeps it hidden through a FULL 5/5 Cấp 0 run, graduation included", async () => {
    renderInCap0(
      makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task_5_done_at: "t",
        task5_debrief_done: true,
        graduated_at: "2026-07-22T00:00:00Z",
      }),
    )
    await waitFor(() => expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument())
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  it("NON-Cap0 regression: outside Cap0Provider, sổ lệnh + Ô Giá + dropdown are all present exactly as today", async () => {
    renderOutsideCap0()
    await waitFor(() => expect(screen.getByText(/Spread:/)).toBeInTheDocument())
    // "Giá" also appears as the order-book's column header, so scope to the
    // price field's own <label>.
    expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument()
    expect(screen.getByText("Lệnh thị trường (MP)")).toBeInTheDocument()
    // No Cấp 0 Kế hoạch block either, outside Cấp 0.
    expect(screen.queryByText("KẾ HOẠCH")).not.toBeInTheDocument()
  })
})

// ── Khối Kế hoạch: chips only, in EVERY state of Cấp 0 (spec v3.0 §4) ────────
// v2.2 rendered a read-only −5%/+10% cắt lỗ/chốt lời preset before nhiệm vụ ①
// and swapped it for user-typed inputs after ① (whose first `keydown` was the
// "cổng chất lượng 1" gate). v3.0 deletes both modes and the gate with them.
describe("Khối Kế hoạch — KHÔNG cắt lỗ/chốt lời ở bất kỳ trạng thái nào", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  it.each([
    ["before nhiệm vụ ① (was the «filled» preset)", {}],
    ["after nhiệm vụ ① (was the «manual» typed input)", { task_1_done_at: "2026-07-21T00:00:00Z" }],
  ])("★ shows only the 5 chips — %s", async (_label, overrides) => {
    renderInCap0(makeProgress(overrides))
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    expect(screen.getByText("Vì sao bạn chọn VNM?")).toBeInTheDocument()
    expect(screen.getByText("Công ty tôi biết")).toBeInTheDocument()
    // Not the labels, not the preset values, not the tooltip copy.
    expect(screen.queryByText(/Cắt lỗ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Chốt lời/)).not.toBeInTheDocument()
    expect(screen.queryByText(/đề xuất/)).not.toBeInTheDocument()
    expect(screen.queryByText(/lời hứa với chính mình/)).not.toBeInTheDocument()
  })

  it("★ never PATCHes a task-5 gate from the order panel — ⑤ is earned by closing the Kết sổ", async () => {
    renderInCap0(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    // Type into every spinbutton the panel still has (Giá, Khối lượng) — none
    // of them may trip a Cấp 0 gate.
    for (const input of screen.getAllByRole("spinbutton")) {
      fireEvent.keyDown(input, { key: "5", code: "Digit5" })
    }

    await new Promise((r) => setTimeout(r, 50))
    expect(patch).not.toHaveBeenCalled()
  })
})
