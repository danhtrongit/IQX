import { render, screen, fireEvent, within } from "@testing-library/react"
import React, { useEffect, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Spies referenced from inside `vi.mock` factories MUST go through
// `vi.hoisted` (see the same pattern in `Cap0TradingPage.test.tsx`).
const { useCap0ProgressMock, usePremiumStatusMock } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  // Premium-honest mode fix — `JourneyPanel`'s level-card `ModeBadge` now
  // needs `usePremiumStatus()` too (threaded into `tradingModeFor`). Default
  // to a free user so the many pre-existing "SÂN TẬP" tests below keep
  // passing without opting in; the premium-graduate case is exercised
  // explicitly.
  usePremiumStatusMock: vi.fn(() => ({ isPremium: false, isLoading: false })),
}))

vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))

// The other 4 sidebar-right panels are the EXISTING, untouched features —
// stub them so `RightSidebar`'s tests below only exercise panel *routing*
// (does "journey" resolve to JourneyPanel without breaking the other 4?),
// not their real implementations.
vi.mock("@/features/news", () => ({
  NewsFeedPanel: () => <div data-testid="news-panel" />,
}))
vi.mock("@/features/trading", () => ({
  TradingPanel: () => <div data-testid="trading-panel" />,
}))
vi.mock("@/features/watchlist", () => ({
  WatchlistPanel: () => <div data-testid="watchlist-panel" />,
}))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="premium-gate">{children}</div>
  ),
  usePremiumStatus: (...a: unknown[]) => usePremiumStatusMock(...a),
}))
vi.mock("@/features/patterns", () => ({
  AIPatternPanel: () => <div data-testid="patterns-panel" />,
}))

import { JourneyPanel } from "./JourneyPanel"
import { JourneyBar } from "./JourneyBar"
import { RightSidebar } from "@/features/dashboard/components/RightSidebar"
import { RightToolbar } from "@/features/dashboard/components/RightToolbar"
import { Cap0Provider, useCap0Events } from "./Cap0Context"

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

/** Renders the current `activePanel` so tests can assert `setActivePanel` calls. */
function PanelSpy() {
  const { activePanel } = useSidebar()
  return <div data-testid="panel-spy">{activePanel}</div>
}

/** Registers a spy as the Cap0 event bus's `onLaunchTour` handler — mirrors
 *  how `Cap0TradingPage` registers the real tour-launch dispatch, so tests
 *  can assert `JourneyPanel`'s "Làm ngay →" calls `onLaunchTour(no)` for
 *  Chặng 2 tasks instead of `setActivePanel("trading")`. */
function LaunchTourSpy({ onLaunch }: { onLaunch: (taskNo: number) => void }) {
  const { registerHandlers } = useCap0Events()
  useEffect(() => {
    registerHandlers({ onLaunchTour: onLaunch })
  }, [registerHandlers, onLaunch])
  return null
}

