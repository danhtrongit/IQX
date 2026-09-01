import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Progressive hide-by-level (spec v3.0 §8) inside `TradingPanel`/`OrderEntry`:
 *  - Sổ lệnh bid/ask ĐÃ BỊ BỎ khỏi panel đặt lệnh — không cấp nào render nó
 *    nữa (trước đây nó ẩn suốt Cấp 0/1 rồi mở từ Cấp 2).
 *  - Ô Giá + dropdown loại lệnh (MP/LO) ẩn cho đến khi xong nhiệm vụ ①.
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
    task4_debrief_done: false,
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

  it("★ không render sổ lệnh bid/ask (đã bỏ khỏi panel), và ẩn Ô Giá/dropdown loại lệnh trên progress Cấp 0 mới", async () => {
    renderInCap0(makeProgress())
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
    expect(screen.queryByText("Giá")).not.toBeInTheDocument()
    expect(screen.queryByText("MP — Thị trường")).not.toBeInTheDocument()
  })

  it("reveals Ô Giá + dropdown loại lệnh once task ① is done — UNCHANGED", async () => {
    renderInCap0(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText("Giá")).toBeInTheDocument())

    expect(screen.getByText("MP — Thị trường")).toBeInTheDocument()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  it("★ reveals Ô Giá through a FULL 4/4 Cấp 0 run, graduation included", async () => {
    renderInCap0(
      makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task4_debrief_done: true,
        graduated_at: "2026-07-22T00:00:00Z",
      }),
    )
    await waitFor(() => expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument())
  })

  it("NON-Cap0 regression: outside Cap0Provider, Ô Giá + dropdown are present exactly as today", async () => {
    renderOutsideCap0()
    await waitFor(() =>
      expect(screen.getByText("Giá", { selector: "label" })).toBeInTheDocument(),
    )
    // ★ Sổ lệnh bid/ask đã bị BỎ khỏi panel đặt lệnh — không một cấp nào, kể
    // cả ngoài mọi cấp (/bieu-do, /co-phieu), còn render nó.
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
    expect(screen.getByText("MP — Thị trường")).toBeInTheDocument()
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

  it("★ never PATCHes a task gate from the order panel — ④ is earned by closing the Kết sổ", async () => {
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

/**
 * ★ Panel Cấp 0 chỉ hiện đúng những gì mockup `iqx-cap0-datlenh.html` vẽ.
 *
 * Mockup vẽ: badge chế độ · MUA/BÁN · ticker · Trần/TC/Sàn · Số dư · Khối
 * lượng · Phí giao dịch · Kế hoạch · nút. KHÔNG vẽ: KL/NN/GTGD, lãi/lỗ luỹ
 * kế + WR, dòng "Đang giữ", nút % số dư, dòng Giá trị/Tổng.
 *
 * Năm thứ đó bị ẩn CHỈ ở Cấp 0 — chúng là công cụ thật của người đang giao
 * dịch, nên /bieu-do, /co-phieu và Cấp 1+ phải giữ nguyên. Test thứ hai canh
 * đúng điều đó; thiếu nó thì một lần "dọn cho gọn" sẽ lấy mất nút % số dư của
 * mọi người dùng thật mà không ai biết.
 */
describe("Panel Cấp 0 — ẩn đúng những gì mockup không vẽ (spec §8)", () => {
  // `WR: {n}%` bị React tách thành nhiều text node nên phải dùng regex; các
  // nhãn còn lại là chuỗi liền.
  const KHONG_VE = ["KL", "NN", "GTGD", "Giá trị", "Tổng"]
  const WR = /WR:/

  it("★ ẩn KL/NN/GTGD, lãi-lỗ+WR, Đang giữ, nút % số dư và Giá trị/Tổng khi ở Cấp 0", async () => {
    renderInCap0(makeProgress({ task_1_done_at: null }))
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    for (const nhan of KHONG_VE) {
      expect(screen.queryByText(nhan)).not.toBeInTheDocument()
    }
    expect(screen.queryByText(WR)).not.toBeInTheDocument()
    // Nút % số dư (10/25/50/100) — mockup chỉ có ô Khối lượng.
    for (const pct of ["10%", "25%", "50%", "100%"]) {
      expect(screen.queryByText(pct)).not.toBeInTheDocument()
    }
    // ...nhưng những gì mockup CÓ vẽ thì vẫn phải còn.
    expect(screen.getByText("Trần")).toBeInTheDocument()
    expect(screen.getByText("Sàn")).toBeInTheDocument()
    expect(screen.getByText("Số dư Sân tập")).toBeInTheDocument()
    expect(screen.getByText(/Phí giao dịch/)).toBeInTheDocument()
  })

  it("★ NGOÀI Cấp 0 (/bieu-do, /co-phieu) giữ NGUYÊN cả năm — chúng là công cụ thật", async () => {
    renderOutsideCap0()
    await waitFor(() => expect(screen.getByText("Trần")).toBeInTheDocument())

    for (const nhan of KHONG_VE) {
      expect(screen.getAllByText(nhan).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText(WR).length).toBeGreaterThan(0)
    expect(screen.getByText("10%")).toBeInTheDocument()
    expect(screen.getByText("Số dư")).toBeInTheDocument()
  })
})
