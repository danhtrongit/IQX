import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const {
  useCap7EventsMock,
  useCap7ProgressMock,
  useCap7TradeLogMock,
  useCap6ProgressMock,
  useCap5ProgressMock,
  useCap4ProgressMock,
  useCap3ProgressMock,
  useCap2ProgressMock,
  useCap2TradeLogMock,
  analysisPropsSpy,
} = vi.hoisted(() => ({
  useCap7EventsMock: vi.fn(() => ({ isCap7Active: true })),
  useCap7ProgressMock: vi.fn(() => ({ data: null })),
  useCap7TradeLogMock: vi.fn(() => ({ trades: [], record: vi.fn() })),
  useCap6ProgressMock: vi.fn(() => ({ data: null })),
  useCap5ProgressMock: vi.fn(() => ({ data: null })),
  useCap4ProgressMock: vi.fn(() => ({ data: null })),
  useCap3ProgressMock: vi.fn(() => ({ data: null })),
  useCap2ProgressMock: vi.fn(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn(() => ({ trades: [], scores: [] })),
  analysisPropsSpy: vi.fn(),
}))

vi.mock("./Cap7Context", () => ({ useCap7Events: () => useCap7EventsMock() }))
vi.mock("./hooks", () => ({
  useCap7Progress: (...a: unknown[]) => useCap7ProgressMock(...a),
}))
vi.mock("./tradeLogCap7", () => ({ useCap7TradeLog: () => useCap7TradeLogMock() }))
vi.mock("@/features/cap6/hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
}))
vi.mock("@/features/cap5/hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
}))
vi.mock("@/features/cap4/hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
}))
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
}))
vi.mock("@/features/cap2/tradeLogCap2", () => ({
  useCap2TradeLog: () => useCap2TradeLogMock(),
}))
vi.mock("./Cap7PortfolioAnalysis", () => ({
  Cap7PortfolioAnalysis: (props: Record<string, unknown>) => {
    analysisPropsSpy(props)
    return <div data-testid="cap7-portfolio-analysis-mock" />
  },
}))

import { Cap7PortfolioAnalysisPanel } from "./Cap7PortfolioAnalysisPanel"

describe("Cap7PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap7EventsMock.mockReset()
    useCap7EventsMock.mockReturnValue({ isCap7Active: true })
    useCap7ProgressMock.mockReset()
    useCap7ProgressMock.mockReturnValue({ data: null })
    useCap7TradeLogMock.mockReset()
    useCap7TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    useCap6ProgressMock.mockReset()
    useCap6ProgressMock.mockReturnValue({ data: null })
    useCap5ProgressMock.mockReset()
    useCap5ProgressMock.mockReturnValue({ data: null })
    useCap4ProgressMock.mockReset()
    useCap4ProgressMock.mockReturnValue({ data: null })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: null })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: null })
    useCap2TradeLogMock.mockReset()
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores: [] })
    analysisPropsSpy.mockReset()
  })

  it("renders Cap7PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap7PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap7-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("feeds it the Cấp 7/6/5/4/3/2 hồ sơ, the Cấp 7 trade log and the shared điểm log", () => {
    const cap7Progress = { id: "p7", so_lenh_doc_luc: 21 }
    const cap6Progress = { id: "p6", so_lenh_doi_chieu: 12 }
    const cap5Progress = { id: "p5", so_lenh_phan_loai: 12 }
    const cap4Progress = { id: "p4", so_lenh_doc_du_5lop: 22 }
    const cap3Progress = { id: "p3", khau_vi: "can_bang" }
    const cap2Progress = { id: "p2" }
    const trades = [{ orderId: "o1", lucDocUser: "manh" }]
    const scores = [{ ngay: "2026-08-01", diem: 90, xepLoai: "xanh" }]
    useCap7ProgressMock.mockReturnValue({ data: cap7Progress })
    useCap6ProgressMock.mockReturnValue({ data: cap6Progress })
    useCap5ProgressMock.mockReturnValue({ data: cap5Progress })
    useCap4ProgressMock.mockReturnValue({ data: cap4Progress })
    useCap3ProgressMock.mockReturnValue({ data: cap3Progress })
    useCap2ProgressMock.mockReturnValue({ data: cap2Progress })
    useCap7TradeLogMock.mockReturnValue({ trades, record: vi.fn() })
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores })

    render(
      <SidebarProvider>
        <Cap7PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cap7Progress,
        cap6Progress,
        cap5Progress,
        cap4Progress,
        cap3Progress,
        cap2Progress,
        trades,
        dailyScores: scores,
      }),
    )
  })

  it("does not query anything outside a Cap7Provider", () => {
    useCap7EventsMock.mockReturnValue({ isCap7Active: false })
    render(
      <SidebarProvider>
        <Cap7PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(useCap7ProgressMock).toHaveBeenCalledWith(false)
    expect(useCap6ProgressMock).toHaveBeenCalledWith(false)
    expect(useCap5ProgressMock).toHaveBeenCalledWith(false)
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
      <SidebarProvider defaultPanel="cap7-analysis">
        <Cap7PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
