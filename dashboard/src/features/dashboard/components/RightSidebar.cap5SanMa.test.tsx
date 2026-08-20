import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * ★★ Cấp 5 «Săn mã» — panel MỚI `"cap5-sanma"` phải gác theo cấp: chỉ render
 * `SanMaPanel` khi `isCap5Active`, ngoài Cấp 5 rơi về nhánh phòng thủ. Và panel
 * `"watchlist"` DÙNG CHUNG phải giữ NGUYÊN `WatchlistPanel` cũ ở MỌI cấp —
 * nhiệm vụ ③ của Cấp 0 («Xem tab Theo dõi») treo trên đúng component đó.
 *
 * Khung mock sao lại từ `RightSidebar.cap5Journey.test.tsx`.
 *
 * (nguyên bản: Cấp 5 Task FE3 — `RightSidebar`'s "journey"/"cap5-analysis" panel routing must
 * pick the Cấp 5 views (`JourneyPanelCap5`/`Cap5PortfolioAnalysisPanel`) while
 * `isCap5Active`, and fall through to Cấp 4's/…/Cấp 0's own routing otherwise —
 * mirrors `RightSidebar.cap4Journey.test.tsx`, one level up. A real Cấp 5 session
 * has `isCap1Active`…`isCap4Active` true too (Cấp 5 wraps all five providers —
 * see `Cap5TradingPage`), so "journey" must check `isCap5Active` FIRST.
 */

const {
  useCap0EventsMock,
  useCap0ProgressMock,
  useCap1EventsMock,
  useCap2EventsMock,
  useCap3EventsMock,
  useCap4EventsMock,
  useCap5EventsMock,
} = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: false })),
  useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: false })),
  useCap3EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap3Active: false })),
  useCap4EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap4Active: false })),
  useCap5EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap5Active: false })),
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
vi.mock("@/features/cap5/SanMaPanel", () => ({
  SanMaPanel: () => <div data-testid="cap5-sanma-panel" />,
}))
vi.mock("@/features/cap5/Cap5WatchlistPanel", () => ({
  Cap5WatchlistPanel: () => <div data-testid="cap5-watchlist-panel" />,
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

function renderPanel(panel: "cap5-sanma" | "cap5-watchlist" | "watchlist") {
  return render(
    <SidebarProvider defaultPanel={panel}>
      <RightSidebar />
    </SidebarProvider>,
  )
}

describe("RightSidebar — panel «Săn mã» của Cấp 5 gác theo cấp", () => {
  it('"cap5-sanma" → SanMaPanel khi isCap5Active', () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderPanel("cap5-sanma")
    expect(screen.getByTestId("cap5-sanma-panel")).toBeInTheDocument()
  })

  it('★ "cap5-sanma" ngoài Cấp 5 KHÔNG render màn Săn mã (phòng thủ)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    renderPanel("cap5-sanma")
    expect(screen.queryByTestId("cap5-sanma-panel")).not.toBeInTheDocument()
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
  })

  it('nhãn header mobile của "cap5-sanma" là "Săn mã"', () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderPanel("cap5-sanma")
    expect(screen.getByText("Săn mã")).toBeInTheDocument()
  })
})

describe("RightSidebar — panel «Danh mục» DÙNG CHUNG không bị Cấp 5 đụng vào", () => {
  it("★ TRONG Cấp 5, \"watchlist\" vẫn là `WatchlistPanel` cũ (nhiệm vụ ③ Cấp 0 an toàn)", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderPanel("watchlist")
    expect(screen.getByTestId("watchlist-panel")).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-sanma-panel")).not.toBeInTheDocument()
  })

  it("★ NGOÀI Cấp 5, \"watchlist\" vẫn là `WatchlistPanel` cũ", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    renderPanel("watchlist")
    expect(screen.getByTestId("watchlist-panel")).toBeInTheDocument()
  })
})

describe("RightSidebar — panel «Watchlist» Cấp 5 gác theo cấp (spec §6)", () => {
  it('"cap5-watchlist" → Cap5WatchlistPanel khi isCap5Active', () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderPanel("cap5-watchlist")
    expect(screen.getByTestId("cap5-watchlist-panel")).toBeInTheDocument()
  })

  it('★ "cap5-watchlist" ngoài Cấp 5 KHÔNG render Watchlist Cấp 5 (phòng thủ)', () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    renderPanel("cap5-watchlist")
    expect(screen.queryByTestId("cap5-watchlist-panel")).not.toBeInTheDocument()
    expect(screen.getByTestId("journey-panel-cap0")).toBeInTheDocument()
  })

  it("★ Watchlist Cấp 5 và «Danh mục» dùng chung là HAI panel khác nhau", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderPanel("cap5-watchlist")
    expect(screen.queryByTestId("watchlist-panel")).not.toBeInTheDocument()
  })
})
