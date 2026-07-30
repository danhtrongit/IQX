import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const {
  useCap4EventsMock,
  useCap4ProgressMock,
  useCap4TradeLogMock,
  useCap3ProgressMock,
  useCap2ProgressMock,
  useCap2TradeLogMock,
  analysisPropsSpy,
} = vi.hoisted(() => ({
  useCap4EventsMock: vi.fn(() => ({ isCap4Active: true })),
  useCap4ProgressMock: vi.fn(() => ({ data: null })),
  useCap4TradeLogMock: vi.fn(() => ({ trades: [], record: vi.fn() })),
  useCap3ProgressMock: vi.fn(() => ({ data: null })),
  useCap2ProgressMock: vi.fn(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn(() => ({ trades: [], scores: [] })),
  analysisPropsSpy: vi.fn(),
}))

vi.mock("./Cap4Context", () => ({ useCap4Events: () => useCap4EventsMock() }))
vi.mock("./hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
}))
vi.mock("./tradeLogCap4", () => ({ useCap4TradeLog: () => useCap4TradeLogMock() }))
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
}))
vi.mock("@/features/cap2/tradeLogCap2", () => ({
  useCap2TradeLog: () => useCap2TradeLogMock(),
}))
vi.mock("./Cap4PortfolioAnalysis", () => ({
  Cap4PortfolioAnalysis: (props: Record<string, unknown>) => {
    analysisPropsSpy(props)
    return <div data-testid="cap4-portfolio-analysis-mock" />
  },
}))

import { Cap4PortfolioAnalysisPanel } from "./Cap4PortfolioAnalysisPanel"

describe("Cap4PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap4EventsMock.mockReset()
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
    useCap4ProgressMock.mockReset()
    useCap4ProgressMock.mockReturnValue({ data: null })
    useCap4TradeLogMock.mockReset()
    useCap4TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: null })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: null })
    useCap2TradeLogMock.mockReset()
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores: [] })
    analysisPropsSpy.mockReset()
  })

  it("renders Cap4PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap4PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap4-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("feeds it the Cấp 4/3/2 hồ sơ, the Cấp 4 trade log and the shared điểm log", () => {
    const cap4Progress = { id: "p4", so_lenh_doc_du_5lop: 12 }
    const cap3Progress = { id: "p3", khau_vi: "can_bang" }
    const cap2Progress = { id: "p2" }
    const trades = [{ orderId: "o1" }]
    const scores = [{ ngay: "2026-07-29", diem: 90, xepLoai: "xanh" }]
    useCap4ProgressMock.mockReturnValue({ data: cap4Progress })
    useCap3ProgressMock.mockReturnValue({ data: cap3Progress })
    useCap2ProgressMock.mockReturnValue({ data: cap2Progress })
    useCap4TradeLogMock.mockReturnValue({ trades, record: vi.fn() })
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores })

    render(
      <SidebarProvider>
        <Cap4PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cap4Progress,
        cap3Progress,
        cap2Progress,
        trades,
        dailyScores: scores,
      }),
    )
  })

  it("does not query anything outside a Cap4Provider", () => {
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    render(
      <SidebarProvider>
        <Cap4PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(useCap4ProgressMock).toHaveBeenCalledWith(false)
    expect(useCap3ProgressMock).toHaveBeenCalledWith(false)
    expect(useCap2ProgressMock).toHaveBeenCalledWith(false)
  })

  it('clicking "← Hành trình" switches the sidebar back to the journey panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="cap4-analysis">
        <Cap4PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
