import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const {
  useCap3EventsMock,
  useCap3ProgressMock,
  useCap3TradeLogMock,
  useCap2ProgressMock,
  useCap2TradeLogMock,
  analysisPropsSpy,
} = vi.hoisted(() => ({
  useCap3EventsMock: vi.fn(() => ({ isCap3Active: true })),
  useCap3ProgressMock: vi.fn(() => ({ data: null })),
  useCap3TradeLogMock: vi.fn(() => ({ trades: [], record: vi.fn() })),
  useCap2ProgressMock: vi.fn(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn(() => ({ trades: [], scores: [] })),
  analysisPropsSpy: vi.fn(),
}))

vi.mock("./Cap3Context", () => ({ useCap3Events: () => useCap3EventsMock() }))
vi.mock("./hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
}))
vi.mock("./tradeLogCap3", () => ({ useCap3TradeLog: () => useCap3TradeLogMock() }))
vi.mock("@/features/cap2/hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
}))
vi.mock("@/features/cap2/tradeLogCap2", () => ({
  useCap2TradeLog: () => useCap2TradeLogMock(),
}))
vi.mock("./Cap3PortfolioAnalysis", () => ({
  Cap3PortfolioAnalysis: (props: Record<string, unknown>) => {
    analysisPropsSpy(props)
    return <div data-testid="cap3-portfolio-analysis-mock" />
  },
}))

import { Cap3PortfolioAnalysisPanel } from "./Cap3PortfolioAnalysisPanel"

describe("Cap3PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap3EventsMock.mockReset()
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: null })
    useCap3TradeLogMock.mockReset()
    useCap3TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: null })
    useCap2TradeLogMock.mockReset()
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores: [] })
    analysisPropsSpy.mockReset()
  })

  it("renders Cap3PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap3PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap3-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("feeds it the Cấp 3 hồ sơ, the Cấp 2 hồ sơ, the Cấp 3 trade log and the shared điểm log", () => {
    const cap3Progress = { id: "p3", khau_vi: "can_bang" }
    const cap2Progress = { id: "p2" }
    const trades = [{ orderId: "o1" }]
    const scores = [{ ngay: "2026-07-29", diem: 90, xepLoai: "xanh" }]
    useCap3ProgressMock.mockReturnValue({ data: cap3Progress })
    useCap2ProgressMock.mockReturnValue({ data: cap2Progress })
    useCap3TradeLogMock.mockReturnValue({ trades, record: vi.fn() })
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores })

    render(
      <SidebarProvider>
        <Cap3PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cap3Progress,
        cap2Progress,
        trades,
        dailyScores: scores,
      }),
    )
  })

  it("does not query anything outside a Cap3Provider", () => {
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    render(
      <SidebarProvider>
        <Cap3PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(useCap3ProgressMock).toHaveBeenCalledWith(false)
    expect(useCap2ProgressMock).toHaveBeenCalledWith(false)
  })

  it('clicking "← Hành trình" switches the sidebar back to the journey panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="cap3-analysis">
        <Cap3PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
