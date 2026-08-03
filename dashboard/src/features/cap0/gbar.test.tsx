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

/** Simulates the calls `PlanBlock`/`OrderEntry`/`StockHeader` make into the bus. */
function EventTrigger() {
  const events = useCap0Events()
  return (
    <div>
      <button onClick={() => events.onReasonPicked?.("Công ty tôi biết")}>pick-reason</button>
      <button
        onClick={() =>
          events.onOrderFilled?.({ symbol: "VNM", side: "buy", quantity: 100, price: 61800 })
        }
      >
        fill-order
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({ symbol: "VNM", side: "sell", quantity: 100, price: 61800 })
        }
      >
        fill-order-sell
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({ symbol: "HPG", side: "buy", quantity: 100, price: 30000 })
        }
      >
        fill-order-other-symbol
      </button>
      <button onClick={() => events.onStarToggled?.("VNM", true)}>star-toggle</button>
      <button onClick={() => events.onGbarWarn?.()}>warn</button>
      {/* Buy events carrying Kế hoạch sl/tp (nhiệm vụ ①'s preset, or nhiệm vụ
          ⑤'s manually-typed values) — used by the buy→sell debrief tests. */}
      <button
        onClick={() =>
          events.onOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 100,
            price: 61800,
            sl: 58710,
            tp: 67980,
          })
        }
      >
        buy-vnm-with-plan
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 200,
            price: 30000,
            sl: 28500,
            tp: 33000,
          })
        }
      >
        buy-hpg-with-plan
      </button>
      <button
        onClick={() =>
          events.onOrderFilled?.({ symbol: "VNM", side: "sell", quantity: 100, price: 63000 })
        }
      >
        sell-vnm
      </button>
      <button onClick={() => events.onSlTyped?.()}>sl-typed</button>
    </div>
  )
}

function PanelSpy() {
  const { activePanel } = useSidebar()
  return <div data-testid="panel-spy">{activePanel}</div>
}

function renderGbar(progress: Cap0Progress | null) {
  get.mockReturnValue({ json: () => Promise.resolve(progress) })
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

  it('shows the "CẦN LÀM" tag + step 1/3 message on fresh progress', async () => {
    renderGbar(makeProgress())
    await waitFor(() =>
      expect(
        screen.getByText(
          "Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
        ),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText("CẦN LÀM")).toBeInTheDocument()
  })

  it("advances to step 2/3 after a reason is picked", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    expect(
      screen.getByText("Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM"),
    ).toBeInTheDocument()
  })

  it("advances to step 3/3 after the order fills, and toasts the fill confirmation", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order"))
    expect(
      screen.getByText(
        "Bước 3/3 — Mở 👁 Danh mục xem tab Nắm giữ, rồi quay lại Đặt lệnh gắn ★ cạnh VNM",
      ),
    ).toBeInTheDocument()
    expect(messageSuccess).toHaveBeenCalledWith("✓ Khớp lệnh MUA 100 VNM @ 61,800")
  })

  it("ignores a SELL fill (does not advance step 2 → 3)", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order-sell"))
    expect(screen.getByText(/Bước 2\/3/)).toBeInTheDocument()
  })

  it("ignores a fill for a different symbol (does not advance step 2 → 3)", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order-other-symbol"))
    expect(screen.getByText(/Bước 2\/3/)).toBeInTheDocument()
  })

  it("completes the task once all 3 flags land: toasts, PATCHes /cap0/task, hides, and returns to Hành trình", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order"))
    fireEvent.click(screen.getByText("star-toggle"))

    expect(messageSuccess).toHaveBeenCalledWith("★ Đã thêm VNM vào danh mục Theo dõi")
    expect(messageSuccess).toHaveBeenCalledWith(
      "🎉 Nhiệm vụ 1 hoàn thành! Nắm giữ = tiền đang nằm · Theo dõi = mắt đang canh",
    )
    // The reducer's local `TASK_DONE` dispatch hides the bar synchronously;
    // `completeTask.mutate`'s actual PATCH is dispatched by React Query on a
    // microtask, so that assertion needs a `waitFor`.
    expect(screen.queryByText(/Bước/)).not.toBeInTheDocument()
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 1, gate: "star" } }),
    )
  })

  it("shows nhiệm vụ ⑤'s «Bước 1/2» (not nhiệm vụ ①'s bar) once task ① is already done server-side (fresh mount)", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-20T00:00:00Z" }))
    // Nhiệm vụ ① is done — its own 3-step bar is gone...
    await waitFor(() => expect(screen.queryByText(/Bước \d\/3/)).not.toBeInTheDocument())
    // ...but nhiệm vụ ⑤ (spec §4 Chặng 3 / §6) is now active and takes over
    // the SAME `.gbar` slot.
    expect(
      screen.getByText(
        "Bước 1/2 — Tự gõ ngưỡng cắt lỗ vào ô (nhập bằng bàn phím, đây là lời hứa của bạn)",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("CẦN LÀM")).toBeInTheDocument()
  })

  it("wrong action (buy without a reason) flashes warn (red + ⚠ prefix), then reverts to amber after ~1.6s but stays", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderGbar(makeProgress())
    await vi.waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("warn"))
    expect(
      screen.getByText(
        "⚠ Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
      ),
    ).toBeInTheDocument()
    expect(document.querySelector(".cap0-gbar--warn")).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1600)
    })

    expect(
      screen.getByText(
        "Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
      ),
    ).toBeInTheDocument()
    expect(document.querySelector(".cap0-gbar--warn")).toBeNull()
    vi.useRealTimers()
  })
})

