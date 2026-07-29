import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "./types"
import type { Cap1TradeRecord } from "./tradeLog"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap1ProgressMock, useCap1EventsMock, useCap1TradeLogMock } = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap1EventsMock: vi.fn(() => ({ isCap1Active: true })),
  useCap1TradeLogMock: vi.fn(() => ({ trades: [], record: vi.fn() })),
}))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
}))
vi.mock("./Cap1Context", () => ({
  useCap1Events: () => useCap1EventsMock(),
}))
vi.mock("./tradeLog", () => ({
  useCap1TradeLog: () => useCap1TradeLogMock(),
}))

import { JourneyPanelCap1 } from "./JourneyPanelCap1"

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

function trade(overrides: Partial<Cap1TradeRecord> = {}): Cap1TradeRecord {
  return {
    orderId: "o1",
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 5,
    pnlVnd: 100_000,
    closedAt: "2026-07-20T00:00:00Z",
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap1 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap1", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1EventsMock.mockReset()
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap1TradeLogMock.mockReset()
    useCap1TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
  })

  it("renders the level card — CẤP 1 / HỌC VIỆC / italic bài học / badge THỰC CHIẾN", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.getByText("CẤP 1")).toBeInTheDocument()
    expect(screen.getByText("HỌC VIỆC")).toBeInTheDocument()
    expect(
      screen.getByText('"Vào lệnh phải biết VÌ SAO mua và mua vùng nào."'),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 2 · 0/6" with fresh progress', () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 2 · 0/6")).toBeInTheDocument()
  })

  it("renders all 6 task names verbatim", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.getByText("Lệnh Thực chiến đầu tiên có kế hoạch")).toBeInTheDocument()
    expect(screen.getByText("Bán lệnh đầu — Kết sổ đầu")).toBeInTheDocument()
    expect(screen.getByText("Làm quen 5 lý do — chọn đủ 5 lý do mua")).toBeInTheDocument()
    expect(
      screen.getByText("Chọn lý do có cơ sở — 3 lệnh có lý do được ✅ Ủng hộ"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Xem lại danh mục — mở trang Phân tích danh mục 3 lần"),
    ).toBeInTheDocument()
    expect(screen.getByText("Tổng số lệnh Thực chiến — 10 lệnh")).toBeInTheDocument()
  })

  it("① and ⑥ are active at 0/6; ②③④⑤ are locked until ① is done", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.getByTestId("cap1-task-1").className).toContain("cap0-checklist-item--active")
    expect(screen.getByTestId("cap1-task-6").className).toContain("cap0-checklist-item--active")
    for (const no of [2, 3, 4, 5]) {
      expect(screen.getByTestId(`cap1-task-${no}`).className).toContain(
        "cap0-checklist-item--locked",
      )
    }
  })

  it("once ① is done, ②③④⑤ become active", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    renderPanel()
    for (const no of [2, 3, 4, 5]) {
      expect(screen.getByTestId(`cap1-task-${no}`).className).toContain(
        "cap0-checklist-item--active",
      )
    }
  })

  it("③ shows the 5-ô lý do ✓/✗ grid computed from the trade log", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t" }),
    })
    useCap1TradeLogMock.mockReturnValue({
      trades: [trade({ lyDo: "dong_tien" }), trade({ lyDo: "ky_thuat" })],
      record: vi.fn(),
    })
    renderPanel()
    const task3 = screen.getByTestId("cap1-task-3")
    expect(within(task3).getByText(/🎯✓/)).toBeInTheDocument()
    expect(within(task3).getByText(/💰✓/)).toBeInTheDocument()
    expect(within(task3).getByText(/👤✗/)).toBeInTheDocument()
    expect(within(task3).getByText(/📰✗/)).toBeInTheDocument()
    expect(within(task3).getByText(/💎✗/)).toBeInTheDocument()
  })

  it("④ shows «Lý do có cơ sở (✅): X/3»", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lenh_ly_do_ung_ho: 2 }),
    })
    renderPanel()
    expect(
      within(screen.getByTestId("cap1-task-4")).getByText("Lý do có cơ sở (✅): 2/3"),
    ).toBeInTheDocument()
  })

  it("⑤ shows «Đã xem lại danh mục X/3 lần»", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lan_xem_danh_muc: 1 }),
    })
    renderPanel()
    expect(
      within(screen.getByTestId("cap1-task-5")).getByText("Đã xem lại danh mục 1/3 lần"),
    ).toBeInTheDocument()
  })

  it("⑥ shows «Lệnh Thực chiến X/10»", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_thuc_chien: 7 }),
    })
    renderPanel()
    expect(
      within(screen.getByTestId("cap1-task-6")).getByText("Lệnh Thực chiến 7/10"),
    ).toBeInTheDocument()
  })

  it('clicking "Xem Phân tích danh mục →" switches the sidebar to the cap1-analysis panel', () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap1 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap1-analysis")
  })

  it("shows the graduation goal box copy", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.getByText(/tốt nghiệp/)).toBeInTheDocument()
    expect(screen.getByText(/Cấp 2 «Kỷ luật»/)).toBeInTheDocument()
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec §8 — Cấp 1 has none)", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })
})
