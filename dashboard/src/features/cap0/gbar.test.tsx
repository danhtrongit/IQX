import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import React, { type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Same pattern as `cap0.test.tsx` — mock the ky client so `useCap0Progress` /
// `useCompleteTask` run against fixtures, no network/tokens.
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
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }))

// Spy on `Message.success` (the 3 spec §4 toasts) and `Message.info` (the
// spec §8 unlock toast) while keeping everything else in the library real.
const { messageSuccess, messageInfo } = vi.hoisted(() => ({
  messageSuccess: vi.fn(),
  messageInfo: vi.fn(),
}))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: messageSuccess, info: messageInfo },
  }
})

import { Cap0Provider, useCap0Events } from "./Cap0Context"
import { Gbar } from "./Gbar"

/** Verbatim spec §6, nhiệm vụ ④. */
const TASK4_MSG = "Chọn lệnh trong Nắm giữ và bấm Bán để khép vòng đời lệnh đầu tiên"

function makeProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
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

/** One raw `virtual-trading/portfolio` position row (as the API returns it). */
const RAW_POSITION = {
  symbol: "VNM",
  quantity_total: 100,
  avg_cost_vnd: 61800,
  current_price_vnd: 62000,
  market_value_vnd: 6_200_000,
  unrealized_pnl_vnd: 20_000,
}

/** Simulates the calls `PlanBlock`/`OrderEntry`/`StockHeader` make into the bus. */
function EventTrigger() {
  const events = useCap0Events()
  return (
    <div>
      <button onClick={() => events.onReasonPicked?.("Công ty tôi biết")}>pick-reason</button>
      <button
        onClick={() =>
          events.onOrderFilled?.({
            orderId: "buy-vnm-1",
            symbol: "VNM",
            side: "buy",
            quantity: 100,
            price: 61800,
          })
        }
      >
        fill-order
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({
            orderId: "sell-vnm-flat",
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 61800,
          })
        }
      >
        fill-order-sell
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({
            orderId: "buy-hpg-100",
            symbol: "HPG",
            side: "buy",
            quantity: 100,
            price: 30000,
          })
        }
      >
        fill-order-other-symbol
      </button>
      <button onClick={() => events.onStarToggled?.("VNM", true)}>star-toggle</button>
      <button onClick={() => events.onPortfolioTabOpen?.("holdings")}>open-holdings-tab</button>
      <button onClick={() => events.onPortfolioTabOpen?.("watchlist")}>open-watchlist-tab</button>
      <button onClick={() => events.onPortfolioTabOpen?.("history")}>open-history-tab</button>
      <button onClick={() => events.onGbarWarn?.()}>warn</button>
      <button
        onClick={() =>
          events.onOrderFilled?.({
            orderId: "buy-hpg-200",
            symbol: "HPG",
            side: "buy",
            quantity: 200,
            price: 30000,
          })
        }
      >
        buy-hpg
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({
            orderId: "sell-vnm-1",
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 63000,
          })
        }
      >
        sell-vnm
      </button>
    </div>
  )
}

function PanelSpy() {
  const { activePanel } = useSidebar()
  return <div data-testid="panel-spy">{activePanel}</div>
}

/**
 * Routes the mocked `api.get` by URL. `Gbar` reads THREE server things now:
 * `cap0/progress`, `virtual-trading/orders` (retro Kết sổ) and
 * `virtual-trading/portfolio` (spec §6's "có lệnh mở nhưng chưa bán" condition
 * for the nhiệm vụ ④ bar).
 */
