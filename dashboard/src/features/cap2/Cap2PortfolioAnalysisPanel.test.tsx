import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const { useCap2EventsMock, useCap2ProgressMock, useCap2TradeLogMock, useTradesMock, useScoresMock, useAnalysisMock, analysisPropsMock } = vi.hoisted(() => ({
  useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: true })),
  useCap2ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], scores: [] })),
  useTradesMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: undefined })),
  useScoresMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: undefined })),
  useAnalysisMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: undefined })),
  analysisPropsMock: vi.fn(),
}))

vi.mock("./Cap2Context", () => ({ useCap2Events: () => useCap2EventsMock() }))
vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useCap2Trades: (...a: unknown[]) => useTradesMock(...a),
  useDiemKyLuatHistory: (...a: unknown[]) => useScoresMock(...a),
  useCap2Analysis: (...a: unknown[]) => useAnalysisMock(...a),
}))
vi.mock("./tradeLogCap2", () => ({ useCap2TradeLog: () => useCap2TradeLogMock() }))
vi.mock("./Cap2PortfolioAnalysis", () => ({
  Cap2PortfolioAnalysis: (props: unknown) => {
    analysisPropsMock(props)
    return <div data-testid="cap2-portfolio-analysis-mock" />
  },
}))

import { Cap2PortfolioAnalysisPanel } from "./Cap2PortfolioAnalysisPanel"

describe("Cap2PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap2EventsMock.mockReset()
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: null })
    useCap2TradeLogMock.mockReset()
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores: [] })
    for (const hook of [useTradesMock, useScoresMock, useAnalysisMock]) {
      hook.mockReset()
      hook.mockReturnValue({ data: undefined })
    }
    analysisPropsMock.mockReset()
  })

  it("renders Cap2PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap2PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap2-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("does not revive local trades or scores after successful empty server responses", () => {
    useCap2TradeLogMock.mockReturnValue({
      trades: [{ orderId: "old-account-order" }],
      scores: [{ ngay: "2026-01-01", diem: 90, xepLoai: "xanh" }],
    })
    useTradesMock.mockReturnValue({ data: { trades: [], total: 0 } })
    useScoresMock.mockReturnValue({ data: { scores: [], from_date: "2026-01-01", to_date: "2026-01-31" } })
    render(
      <SidebarProvider>
        <Cap2PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ trades: [], dailyScores: [] }),
    )
  })

  /**
   * ★ Mockup `iqx-cap2-phantich-danhmuc.html` `.hdr` có HAI thứ: nút quay lại
   * bên trái và tiêu đề "Phân tích danh mục" bên phải. `RightSidebar` chỉ vẽ
   * tên panel trong nhánh `md:hidden` ⇒ trên desktop màn này không có tiêu đề
   * nào cả.
   */
  it("★ mockup: header có tiêu đề «Phân tích danh mục» cạnh nút quay lại", () => {
    render(
      <SidebarProvider>
        <Cap2PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("Phân tích danh mục")).toBeInTheDocument()
  })

  it('clicking "← Hành trình" switches the sidebar back to the journey panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="cap2-analysis">
        <Cap2PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
