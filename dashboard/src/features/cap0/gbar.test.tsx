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

// Spy on `Message.success` (the 3 spec §4 toasts) while keeping everything
// else in the library real.
const { messageSuccess } = vi.hoisted(() => ({ messageSuccess: vi.fn() }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, success: messageSuccess } }
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
    expect(messageSuccess).toHaveBeenCalledWith("✓ Khớp lệnh MUA 100 VNM @ 61.800")
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

  it("renders nothing once task ① is already done server-side (fresh mount)", async () => {
    renderGbar(makeProgress({ task_1_done_at: "2026-07-20T00:00:00Z" }))
    await waitFor(() => expect(screen.queryByText(/Bước/)).not.toBeInTheDocument())
    expect(screen.queryByText("CẦN LÀM")).not.toBeInTheDocument()
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
