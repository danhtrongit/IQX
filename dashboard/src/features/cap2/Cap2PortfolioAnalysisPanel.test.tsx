import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

const { useCap2EventsMock, useCap2ProgressMock, useCap2TradeLogMock } = vi.hoisted(() => ({
  useCap2EventsMock: vi.fn(() => ({ isCap2Active: true })),
  useCap2ProgressMock: vi.fn(() => ({ data: null })),
  useCap2TradeLogMock: vi.fn(() => ({ trades: [], scores: [] })),
}))

vi.mock("./Cap2Context", () => ({ useCap2Events: () => useCap2EventsMock() }))
vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
}))
vi.mock("./tradeLogCap2", () => ({ useCap2TradeLog: () => useCap2TradeLogMock() }))
vi.mock("./Cap2PortfolioAnalysis", () => ({
  Cap2PortfolioAnalysis: () => <div data-testid="cap2-portfolio-analysis-mock" />,
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
  })

  it("renders Cap2PortfolioAnalysis", () => {
    render(
      <SidebarProvider>
        <Cap2PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap2-portfolio-analysis-mock")).toBeInTheDocument()
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
