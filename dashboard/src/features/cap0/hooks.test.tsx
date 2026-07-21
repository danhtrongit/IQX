import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

import { useCompleteTask } from "./hooks"

function Harness() {
  const completeTask = useCompleteTask()
  return (
    <button onClick={() => completeTask.mutate({ taskNo: 6, gate: "debrief" })}>complete</button>
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

// ── useCompleteTask auto-tab (spec §7) ──────────────────────────────────────
describe("useCompleteTask", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  it('switches the sidebar to "journey" once any task completes (moment thưởng, KHÔNG confetti)', async () => {
    patch.mockReturnValue({
      json: () =>
        Promise.resolve({
          id: "1",
          user_id: "2",
          entered_at: "2026-07-21T00:00:00Z",
          virtual_balance_init: 250_000_000,
          task_1_done_at: "t",
          task_2_done_at: null,
          task_3_done_at: null,
          task_4_done_at: null,
          task_5_done_at: null,
          task_6_done_at: "t",
          task1_star_clicked: true,
          task5_sl_typed: false,
          task6_debrief_done: true,
          graduated_at: null,
          time_to_graduate_hours: null,
        }),
    })

    renderHarness()
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")

    fireEvent.click(screen.getByText("complete"))

    await waitFor(() => expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey"))
    expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 6, gate: "debrief" } })
  })
})