function routeGet(
  progress: Cap0Progress | null,
  orders: Record<string, unknown>[] = [],
  positions: Record<string, unknown>[] = [],
) {
  get.mockImplementation((url: string) => ({
    json: () => {
      const u = String(url)
      if (u.startsWith("virtual-trading/orders")) return Promise.resolve({ orders })
      if (u.startsWith("virtual-trading/portfolio")) return Promise.resolve({ positions })
      // `DebriefModal` reads the Cấp 0 Kế hoạch chip (`Lý do mua` / `Thời gian
      // giữ`). These Gbar tests are about WHICH Kết sổ opens, not its rows, so
      // answer the honest "no row recorded" — the modal renders "—" for both.
      if (u.startsWith("cap0/kehoach")) return Promise.resolve(null)
      return Promise.resolve(progress)
    },
  }))
}

function renderGbar(
  progress: Cap0Progress | null,
  { positions = [] as Record<string, unknown>[] } = {},
) {
  routeGet(progress, [], positions)
  patch.mockReturnValue({ json: () => Promise.resolve(makeProgress({ task_1_done_at: "t" })) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider defaultPanel="trading">
        <Cap0Provider>
          <Gbar />
          <EventTrigger />
        </Cap0Provider>
        <PanelSpy />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

describe("Gbar", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it('shows the "CẦN LÀM" tag + step 1/2 message on fresh progress', async () => {
    renderGbar(makeProgress())
    await waitFor(() =>
      expect(
        screen.getByText(
          "Bước 1/2 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
        ),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText("CẦN LÀM")).toBeInTheDocument()
  })

  it("advances to step 2/2 after a reason is picked", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    expect(
      screen.getByText("Bước 2/2 — Bấm ĐẶT LỆNH MUA để mua 100 VNM"),
    ).toBeInTheDocument()
  })

  it("ignores a SELL fill (does not complete nhiệm vụ ①)", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order-sell"))
    expect(screen.getByText(/Bước 2\/2/)).toBeInTheDocument()
  })

  it("ignores a fill for a different symbol (does not complete nhiệm vụ ①)", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order-other-symbol"))
    expect(screen.getByText(/Bước 2\/2/)).toBeInTheDocument()
  })

  // ★ Nhiệm vụ ① kết thúc ở lệnh mua khớp — KHÔNG đợi ★ nữa (việc gắn ★ / mở
  // tab đã tách thành nhiệm vụ ②③ riêng), và PATCH đi KHÔNG kèm gate: backend
  // đã bỏ hẳn `task1_star_clicked`.
  it("★ completes the task on chip lý do + lệnh MUA khớp: toasts, PATCHes task 1 with NO gate, hides, returns to Hành trình", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order"))

    expect(messageSuccess).toHaveBeenCalledWith("✓ Khớp lệnh MUA 100 VNM @ 61,800")
    expect(messageSuccess).toHaveBeenCalledWith(
      "🎉 Nhiệm vụ 1 hoàn thành! Mở tab Nắm giữ để xem mã bạn vừa mua",
    )
    // The reducer's local `TASK_DONE` dispatch hides the bar synchronously;
    // `completeTask.mutate`'s actual PATCH is dispatched by React Query on a
    // microtask, so that assertion needs a `waitFor`.
    expect(screen.queryByText(/Bước/)).not.toBeInTheDocument()
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 1 } }),
    )
    expect(patch).not.toHaveBeenCalledWith("cap0/task", {
      json: { task_no: 1, gate: "star" },
    })
  })

  // ★ Cái ★ vẫn là hành vi production cũ, không đụng tới — nó chỉ không còn
  // khoá/mở nhiệm vụ nào của Cấp 0 nữa.
  it("★ a ★ toggle no longer completes anything on its own — ① waits on the BUY, not the star", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("star-toggle"))

    expect(screen.getByText(/Bước 2\/2/)).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(patch).not.toHaveBeenCalled()
  })

  it("wrong action (buy without a reason) flashes warn (red + ⚠ prefix), then reverts to amber after ~1.6s but stays", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderGbar(makeProgress())
    await vi.waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("warn"))
    expect(
      screen.getByText(
        "⚠ Bước 1/2 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
      ),
    ).toBeInTheDocument()
    expect(document.querySelector(".cap0-gbar--warn")).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1600)
    })

    expect(
      screen.getByText(
        "Bước 1/2 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
      ),
    ).toBeInTheDocument()
    expect(document.querySelector(".cap0-gbar--warn")).toBeNull()
    vi.useRealTimers()
  })
})

