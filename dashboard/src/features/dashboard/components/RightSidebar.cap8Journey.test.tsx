import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Cấp 8 Task FE3 — `RightSidebar`'s "journey"/"cap8-analysis" panel routing must
 * pick the Cấp 8 views (`JourneyPanelCap8`/`Cap8PortfolioAnalysisPanel`) while
 * `isCap8Active`, and fall through to Cấp 7's/…/Cấp 0's own routing otherwise —
 * mirrors `RightSidebar.cap7Journey.test.tsx`, one level up. A real Cấp 8 session
 * has `isCap1Active`…`isCap7Active` true too (Cấp 8 wraps all EIGHT providers —
 * see `Cap8TradingPage`), so "journey" must check `isCap8Active` FIRST.
 */

const {
  useCap0EventsMock,
  useCap0ProgressMock,
  useCap1EventsMock,
  useCap2EventsMock,
  useCap3EventsMock,
  useCap4EventsMock,
  useCap5EventsMock,
  useCap6EventsMock,
  useCap7EventsMock,
  useCap8EventsMock,
} = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn(() => ({ data: null })),
  useCap1EventsMock: vi.fn(() => ({ isCap1Active: false })),
  useCap2EventsMock: vi.fn(() => ({ isCap2Active: false })),
  useCap3EventsMock: vi.fn(() => ({ isCap3Active: false })),
  useCap4EventsMock: vi.fn(() => ({ isCap4Active: false })),
  useCap5EventsMock: vi.fn(() => ({ isCap5Active: false })),
  useCap6EventsMock: vi.fn(() => ({ isCap6Active: false })),
  useCap7EventsMock: vi.fn(() => ({ isCap7Active: false })),
  useCap8EventsMock: vi.fn(() => ({ isCap8Active: false })),
}))

vi.mock("@/features/cap0/Cap0Context", () => ({ useCap0Events: () => useCap0EventsMock() }))
vi.mock("@/features/cap0/hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))
vi.mock("@/features/cap0/JourneyPanel", () => ({
  JourneyPanel: () => <div data-testid="journey-panel-cap0" />,
}))
vi.mock("@/features/cap1/Cap1Context", () => ({ useCap1Events: () => useCap1EventsMock() }))
vi.mock("@/features/cap1/JourneyPanelCap1", () => ({
  JourneyPanelCap1: () => <div data-testid="journey-panel-cap1" />,
}))
vi.mock("@/features/cap1/Cap1PortfolioAnalysisPanel", () => ({
  Cap1PortfolioAnalysisPanel: () => <div data-testid="cap1-analysis-panel" />,
}))
vi.mock("@/features/cap2/Cap2Context", () => ({ useCap2Events: () => useCap2EventsMock() }))
vi.mock("@/features/cap2/JourneyPanelCap2", () => ({
  JourneyPanelCap2: () => <div data-testid="journey-panel-cap2" />,
}))
vi.mock("@/features/cap2/Cap2PortfolioAnalysisPanel", () => ({
  Cap2PortfolioAnalysisPanel: () => <div data-testid="cap2-analysis-panel" />,
}))
vi.mock("@/features/cap3/Cap3Context", () => ({ useCap3Events: () => useCap3EventsMock() }))
vi.mock("@/features/cap3/JourneyPanelCap3", () => ({
  JourneyPanelCap3: () => <div data-testid="journey-panel-cap3" />,
}))
vi.mock("@/features/cap3/Cap3PortfolioAnalysisPanel", () => ({
  Cap3PortfolioAnalysisPanel: () => <div data-testid="cap3-analysis-panel" />,
}))
vi.mock("@/features/cap4/Cap4Context", () => ({ useCap4Events: () => useCap4EventsMock() }))
vi.mock("@/features/cap4/JourneyPanelCap4", () => ({
  JourneyPanelCap4: () => <div data-testid="journey-panel-cap4" />,
}))
vi.mock("@/features/cap4/Cap4PortfolioAnalysisPanel", () => ({
  Cap4PortfolioAnalysisPanel: () => <div data-testid="cap4-analysis-panel" />,
}))
vi.mock("@/features/cap5/Cap5Context", () => ({ useCap5Events: () => useCap5EventsMock() }))
vi.mock("@/features/cap5/JourneyPanelCap5", () => ({
  JourneyPanelCap5: () => <div data-testid="journey-panel-cap5" />,
}))
vi.mock("@/features/cap5/Cap5PortfolioAnalysisPanel", () => ({
  Cap5PortfolioAnalysisPanel: () => <div data-testid="cap5-analysis-panel" />,
}))
vi.mock("@/features/cap6/Cap6Context", () => ({ useCap6Events: () => useCap6EventsMock() }))
vi.mock("@/features/cap6/JourneyPanelCap6", () => ({
  JourneyPanelCap6: () => <div data-testid="journey-panel-cap6" />,
}))
vi.mock("@/features/cap6/Cap6PortfolioAnalysisPanel", () => ({
  Cap6PortfolioAnalysisPanel: () => <div data-testid="cap6-analysis-panel" />,
}))
vi.mock("@/features/cap7/Cap7Context", () => ({ useCap7Events: () => useCap7EventsMock() }))
vi.mock("@/features/cap7/JourneyPanelCap7", () => ({
  JourneyPanelCap7: () => <div data-testid="journey-panel-cap7" />,
}))
vi.mock("@/features/cap7/Cap7PortfolioAnalysisPanel", () => ({
  Cap7PortfolioAnalysisPanel: () => <div data-testid="cap7-analysis-panel" />,
}))
vi.mock("@/features/cap8/Cap8Context", () => ({ useCap8Events: () => useCap8EventsMock() }))
vi.mock("@/features/cap8/JourneyPanelCap8", () => ({
  JourneyPanelCap8: () => <div data-testid="journey-panel-cap8" />,
}))
vi.mock("@/features/cap8/Cap8PortfolioAnalysisPanel", () => ({
  Cap8PortfolioAnalysisPanel: () => <div data-testid="cap8-analysis-panel" />,
}))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div data-testid="news-panel" /> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div data-testid="trading-panel" /> }))
vi.mock("@/features/watchlist", () => ({
  WatchlistPanel: () => <div data-testid="watchlist-panel" />,
}))
vi.mock("@/features/patterns", () => ({
  AIPatternPanel: () => <div data-testid="patterns-panel" />,
}))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { RightSidebar } from "./RightSidebar"

