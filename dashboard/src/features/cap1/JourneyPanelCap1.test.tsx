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

  it("shows the ordinal ①..⑥ next to each (full, unshortened) task name", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    const task2 = within(screen.getByTestId("cap1-task-2"))
    expect(task2.getByText("②")).toBeInTheDocument()
    expect(task2.getByText("Bán lệnh đầu — Kết sổ đầu")).toBeInTheDocument()
  })

  it("at 0/6: ① is the 🎯 active task, ⑥ is 🔲 open, ②③④⑤ are 🔒 locked", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    const task1 = screen.getByTestId("cap1-task-1")
    expect(task1.className).toContain("cap0-checklist-item--active")
    expect(within(task1).getByText("🎯")).toBeInTheDocument()

    const task6 = screen.getByTestId("cap1-task-6")
    expect(task6.className).toContain("cap1-checklist-item--open")
    expect(task6.className).not.toContain("cap0-checklist-item--active")
    expect(within(task6).getByText("🔲")).toBeInTheDocument()

    for (const no of [2, 3, 4, 5]) {
      const task = screen.getByTestId(`cap1-task-${no}`)
      expect(task.className).toContain("cap0-checklist-item--locked")
      expect(within(task).getByText("🔒")).toBeInTheDocument()
    }
  })

  it("once ① is done it shows ✅, ② becomes the single 🎯 active task and ③④⑤⑥ are 🔲 open", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    renderPanel()
    const task1 = screen.getByTestId("cap1-task-1")
    expect(task1.className).toContain("cap0-checklist-item--done")
    expect(within(task1).getByText("✅")).toBeInTheDocument()

    expect(screen.getByTestId("cap1-task-2").className).toContain("cap0-checklist-item--active")
    for (const no of [3, 4, 5, 6]) {
      const task = screen.getByTestId(`cap1-task-${no}`)
      expect(task.className).toContain("cap1-checklist-item--open")
      expect(task.className).not.toContain("cap0-checklist-item--active")
    }
    // Exactly ONE 🎯 in the whole checklist.
    expect(screen.getAllByText("🎯").filter((el) => el.className.includes("checklist"))).toHaveLength(
      1,
    )
  })

  it('unlocked-but-not-focused tasks keep their "Làm ngay →" shortcut', () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    renderPanel()
    expect(within(screen.getByTestId("cap1-task-5")).getByText("Làm ngay →")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap1-task-3")).getByText("Làm ngay →")).toBeInTheDocument()
  })

  it("③ shows the 5 lý do emoji strip — unused lý do dimmed (.off) — plus «Đã dùng n/5 lý do»", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_ly_do_da_dung: 2 }),
    })
    useCap1TradeLogMock.mockReturnValue({
      trades: [trade({ lyDo: "dong_tien" }), trade({ lyDo: "ky_thuat" })],
      record: vi.fn(),
    })
    renderPanel()
    const task3 = within(screen.getByTestId("cap1-task-3"))
    // Đã dùng → sáng; chưa dùng → mờ (class `.off` như mockup)
    expect(task3.getByTestId("cap1-coverage-ky_thuat").className).not.toContain("cap1-coverage-off")
    expect(task3.getByTestId("cap1-coverage-dong_tien").className).not.toContain(
      "cap1-coverage-off",
    )
    for (const value of ["noi_bo", "tin_tuc", "dinh_gia"]) {
      expect(task3.getByTestId(`cap1-coverage-${value}`).className).toContain("cap1-coverage-off")
    }
    // Emoji only — the old "✓/✗" pairs are gone.
    expect(task3.getByTestId("cap1-coverage-noi_bo")).toHaveTextContent("👤")
    expect(task3.queryByText(/✗/)).not.toBeInTheDocument()
    expect(task3.getByText("Đã dùng 2/5 lý do")).toBeInTheDocument()
  })

  it("③'s «Đã dùng» never under-reports the server count when the local trade log is empty", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_ly_do_da_dung: 4 }),
    })
    useCap1TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    renderPanel()
    expect(
      within(screen.getByTestId("cap1-task-3")).getByText("Đã dùng 4/5 lý do"),
    ).toBeInTheDocument()
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

  it("renders the two-tool row 📓 Kết sổ + 📊 Phân tích danh mục", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    const tools = within(screen.getByTestId("cap1-tools"))
    expect(tools.getByText("📓 Kết sổ")).toBeInTheDocument()
    expect(tools.getByRole("button", { name: "📊 Phân tích danh mục" })).toBeInTheDocument()
    // Kết sổ tự mở khi bán lệnh (spec §6) — không có màn để mở tay, nên ô này
    // KHÔNG phải nút bấm chết.
    expect(tools.getAllByRole("button")).toHaveLength(1)
  })

  it('clicking "📊 Phân tích danh mục" switches the sidebar to the cap1-analysis panel', () => {
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
    fireEvent.click(screen.getByRole("button", { name: "📊 Phân tích danh mục" }))
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
