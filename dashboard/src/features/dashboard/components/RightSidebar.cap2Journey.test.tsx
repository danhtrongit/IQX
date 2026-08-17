import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * Task FE4 — `RightSidebar`'s "journey"/"cap2-analysis" panel routing must
 * pick the Cấp 2 views (`JourneyPanelCap2`/`Cap2PortfolioAnalysisPanel`)
 * instead of Cấp 1's/Cấp 0's while `isCap2Active`, and fall through to Cấp
 * 1's/Cấp 0's own routing otherwise — mirrors
 * `RightSidebar.cap1Journey.test.tsx`, one level up. A real Cấp 2 session
 * also has `isCap1Active` true (Cấp 2 reuses Cấp 1's Form Kế hoạch, wraps
 * BOTH providers — see `Cap2TradingPage`), so "journey"/"cap2-analysis" must
 * check `isCap2Active` FIRST.
 */

const { useCap0EventsMock, useCap0ProgressMock, useCap1EventsMock, useCap2EventsMock } = vi.hoisted(
  () => ({
    useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
    useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
    useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: false })),
    useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: false })),
  }),
)

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
vi.mock("@/features/cap2/Cap2Context", () => ({ useCap2Events: () => useCap2EventsMock() }))
vi.mock("@/features/cap2/JourneyPanelCap2", () => ({
  JourneyPanelCap2: () => <div data-testid="journey-panel-cap2" />,
}))
vi.mock("@/features/cap2/Cap2PortfolioAnalysisPanel", () => ({
  Cap2PortfolioAnalysisPanel: () => <div data-testid="cap2-analysis-panel" />,
}))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div data-testid="news-panel" /> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div data-testid="trading-panel" /> }))
vi.mock("@/features/watchlist", () => ({ WatchlistPanel: () => <div data-testid="watchlist-panel" /> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div data-testid="patterns-panel" /> }))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { RightSidebar } from "./RightSidebar"

describe("RightSidebar — Cấp 2 journey/analysis panel routing (Task FE4)", () => {
  it('resolves "journey" to JourneyPanelCap2 while isCap2Active', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap2")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap1")).not.toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap0")).not.toBeInTheDocument()
  })

  it('resolves "journey" to JourneyPanelCap1 when isCap2Active is false (regression check)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap1")).toBeInTheDocument()
    expect(screen.queryByTestId("journey-panel-cap2")).not.toBeInTheDocument()
  })

  it('resolves "cap2-analysis" to Cap2PortfolioAnalysisPanel while isCap2Active', () => {
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    render(
      <SidebarProvider defaultPanel="cap2-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap2-analysis-panel")).toBeInTheDocument()
  })

  it('falls back to Cấp 0\'s JourneyPanel for "cap2-analysis" when isCap2Active is false (defensive)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    render(
      <SidebarProvider defaultPanel="cap2-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
    expect(screen.queryByTestId("cap2-analysis-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label for "cap2-analysis" is "Phân tích danh mục"', () => {
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    render(
      <SidebarProvider defaultPanel="cap2-analysis">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })
})
