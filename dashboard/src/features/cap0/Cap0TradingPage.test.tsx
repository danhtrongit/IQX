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
const { useCap0ProgressMock, usePremiumStatusMock, enterMutate, placementMutate, completeTaskMutate, graduateMutate, messageInfo, navigateMock } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  // Premium-honest mode fix — `tradingModeFor` now needs `isPremium` too.
  // Default to a free user (the common case) so pre-existing "SÂN TẬP"
  // assertions keep passing without every test needing to opt in; the
  // premium-graduate case is exercised explicitly below.
  usePremiumStatusMock: vi.fn(() => ({ isPremium: false, isLoading: false })),
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
  // `Gbar` (now mounted below the journey bar) calls `useCompleteTask` — a
  // no-op spy is enough here since this file only exercises the Cấp 0 shell,
  // not nhiệm vụ ①'s own behaviour (see `gbar.test.tsx`).
  completeTaskMutate: vi.fn(),
  // `GraduationModal` (now mounted unconditionally alongside PlacementModal)
  // calls `useGraduate` itself — a no-op spy is enough here since this file
  // only exercises the Cấp 0 shell/mode badge, not the modal's own gating/
  // button behaviour (see `graduation.test.tsx`).
  graduateMutate: vi.fn(),
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
// rendering the real toolbar's icons/panels. `RightSidebar`'s stub also
// exposes a button wired to the REAL Cap0 event bus's `onLaunchTour` (T2 —
// `Cap0Context` is NOT mocked in this file) so tests can simulate Journey's
// "Làm ngay →" for task ② without needing the real `JourneyPanel`/sidebar
// panel-switching machinery.
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <RightSidebarStub />,
  RightToolbar: ({ onActionClick }: { onActionClick?: (id: string) => void }) => (
    <button data-testid="right-toolbar" onClick={() => onActionClick?.("ai-insight")}>
      AI Phân tích
    </button>
  ),
}))

function RightSidebarStub() {
  const { onLaunchTour } = useCap0Events()
  return (
    <div data-testid="right-sidebar">
      <button data-testid="launch-bangdien-tour" onClick={() => onLaunchTour?.(2)}>
        launch bảng điện
      </button>
      <button data-testid="launch-bantin-tour" onClick={() => onLaunchTour?.(3)}>
        launch bản tin
      </button>
      <button data-testid="launch-6nguoichoi-tour" onClick={() => onLaunchTour?.(4)}>
        launch 6 người chơi
      </button>
    </div>
  )
}

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

// Premium-honest mode fix — `Cap0TradingPage`'s `ModeBadge` now needs
// `usePremiumStatus()` too (threaded into `tradingModeFor`).
vi.mock("@/features/premium", () => ({
  usePremiumStatus: (...a: unknown[]) => usePremiumStatusMock(...a),
}))

// FE1 hooks — mocked so this test controls progress state without a real
// QueryClient/API.
vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
  useEnterCap0: () => ({ mutate: enterMutate }),
  usePlacement: () => ({ mutate: placementMutate }),
  useCompleteTask: () => ({ mutate: completeTaskMutate }),
  useGraduate: () => ({ mutate: graduateMutate, isPending: false }),
  // `DebriefModal` (mounted via `Gbar`) reads the Cấp 0 kế hoạch row for its
  // `Lý do mua`/`Thời gian giữ` rows — a stub is enough here (the Kết sổ's own
  // behaviour is covered in `debrief.test.tsx`).
  useCap0Kehoach: () => ({ data: null }),
}))

// `Gbar` reads FILLED order history (`useOrders`) to re-open the Kết sổ for a
// round trip that closed off-route or before a reload (nhiệm vụ ⑤ recovery —
// see `retroDebrief.ts`). The real hook calls `useAuth`, which throws outside
// an `AuthProvider` this file deliberately doesn't mount (it mocks `./hooks`
// for the same reason). Empty history = the retro path finds nothing, so the
// Cấp 0 shell assertions below are unaffected; the recovery behaviour itself
// is covered in `gbar.test.tsx`.
vi.mock("@/features/trading/hooks", () => ({
  useOrders: () => ({ data: [] }),
  // `Gbar` also reads the portfolio now — spec v3.0 §6 gates nhiệm vụ ⑤'s
  // reminder on "có lệnh mở nhưng chưa bán".
  usePortfolio: () => ({ data: { positions: [] } }),
}))

