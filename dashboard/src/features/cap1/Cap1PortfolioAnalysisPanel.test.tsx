import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "./types"

const { useCap1ProgressMock, useCap1EventsMock, useCap1TradeLogMock, markTaskMutate } = vi.hoisted(
  () => ({
    useCap1ProgressMock: vi.fn(),
    useCap1EventsMock: vi.fn(() => ({ isCap1Active: true })),
    useCap1TradeLogMock: vi.fn(() => ({ trades: [], record: vi.fn() })),
    markTaskMutate: vi.fn(),
  }),
)

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useCompleteCap1Task: () => ({ mutate: markTaskMutate, isPending: false }),
}))
vi.mock("./Cap1Context", () => ({
  useCap1Events: () => useCap1EventsMock(),
}))
vi.mock("./tradeLog", () => ({
  useCap1TradeLog: () => useCap1TradeLogMock(),
}))
vi.mock("./Cap1PortfolioAnalysis", () => ({
  Cap1PortfolioAnalysis: () => <div data-testid="cap1-portfolio-analysis" />,
}))

import { Cap1PortfolioAnalysisPanel } from "./Cap1PortfolioAnalysisPanel"

function makeProgress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    task_6_done_at: null,
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
    so_lan_xem_danh_muc: 0,
    so_lenh_thuc_chien: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("Cap1PortfolioAnalysisPanel", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    useCap1EventsMock.mockReset()
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap1TradeLogMock.mockReset()
    useCap1TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    markTaskMutate.mockReset()
  })

  it("renders Cap1PortfolioAnalysis fed by progress + trades", () => {
    render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap1-portfolio-analysis")).toBeInTheDocument()
  })

  it("bumps nhiệm vụ ⑤ (PATCH /cap1/task {task_no: 5}) once on mount", () => {
    render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(markTaskMutate).toHaveBeenCalledTimes(1)
    expect(markTaskMutate).toHaveBeenCalledWith(5)
  })

  it("does NOT bump nhiệm vụ ⑤ when isCap1Active is false (defensive — should be unreachable outside Cấp 1)", () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(markTaskMutate).not.toHaveBeenCalled()
  })

  it('clicking "← Hành trình" switches the sidebar back to the journey panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="cap1-analysis">
        <Cap1PortfolioAnalysisPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("← Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