// ── Nhiệm vụ ④ «Bán một lệnh, kết sổ đầu tiên» (spec §6) ─────────────────────
// Một lời nhắc đứng yên. Nhiệm vụ này lùi từ ⑤ về ④ khi Chặng 2 (ba tour sản
// phẩm) bị bỏ khỏi Cấp 0 — nội dung thanh không đổi, chỉ cột nó đọc thì đổi.
describe("Gbar — nhiệm vụ ④ reminder (spec §6)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("★ shows §6's verbatim sell reminder once ① is done and a position is open", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }), {
      positions: [RAW_POSITION],
    })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())
    expect(screen.getByText("CẦN LÀM")).toBeInTheDocument()
    // Nhiệm vụ ①'s own step bar is gone...
    expect(screen.queryByText(/Bước \d\/\d/)).not.toBeInTheDocument()
    // ...and so is every trace of the deleted SL flow.
    expect(screen.queryByText(/cắt lỗ/i)).not.toBeInTheDocument()
  })

  it("★ does NOT show it while nhiệm vụ ① is still open — ① owns the bar first", async () => {
    renderGbar(makeProgress(), { positions: [RAW_POSITION] })
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    expect(screen.queryByText(TASK4_MSG)).not.toBeInTheDocument()
  })

  it("★ does NOT show it when there is no open position — §6's condition is «có lệnh mở nhưng chưa bán»", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }), { positions: [] })
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(TASK4_MSG)).not.toBeInTheDocument()
    expect(document.querySelector(".cap0-gbar")).toBeNull()
  })

  it("★ does NOT show it once ④ is already done, even with a fresh position open", async () => {
    renderGbar(
      makeProgress({
        task_1_done_at: "t",
        task_4_done_at: "2026-07-22T00:00:00Z",
        task4_debrief_done: true,
      }),
      { positions: [RAW_POSITION] },
    )
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(TASK4_MSG)).not.toBeInTheDocument()
  })

  it("ignores a zero-quantity position row (a fully-closed holding is not an open position)", async () => {
    renderGbar(makeProgress({ task_1_done_at: "t" }), {
      positions: [{ ...RAW_POSITION, quantity_total: 0 }],
    })
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(TASK4_MSG)).not.toBeInTheDocument()
  })
})

describe("Gbar — buy → sell opens the Kết sổ debrief (spec §5/§6, nhiệm vụ ④)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("a BUY then a SELL opens DebriefModal with the entry price / order #n captured from the buy", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }), {
      positions: [RAW_POSITION],
    })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("fill-order")) // BUY VNM @ 61,800
    fireEvent.click(screen.getByText("sell-vnm")) // SELL VNM @ 63,000

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText("+120,000đ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.getAllByText("61,800").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/63,000/)).toBeInTheDocument()
  })

  // ★ The Kết sổ's `Lý do mua` / `Thời gian giữ` are read per ORDER, so the live
  // path has to carry the BUY's own id across to the sell — the same key the
  // chip was filed under at fill time. Keyed on the symbol instead, a user who
  // re-entered VNM after this round trip would be shown the NEW order's chip.
  it("★ asks for the kehoach row of the BUY that opened the round trip, not of the mã", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }), {
      positions: [RAW_POSITION],
    })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("fill-order")) // BUY VNM (id buy-vnm-1)
    fireEvent.click(screen.getByText("sell-vnm")) // SELL VNM

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("cap0/kehoach", {
        searchParams: { order_id: "buy-vnm-1" },
      }),
    )
    expect(get).not.toHaveBeenCalledWith("cap0/kehoach", {
      searchParams: { order_id: "sell-vnm-1" },
    })
  })

  it("buy A, buy B, then sell A → the debrief uses A's captured entry price, not B's", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }), {
      positions: [RAW_POSITION],
    })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("fill-order")) // A — VNM @ 61,800
    fireEvent.click(screen.getByText("buy-hpg")) // B — HPG @ 30,000
    fireEvent.click(screen.getByText("sell-vnm")) // sell A (VNM)

    expect(screen.getByText(/MUA 100 VNM → BÁN/)).toBeInTheDocument()
    expect(screen.getAllByText("61,800").length).toBeGreaterThanOrEqual(2)
    // B's (HPG's) figures must NOT leak into A's debrief.
    expect(screen.queryByText(/30,000/)).not.toBeInTheDocument()
  })
})

