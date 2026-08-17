import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"

/**
 * ★★ Bấm vào một mã trong panel "Danh mục" KHÔNG được rời khỏi `/dau-truong`.
 *
 * `WatchlistPanel`'s default row action navigates to `/co-phieu/:symbol`. Đúng
 * trên /bieu-do và /co-phieu; bên trong một trang cấp nó ném người dùng ra khỏi
 * terminal giữa lúc đang làm nhiệm vụ — và ra khỏi `Cap0Provider`, nên lệnh kế
 * tiếp của họ bắn vào bus no-op (đúng lỗi mà `retroDebrief.ts` phải đi vá).
 *
 * `RightSidebar` là chỗ duy nhất biết cả hai điều cần biết: có shell cấp nào
 * đang mount không (`isCapNActive`) và mã của terminal đổi bằng cách nào
 * (`SymbolProvider`). Nên nó truyền `onRowSelect` — và CHỈ khi có shell cấp.
 * Ngoài đó prop là `undefined` và panel giữ nguyên navigation cũ.
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
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div data-testid="trading-panel" /> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div data-testid="patterns-panel" /> }))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

/**
 * Stand-in for the real panel: reports whether it was handed `onRowSelect` at
 * all, and lets a test fire a row click through whichever path is wired.
 */
vi.mock("@/features/watchlist", () => ({
  WatchlistPanel: ({ onRowSelect }: { onRowSelect?: (symbol: string) => void }) => (
    <div data-testid="watchlist-panel" data-has-rowselect={onRowSelect ? "yes" : "no"}>
      <button type="button" onClick={() => onRowSelect?.("HPG")}>
        row HPG
      </button>
    </div>
  ),
}))

import { RightSidebar } from "./RightSidebar"

/** Renders the terminal's current symbol so a row click can be observed. */
function SymbolSpy() {
  const { symbol } = useSymbol()
  return <div data-testid="symbol-spy">{symbol}</div>
}

function renderSidebar() {
  return render(
    <SymbolProvider symbol="VNM">
      <SidebarProvider defaultPanel="watchlist">
        <RightSidebar />
        <SymbolSpy />
      </SidebarProvider>
    </SymbolProvider>,
  )
}

describe("RightSidebar — row click inside a level shell switches the symbol instead of navigating", () => {
  beforeEach(() => {
    capMocks.useCap0EventsMock.mockReturnValue({ isCap0Active: false })
    capMocks.useCap1EventsMock.mockReturnValue({ isCap1Active: false })
  })

  it("★★ inside Cấp 0: passes onRowSelect, and clicking a row switches the terminal's symbol", () => {
    capMocks.useCap0EventsMock.mockReturnValue({ isCap0Active: true })
    renderSidebar()

    expect(screen.getByTestId("watchlist-panel")).toHaveAttribute("data-has-rowselect", "yes")
    expect(screen.getByTestId("symbol-spy")).toHaveTextContent("VNM")

    fireEvent.click(screen.getByText("row HPG"))

    expect(screen.getByTestId("symbol-spy")).toHaveTextContent("HPG")
  })

  // Cấp 1 (và mọi cấp trên) dùng CHUNG sidebar này, và cùng bị đúng lỗi đó.
  it("★ inside Cấp 1: same treatment", () => {
    capMocks.useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    renderSidebar()

    expect(screen.getByTestId("watchlist-panel")).toHaveAttribute("data-has-rowselect", "yes")
    fireEvent.click(screen.getByText("row HPG"))
    expect(screen.getByTestId("symbol-spy")).toHaveTextContent("HPG")
  })

  // ★★ Mặt còn lại: /bieu-do và /co-phieu KHÔNG có shell cấp nào, và ở đó
  // `onRowSelect` phải vắng mặt hoàn toàn để panel giữ nguyên navigation cũ.
  it("★★ outside every level shell: passes NO onRowSelect — /bieu-do & /co-phieu keep navigating", () => {
    renderSidebar()

    expect(screen.getByTestId("watchlist-panel")).toHaveAttribute("data-has-rowselect", "no")
    fireEvent.click(screen.getByText("row HPG"))
    expect(screen.getByTestId("symbol-spy")).toHaveTextContent("VNM")
  })
})
