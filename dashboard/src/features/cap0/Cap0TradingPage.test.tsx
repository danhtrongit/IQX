import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Spies referenced from inside `vi.mock` factories MUST go through
// `vi.hoisted` — `vi.mock` calls are hoisted above ALL other statements
// (including plain top-level `const`s), so a factory closing over a plain
// `const` can hit a TDZ ReferenceError at mock-invocation time.
const { useCap0ProgressMock, enterMutate, placementMutate, messageInfo, navigateMock } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  // Mirror react-query's real `mutate(variables, options)` shape: by default,
  // synchronously invoke the caller's `onSuccess` (the "happy path" a normal
  // mutation resolves to) so existing synchronous assertions keep working.
  // Individual tests override this with `mockImplementationOnce` to exercise
  // the failure path (no `onSuccess` call).
  enterMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  placementMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  messageInfo: vi.fn(),
  navigateMock: vi.fn(),
}))

// Spy on `useNavigate` (AI Insight symbol picker → `/co-phieu/:symbol`) while
// keeping the REAL `MemoryRouter`/routing primitives, since Arco's `Modal`
// doesn't unmount its content synchronously on close (it animates), so
// asserting "the modal closed" via DOM absence is flaky — asserting the
// navigation call is the reliable signal.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

// Terminal children (CenterPanel/RightSidebar/RightToolbar) are the EXISTING,
// untouched dashboard components — stub them so this test only exercises the
// Cap0 shell (chrome + placement modal + mode badge + wiring), not the real
// terminal. `RightToolbar`'s stub still forwards `onActionClick` so the "AI
// Phân tích" wiring (FE2 review Important #2) can be exercised without
// rendering the real toolbar's icons/panels.
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <div data-testid="right-sidebar" />,
  RightToolbar: ({ onActionClick }: { onActionClick?: (id: string) => void }) => (
    <button data-testid="right-toolbar" onClick={() => onActionClick?.("ai-insight")}>
      AI Phân tích
    </button>
  ),
}))

// App chrome (Header/MarketBar/Footer/TrialBanner) is the EXISTING, untouched
// `DashboardPage` chrome — stub it here too (each depends on its own
// auth/premium/theme context not set up in this file; that chrome's own
// behaviour is covered by `features/navigation`'s own tests, e.g.
// `Header.test.tsx`). This test only asserts Cap0TradingPage actually RENDERS
// it (FE2 review Important #1 — chrome must surround the terminal).
vi.mock("@/features/navigation", () => ({
  TrialBanner: () => <div data-testid="trial-banner" />,
  Header: () => <div data-testid="header" />,
  MarketBar: () => <div data-testid="market-bar" />,
  Footer: () => <div data-testid="footer" />,
}))

// FE1 hooks — mocked so this test controls progress state without a real
// QueryClient/API.
vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
  useEnterCap0: () => ({ mutate: enterMutate }),
  usePlacement: () => ({ mutate: placementMutate }),
}))

// Only stub `Message` (used for the "Đã từng" toast) — keep the real Modal/
// Button so PlacementModal (and the AI Insight symbol-picker modal) render
// faithfully.
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { Cap0TradingPage } from "./Cap0TradingPage"

const fakeProgress: Cap0Progress = {
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
}