// ── Retroactive Kết sổ (nhiệm vụ ④ was unreachable — the graduation blocker) ──
// The live `onOrderFilled` sell branch above only fires inside `Cap0Provider`
// (i.e. on `/dau-truong`), and `debriefCountRef`/`lastBuyBySymbolRef` are
// session-local refs. A user who sold from `/bieu-do` or `/co-phieu`, or who
// reloaded before pressing "Đóng kết sổ ✓", could never reach the Kết sổ — and
// since `Cap0Service.graduate` demands 4/4 + the debrief gate, could never
// graduate. `Gbar` also reconstructs the Kết sổ from SERVER order history.

/** A `VirtualOrder` row as `GET /virtual-trading/orders` returns it. */
function rawOrder(o: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    symbol: "VNM",
    side: "buy",
    quantity: 100,
    filled_price_vnd: 61800,
    status: "filled",
    created_at: "2026-07-21T02:00:00Z",
    ...o,
  }
}

const RAW_BUY = rawOrder({ id: "b1", side: "buy", filled_price_vnd: 61800 })
const RAW_SELL = rawOrder({
  id: "s1",
  side: "sell",
  filled_price_vnd: 63000,
  created_at: "2026-07-21T06:00:00Z",
})

function renderGbarWithHistory(
  progress: Cap0Progress | null,
  orders: Record<string, unknown>[],
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  positions: Record<string, unknown>[] = [],
) {
  routeGet(progress, orders, positions)
  patch.mockReturnValue({
    json: () => Promise.resolve({ ...progress, task_4_done_at: "t", task4_debrief_done: true }),
  })
  const utils = render(
    <QueryClientProvider client={client}>
      <SidebarProvider defaultPanel="trading">
        <Cap0Provider>
          <Gbar />
          <EventTrigger />
        </Cap0Provider>
      </SidebarProvider>
    </QueryClientProvider>,
  )
  return { ...utils, client }
}

/** Task ①②③ done (so nhiệm vụ ④ is the live stage), nhiệm vụ ④ still open. */
function task4Pending(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: null,
    task4_debrief_done: false,
    ...overrides,
  })
}

