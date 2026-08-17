import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Cấp 4 Task FE3 — `RightSidebar`'s "journey"/"cap4-analysis" panel routing
 * must pick the Cấp 4 views (`JourneyPanelCap4`/`Cap4PortfolioAnalysisPanel`)
 * while `isCap4Active`, and fall through to Cấp 3's/Cấp 2's/Cấp 1's/Cấp 0's own
 * routing otherwise — mirrors `RightSidebar.cap3Journey.test.tsx`, one level up.
 * A real Cấp 4 session has `isCap1Active`/`isCap2Active`/`isCap3Active` true too
 * (Cấp 4 wraps all four providers — see `Cap4TradingPage`), so "journey" must
 * check `isCap4Active` FIRST.
 */

const {
  useCap0EventsMock,
  useCap0ProgressMock,
  useCap1EventsMock,
  useCap2EventsMock,
  useCap3EventsMock,
  useCap4EventsMock,
} = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: false })),
  useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: false })),
  useCap3EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap3Active: false })),
  useCap4EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap4Active: false })),
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

describe("RightSidebar — Cấp 4 journey/analysis panel routing (Cấp 4 Task FE3)", () => {
  it('resolves "journey" to JourneyPanelCap4 while isCap4Active', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap4")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap3")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap2")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap1")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap0")).not.toBeInTheDocument()
  })

  it('resolves "journey" to JourneyPanelCap3 when isCap4Active is false (regression check)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap3")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap4")).not.toBeInTheDocument()
  })

  it('resolves "cap4-analysis" to Cap4PortfolioAnalysisPanel while isCap4Active', () => {
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
    render(
      <SidebarProvider defaultPanel="cap4-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap4-analysis-panel")).toBeInTheDocument()
  })

  it('falls back to Cấp 0\'s JourneyPanel for "cap4-analysis" when isCap4Active is false (defensive)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    render(
      <SidebarProvider defaultPanel="cap4-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("cap4-analysis-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label for "cap4-analysis" is "Phân tích danh mục"', () => {
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
    render(
      <SidebarProvider defaultPanel="cap4-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })
})
