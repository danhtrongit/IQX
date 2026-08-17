import { render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"
import { SymbolProvider } from "@/shared/contexts/symbol-context"

/**
 * ★★ `RightSidebar` là chỗ DUY NHẤT biết cả hai điều cần biết: có shell cấp
 * nào đang mount không (`isCapNActive`), và panel dùng chung nào đang hiện.
 * Nó đã truyền `onRowSelect` cho `WatchlistPanel` vì đúng lý do đó; file này
 * canh hai prop còn lại của `TradingPanel`:
 *
 *  · `symbolLink="none"` — nút mã ở đầu panel Đặt lệnh thôi dẫn ra /co-phieu;
 *  · `onPremiumRequired`  — lỗi Premium thôi tự đá sang /nang-cap.
 *
 * Một dòng ở đây phủ CẢ CHÍN cấp, kể cả các cấp đang tắt sau trần — nên khi
 * mở cấp sau không ai phải nhớ lại. Ngoài shell cấp, cả hai prop phải là giá
 * trị mặc định để /bieu-do & /co-phieu không đổi một hành vi nào.
 */

const capMocks = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: false })),
}))

vi.mock("@/features/cap0/Cap0Context", () => ({
  useCap0Events: () => capMocks.useCap0EventsMock(),
}))
vi.mock("@/features/cap0/hooks", () => ({
  useCap0Progress: (...a: unknown[]) => capMocks.useCap0ProgressMock(...a),
}))
vi.mock("@/features/cap0/JourneyPanel", () => ({
  JourneyPanel: () => <div data-testid="journey-panel-cap0" />,
}))
vi.mock("@/features/cap1/Cap1Context", () => ({
  useCap1Events: () => capMocks.useCap1EventsMock(),
}))
vi.mock("@/features/cap1/JourneyPanelCap1", () => ({
  JourneyPanelCap1: () => <div data-testid="journey-panel-cap1" />,
}))
vi.mock("@/features/cap1/Cap1PortfolioAnalysisPanel", () => ({
  Cap1PortfolioAnalysisPanel: () => <div data-testid="cap1-analysis-panel" />,
}))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div data-testid="news-panel" /> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div data-testid="patterns-panel" /> }))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/features/watchlist", () => ({
  WatchlistPanel: () => <div data-testid="watchlist-panel" />,
}))

/** Stand-in phơi hai prop ra DOM để test đọc được. */
vi.mock("@/features/trading", () => ({
  TradingPanel: ({
    symbolLink,
    onPremiumRequired,
  }: {
    symbolLink?: string
    onPremiumRequired?: () => void
  }) => (
    <div
      data-testid="trading-panel"
      data-symbol-link={symbolLink ?? "(mặc định)"}
      data-has-premium-handler={onPremiumRequired ? "yes" : "no"}
    />
  ),
}))

import { RightSidebar } from "./RightSidebar"

function renderSidebar() {
  return render(
    <SymbolProvider symbol="VNM">
      <SidebarProvider defaultPanel="trading">
        <RightSidebar />
      </SidebarProvider>
    </SymbolProvider>,
  )
}

describe("RightSidebar — TradingPanel không còn là lối ra khỏi trang cấp", () => {
  beforeEach(() => {
    capMocks.useCap0EventsMock.mockReturnValue({ isCap0Active: false })
    capMocks.useCap1EventsMock.mockReturnValue({ isCap1Active: false })
  })

  it('★★ trong Cấp 0: symbolLink="none" + có onPremiumRequired', () => {
    capMocks.useCap0EventsMock.mockReturnValue({ isCap0Active: true })
    renderSidebar()

    const panel = screen.getByTestId("trading-panel")
    expect(panel).toHaveAttribute("data-symbol-link", "none")
    expect(panel).toHaveAttribute("data-has-premium-handler", "yes")
  })

  it("★ trong Cấp 1 (và mọi cấp trên — cùng một sidebar): y hệt", () => {
    capMocks.useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    renderSidebar()

    const panel = screen.getByTestId("trading-panel")
    expect(panel).toHaveAttribute("data-symbol-link", "none")
    expect(panel).toHaveAttribute("data-has-premium-handler", "yes")
  })

  it('★★ ngoài mọi shell cấp: symbolLink="navigate" + KHÔNG handler — /bieu-do & /co-phieu giữ nguyên', () => {
    renderSidebar()

    const panel = screen.getByTestId("trading-panel")
    expect(panel).toHaveAttribute("data-symbol-link", "navigate")
    expect(panel).toHaveAttribute("data-has-premium-handler", "no")
  })
})