describe("Gbar — retroactive Kết sổ from order history (nhiệm vụ ④ recovery)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("opens the Kết sổ on mount for a user whose round trip ALREADY closed and who never finished ④", async () => {
    renderGbarWithHistory(task4Pending(), [RAW_SELL, RAW_BUY])

    await waitFor(() =>
      expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument(),
    )
    // Reconciled against server data: buy 61,800 → sell 63,000, 100 VNM.
    expect(screen.getByText("+120,000đ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.getByText(/63,000/)).toBeInTheDocument()
  })

  // ★★ Failure B of the review, end to end through the FE: buy VNM (chip A) →
  // sell → buy VNM AGAIN (chip B, still open) → reload. The reconstruction
  // reports the FIRST round trip (entry 61,800), so the chip it asks for must be
  // that buy's — asking by symbol would answer with the still-open re-entry and
  // put another order's `Lý do mua`/`Thời gian giữ` beside these prices.
  it("★ asks for the reconstructed BUY's kehoach row, not the mã's most recent buy", async () => {
    const REENTRY = rawOrder({
      id: "b2",
      side: "buy",
      filled_price_vnd: 64000,
      created_at: "2026-07-22T02:00:00Z",
    })
    renderGbarWithHistory(task4Pending(), [REENTRY, RAW_SELL, RAW_BUY])

    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("cap0/kehoach", { searchParams: { order_id: "b1" } }),
    )
    expect(get).not.toHaveBeenCalledWith("cap0/kehoach", { searchParams: { order_id: "b2" } })
  })

  it("★ closing it PATCHes /cap0/task task 4 + the debrief gate — the graduation blocker clears", async () => {
    renderGbarWithHistory(task4Pending(), [RAW_SELL, RAW_BUY])
    await waitFor(() => expect(screen.getByText("Đóng kết sổ ✓")).toBeInTheDocument())

    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", {
        json: { task_no: 4, gate: "debrief" },
      }),
    )
    // ★ Nhiệm vụ ⑤ không còn tồn tại — PATCH số 5 giờ là gửi một nhiệm vụ ma.
    expect(patch).not.toHaveBeenCalledWith("cap0/task", {
      json: { task_no: 5, gate: "debrief" },
    })
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  // ★★ THE regression this whole recovery path exists for. «Bán + Kết sổ» has
  // moved column twice (⑥ → ⑤ → ④, the BE migration carrying the data down each
  // time), so the guard must read `task_4_done_at` — and must NOT be fooled by
  // a stale `task_5_done_at` a mid-flight user still carries. Treat that as "④
  // done" and the retro Kết sổ is suppressed, the gate stays false, and
  // `graduate()` 409s forever with no way out.
  it("★ still opens for a user whose ④ is unfinished even though earlier tasks are done", async () => {
    renderGbarWithHistory(
      task4Pending({ task_1_done_at: "2026-07-21T00:00:00Z" }),
      [RAW_SELL, RAW_BUY],
    )
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
  })

  it("does NOT open for a user who has ALREADY done nhiệm vụ ④", async () => {
    renderGbarWithHistory(
      task4Pending({ task_4_done_at: "2026-07-22T00:00:00Z", task4_debrief_done: true }),
      [RAW_SELL, RAW_BUY],
    )
    // Wait for progress to actually land before asserting the absence.
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("does NOT open when the user has never sold (no closed round trip)", async () => {
    renderGbarWithHistory(task4Pending(), [RAW_BUY])
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("does NOT open when order history is empty", async () => {
    renderGbarWithHistory(task4Pending(), [])
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("does NOT open for a user who never entered Cấp 0 (progress null), even with a closed round trip", async () => {
    renderGbarWithHistory(null, [RAW_SELL, RAW_BUY])
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("numbers the retro Kết sổ #2 when TWO round trips already closed", async () => {
    renderGbarWithHistory(task4Pending(), [
      rawOrder({ id: "s2", side: "sell", filled_price_vnd: 70000, created_at: "2026-07-24T06:00:00Z" }),
      rawOrder({ id: "b2", side: "buy", filled_price_vnd: 65000, created_at: "2026-07-24T02:00:00Z" }),
      RAW_SELL,
      RAW_BUY,
    ])
    await waitFor(() =>
      expect(screen.getByText("KẾT SỔ LỆNH · #2 · SÂN TẬP")).toBeInTheDocument(),
    )
    // The MOST RECENT round trip: 65,000 → 70,000, not 61,800 → 63,000.
    expect(screen.getByText("+500,000đ · MUA 100 VNM → BÁN")).toBeInTheDocument()
  })
})

describe("Gbar — live sell path is unchanged; retro must not double-open or double-count #N", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("a live sell still opens the Kết sổ IMMEDIATELY with its real entry price off the bus", async () => {
    // Empty history — nothing for the retro path to find; only the bus fires.
    renderGbarWithHistory(task4Pending(), [], undefined, [RAW_POSITION])
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("fill-order"))
    fireEvent.click(screen.getByText("sell-vnm"))

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText("+120,000đ · MUA 100 VNM → BÁN")).toBeInTheDocument()
  })

  it("when the order history refetches AFTER a live sell, the retro path does not replace the live Kết sổ (no double-open for the same sell)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderGbarWithHistory(task4Pending(), [], client, [RAW_POSITION])
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("fill-order"))
    fireEvent.click(screen.getByText("sell-vnm"))
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()

    // Simulate what `usePlaceOrder`'s `onSuccess` does in the real app: the
    // just-filled round trip now appears in server history and every trading
    // query is invalidated.
    routeGet(task4Pending(), [RAW_SELL, RAW_BUY], [RAW_POSITION])
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["trading"] })
    })

    // Still exactly ONE Kết sổ, still #1.
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getAllByText(/KẾT SỔ LỆNH/)).toHaveLength(1)
  })

  it("#N does not double-count: after a retroactive #2, the next LIVE sell is #3", async () => {
    renderGbarWithHistory(
      task4Pending(),
      [
        rawOrder({ id: "s2", side: "sell", filled_price_vnd: 70000, created_at: "2026-07-24T06:00:00Z" }),
        rawOrder({ id: "b2", side: "buy", filled_price_vnd: 65000, created_at: "2026-07-24T02:00:00Z" }),
        RAW_SELL,
        RAW_BUY,
      ],
      undefined,
      [RAW_POSITION],
    )
    await waitFor(() =>
      expect(screen.getByText("KẾT SỔ LỆNH · #2 · SÂN TẬP")).toBeInTheDocument(),
    )

    // Read + close the retro Kết sổ, then close another round trip live.
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("fill-order"))
    fireEvent.click(screen.getByText("sell-vnm"))

    // Continues the server-derived numbering — not back to #1.
    expect(screen.getByText("KẾT SỔ LỆNH · #3 · SÂN TẬP")).toBeInTheDocument()
  })
})