describe("JourneyPanel", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
  })

  it("renders the level card — CẤP 0 / NHẬP MÔN / italic lesson / mode badge", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0")).toBeInTheDocument()
    expect(screen.getByText("NHẬP MÔN")).toBeInTheDocument()
    expect(
      screen.getByText('"Hiểu sân chơi, và đi trọn vòng đời một lệnh."'),
    ).toBeInTheDocument()
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
  })

  it('keeps "SÂN TẬP · T+0" once graduated_at is set for a FREE (non-premium) user — premium-honest mode fix', () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
    expect(screen.queryByText("THỰC CHIẾN")).not.toBeInTheDocument()
  })

  it('shows "THỰC CHIẾN" instead once graduated_at is set AND the user is premium (spec §9 mode switch)', () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    usePremiumStatusMock.mockReturnValue({ isPremium: true, isLoading: false })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.queryByText("SÂN TẬP · T+0")).not.toBeInTheDocument()
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 1 · 0/6" with fresh progress', () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 1 · 0/6")).toBeInTheDocument()
  })

  it("renders all 6 task names verbatim", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("Lệnh đầu tiên + Nắm giữ + Theo dõi")).toBeInTheDocument()
    expect(screen.getByText("Tour bảng điện — 8 điểm")).toBeInTheDocument()
    expect(screen.getByText("Tour bản tin thị trường")).toBeInTheDocument()
    expect(screen.getByText('Tour "6 người chơi" trên mã của bạn')).toBeInTheDocument()
    expect(screen.getByText("Lệnh thứ hai — tự đặt ngưỡng cắt lỗ")).toBeInTheDocument()
    expect(screen.getByText("Bán một lệnh — kết sổ đầu tiên")).toBeInTheDocument()
  })

  it("① is active (description + «Làm ngay →») at 0/6; ②③④ are locked with no «Làm ngay» button", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(within(screen.getByTestId("cap0-task-1")).getByText("Làm ngay →")).toBeInTheDocument()
    for (const no of [2, 3, 4]) {
      const item = screen.getByTestId(`cap0-task-${no}`)
      expect(item.className).toContain("cap0-checklist-item--locked")
      expect(within(item).queryByText("Làm ngay →")).not.toBeInTheDocument()
    }
    // ⑤/⑥ aren't reachable yet either (① not done) — only ① has a button.
    expect(screen.getAllByText("Làm ngay →")).toHaveLength(1)
  })

  it("once ① is done: header 1/6, ① done (✓, no button), ②③④ become active (independent, T2), ⑤ becomes active too", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 1 · 1/6")).toBeInTheDocument()

    const task1 = screen.getByTestId("cap0-task-1")
    expect(task1.className).toContain("cap0-checklist-item--done")
    expect(within(task1).getByText("✓")).toBeInTheDocument()
    expect(within(task1).queryByText("Làm ngay →")).not.toBeInTheDocument()

    // ②③④ (Chặng 2 tours) — independent of each other, any order (T2).
    for (const no of [2, 3, 4]) {
      const item = screen.getByTestId(`cap0-task-${no}`)
      expect(item.className).toContain("cap0-checklist-item--active")
      expect(within(item).getByText("Làm ngay →")).toBeInTheDocument()
    }

    const task5 = screen.getByTestId("cap0-task-5")
    expect(task5.className).toContain("cap0-checklist-item--active")
    expect(within(task5).getByText("Làm ngay →")).toBeInTheDocument()
  })

  it("② is done (✓, no button) once task_2_done_at is set, independent of ③④'s own state", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "2026-07-21T01:00:00Z",
        task_2_done_at: "2026-07-21T02:00:00Z",
      }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const task2 = screen.getByTestId("cap0-task-2")
    expect(task2.className).toContain("cap0-checklist-item--done")
    expect(within(task2).getByText("✓")).toBeInTheDocument()
    expect(within(task2).queryByText("Làm ngay →")).not.toBeInTheDocument()

    // ③④ stay active (not blocked by ② being done, not yet done themselves).
    for (const no of [3, 4]) {
      const item = screen.getByTestId(`cap0-task-${no}`)
      expect(item.className).toContain("cap0-checklist-item--active")
    }
  })

  it('clicking «Làm ngay →» on task ② calls onLaunchTour(2) instead of switching to the trading panel', () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    const onLaunch = vi.fn()
    render(
      <SidebarProvider>
        <Cap0Provider>
          <JourneyPanel />
          <LaunchTourSpy onLaunch={onLaunch} />
        </Cap0Provider>
        <PanelSpy />
      </SidebarProvider>,
    )
    const task2 = screen.getByTestId("cap0-task-2")
    fireEvent.click(within(task2).getByText("Làm ngay →"))
    expect(onLaunch).toHaveBeenCalledWith(2)
    expect(screen.getByTestId("panel-spy")).not.toHaveTextContent("trading")
  })

  it('clicking «Làm ngay →» switches the sidebar to the trading panel', () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("shows the graduation goal box copy", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText(/tốt nghiệp/)).toBeInTheDocument()
    expect(screen.getByText(/Thực chiến/)).toBeInTheDocument()
  })
})

describe("JourneyBar", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
  })

  it("shows «CẤP 0 · 0/6» + the 0/6 copy on fresh progress", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 0/6")).toBeInTheDocument()
    expect(screen.getByText("Lệnh đầu tiên của bạn")).toBeInTheDocument()
  })

  it("shows the 1/6 copy once ① is done", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 1/6")).toBeInTheDocument()
    expect(
      screen.getByText("✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"),
    ).toBeInTheDocument()
  })

  it("shows the 6/6 graduation copy when all 6 tasks are done", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task_5_done_at: "t",
        task_6_done_at: "t",
      }),
    })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 6/6")).toBeInTheDocument()
    expect(screen.getByText("🎓 Hoàn thành Cấp 0!")).toBeInTheDocument()
  })

  it('clicking the bar calls setActivePanel("journey")', () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider defaultPanel="trading">
        <JourneyBar />
        <PanelSpy />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
    fireEvent.click(screen.getByTitle("Bấm để mở Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })

  it("renders 6 progress dots", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(container.querySelectorAll(".cap0-jd")).toHaveLength(6)
  })
})

describe("RightSidebar — journey panel wired in without breaking the existing 4 panels", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
  })

  it('resolves "journey" to JourneyPanel (and not any other panel)', () => {
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 1 · 0/6")).toBeInTheDocument()
    expect(screen.queryByTestId("news-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("trading-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("watchlist-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("patterns-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label shows "Hành trình" for the journey panel (panelNames complete)', () => {
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Hành trình")).toBeInTheDocument()
  })

  it.each([
    ["news", "Tin tức", "news-panel"],
    ["trading", "Đặt lệnh", "trading-panel"],
    ["watchlist", "Danh mục", "watchlist-panel"],
    ["patterns", "AI Mẫu nến", "patterns-panel"],
  ] as const)(
    'the existing "%s" panel still resolves after adding journey (label %s)',
    (panel, label, testId) => {
      render(
        <SidebarProvider defaultPanel={panel}>
          <RightSidebar />
        </SidebarProvider>,
      )
      expect(screen.getByTestId(testId)).toBeInTheDocument()
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    },
  )
})

describe("RightToolbar — journey prepended", () => {
  it('shows "Hành trình" and clicking it activates the journey panel', () => {
    render(
      <SidebarProvider defaultPanel="trading">
        <RightToolbar />
        <PanelSpy />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
    fireEvent.click(screen.getByText("Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
