import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Task FE3 — `RightSidebar`'s "journey"/"cap1-analysis" panel routing must
 * pick the Cấp 1 views (`JourneyPanelCap1`/`Cap1PortfolioAnalysisPanel`)
 * instead of Cấp 0's `JourneyPanel` while `isCap1Active`, and fall back to
 * Cấp 0's `JourneyPanel` otherwise (both when outside any level provider AND
 * — defensively — for the "cap1-analysis" panel landing active outside Cấp 1).
 *
 * `useCap0Events`/`useCap0Progress` (untouched cap0 wiring) are mocked the
 * same way `RightSidebar.cap0HideByLevel.test.tsx` does; `useCap1Events` is
 * mocked directly (both components import from the CONCRETE
 * `@/features/cap1/Cap1Context`, not the barrel, to avoid a module cycle).
 */

const { useCap0EventsMock, useCap0ProgressMock, useCap1EventsMock } = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn(() => ({ data: null })),
  useCap1EventsMock: vi.fn(() => ({ isCap1Active: false })),
}))

vi.mock("@/features/cap0/Cap0Context", () => ({ useCap0Events: () => useCap0EventsMock() }))
vi.mock("@/features/cap0/hooks", () => ({ useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a) }))
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
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div data-testid="news-panel" /> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div data-testid="trading-panel" /> }))
vi.mock("@/features/watchlist", () => ({ WatchlistPanel: () => <div data-testid="watchlist-panel" /> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div data-testid="patterns-panel" /> }))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { RightSidebar } from "./RightSidebar"

describe("RightSidebar — Cấp 1 journey/analysis panel routing (Task FE3)", () => {
  it('resolves "journey" to JourneyPanelCap1 while isCap1Active', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap1")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap0")).not.toBeInTheDocument()
  })

  it('resolves "journey" to Cấp 0\'s JourneyPanel when isCap1Active is false (regression check)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap1")).not.toBeInTheDocument()
  })

  it('resolves "cap1-analysis" to Cap1PortfolioAnalysisPanel while isCap1Active', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    render(
      <SidebarProvider defaultPanel="cap1-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap1-analysis-panel")).toBeInTheDocument()
  })

  it('falls back to Cấp 0\'s JourneyPanel for "cap1-analysis" when isCap1Active is false (defensive)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    render(
      <SidebarProvider defaultPanel="cap1-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("cap1-analysis-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label for "cap1-analysis" is "Phân tích danh mục"', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    render(
      <SidebarProvider defaultPanel="cap1-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })
})