describe("Gbar — spec §8 unlock toast", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it('completing nhiệm vụ ① (task_1_done_at flips true server-side) toasts "Bạn vừa mở khóa: Ô Giá & loại lệnh (LO/MP)."', async () => {
    // A stateful `get` mock: starts fresh, then reflects the server state the
    // PATCH mock "persists" once nhiệm vụ ① completes — driving the SAME
    // `progress` transition (false → true) the real app produces when
    // `completeTask`'s mutation invalidates + refetches `useCap0Progress`.
    let serverProgress = makeProgress()
    get.mockImplementation((url: string) => ({
      json: () => {
        const u = String(url)
        if (u.startsWith("virtual-trading/orders")) return Promise.resolve({ orders: [] })
        if (u.startsWith("virtual-trading/portfolio")) return Promise.resolve({ positions: [] })
        return Promise.resolve(serverProgress)
      },
    }))
    patch.mockImplementation(() => {
      serverProgress = makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" })
      return { json: () => Promise.resolve(serverProgress) }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SidebarProvider defaultPanel="trading">
          <Cap0Provider>
            <Gbar />
            <EventTrigger />
          </Cap0Provider>
        </SidebarProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order"))

    await waitFor(() =>
      expect(messageInfo).toHaveBeenCalledWith("Bạn vừa mở khóa: Ô Giá & loại lệnh (LO/MP)."),
    )
    // ★ The sổ lệnh NEVER unlocks inside Cấp 0 under v3.0 (§8: it opens at Cấp
    // 2), so that toast must not exist at all any more.
    expect(messageInfo).not.toHaveBeenCalledWith("Bạn vừa mở khóa: Sổ lệnh bid/ask.")
    expect(messageInfo).not.toHaveBeenCalledWith("Bạn vừa mở khóa: Tin tức & AI Mẫu nến.")
  })

  it("does NOT toast on a fresh mount where task ① is already done (no spurious loading→resolved transition)", async () => {
    routeGet(makeProgress({ task_1_done_at: "2026-07-20T00:00:00Z" }), [], [RAW_POSITION])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SidebarProvider defaultPanel="trading">
          <Cap0Provider>
            <Gbar />
          </Cap0Provider>
        </SidebarProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())
    expect(messageInfo).not.toHaveBeenCalled()
  })
})

