import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap2Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap2ProgressMock, useCap2EventsMock, useDiemKyLuatMock } = vi.hoisted(() => ({
  useCap2ProgressMock: vi.fn(),
  useCap2EventsMock: vi.fn(() => ({ isCap2Active: true })),
  useDiemKyLuatMock: vi.fn(() => ({ data: undefined, isLoading: true })),
}))

vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useDiemKyLuat: (...a: unknown[]) => useDiemKyLuatMock(...a),
}))
vi.mock("./Cap2Context", () => ({
  useCap2Events: () => useCap2EventsMock(),
}))

import { JourneyPanelCap2 } from "./JourneyPanelCap2"

function makeProgress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    chuoi_current: 0,
    chuoi_record: 0,
    last_chuoi_reset_at: null,
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
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: undefined, isLoading: true })
  })

  it("renders the level card — CẤP 2 / KỶ LUẬT / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 2")).toBeInTheDocument()
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    expect(
      screen.getByText('"Kế hoạch chỉ có giá trị khi được thực hiện."'),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 3 · 0/5" with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 3 · 0/5")).toBeInTheDocument()
  })

  it("renders all 5 nhiệm vụ names verbatim", () => {
    renderPanel()
    expect(
      screen.getByText("Chuỗi lệnh kỷ luật đầu tiên — 5 lệnh liên tiếp không vi phạm"),
    ).toBeInTheDocument()
    expect(screen.getByText("Cắt lỗ đúng phiên — 5 lần")).toBeInTheDocument()
    expect(screen.getByText("Không nhồi lệnh khi lỗ — 0 lần trong 15 lệnh")).toBeInTheDocument()
    expect(
      screen.getByText("Chốt lời đúng — 3 lần chạm chốt lời không hụt"),
    ).toBeInTheDocument()
    expect(screen.getByText("Cửa sổ 20 lệnh — Vi phạm ≤2")).toBeInTheDocument()
  })

  it("① is active at 0/5; ②③④⑤ are locked until ① is done", () => {
    renderPanel()
    expect(screen.getByTestId("cap2-task-1").className).toContain("cap0-checklist-item--active")
    for (const no of [2, 3, 4, 5]) {
      expect(screen.getByTestId(`cap2-task-${no}`).className).toContain(
        "cap0-checklist-item--locked",
      )
    }
  })

  it("once ① is done, ②③④⑤ become active", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z", chuoi_current: 5 }),
    })
    renderPanel()
    for (const no of [2, 3, 4, 5]) {
      expect(screen.getByTestId(`cap2-task-${no}`).className).toContain(
        "cap0-checklist-item--active",
      )
    }
  })

  it("done tasks show the done state", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task_5_done_at: "t",
      }),
    })
    renderPanel()
    for (const no of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`cap2-task-${no}`).className).toContain(
        "cap0-checklist-item--done",
      )
    }
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 3 · 5/5")).toBeInTheDocument()
  })

  it("① shows a motivational countdown to chuỗi 5 (spec §2①)", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress({ chuoi_current: 2 }) })
    renderPanel()
    expect(
      within(screen.getByTestId("cap2-task-1")).getByText(
        "Còn 3 lệnh nữa đạt chuỗi 5 lệnh kỷ luật",
      ),
    ).toBeInTheDocument()
  })

  it("renders the ChuoiWidget block (spec §4 point 3)", () => {
    renderPanel()
    expect(screen.getByTestId("cap2-chuoi")).toBeInTheDocument()
  })

  it("renders the Điểm kỷ luật hôm nay block (spec §4 point 4)", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: {
        ngay: "2026-07-21",
        co_giao_dich: true,
        co_tinh_huong: true,
        diem: 90,
        xep_loai: "xanh",
        giai_thich: "Bạn giữ đúng cam kết.",
        thanh_phan: {
          ke_hoach: 40,
          ke_hoach_toi_da: 40,
          cat_lo_dung: 40,
          cat_lo_dung_toi_da: 40,
          khong_nhoi: 30,
          khong_nhoi_toi_da: 30,
          chot_loi_dung: 20,
          chot_loi_dung_toi_da: 30,
        },
      },
      isLoading: false,
    })
    renderPanel()
    expect(screen.getByTestId("cap2-diem-card")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-diem-value")).toHaveTextContent("90")
  })

  it("renders the cẩm nang cắt lỗ/chốt lời static explainer (spec §5.5)", () => {
    renderPanel()
    expect(screen.getByText(/CẨM NANG CẮT LỖ.*CHỐT LỜI/i)).toBeInTheDocument()
    expect(screen.getByText(/Cách 1 — Theo Hỗ trợ \/ Kháng cự/)).toBeInTheDocument()
    expect(screen.getByText(/Cách 2 — Theo Biên độ dao động/)).toBeInTheDocument()
  })

  it('clicking "Xem Phân tích danh mục →" switches the sidebar to the cap2-analysis panel', () => {
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
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap2-analysis")
  })

  it("shows the graduation goal box copy (spec §4 point 10)", () => {
    renderPanel()
    expect(screen.getByText(/tốt nghiệp Cấp 2/)).toBeInTheDocument()
    expect(screen.getByText(/Cấp 3 «Bản lĩnh»/)).toBeInTheDocument()
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })
})
