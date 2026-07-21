import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Progressive hide-by-level (spec §8) inside `TradingPanel`/`OrderEntry`:
 *  - Sổ lệnh bid/ask ẩn cho đến nhiệm vụ ② (never done this delivery — stays
 *    hidden throughout, that's expected, not a bug).
 *  - Ô Giá + dropdown loại lệnh (MP/LO) ẩn cho đến nhiệm vụ ⑤ (tức là xong
 *    nhiệm vụ ①).
 *  - Cổng chất lượng 1 (nhiệm vụ ⑤): `keydown` vào ô cắt lỗ (manual mode) →
 *    `completeTask(5, "sl_typed")`; clicking the InputNumber's own auto
 *    step button (mode="button" +/- stepper — the "auto −5%/−7%"-style
 *    control the spec warns about) must NOT count.
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
    task_6_done_at: null,
    task1_star_clicked: false,
    task5_sl_typed: false,
    task6_debrief_done: false,
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

/** Locate the manual-mode SL `InputNumber`'s own `<input>` via its label —
 *  robust regardless of how many OTHER spinbuttons (Giá/Khối lượng/Chốt lời)
 *  are on the page. */
function getSlInput(): HTMLElement {
  const label = screen.getByText("Cắt lỗ", { selector: "label" })
  const container = label.closest("div") as HTMLElement
  return within(container).getByRole("spinbutton")
}

/** Locate the SL InputNumber's own step-button (mode="button" +/- stepper) —
 *  clicking it changes the value via `onChange`/`onMouseDown`, NEVER fires a
 *  `keydown` on the input, which is exactly the "auto button" the spec's
 *  cổng chất lượng 1 must reject. */
function getSlStepButton(): HTMLElement {
  const slInput = getSlInput()
  const group = slInput.closest(".arco-input-group") as HTMLElement
  const btn = group.querySelector(".arco-input-number-step-button") as HTMLElement
  if (!btn) throw new Error("SL step button not found")
  return btn
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

  it("reveals Ô Giá + dropdown loại lệnh once task ① is done (nhiệm vụ ⑤ mở) — sổ lệnh stays hidden (task ② never done this delivery)", async () => {
    renderInCap0(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("Giá")).toBeInTheDocument())

    expect(screen.getByText("Lệnh thị trường (MP)")).toBeInTheDocument()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  it("reveals sổ lệnh bid/ask once task ② is done", async () => {
    renderInCap0(makeProgress({ task_2_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText(/Spread:/)).toBeInTheDocument())
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

describe("Nhiệm vụ ⑤ — cổng chất lượng 1 (keydown vào ô cắt lỗ)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  it('a keydown into the manual SL input calls completeTask(5, "sl_typed")', async () => {
    renderInCap0(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument())
    // Confirm manual mode actually switched in (label, not the filled-mode div).
    expect(screen.getByText("Cắt lỗ", { selector: "label" })).toBeInTheDocument()

    fireEvent.keyDown(getSlInput(), { key: "5", code: "Digit5" })

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 5, gate: "sl_typed" } }),
    )
  })

  it("clicking the InputNumber's own auto step button does NOT count (no keydown fired)", async () => {
    renderInCap0(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument())
    // Confirm manual mode actually switched in (label, not the filled-mode div).
    expect(screen.getByText("Cắt lỗ", { selector: "label" })).toBeInTheDocument()

    fireEvent.mouseDown(getSlStepButton())

    // Give any (incorrect) async gate a tick to fire, then assert it didn't.
    await new Promise((r) => setTimeout(r, 50))
    expect(patch).not.toHaveBeenCalledWith(
      "cap0/task",
      expect.objectContaining({ json: expect.objectContaining({ task_no: 5 }) }),
    )
  })

  it("does not re-fire the gate once task5_sl_typed is already true server-side", async () => {
    renderInCap0(
      makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z", task5_sl_typed: true }),
    )
    await waitFor(() => expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument())
    // Confirm manual mode actually switched in (label, not the filled-mode div).
    expect(screen.getByText("Cắt lỗ", { selector: "label" })).toBeInTheDocument()

    fireEvent.keyDown(getSlInput(), { key: "5", code: "Digit5" })

    await new Promise((r) => setTimeout(r, 50))
    expect(patch).not.toHaveBeenCalledWith(
      "cap0/task",
      expect.objectContaining({ json: expect.objectContaining({ task_no: 5 }) }),
    )
  })
})
