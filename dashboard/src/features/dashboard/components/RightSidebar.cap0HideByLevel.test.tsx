import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Progressive hide-by-level (spec §8) for the "Tin tức" / "AI Mẫu nến" tabs:
 *  - `RightToolbar` hides the tab BUTTON while in Cấp 0 and not yet
 *    graduated.
 *  - `RightSidebar` also falls back to the Cấp 0 default view (defense in
 *    depth) if `activePanel` somehow still lands on "news"/"patterns" while
 *    hidden.
 *  - A NON-Cap0 regression check: outside Cấp 0, both tabs are always
 *    present, exactly as today.
 *
 * `useCap0Events`/`useCap0Progress` are mocked directly (both components
 * import them from the CONCRETE `@/features/cap0/*` files, not the barrel,
 * to avoid a module cycle — see each component's own comment) — this lets
 * the test control `isCap0Active`/progress without a real Cap0Provider.
 * `cap0Visibility` itself is the REAL implementation (pure logic worth
 * exercising for real, not mocked).
 */

const { useCap0EventsMock, useCap0ProgressMock } = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn(),
  useCap0ProgressMock: vi.fn(),
}))
vi.mock("@/features/cap0/Cap0Context", () => ({
  useCap0Events: () => useCap0EventsMock(),
}))
vi.mock("@/features/cap0/hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))
vi.mock("@/features/cap0/JourneyPanel", () => ({
  JourneyPanel: () => <div data-testid="journey-panel" />,
}))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div data-testid="news-panel" /> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div data-testid="trading-panel" /> }))
vi.mock("@/features/watchlist", () => ({ WatchlistPanel: () => <div data-testid="watchlist-panel" /> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div data-testid="patterns-panel" /> }))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { RightSidebar } from "./RightSidebar"
import { RightToolbar } from "./RightToolbar"

function makeProgress(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    user_id: "2",
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
    ...overrides,
  }
}

function setCap0(isCap0Active: boolean, progress: ReturnType<typeof makeProgress> | null | undefined) {
  useCap0EventsMock.mockReturnValue({ isCap0Active })
  useCap0ProgressMock.mockReturnValue({ data: progress })
}

describe("RightToolbar — hide-by-level (spec §8)", () => {
  it('hides "Tin tức" and "AI Mẫu nến" tab buttons while in Cấp 0, not yet graduated', () => {
    setCap0(true, makeProgress())
    render(
      <SidebarProvider defaultPanel="journey">
        <RightToolbar />
      </SidebarProvider>,
    )
    expect(screen.queryByText("Tin tức")).not.toBeInTheDocument()
    expect(screen.queryByText("AI Mẫu nến")).not.toBeInTheDocument()
    // Untouched tabs still there.
    expect(screen.getByText("Hành trình")).toBeInTheDocument()
    expect(screen.getByText("Đặt lệnh")).toBeInTheDocument()
    expect(screen.getByText("Danh mục")).toBeInTheDocument()
    expect(screen.getByText("AI Phân tích")).toBeInTheDocument()
  })

  it('reveals "Tin tức" and "AI Mẫu nến" once graduated (lên Cấp 1)', () => {
    setCap0(true, makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }))
    render(
      <SidebarProvider defaultPanel="journey">
        <RightToolbar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Tin tức")).toBeInTheDocument()
    expect(screen.getByText("AI Mẫu nến")).toBeInTheDocument()
  })

  it("NON-Cap0 regression: outside Cấp 0, both tabs are always present", () => {
    setCap0(false, undefined)
    render(
      <SidebarProvider defaultPanel="news">
        <RightToolbar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Tin tức")).toBeInTheDocument()
    expect(screen.getByText("AI Mẫu nến")).toBeInTheDocument()
  })
})

describe("RightSidebar — hide-by-level defense-in-depth (spec §8)", () => {
  it('falls back to the Cấp 0 default view if "news" is somehow active while hidden', () => {
    setCap0(true, makeProgress())
    render(
      <SidebarProvider defaultPanel="news">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel")).toBeInTheDocument()
    expect(screen.queryByTestId("news-panel")).not.toBeInTheDocument()
  })

  it('falls back to the Cấp 0 default view if "patterns" is somehow active while hidden', () => {
    setCap0(true, makeProgress())
    render(
      <SidebarProvider defaultPanel="patterns">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel")).toBeInTheDocument()
    expect(screen.queryByTestId("patterns-panel")).not.toBeInTheDocument()
  })

  it("renders the real NewsFeedPanel/AIPatternPanel once graduated", () => {
    setCap0(true, makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }))
    const { unmount } = render(
      <SidebarProvider defaultPanel="news">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("news-panel")).toBeInTheDocument()
    unmount()

    // `SidebarProvider`'s `defaultPanel` only seeds INITIAL state — a
    // `rerender` with a different prop would NOT switch `activePanel` (React
    // preserves state across rerenders), so mount fresh instead.
    render(
      <SidebarProvider defaultPanel="patterns">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("patterns-panel")).toBeInTheDocument()
  })

  it("NON-Cap0 regression: outside Cấp 0, the real News/Patterns panels render exactly as today", () => {
    setCap0(false, undefined)
    render(
      <SidebarProvider defaultPanel="news">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("news-panel")).toBeInTheDocument()
  })

  it("clicking the mobile close button still works alongside the hide-by-level guard", () => {
    setCap0(true, makeProgress())
    render(
      <SidebarProvider defaultPanel="watchlist">
        <RightSidebar />
      </SidebarProvider>,
    )
    // watchlist is unaffected by §8 — renders normally.
    expect(screen.getByTestId("watchlist-panel")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button"))
  })
})
