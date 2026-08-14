import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap2Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap2ProgressMock, useCap2EventsMock, flags } = vi.hoisted(() => ({
  // Mutable so the goal box can be asserted on BOTH sides of the trần cấp.
  flags: { CAP_MAX_ENABLED: 2 },
  useCap2ProgressMock: vi.fn(),
  useCap2EventsMock: vi.fn(() => ({ isCap2Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
}))
vi.mock("./Cap2Context", () => ({
  useCap2Events: () => useCap2EventsMock(),
}))

// Getter (not a plain value): the panel must read the trần at RENDER time.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

import { JourneyPanelCap2 } from "./JourneyPanelCap2"

function makeProgress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap2 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap2", () => {
  beforeEach(() => {
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: makeProgress() })
    useCap2EventsMock.mockReset()
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    flags.CAP_MAX_ENABLED = 2
  })

  it("renders the level card — CẤP 2 / KỶ LUẬT / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 2")).toBeInTheDocument()
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    expect(screen.getByText('"Kế hoạch chỉ có giá trị khi được thực hiện."')).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  // ── ★★ Hành trình CHỈ CÒN 2 NHIỆM VỤ ★★ ───────────────────────────────────
  it("★ renders EXACTLY 2 nhiệm vụ — the 5-nhiệm-vụ list is gone for good", () => {
    renderPanel()
    expect(screen.getByTestId("cap2-task-1")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-task-2")).toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-3")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-4")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-5")).not.toBeInTheDocument()
    // ...và không còn dấu vết câu chữ của 5 nhiệm vụ cũ.
    expect(screen.queryByText(/Chuỗi lệnh kỷ luật đầu tiên/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cắt lỗ đúng phiên — 5 lần/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Không nhồi lệnh khi lỗ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cửa sổ 20 lệnh/)).not.toBeInTheDocument()
  })

  it("★ renders both nhiệm vụ names VERBATIM from the mockup", () => {
    renderPanel()
    expect(
      within(screen.getByTestId("cap2-task-1")).getByText(
        "10 lệnh Thực chiến có đặt cắt lỗ / chốt lời",
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("cap2-task-2")).getByText("Thực hiện đúng khi giá chạm mốc"),
    ).toBeInTheDocument()
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 3" + 0/2 with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 3")).toBeInTheDocument()
    expect(screen.getByText("0/2")).toBeInTheDocument()
  })

  // ── ★★ Các khối chỉ số đã RỜI tab Hành trình ★★ ───────────────────────────
  it("★ no ChuoiWidget, no Điểm kỷ luật card, no Cẩm nang block", () => {
    renderPanel()
    expect(screen.queryByTestId("cap2-chuoi")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-diem-card")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-camnang")).not.toBeInTheDocument()
    expect(screen.queryByText(/CẨM NANG CẮT LỖ/i)).not.toBeInTheDocument()
  })

  // ── ★★ SONG SONG: ② không bị ① khoá ★★ ────────────────────────────────────
  it("★ both nhiệm vụ are actionable at 0/2 — neither is locked behind the other", () => {
    renderPanel()
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap2-task-${no}`).className).not.toContain(
        "cap0-checklist-item--locked",
      )
    }
    // ① được tập trung, ② vẫn có lối tắt "Làm ngay →" ngay trên dòng của nó.
    expect(screen.getByTestId("cap2-task-1").className).toContain("cap0-checklist-item--current")
    expect(within(screen.getByTestId("cap2-task-2")).getByText("Làm ngay →")).toBeInTheDocument()
  })

  it("★ ② can be done BEFORE ① — the focus moves to ①, ② reads done", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_2_done_at: "t", so_lan_thuc_hien_dung: 2 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap2-task-2").className).toContain("cap0-checklist-item--done")
    expect(screen.getByTestId("cap2-task-1").className).toContain("cap0-checklist-item--current")
    expect(within(screen.getByTestId("cap2-focus")).getByText("①")).toBeInTheDocument()
  })

  it("★ when ① is done first, the focus moves to ② (not to a locked row)", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lenh_co_cl_tp: 10 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap2-task-1").className).toContain("cap0-checklist-item--done")
    const focus = within(screen.getByTestId("cap2-focus"))
    expect(focus.getByText("②")).toBeInTheDocument()
    expect(focus.getByText("Thực hiện đúng khi giá chạm mốc")).toBeInTheDocument()
  })

  // ── ★★ Con số tiến độ NGUYÊN VĂN mockup ★★ ────────────────────────────────
  it("★ ① reads «n/10 lệnh» and ② reads «n/2 lần» from the server counters", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_co_cl_tp: 6, so_lan_thuc_hien_dung: 1 }),
    })
    renderPanel()
    // ① đang được tập trung → con số nằm trên ô tập trung.
    expect(within(screen.getByTestId("cap2-focus")).getByText("6/10 lệnh")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap2-task-2")).getByText("1/2 lần")).toBeInTheDocument()
  })

  it("★ counters never overshoot their target (server may count past 10/2)", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_co_cl_tp: 47, so_lan_thuc_hien_dung: 9 }),
    })
    renderPanel()
    expect(within(screen.getByTestId("cap2-focus")).getByText("10/10 lệnh")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap2-task-2")).getByText("2/2 lần")).toBeInTheDocument()
  })

  // ── ★★ Thanh hành trình (mockup `.jbar`) ★★ ───────────────────────────────
  it("★ jbar reads «CẤP 2 · 0/2» + the mockup's parallel-tasks sub-line, with 2 dots", () => {
    renderPanel()
    const jbar = within(screen.getByTestId("cap2-jbar"))
    expect(jbar.getByText("CẤP 2 · 0/2")).toBeInTheDocument()
    expect(
      jbar.getByText("Hai nhiệm vụ làm song song — chưa xong cái nào"),
    ).toBeInTheDocument()
    // Chưa xong cái nào ⇒ cả hai chấm đều "đang tới lượt" (song song).
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap2-jbar-dot-${no}`).className).toContain("cap2-jd--now")
    }
  })

  it("★ jbar at 1/2 names the remaining nhiệm vụ (never «tiếp» — nothing follows anything)", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    const jbar = within(screen.getByTestId("cap2-jbar"))
    expect(jbar.getByText("CẤP 2 · 1/2")).toBeInTheDocument()
    expect(jbar.getByText("Thực hiện đúng khi giá chạm mốc")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-jbar-dot-1").className).toContain("cap2-jd--done")
    expect(screen.getByTestId("cap2-jbar-dot-2").className).toContain("cap2-jd--now")
  })

  it("★ jbar at 2/2 says the level is finished", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t" }),
    })
    renderPanel()
    expect(within(screen.getByTestId("cap2-jbar")).getByText("🎓 Hoàn thành Cấp 2!")).toBeInTheDocument()
    expect(screen.getByText("CẤP 2 · 2/2")).toBeInTheDocument()
  })

  it("at 2/2 the focus box switches to the ready-to-graduate state", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t" }),
    })
    renderPanel()
    const focus = within(screen.getByTestId("cap2-focus"))
    expect(focus.getByText("ĐÃ XONG CẢ 2 NHIỆM VỤ")).toBeInTheDocument()
    expect(focus.getByText("Sẵn sàng tốt nghiệp Cấp 2")).toBeInTheDocument()
  })

  // ── Hàng 2 công cụ (mockup `.tools`) ──────────────────────────────────────
  it('clicking "📊 Phân tích danh mục" switches the sidebar to the cap2-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap2 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("📊 Phân tích danh mục"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap2-analysis")
  })

  it('"Làm ngay →" leads back to the Đặt lệnh tab', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap2 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(within(screen.getByTestId("cap2-focus")).getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  // ── ★★ Ô mục tiêu: TRẠNG THÁI CUỐI của một người đã tốt nghiệp Cấp 2 ★★ ───
  it("★ goal box says «Xong 2/2 →» and never promises Cấp 3 while the trần is 2", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t" }),
    })
    renderPanel()
    const goal = screen.getByTestId("cap2-journey-goal")
    expect(goal).toHaveTextContent("Xong 2/2 →")
    expect(goal).not.toHaveTextContent(/lên\s+Cấp 3/)
    expect(goal).toHaveTextContent(/Cấp 3 «Bản lĩnh» chưa ra mắt/)
  })

  it("★ goal box restores the mockup's Cấp 3 wording the moment the trần reaches 3", () => {
    flags.CAP_MAX_ENABLED = 3
    renderPanel()
    const goal = screen.getByTestId("cap2-journey-goal")
    expect(goal).toHaveTextContent(
      "Xong 2/2 → tốt nghiệp Cấp 2, lên Cấp 3 «Bản lĩnh» (quản lý vốn: khẩu vị · tự tin · khối lượng).",
    )
    expect(goal).not.toHaveTextContent(/chưa ra mắt/)
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })

  it("only queries Cấp 2 progress inside a real Cap2Provider", () => {
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    renderPanel()
    expect(useCap2ProgressMock).toHaveBeenCalledWith(false)
  })
})
