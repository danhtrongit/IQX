import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const {
  useCap8EventsMock,
  useCap8ProgressMock,
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
  useCap8EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap8Active: true })),
  useCap8ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap7ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap7TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], record: vi.fn() })),
  useCap6ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap5ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap4ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap3ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], scores: [] })),
  analysisPropsSpy: vi.fn(),
}))

vi.mock("./Cap8Context", () => ({ useCap8Events: () => useCap8EventsMock() }))
vi.mock("./hooks", () => ({
  useCap8Progress: (...a: unknown[]) => useCap8ProgressMock(...a),
}))
vi.mock("@/features/cap7/hooks", () => ({
  useCap7Progress: (...a: unknown[]) => useCap7ProgressMock(...a),
}))
vi.mock("@/features/cap7/tradeLogCap7", () => ({
  useCap7TradeLog: () => useCap7TradeLogMock(),
}))
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
vi.mock("./Cap8PortfolioAnalysis", () => ({
  Cap8PortfolioAnalysis: (props: Record<string, unknown>) => {
    analysisPropsSpy(props)
    return <div data-testid="cap8-portfolio-analysis-mock" />
  },
}))

import { Cap8PortfolioAnalysisPanel } from "./Cap8PortfolioAnalysisPanel"

describe("Cap8PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap8EventsMock.mockReset()
    useCap8EventsMock.mockReturnValue({ isCap8Active: true })
    useCap8ProgressMock.mockReset()
    useCap8ProgressMock.mockReturnValue({ data: null })
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

  it("renders Cap8PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap8PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap8-portfolio-analysis-mock")).toBeInTheDocument()
  })

  it("feeds it the Cấp 8/7/6/5/4/3/2 hồ sơ, the Cấp 7 trade log and the shared điểm log", () => {
    const cap8Progress = { id: "p8", so_lenh_kiem_tra: 15 }
    const cap7Progress = { id: "p7", so_lenh_doc_luc: 21 }
    const cap6Progress = { id: "p6", so_lenh_doi_chieu: 12 }
    const cap5Progress = { id: "p5", so_lenh_phan_loai: 12 }
    const cap4Progress = { id: "p4", so_lenh_doc_du_5lop: 22 }
    const cap3Progress = { id: "p3", khau_vi: "can_bang" }
    const cap2Progress = { id: "p2" }
    const trades = [{ orderId: "o1", lucDocUser: "manh" }]
    const scores = [{ ngay: "2026-11-02", diem: 90, xepLoai: "xanh" }]
    useCap8ProgressMock.mockReturnValue({ data: cap8Progress })
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
        <Cap8PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cap8Progress,
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

  // ★ `undefined` from a not-yet-resolved query must reach the analysis as
  // `null` (its documented "chưa có hồ sơ" input), never as `undefined` — the
  // khối ⑱ branches on `=== null`.
  it("normalises an unresolved hồ sơ to null, not undefined", () => {
    useCap8ProgressMock.mockReturnValue({ data: undefined })
    render(
      <SidebarProvider>
        <Cap8PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cap8Progress: null }),
    )
  })

  it("does not query anything outside a Cap8Provider", () => {
    useCap8EventsMock.mockReturnValue({ isCap8Active: false })
    render(
      <SidebarProvider>
        <Cap8PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(useCap8ProgressMock).toHaveBeenCalledWith(false)
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
      <SidebarProvider defaultPanel="cap8-analysis">
        <Cap8PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
