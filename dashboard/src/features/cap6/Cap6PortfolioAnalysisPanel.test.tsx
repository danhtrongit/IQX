import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const {
  useCap6EventsMock,
  useCap6ProgressMock,
  useCap6TradeLogMock,
  useCap5ProgressMock,
  useCap4ProgressMock,
  useCap3ProgressMock,
  useCap2ProgressMock,
  useCap2TradeLogMock,
  analysisPropsSpy,
} = vi.hoisted(() => ({
  useCap6EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap6Active: true })),
  useCap6ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap6TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], record: vi.fn() })),
  useCap5ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap4ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap3ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], scores: [] })),
  analysisPropsSpy: vi.fn(),
}))

vi.mock("./Cap6Context", () => ({ useCap6Events: () => useCap6EventsMock() }))
vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
}))
vi.mock("./tradeLogCap6", () => ({ useCap6TradeLog: () => useCap6TradeLogMock() }))
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
vi.mock("./Cap6PortfolioAnalysis", () => ({
  Cap6PortfolioAnalysis: (props: Record<string, unknown>) => {
    analysisPropsSpy(props)
    return <div data-testid="cap6-portfolio-analysis-mock" />
  },
}))

import { Cap6PortfolioAnalysisPanel } from "./Cap6PortfolioAnalysisPanel"

describe("Cap6PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap6EventsMock.mockReset()
    useCap6EventsMock.mockReturnValue({ isCap6Active: true })
    useCap6ProgressMock.mockReset()
    useCap6ProgressMock.mockReturnValue({ data: null })
    useCap6TradeLogMock.mockReset()
    useCap6TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
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

  it("renders Cap6PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap6PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap6-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("feeds it the Cấp 6/5/4/3/2 hồ sơ, the Cấp 6 trade log and the shared điểm log", () => {
    const cap6Progress = { id: "p6", so_lenh_doi_chieu: 12 }
    const cap5Progress = { id: "p5", so_lenh_phan_loai: 12 }
    const cap4Progress = { id: "p4", so_lenh_doc_du_5lop: 22 }
    const cap3Progress = { id: "p3", khau_vi: "can_bang" }
    const cap2Progress = { id: "p2" }
    const trades = [{ orderId: "o1", kieuCoPhieu: "ngan_hang" }]
    const scores = [{ ngay: "2026-07-31", diem: 90, xepLoai: "xanh" }]
    useCap6ProgressMock.mockReturnValue({ data: cap6Progress })
    useCap5ProgressMock.mockReturnValue({ data: cap5Progress })
    useCap4ProgressMock.mockReturnValue({ data: cap4Progress })
    useCap3ProgressMock.mockReturnValue({ data: cap3Progress })
    useCap2ProgressMock.mockReturnValue({ data: cap2Progress })
    useCap6TradeLogMock.mockReturnValue({ trades, record: vi.fn() })
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores })

    render(
      <SidebarProvider>
        <Cap6PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
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

  it("does not query anything outside a Cap6Provider", () => {
    useCap6EventsMock.mockReturnValue({ isCap6Active: false })
    render(
      <SidebarProvider>
        <Cap6PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
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
      <SidebarProvider defaultPanel="cap6-analysis">
        <Cap6PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
