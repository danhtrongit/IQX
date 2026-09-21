import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "./types"

// ★ `markTaskMutate` cố tình GIỮ LẠI dù panel không còn gọi: nó là cái bẫy để
// test bên dưới chứng minh KHÔNG có `PATCH /cap1/task` nào bị bắn lúc mount.
const { useCap1ProgressMock, useCap1TradesMock, useCap1EventsMock, useCap1TradeLogMock, analysisPropsMock, markTaskMutate, trackMock } = vi.hoisted(
  () => ({
    useCap1ProgressMock: vi.fn(),
    useCap1TradesMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: undefined })),
    useCap1EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap1Active: true })),
    useCap1TradeLogMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ trades: [], record: vi.fn() })),
    analysisPropsMock: vi.fn(),
    markTaskMutate: vi.fn(),
    trackMock: vi.fn(),
  }),
)

vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: trackMock }))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useCap1Trades: (...a: unknown[]) => useCap1TradesMock(...a),
  useCompleteCap1Task: () => ({ mutate: markTaskMutate, isPending: false }),
}))
vi.mock("./Cap1Context", () => ({
  useCap1Events: () => useCap1EventsMock(),
}))
vi.mock("./tradeLog", () => ({
  useCap1TradeLog: () => useCap1TradeLogMock(),
  cap1TradeFromHistory: (row: unknown) => row,
}))
vi.mock("./Cap1PortfolioAnalysis", () => ({
  Cap1PortfolioAnalysis: (props: unknown) => {
    analysisPropsMock(props)
    return <div data-testid="cap1-portfolio-analysis" />
  },
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
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
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
    useCap1TradesMock.mockReset()
    useCap1TradesMock.mockReturnValue({ data: undefined })
    useCap1EventsMock.mockReset()
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap1TradeLogMock.mockReset()
    useCap1TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    analysisPropsMock.mockReset()
    markTaskMutate.mockReset()
    trackMock.mockReset()
  })

  it("renders Cap1PortfolioAnalysis fed by progress + trades", () => {
    render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("cap1-portfolio-analysis")).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith("cap1_phantich_danhmuc_open")
    expect(trackMock).toHaveBeenCalledWith("cap1_phantich_danhmuc_view")
  })

  it("treats a successful empty server history as authoritative", () => {
    useCap1TradeLogMock.mockReturnValue({ trades: [{ orderId: "old-account-order" }] })
    useCap1TradesMock.mockReturnValue({ data: { trades: [], total: 0 } })
    render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(analysisPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ trades: [] }),
    )
  })

  it("records each visible behavior pattern without duplicating it on rerender", () => {
    useCap1TradeLogMock.mockReturnValue({
      trades: Array.from({ length: 5 }, (_, index) => ({
        orderId: `order-${index}`,
        pnlVnd: 500_000,
        pnlPct: 8.33,
        lyDo: "ky_thuat",
        trangThaiLucDat: "ung_ho",
        closedAt: "2026-07-10T00:00:00Z",
      })),
      record: vi.fn(),
    })

    const { rerender } = render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(trackMock).toHaveBeenCalledWith("cap1_pattern_shown", {
      pattern_id: "vu_khi_rieng",
    })

    rerender(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(
      trackMock.mock.calls.filter(([name]) => name === "cap1_pattern_shown"),
    ).toHaveLength(1)
  })

  // ★★ Nhiệm vụ «Xem lại danh mục — mở Phân tích danh mục 3 lần khác ngày» đã
  // bị bỏ khỏi hành trình Cấp 1, và ⑤ bây giờ là «10 lệnh Thực chiến» mà server
  // tự suy ra từ `so_lenh_thuc_chien`. Mở panel này KHÔNG được bắn
  // `PATCH /cap1/task` nữa — dưới mô hình mới nó chỉ là một lần tính lại vô
  // nghĩa (và với `task_no: 5` thì còn là gửi sai ý nghĩa nhiệm vụ).
  it("★ fires NO PATCH /cap1/task on mount", () => {
    render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    expect(markTaskMutate).not.toHaveBeenCalled()
  })

  it("★ still fires nothing on a re-render / when isCap1Active flips on", () => {
    useCap1EventsMock.mockReturnValue({ isCap1Active: false })
    const { rerender } = render(
      <SidebarProvider>
        <Cap1PortfolioAnalysisPanel />
      </SidebarProvider>,
    )
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    rerender(
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
