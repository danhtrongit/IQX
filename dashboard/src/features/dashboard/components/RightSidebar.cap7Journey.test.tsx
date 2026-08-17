import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Cấp 7 Task FE3 — `RightSidebar`'s "journey"/"cap7-analysis" panel routing must
 * pick the Cấp 7 views (`JourneyPanelCap7`/`Cap7PortfolioAnalysisPanel`) while
 * `isCap7Active`, and fall through to Cấp 6's/…/Cấp 0's own routing otherwise —
 * mirrors `RightSidebar.cap6Journey.test.tsx`, one level up. A real Cấp 7 session
 * has `isCap1Active`…`isCap6Active` true too (Cấp 7 wraps all seven providers —
 * see `Cap7TradingPage`), so "journey" must check `isCap7Active` FIRST.
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
} = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: false })),
  useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: false })),
  useCap3EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap3Active: false })),
  useCap4EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap4Active: false })),
  useCap5EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap5Active: false })),
  useCap6EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap6Active: false })),
  useCap7EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap7Active: false })),
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

describe("RightSidebar — Cấp 7 journey/analysis panel routing (Cấp 7 Task FE3)", () => {
  it('resolves "journey" to JourneyPanelCap7 while isCap7Active', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    useCap6EventsMock.mockReturnValue({ isCap6Active: true })
    useCap7EventsMock.mockReturnValue({ isCap7Active: true })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap7")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap6")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap5")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap0")).not.toBeInTheDocument()
  })

  it('resolves "journey" to JourneyPanelCap6 when isCap7Active is false (regression check)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    useCap6EventsMock.mockReturnValue({ isCap6Active: true })
    useCap7EventsMock.mockReturnValue({ isCap7Active: false })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap6")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap7")).not.toBeInTheDocument()
  })

  it('resolves "cap7-analysis" to Cap7PortfolioAnalysisPanel while isCap7Active', () => {
    useCap7EventsMock.mockReturnValue({ isCap7Active: true })
    render(
      <SidebarProvider defaultPanel="cap7-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap7-analysis-panel")).toBeInTheDocument()
  })

  it('falls back to Cấp 0\'s JourneyPanel for "cap7-analysis" when isCap7Active is false (defensive)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    useCap6EventsMock.mockReturnValue({ isCap6Active: false })
    useCap7EventsMock.mockReturnValue({ isCap7Active: false })
    render(
      <SidebarProvider defaultPanel="cap7-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("cap7-analysis-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label for "cap7-analysis" is "Phân tích danh mục"', () => {
    useCap7EventsMock.mockReturnValue({ isCap7Active: true })
    render(
      <SidebarProvider defaultPanel="cap7-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })
})