describe("Gbar — nhiệm vụ ⑤ 2-step (spec §4 Chặng 3 / §6)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("shows «Bước 1/2» once task ① is done, before the SL field is typed", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() =>
      expect(
        screen.getByText(
          "Bước 1/2 — Tự gõ ngưỡng cắt lỗ vào ô (nhập bằng bàn phím, đây là lời hứa của bạn)",
        ),
      ).toBeInTheDocument(),
    )
  })

  it("the SL-typed bus event (`onSlTyped`) advances «Bước 1/2 → 2/2» instantly (no PATCH round trip needed)", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("sl-typed"))

    expect(
      screen.getByText("Bước 2/2 — Bấm ĐẶT LỆNH MUA để hoàn tất lệnh thứ hai"),
    ).toBeInTheDocument()
  })

  it("a subsequent BUY (nhiệm vụ ⑤'s second order) completes the task and hides the bar", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("sl-typed"))
    expect(screen.getByText(/Bước 2\/2/)).toBeInTheDocument()

    fireEvent.click(screen.getByText("buy-vnm-with-plan"))

    expect(screen.queryByText(/Bước/)).not.toBeInTheDocument()
  })

  it("a BUY completes the task even if the SL field was never typed (order-placed is the sole hide signal)", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("buy-vnm-with-plan"))

    expect(screen.queryByText(/Bước/)).not.toBeInTheDocument()
  })

  it("a BUY before task ① is done does NOT trip nhiệm vụ ⑤'s bar (it's task ①'s own order, tracked separately)", async () => {
    renderGbar(makeProgress())
    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order"))

    // Still task ①'s 3-step bar (step 3/3) — nhiệm vụ ⑤ hasn't started yet.
    expect(screen.getByText(/Bước 3\/3/)).toBeInTheDocument()
  })
})

describe("Gbar — buy → sell opens the Kết sổ debrief (spec §5/§6, nhiệm vụ ⑥)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("a BUY then a SELL opens DebriefModal with the entry price / SL / TP / order #n captured from the buy", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("buy-vnm-with-plan"))
    fireEvent.click(screen.getByText("sell-vnm"))

    // Header "#1" (first debrief this session) + Kế hoạch/Thực tế reconciled
    // against the BUY's captured price (61,800) / sl (58,710 · −5.0%) / tp
    // (67,980 · +10.0%), against the SELL's exit price (63,000).
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText("+120,000 ₫ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.getAllByText("61,800").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("58,710 · −5.0%")).toBeInTheDocument()
    expect(screen.getByText("67,980 · +10.0%")).toBeInTheDocument()
    expect(screen.getByText(/63,000/)).toBeInTheDocument()
  })

  it("buy A, buy B, then sell A → the debrief reconciles against A's captured plan, not B's", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("buy-vnm-with-plan")) // A — VNM, sl 58,710 / tp 67,980
    fireEvent.click(screen.getByText("buy-hpg-with-plan")) // B — HPG, sl 28,500 / tp 33,000
    fireEvent.click(screen.getByText("sell-vnm")) // sell A (VNM)

    expect(screen.getByText(/MUA 100 VNM → BÁN/)).toBeInTheDocument()
    expect(screen.getByText("58,710 · −5.0%")).toBeInTheDocument()
    expect(screen.getByText("67,980 · +10.0%")).toBeInTheDocument()
    // B's (HPG's) figures must NOT leak into A's debrief.
    expect(screen.queryByText(/28,500/)).not.toBeInTheDocument()
    expect(screen.queryByText(/33,000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/30,000/)).not.toBeInTheDocument()
  })
})