// `Cap0TradingPage` now calls `useNavigate()` (AI Insight symbol picker →
// `/co-phieu/:symbol`), which requires a Router context — wrap every render
// the same way `Header.test.tsx` does.
function renderCap0(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

describe("Cap0TradingPage", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    enterMutate.mockReset()
    enterMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    placementMutate.mockReset()
    placementMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    messageInfo.mockReset()
    navigateMock.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as DashboardPage (TrialBanner/Header/MarketBar/Footer)", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the mode badge "SÂN TẬP · T+0"', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
  })

  it("shows PlacementModal when the user has no progress yet (first visit)", () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("Chào mừng đến Demo Trading của IQX.")).toBeInTheDocument()
    expect(screen.getByText("Bạn đã từng mua cổ phiếu chưa?")).toBeInTheDocument()
    expect(screen.getByText("Chưa từng")).toBeInTheDocument()
    expect(screen.getByText("Bắt đầu từ Cấp 0 «Nhập môn»")).toBeInTheDocument()
    expect(screen.getByText("Đã từng")).toBeInTheDocument()
    expect(screen.getByText("Làm bài xếp lớp 5 phút")).toBeInTheDocument()
  })

  it("does NOT show PlacementModal once the user already has Cấp 0 progress", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.queryByText("Chào mừng đến Demo Trading của IQX.")).not.toBeInTheDocument()
  })

  it("does NOT show PlacementModal while progress is still loading", () => {
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    renderCap0(<Cap0TradingPage />)
    expect(screen.queryByText("Chào mừng đến Demo Trading của IQX.")).not.toBeInTheDocument()
  })

  it('clicking "Chưa từng" calls placement(false) + enterCap0() and stays in Cấp 0', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Chưa từng"))
    expect(placementMutate).toHaveBeenCalledWith(false)
    expect(enterMutate).toHaveBeenCalledTimes(1)
    expect(enterMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('clicking "Đã từng" calls placement(true) but does NOT enter Cấp 0, shows a toast', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Đã từng"))
    expect(placementMutate).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterMutate).not.toHaveBeenCalled()
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("xếp lớp"))
  })

  it('marks placement as locally "seen" after answering, so a re-render (e.g. progress still null while /enter is in flight) does not re-show it', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    const { rerender } = renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Chưa từng"))
    // Re-render with the SAME (still-null) progress, simulating the window
    // before useEnterCap0's mutation resolves and invalidates the query.
    rerender(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <Cap0TradingPage />
      </MemoryRouter>,
    )
    expect(window.localStorage.getItem("iqx_cap0_placement_seen")).toBe("1")
  })

  it('does NOT mark placement "seen" when the "Chưa từng" mutation FAILS, leaving the modal retryable', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    // Simulate a network failure: `enterCap0.mutate` never calls `onSuccess`.
    enterMutate.mockImplementationOnce(
      (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error("network"))
      },
    )
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Chưa từng"))
    expect(window.localStorage.getItem("iqx_cap0_placement_seen")).toBeNull()
    // Modal is still up — the user can retry.
    expect(screen.getByText("Chào mừng đến Demo Trading của IQX.")).toBeInTheDocument()
  })

  it('does NOT mark placement "seen" (and does NOT toast) when the "Đã từng" mutation FAILS', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    placementMutate.mockImplementationOnce(
      (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error("network"))
      },
    )
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Đã từng"))
    expect(window.localStorage.getItem("iqx_cap0_placement_seen")).toBeNull()
    expect(messageInfo).not.toHaveBeenCalled()
    expect(screen.getByText("Chào mừng đến Demo Trading của IQX.")).toBeInTheDocument()
  })

  it("mounts the real JourneyBar (progress x/6 + next-task copy) in the top bar", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("CẤP 0 · 0/6")).toBeInTheDocument()
    expect(screen.getByTitle("Bấm để mở Hành trình")).toBeInTheDocument()
  })

  it("defaults the sidebar to the journey panel on mount (overrides the app-root 'news' default)", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap0TradingPage />
          <PanelSpy />
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })

  it('clicking "AI Phân tích" in the toolbar opens the AI Insight symbol-picker modal (not a no-op)', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()
  })

  it('submitting a valid symbol from the AI Insight picker navigates to /co-phieu/:symbol', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByTestId("right-toolbar"))
    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VCB")
  })
})

describe("Cap0TradingPage smoke", () => {
  it("mounts without crashing when progress is null", () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    const { container } = renderCap0(<Cap0TradingPage />)
    expect(within(container).getByTestId("center-panel")).toBeInTheDocument()
  })
})
