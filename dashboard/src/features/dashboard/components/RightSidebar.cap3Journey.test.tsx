import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Cấp 3 Task FE3 — `RightSidebar`'s "journey"/"cap3-analysis" panel routing
 * must pick the Cấp 3 views (`JourneyPanelCap3`/`Cap3PortfolioAnalysisPanel`)
 * while `isCap3Active`, and fall through to Cấp 2's/Cấp 1's/Cấp 0's own
 * routing otherwise — mirrors `RightSidebar.cap2Journey.test.tsx`, one level
 * up. A real Cấp 3 session has `isCap1Active` AND `isCap2Active` true too
 * (Cấp 3 wraps all three providers — see `Cap3TradingPage`), so "journey"
 * must check `isCap3Active` FIRST.
 */

const {
  useCap0EventsMock,
  useCap0ProgressMock,
  useCap1EventsMock,
  useCap2EventsMock,
  useCap3EventsMock,
} = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: false })),
  useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: false })),
  useCap3EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap3Active: false })),
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

describe("RightSidebar — Cấp 3 journey/analysis panel routing (Cấp 3 Task FE3)", () => {
  it('resolves "journey" to JourneyPanelCap3 while isCap3Active', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap3")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap2")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap1")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap0")).not.toBeInTheDocument()
  })

  it('resolves "journey" to JourneyPanelCap2 when isCap3Active is false (regression check)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap2")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap3")).not.toBeInTheDocument()
  })

  it('resolves "cap3-analysis" to Cap3PortfolioAnalysisPanel while isCap3Active', () => {
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    render(
      <SidebarProvider defaultPanel="cap3-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap3-analysis-panel")).toBeInTheDocument()
  })

  it('falls back to Cấp 0\'s JourneyPanel for "cap3-analysis" when isCap3Active is false (defensive)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    render(
      <SidebarProvider defaultPanel="cap3-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("cap3-analysis-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label for "cap3-analysis" is "Phân tích danh mục"', () => {
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    render(
      <SidebarProvider defaultPanel="cap3-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })
})