// ── Retroactive Kết sổ (nhiệm vụ ⑥ was unreachable — the graduation blocker) ──
// The live `onOrderFilled` sell branch above only fires inside `Cap0Provider`
// (i.e. on `/dau-truong`), and `debriefCountRef`/`lastBuyBySymbolRef` are
// session-local refs. A user who sold from `/bieu-do` or `/co-phieu`, or who
// reloaded before pressing "Đóng kết sổ ✓", could never reach nhiệm vụ ⑥ —
// and since `Cap0Service.graduate` demands 6/6 + both gates, could never
// graduate. `Gbar` now also reconstructs the Kết sổ from SERVER order history.

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

/**
 * Routes the mocked `api.get` by URL: `cap0/progress` → progress,
 * `virtual-trading/orders` → the given filled-order history.
 */
function renderGbarWithHistory(
  progress: Cap0Progress | null,
  orders: Record<string, unknown>[],
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  get.mockImplementation((url: string) => ({
    json: () =>
      Promise.resolve(
        String(url).startsWith("virtual-trading/orders") ? { orders } : progress,
      ),
  }))
  patch.mockReturnValue({
    json: () => Promise.resolve({ ...progress, task_6_done_at: "t", task6_debrief_done: true }),
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

/** Task ① done (so nhiệm vụ ⑤/⑥ are the live stage), nhiệm vụ ⑥ still open. */
function task6Pending(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    task_6_done_at: null,
    task5_sl_typed: true,
    task6_debrief_done: false,
    ...overrides,
  })
}

describe("Gbar — retroactive Kết sổ from order history (nhiệm vụ ⑥ recovery)", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    messageSuccess.mockReset()
    messageInfo.mockReset()
    vi.useRealTimers()
  })

  it("opens the Kết sổ on mount for a user whose round trip ALREADY closed and who never finished ⑥", async () => {
    renderGbarWithHistory(task6Pending(), [RAW_SELL, RAW_BUY])

    await waitFor(() =>
      expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument(),
    )
    // Reconciled against server data: buy 61,800 → sell 63,000, 100 VNM.
    expect(screen.getByText("+120,000 ₫ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.getByText(/63,000/)).toBeInTheDocument()
  })

  it("closing it PATCHes /cap0/task task 6 + the debrief gate — the graduation blocker clears", async () => {
    renderGbarWithHistory(task6Pending(), [RAW_SELL, RAW_BUY])
    await waitFor(() => expect(screen.getByText("Đóng kết sổ ✓")).toBeInTheDocument())

    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", {
        json: { task_no: 6, gate: "debrief" },
      }),
    )
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("does NOT invent an SL/TP it never had — both Thực tế cells read «không ghi nhận»", async () => {
    renderGbarWithHistory(task6Pending(), [RAW_SELL, RAW_BUY])
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())

    expect(screen.getAllByText("không ghi nhận")).toHaveLength(2)
    // Never "0" and never a fabricated threshold verdict.
    expect(screen.queryByText("không chạm")).not.toBeInTheDocument()
    expect(screen.queryByText("chưa tới — bán tay")).not.toBeInTheDocument()
    expect(screen.queryByText(/^0 · /)).not.toBeInTheDocument()
  })

  it("does NOT open for a user who has ALREADY done nhiệm vụ ⑥", async () => {
    renderGbarWithHistory(
      task6Pending({ task_6_done_at: "2026-07-22T00:00:00Z", task6_debrief_done: true }),
      [RAW_SELL, RAW_BUY],
    )
    // Wait for progress to actually land before asserting the absence.
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("does NOT open when the user has never sold (no closed round trip)", async () => {
    renderGbarWithHistory(task6Pending(), [RAW_BUY])
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("does NOT open when order history is empty", async () => {
    renderGbarWithHistory(task6Pending(), [])
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
    renderGbarWithHistory(task6Pending(), [
      rawOrder({ id: "s2", side: "sell", filled_price_vnd: 70000, created_at: "2026-07-24T06:00:00Z" }),
      rawOrder({ id: "b2", side: "buy", filled_price_vnd: 65000, created_at: "2026-07-24T02:00:00Z" }),
      RAW_SELL,
      RAW_BUY,
    ])
    await waitFor(() =>
      expect(screen.getByText("KẾT SỔ LỆNH · #2 · SÂN TẬP")).toBeInTheDocument(),
    )
    // The MOST RECENT round trip: 65,000 → 70,000, not 61,800 → 63,000.
    expect(screen.getByText("+500,000 ₫ · MUA 100 VNM → BÁN")).toBeInTheDocument()
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

  it("a live sell still opens the Kết sổ IMMEDIATELY with its real sl/tp off the bus", async () => {
    // Empty history — nothing for the retro path to find; only the bus fires.
    renderGbarWithHistory(task6Pending(), [])
    await waitFor(() => expect(screen.getByText(/Bước 1\/2|Bước 2\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("buy-vnm-with-plan"))
    fireEvent.click(screen.getByText("sell-vnm"))

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    // Real Kế hoạch values from the buy event — NOT "không ghi nhận".
    expect(screen.getByText("58,710 · −5.0%")).toBeInTheDocument()
    expect(screen.getByText("67,980 · +10.0%")).toBeInTheDocument()
    expect(screen.queryByText("không ghi nhận")).not.toBeInTheDocument()
  })

  it("when the order history refetches AFTER a live sell, the retro path does not replace the live Kết sổ (no double-open for the same sell)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderGbarWithHistory(task6Pending(), [], client)
    await waitFor(() => expect(screen.getByText(/Bước 1\/2|Bước 2\/2/)).toBeInTheDocument())

    fireEvent.click(screen.getByText("buy-vnm-with-plan"))
    fireEvent.click(screen.getByText("sell-vnm"))
    expect(screen.getByText("58,710 · −5.0%")).toBeInTheDocument()

    // Simulate what `usePlaceOrder`'s `onSuccess` does in the real app: the
    // just-filled round trip now appears in server history and every trading
    // query is invalidated.
    get.mockImplementation((url: string) => ({
      json: () =>
        Promise.resolve(
          String(url).startsWith("virtual-trading/orders")
            ? { orders: [RAW_SELL, RAW_BUY] }
            : task6Pending(),
        ),
    }))
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["trading"] })
    })

    // Still the LIVE debrief, with its real Kế hoạch intact.
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText("58,710 · −5.0%")).toBeInTheDocument()
    expect(screen.queryByText("không ghi nhận")).not.toBeInTheDocument()
    expect(screen.getAllByText(/KẾT SỔ LỆNH/)).toHaveLength(1)
  })

  it("#N does not double-count: after a retroactive #2, the next LIVE sell is #3", async () => {
    renderGbarWithHistory(task6Pending(), [
      rawOrder({ id: "s2", side: "sell", filled_price_vnd: 70000, created_at: "2026-07-24T06:00:00Z" }),
      rawOrder({ id: "b2", side: "buy", filled_price_vnd: 65000, created_at: "2026-07-24T02:00:00Z" }),
      RAW_SELL,
      RAW_BUY,
    ])
    await waitFor(() =>
      expect(screen.getByText("KẾT SỔ LỆNH · #2 · SÂN TẬP")).toBeInTheDocument(),
    )

    // Read + close the retro Kết sổ, then close another round trip live.
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("buy-vnm-with-plan"))
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
    get.mockImplementation(() => ({ json: () => Promise.resolve(serverProgress) }))
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

    await waitFor(() => expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument())
    fireEvent.click(screen.getByText("pick-reason"))
    fireEvent.click(screen.getByText("fill-order"))
    fireEvent.click(screen.getByText("star-toggle"))

    await waitFor(() =>
      expect(messageInfo).toHaveBeenCalledWith("Bạn vừa mở khóa: Ô Giá & loại lệnh (LO/MP)."),
    )
    // Not the OTHER pairs — those unlock on different conditions (task ②,
    // graduation) that this scenario never reaches.
    expect(messageInfo).not.toHaveBeenCalledWith("Bạn vừa mở khóa: Sổ lệnh bid/ask.")
    expect(messageInfo).not.toHaveBeenCalledWith("Bạn vừa mở khóa: Tin tức & AI Mẫu nến.")
  })

  it("does NOT toast on a fresh mount where task ① is already done (no spurious loading→resolved transition)", async () => {
    get.mockReturnValue({
      json: () => Promise.resolve(makeProgress({ task_1_done_at: "2026-07-20T00:00:00Z" })),
    })
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

    await waitFor(() => expect(screen.getByText(/Bước 1\/2/)).toBeInTheDocument())
    expect(messageInfo).not.toHaveBeenCalled()
  })
})