/** A REAL Cấp 8 session: every lower bus is active too (cộng dồn). */
function allBusesActive(cap8: boolean) {
  useCap1EventsMock.mockReturnValue({ isCap1Active: true })
  useCap2EventsMock.mockReturnValue({ isCap2Active: true })
  useCap3EventsMock.mockReturnValue({ isCap3Active: true })
  useCap4EventsMock.mockReturnValue({ isCap4Active: true })
  useCap5EventsMock.mockReturnValue({ isCap5Active: true })
  useCap6EventsMock.mockReturnValue({ isCap6Active: true })
  useCap7EventsMock.mockReturnValue({ isCap7Active: true })
  useCap8EventsMock.mockReturnValue({ isCap8Active: cap8 })
}

describe("RightSidebar — Cấp 8 journey/analysis panel routing (Cấp 8 Task FE3)", () => {
  it('resolves "journey" to JourneyPanelCap8 while isCap8Active', () => {
    allBusesActive(true)
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap8")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap7")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap6")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap0")).not.toBeInTheDocument()
  })

  // ★ The ONLY thing that varies between this and the test above is
  // `isCap8Active` — every lower bus stays true, exactly as in a real session.
  it('resolves "journey" to JourneyPanelCap7 when isCap8Active is false (regression check)', () => {
    allBusesActive(false)
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap7")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap8")).not.toBeInTheDocument()
  })

  it('resolves "cap8-analysis" to Cap8PortfolioAnalysisPanel while isCap8Active', () => {
    allBusesActive(true)
    render(
      <SidebarProvider defaultPanel="cap8-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap8-analysis-panel")).toBeInTheDocument()
    expect(screen.queryByTestId("cap7-analysis-panel")).not.toBeInTheDocument()
  })

  it('falls back to Cấp 0\'s JourneyPanel for "cap8-analysis" when isCap8Active is false (defensive)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    useCap6EventsMock.mockReturnValue({ isCap6Active: false })
    useCap7EventsMock.mockReturnValue({ isCap7Active: false })
    useCap8EventsMock.mockReturnValue({ isCap8Active: false })
    render(
      <SidebarProvider defaultPanel="cap8-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("cap8-analysis-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label for "cap8-analysis" is "Phân tích danh mục"', () => {
    allBusesActive(true)
    render(
      <SidebarProvider defaultPanel="cap8-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })
})
