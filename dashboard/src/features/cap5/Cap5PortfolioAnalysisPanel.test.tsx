import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const {
  useCap5EventsMock,
  useCap5ProgressMock,
  useCap5TradeLogMock,
  useCap4ProgressMock,
  useCap3ProgressMock,
  useCap2ProgressMock,
  useCap2TradeLogMock,
  analysisPropsSpy,
} = vi.hoisted(() => ({
  useCap5EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap5Active: true })),
  useCap5ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap5TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], record: vi.fn() })),
  useCap4ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap3ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], scores: [] })),
  analysisPropsSpy: vi.fn(),
}))

vi.mock("./Cap5Context", () => ({ useCap5Events: () => useCap5EventsMock() }))
vi.mock("./hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
}))
vi.mock("./tradeLogCap5", () => ({ useCap5TradeLog: () => useCap5TradeLogMock() }))
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
vi.mock("./Cap5PortfolioAnalysis", () => ({
  Cap5PortfolioAnalysis: (props: Record<string, unknown>) => {
    analysisPropsSpy(props)
    return <div data-testid="cap5-portfolio-analysis-mock" />
  },
}))

import { Cap5PortfolioAnalysisPanel } from "./Cap5PortfolioAnalysisPanel"

describe("Cap5PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap5EventsMock.mockReset()
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    useCap5ProgressMock.mockReset()
    useCap5ProgressMock.mockReturnValue({ data: null })
    useCap5TradeLogMock.mockReset()
    useCap5TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
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

  it("renders Cap5PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap5PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap5-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("feeds it the Cấp 5/4/3/2 hồ sơ, the Cấp 5 trade log and the shared điểm log", () => {
    const cap5Progress = { id: "p5", so_lenh_phan_loai: 12, ty_le_quyet_dinh_dung: 66 }
    const cap4Progress = { id: "p4", so_lenh_doc_du_5lop: 22 }
    const cap3Progress = { id: "p3", khau_vi: "can_bang" }
    const cap2Progress = { id: "p2" }
    const trades = [{ orderId: "o1", o4: "dung_thang" }]
    const scores = [{ ngay: "2026-07-31", diem: 90, xepLoai: "xanh" }]
    useCap5ProgressMock.mockReturnValue({ data: cap5Progress })
    useCap4ProgressMock.mockReturnValue({ data: cap4Progress })
    useCap3ProgressMock.mockReturnValue({ data: cap3Progress })
    useCap2ProgressMock.mockReturnValue({ data: cap2Progress })
    useCap5TradeLogMock.mockReturnValue({ trades, record: vi.fn() })
    useCap2TradeLogMock.mockReturnValue({ trades: [], scores })

    render(
      <SidebarProvider>
        <Cap5PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cap5Progress,
        cap4Progress,
        cap3Progress,
        cap2Progress,
        trades,
        dailyScores: scores,
      }),
    )
  })

  it("does not query anything outside a Cap5Provider", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    render(
      <SidebarProvider>
        <Cap5PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
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
      <SidebarProvider defaultPanel="cap5-analysis">
        <Cap5PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
