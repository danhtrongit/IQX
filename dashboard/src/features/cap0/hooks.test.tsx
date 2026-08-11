import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Same pattern as `gbar.test.tsx` — mock the ky client only (NOT `./hooks`
// itself), so `useCompleteTask` is the REAL hook: this file is the one place
// that tests its `onSuccess` auto-tab centralization directly, independent of
// any particular UI call site (`Gbar`/①, `TradingPanel`/⑤, `DebriefModal`/⑥).
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

import { useCap0Kehoach, useCompleteTask } from "./hooks"

function Harness() {
  const completeTask = useCompleteTask()
  return (
    <button onClick={() => completeTask.mutate({ taskNo: 4, gate: "debrief" })}>complete</button>
  )
}

function PanelSpy() {
  const { activePanel } = useSidebar()
  return <div data-testid="panel-spy">{activePanel}</div>
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider defaultPanel="trading">
        <Harness />
        <PanelSpy />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

function makeTaskResponse() {
  return {
    json: () =>
      Promise.resolve({
        id: "1",
        user_id: "2",
        entered_at: "2026-07-21T00:00:00Z",
        virtual_balance_init: 250_000_000,
        task_1_done_at: "t",
        task_2_done_at: null,
        task_3_done_at: null,
        task_4_done_at: "t",
        task4_debrief_done: true,
        graduated_at: null,
        time_to_graduate_hours: null,
      }),
  }
}

// ── useCompleteTask auto-tab (spec §7) ──────────────────────────────────────
describe("useCompleteTask", () => {
  const originalPathname = window.location.pathname

  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  afterEach(() => {
    window.history.pushState({}, "", originalPathname)
  })

  it('switches the sidebar to "journey" once any task completes while still on /dau-truong (moment thưởng, KHÔNG confetti)', async () => {
    window.history.pushState({}, "", "/dau-truong")
    patch.mockReturnValue(makeTaskResponse())

    renderHarness()
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")

    fireEvent.click(screen.getByText("complete"))

    await waitFor(() => expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey"))
    expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 4, gate: "debrief" } })
  })

  // Regression for the cross-terminal leak: `Cap0TradingPage` sets
  // `activePanel="journey"` on mount and RESTORES the previous panel on
  // unmount — but `useMutation`'s config-level `onSuccess` fires even after
  // the calling component has unmounted. If the user fires a task PATCH
  // (e.g. closing the Kết sổ for nhiệm vụ ④) then immediately navigates away from
  // `/dau-truong` before it resolves, the in-flight `onSuccess` must NOT
  // clobber the sidebar back to "journey" — otherwise the Cấp 0 panel leaks
  // into the shared `/bieu-do` & `/co-phieu` terminals (the `SidebarProvider`
  // is a single app-root singleton). Simulate exactly that: pathname is no
  // longer "/dau-truong" (as if `Cap0TradingPage` already unmounted and
  // restored the prior panel) by the time the PATCH resolves.
  it('does NOT switch the sidebar to "journey" when the task PATCH resolves after the user has left /dau-truong', async () => {
    window.history.pushState({}, "", "/co-phieu/VCB")
    patch.mockReturnValue(makeTaskResponse())

    renderHarness()
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")

    fireEvent.click(screen.getByText("complete"))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 4, gate: "debrief" } }))
    // Give the mutation's onSuccess a tick to run, then assert the panel was
    // left alone — still "trading", never clobbered to "journey".
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })
})

// ── useCap0Kehoach — the REAL `enabled` guard ───────────────────────────────
/**
 * ★ This is the file that can actually test the guard. `debrief.test.tsx` mocks
 * `./hooks` wholesale, so its "does not query while the modal is closed" test
 * only ever observed what `DebriefModal` passed DOWN — it would have passed
 * unchanged if the hook fetched unconditionally. Here the hook is real and only
 * the ky client is mocked, so "no request" means no request.
 */
describe("useCap0Kehoach — the enabled guard", () => {
  function KehoachHarness({ orderId }: { orderId: string | null }) {
    const { data } = useCap0Kehoach(orderId)
    return <div data-testid="chip">{data?.ly_do_label ?? "none"}</div>
  }

  function renderKehoach(orderId: string | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <KehoachHarness orderId={orderId} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    get.mockReset()
    get.mockReturnValue({
      json: () => Promise.resolve({ ly_do_label: "Thử cho biết", so_phien_giu: 0 }),
    })
  })

  it("★ issues NO request at all when there is no order key (modal closed)", async () => {
    renderKehoach(null)
    // Give TanStack Query every chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByTestId("chip")).toHaveTextContent("none")
  })

  it("fetches `GET /cap0/kehoach?order_id=` once an order key is supplied", async () => {
    renderKehoach("buy-order-1")
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("cap0/kehoach", {
        searchParams: { order_id: "buy-order-1" },
      }),
    )
    await waitFor(() => expect(screen.getByTestId("chip")).toHaveTextContent("Thử cho biết"))
  })
})