// ── Nhiệm vụ ② «Xem tab Nắm giữ» / ③ «Xem tab Theo dõi» ──────────────────────
// `WatchlistPanel` chỉ BÁO "tab đang hiện là X" lên bus; toàn bộ luật có ghi
// nhiệm vụ hay không nằm ở `Gbar`. Backend từ chối (400) một PATCH ②/③ khi ①
// chưa xong, và sự kiện này bắn lại mỗi lần đổi tab, nên cửa chắn phải nằm ở
// client — nếu không mỗi cú gõ tab của người chưa mua gì là một cú 400.
describe("Gbar — nhiệm vụ ②③ hoàn thành bằng việc mở tab trong panel Danh mục", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("★ mở tab Nắm giữ sau khi xong ① → PATCH task 2, không kèm gate", async () => {
    renderGbar(makeProgress({ task_1_done_at: "t" }), { positions: [RAW_POSITION] })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("open-holdings-tab"))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 2 } }),
    )
  })

  it("★ mở tab Theo dõi sau khi xong ① → PATCH task 3, không kèm gate", async () => {
    renderGbar(makeProgress({ task_1_done_at: "t" }), { positions: [RAW_POSITION] })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("open-watchlist-tab"))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 3 } }),
    )
  })

  // ★★ Cửa chắn chính: BE trả 400 cho ②/③ khi ① chưa xong.
  it("★★ KHÔNG PATCH gì khi ① chưa xong — dù user gõ qua lại cả hai tab", async () => {
    renderGbar(makeProgress(), { positions: [RAW_POSITION] })
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("open-holdings-tab"))
    fireEvent.click(screen.getByText("open-watchlist-tab"))

    await new Promise((r) => setTimeout(r, 50))
    expect(patch).not.toHaveBeenCalled()
  })

  it("★ không PATCH lại nhiệm vụ đã xong (idempotent theo server truth)", async () => {
    renderGbar(
      makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
      { positions: [RAW_POSITION] },
    )
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("open-holdings-tab"))
    fireEvent.click(screen.getByText("open-watchlist-tab"))

    await new Promise((r) => setTimeout(r, 50))
    expect(patch).not.toHaveBeenCalled()
  })

  // `progress` chỉ đổi sau khi mutation trả về + query refetch, nên nếu chỉ dựa
  // vào nó thì gõ qua gõ lại giữa hai tab sẽ bắn vài PATCH trùng cho cùng ②.
  it("★ gõ đi gõ lại cùng một tab chỉ PATCH ĐÚNG MỘT lần cho mỗi nhiệm vụ", async () => {
    renderGbar(makeProgress({ task_1_done_at: "t" }), { positions: [RAW_POSITION] })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("open-holdings-tab"))
    fireEvent.click(screen.getByText("open-watchlist-tab"))
    fireEvent.click(screen.getByText("open-holdings-tab"))
    fireEvent.click(screen.getByText("open-watchlist-tab"))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 50))
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it("tab Lịch sử không phải nhiệm vụ nào cả — không PATCH", async () => {
    renderGbar(makeProgress({ task_1_done_at: "t" }), { positions: [RAW_POSITION] })
    await waitFor(() => expect(screen.getByText(TASK4_MSG)).toBeInTheDocument())

    fireEvent.click(screen.getByText("open-history-tab"))

    await new Promise((r) => setTimeout(r, 50))
    expect(patch).not.toHaveBeenCalled()
  })
})