// `GraduationModal` (mounted unconditionally inside `Cap0TradingPage`) now
// also calls `useEnterCap1` (Task FE3 — wires "Vào Cấp 1" to actually enter)
// — a no-op spy is enough here since this file only exercises the Cấp 0
// shell, not that button's own behaviour (see `graduation.test.tsx`).
vi.mock("@/features/cap1/hooks", () => ({
  useEnterCap1: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Only stub `Message` (used for the "Đã từng" toast) — keep the real Modal/
// Button so PlacementModal (and the AI Insight symbol-picker modal) render
// faithfully.
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { Cap0TradingPage } from "./Cap0TradingPage"
import { useCap0Events } from "./Cap0Context"

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
  task1_star_clicked: false,
  task5_debrief_done: false,
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
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
    enterMutate.mockReset()
    enterMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    placementMutate.mockReset()
    placementMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    graduateMutate.mockReset()
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

  it('keeps the mode badge on "SÂN TẬP · T+0" once graduated_at is set for a FREE (non-premium) user — premium-honest mode fix: the backend never routes a free user\'s orders through thuc_chien', () => {
    useCap0ProgressMock.mockReturnValue({
      data: { ...fakeProgress, graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
    expect(screen.queryByText("THỰC CHIẾN")).not.toBeInTheDocument()
  })

  it('flips the mode badge to "THỰC CHIẾN" once progress.graduated_at is set AND the user is premium (spec §9)', () => {
    useCap0ProgressMock.mockReturnValue({
      data: { ...fakeProgress, graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    usePremiumStatusMock.mockReturnValue({ isPremium: true, isLoading: false })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.queryByText("SÂN TẬP · T+0")).not.toBeInTheDocument()
  })

  it("shows PlacementModal when the user has no progress yet (first visit) — 3 lựa chọn §3 v3.0", () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("Chào mừng đến Demo Trading của IQX.")).toBeInTheDocument()
    expect(
      screen.getByText("Bạn đã từng mua bán cổ phiếu thật bao giờ chưa?"),
    ).toBeInTheDocument()
    expect(screen.getByTestId("cap0-placement-never")).toHaveTextContent("Chưa bao giờ")
    expect(screen.getByTestId("cap0-placement-unsure")).toHaveTextContent(
      "Có, nhưng chưa tự tin",
    )
    expect(screen.getByTestId("cap0-placement-regular")).toHaveTextContent(
      "Có, giao dịch thường xuyên",
    )
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

  it('clicking "Chưa bao giờ" calls placement(false) + enterCap0() and stays in Cấp 0', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByTestId("cap0-placement-never"))
    expect(placementMutate).toHaveBeenCalledWith(false)
    expect(enterMutate).toHaveBeenCalledTimes(1)
    expect(enterMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    // Người mới hoàn toàn: KHÔNG toast về trần Cấp 1 — họ vốn thuộc Cấp 0.
    expect(messageInfo).not.toHaveBeenCalled()
  })

  // ★ Hai nhánh "đã từng giao dịch" — spec §3 muốn xếp thẳng lên Cấp 1/Cấp 2,
  // nhưng backend chưa có đường vào Cấp 1 (POST /cap1/enter đòi Cấp 0 đã tốt
  // nghiệp), nên FE kẹp trần: vẫn VÀO Cấp 0 (có tài khoản + progress row để
  // làm được nhiệm vụ) và nói thẳng trần hiện tại là Cấp 1. Trước đây nhánh
  // này KHÔNG gọi enterCap0 → user rơi vào ngõ cụt không có progress row.
  for (const [testId, label] of [
    ["cap0-placement-unsure", "Có, nhưng chưa tự tin"],
    ["cap0-placement-regular", "Có, giao dịch thường xuyên"],
  ] as const) {
    it(`clicking "${label}" calls placement(true), DOES enter Cấp 0, and toasts the honest Cấp 1 ceiling`, () => {
      useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
      renderCap0(<Cap0TradingPage />)
      fireEvent.click(screen.getByTestId(testId))
      expect(placementMutate).toHaveBeenCalledWith(true)
      expect(enterMutate).toHaveBeenCalledTimes(1)
      expect(messageInfo).toHaveBeenCalledTimes(1)
      const toast = messageInfo.mock.calls[0][0] as string
      expect(toast).toMatch(/Cấp 1/)
      // ★ Không hứa một Cấp 2 chưa mở.
      expect(toast).not.toMatch(/Cấp\s*[2-8]/)
      // ★ Bài quiz 5 phút đã bị bỏ khỏi v3.0 — đừng hứa lại nó.
      expect(toast).not.toMatch(/xếp lớp/i)
    })
  }

  it('marks placement as locally "seen" after answering, so a re-render (e.g. progress still null while /enter is in flight) does not re-show it', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    const { rerender } = renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByTestId("cap0-placement-never"))
    // Re-render with the SAME (still-null) progress, simulating the window
    // before useEnterCap0's mutation resolves and invalidates the query.
    rerender(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <Cap0TradingPage />
      </MemoryRouter>,
    )
    expect(window.localStorage.getItem("iqx_cap0_placement_seen")).toBe("1")
  })

  for (const testId of [
    "cap0-placement-never",
    "cap0-placement-unsure",
    "cap0-placement-regular",
  ] as const) {
    it(`does NOT mark placement "seen" when the ${testId} mutation FAILS, leaving the modal retryable`, () => {
      useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
      // Simulate a network failure: `enterCap0.mutate` never calls `onSuccess`.
      enterMutate.mockImplementationOnce(
        (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
          opts?.onError?.(new Error("network"))
        },
      )
      renderCap0(<Cap0TradingPage />)
      fireEvent.click(screen.getByTestId(testId))
      expect(window.localStorage.getItem("iqx_cap0_placement_seen")).toBeNull()
      expect(messageInfo).not.toHaveBeenCalled()
      // Modal is still up — the user can retry.
      expect(screen.getByText("Chào mừng đến Demo Trading của IQX.")).toBeInTheDocument()
    })
  }

  it("mounts the real JourneyBar (progress x/5 + next-task copy) in the top bar", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.getByText("CẤP 0 · 0/5")).toBeInTheDocument()
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

  it("restores the previous sidebar panel on unmount (no 'journey' leak into other routes)", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap0TradingPage />
          <PanelSpy />
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
    // Leave Cấp 0 (unmount the page) but keep the shared provider mounted —
    // the panel must fall back to what it was before, not stay "journey".
    rerender(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <PanelSpy />
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId("panel-spy")).not.toHaveTextContent("journey")
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

describe("Cap0TradingPage — Chặng 2 tour host (T2, Journey→tour wiring)", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
    completeTaskMutate.mockReset()
  })

  it('an "onLaunchTour(2)" request (Journey\'s "Làm ngay →" on task ②) starts the Bảng điện tour overlay', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.queryByText("ĐIỂM 1/8")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("launch-bangdien-tour"))
    expect(screen.getByText("ĐIỂM 1/8")).toBeInTheDocument()
  })

  it('completing the Bảng điện tour via "Bỏ qua tour" (skip = complete) calls useCompleteTask with taskNo 2', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByTestId("launch-bangdien-tour"))
    fireEvent.click(screen.getByText("Bỏ qua tour"))
    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 2 })
  })

  it('an "onLaunchTour(4)" request (Journey\'s "Làm ngay →" on task ④) starts the 6-người-chơi tour overlay (6 concept-card steps)', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.queryByText("ĐIỂM 1/6")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("launch-6nguoichoi-tour"))
    expect(screen.getByText("ĐIỂM 1/6")).toBeInTheDocument()
  })

  it('completing the 6-người-chơi tour via "Bỏ qua tour" (skip = complete) calls useCompleteTask with taskNo 4', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByTestId("launch-6nguoichoi-tour"))
    fireEvent.click(screen.getByText("Bỏ qua tour"))
    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 4 })
  })

  it('an "onLaunchTour(3)" request (Journey\'s "Làm ngay →" on task ③) starts the Bản tin tour overlay (concept-card steps)', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    expect(screen.queryByText("ĐIỂM 1/5")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("launch-bantin-tour"))
    expect(screen.getByText("ĐIỂM 1/5")).toBeInTheDocument()
  })

  it('completing the Bản tin tour via "Bỏ qua tour" (skip = complete) calls useCompleteTask with taskNo 3', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    renderCap0(<Cap0TradingPage />)
    fireEvent.click(screen.getByTestId("launch-bantin-tour"))
    fireEvent.click(screen.getByText("Bỏ qua tour"))
    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 3 })
  })
})

describe("Cap0TradingPage smoke", () => {
  it("mounts without crashing when progress is null", () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    const { container } = renderCap0(<Cap0TradingPage />)
    expect(within(container).getByTestId("center-panel")).toBeInTheDocument()
  })
})
