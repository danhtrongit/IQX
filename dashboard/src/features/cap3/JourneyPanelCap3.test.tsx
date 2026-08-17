import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap3Progress, ThachThucCap3 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap3ProgressMock, useThachThucMock, useCap3EventsMock, useDiemKyLuatMock, flags } =
  vi.hoisted(() => ({
    // Mutable — ô mục tiêu phải được kiểm ở CẢ hai phía của trần cấp.
    flags: { CAP_MAX_ENABLED: 3 },
    useCap3ProgressMock: vi.fn(),
    useThachThucMock: vi.fn(),
    useCap3EventsMock: vi.fn(() => ({ isCap3Active: true })),
    useDiemKyLuatMock: vi.fn(() => ({ data: undefined, isLoading: true })),
  }))

vi.mock("./hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useThachThuc: (...a: unknown[]) => useThachThucMock(...a),
}))
vi.mock("./Cap3Context", () => ({
  useCap3Events: () => useCap3EventsMock(),
}))
// Điểm kỷ luật là công cụ Cấp 2 dùng lại nguyên trong Cấp 3 (spec §9 áp cho cả
// Cấp 2 lẫn Cấp 3) — `DiemKyLuatCard` tự fetch, nên mock đúng hook của nó.
vi.mock("@/features/cap2/hooks", () => ({
  useDiemKyLuat: (...a: unknown[]) => useDiemKyLuatMock(...a),
}))
// Getter (không phải giá trị phẳng): ô mục tiêu phải đọc trần ở thời điểm
// RENDER, nếu không một nửa số test hai chiều sẽ xanh giả.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

import { JourneyPanelCap3 } from "./JourneyPanelCap3"

function makeProgress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-07-28T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function makeThachThuc(overrides: Partial<ThachThucCap3> = {}): ThachThucCap3 {
  return {
    dat_ca_3: false,
    lai_pct: {
      ten: "Lãi ≥ +5% trên vốn",
      gia_tri_hien_tai: 3.2,
      muc_tieu: 5,
      dat: false,
      giai_thich:
        "Lãi/lỗ đã chốt ở Cấp 3 đang là 3.2% trên vốn 100,000,000đ — cần đạt ít nhất +5%.",
    },
    so_lenh: {
      ten: "Đủ 15 lệnh Thực chiến",
      gia_tri_hien_tai: 11,
      muc_tieu: 15,
      dat: false,
      giai_thich: "Đã qua 11/15 lệnh Thực chiến kể từ khi vào Cấp 3.",
    },
    diem_ky_luat: {
      ten: "Điểm kỷ luật ≥ 80%",
      gia_tri_hien_tai: 76,
      muc_tieu: 80,
      dat: false,
      giai_thich:
        "Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi giá chạm, không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt. Trung bình giai đoạn Cấp 3: 76.0%.",
    },
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap3 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap3", () => {
  beforeEach(() => {
    flags.CAP_MAX_ENABLED = 3
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: makeProgress() })
    useThachThucMock.mockReset()
    useThachThucMock.mockReturnValue({ data: makeThachThuc() })
    useCap3EventsMock.mockReset()
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: undefined, isLoading: true })
  })

  it("renders the level card — CẤP 3 / BẢN LĨNH / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 3")).toBeInTheDocument()
    expect(screen.getByText("BẢN LĨNH")).toBeInTheDocument()
    expect(screen.getByText('"Mua bao nhiêu quan trọng như mua gì."')).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("renders the Cấp 3 badge (xanh brand #4f8ff7, fill=3) with a ring for tasks done", () => {
    renderPanel()
    const svg = document.querySelector(".cap0-badge svg")
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML).toContain("#4f8ff7")
  })

  it("shows the khẩu vị rủi ro đang dùng (trần % vốn) — §C12c, con số kèm nguồn gốc", () => {
    renderPanel()
    expect(screen.getByTestId("cap3-journey-khauvi")).toHaveTextContent(
      "Khẩu vị: Cân bằng · trần 20%",
    )
  })

  it("says khẩu vị chưa đặt when the hồ sơ has none yet", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderPanel()
    expect(screen.getByTestId("cap3-journey-khauvi")).toHaveTextContent("Chưa đặt khẩu vị")
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 4" + bộ đếm 0/3 with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 4")).toBeInTheDocument()
    expect(screen.getByText("0/3")).toBeInTheDocument()
  })

  it("renders all 3 nhiệm vụ names verbatim (spec §2)", () => {
    renderPanel()
    // Nhiệm vụ đang được tập trung xuất hiện 2 lần (ô tập trung + dòng thu gọn)
    // nên bám theo đúng dòng checklist của từng nhiệm vụ.
    expect(within(screen.getByTestId("cap3-task-1")).getByText(
      "Lệnh đầu tiên đủ khẩu vị + mức tự tin",
    )).toBeInTheDocument()
    expect(
      within(screen.getByTestId("cap3-task-2")).getByText("Kết sổ lệnh đầu Cấp 3"),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("cap3-task-3")).getByText(
        "Thách thức Bản lĩnh — lãi có kỷ luật",
      ),
    ).toBeInTheDocument()
  })

  it("① is active from the moment the user enters Cấp 3, và được NÂNG lên ô tập trung", () => {
    renderPanel()
    expect(screen.getByTestId("cap3-task-1").className).toContain("cap0-checklist-item--active")
    const focus = within(screen.getByTestId("cap3-focus"))
    expect(focus.getByText("NHIỆM VỤ ĐANG LÀM")).toBeInTheDocument()
    expect(focus.getByText("Lệnh đầu tiên đủ khẩu vị + mức tự tin")).toBeInTheDocument()
    expect(focus.getByText(/Cấp 3 thêm quản lý vốn/)).toBeInTheDocument()
    expect(focus.getByText("Làm ngay →")).toBeInTheDocument()
    // Dòng checklist đã THU GỌN: mô tả dài + nút to chỉ còn ở ô tập trung.
    expect(
      within(screen.getByTestId("cap3-task-1")).queryByText("Làm ngay →"),
    ).not.toBeInTheDocument()
  })

  it("★ ô tập trung chuyển sang ② ngay khi ① xong (dẫn từng nhiệm vụ một)", () => {
    useCap3ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    const focus = within(screen.getByTestId("cap3-focus"))
    expect(focus.getByText("Kết sổ lệnh đầu Cấp 3")).toBeInTheDocument()
    expect(focus.getByText(/Bán 1 lệnh đang mở/)).toBeInTheDocument()
  })

  it("★ ①② xong → ô tập trung là ③ Thách thức, kèm tiến độ số lệnh", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t" }),
    })
    renderPanel()
    const focus = within(screen.getByTestId("cap3-focus"))
    expect(focus.getByText(/Thách thức Bản lĩnh/)).toBeInTheDocument()
    expect(focus.getByText("11/15 lệnh")).toBeInTheDocument()
  })

  it("★ xong cả 3 → ô tập trung đổi sang trạng thái sẵn sàng tốt nghiệp", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    renderPanel()
    const focus = screen.getByTestId("cap3-focus")
    expect(focus.className).toContain("cap0-focus--ready")
    expect(within(focus).getByText("Sẵn sàng tốt nghiệp Cấp 3")).toBeInTheDocument()
    expect(within(focus).getByText("ĐÃ XONG CẢ 3 NHIỆM VỤ")).toBeInTheDocument()
    expect(within(focus).queryByText("Làm ngay →")).not.toBeInTheDocument()
  })

  it("② is locked until ① is done", () => {
    renderPanel()
    expect(screen.getByTestId("cap3-task-2").className).toContain("cap0-checklist-item--locked")
  })

  it("② becomes active once ① is done", () => {
    useCap3ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    expect(screen.getByTestId("cap3-task-2").className).toContain("cap0-checklist-item--active")
  })

  it("done nhiệm vụ show the done state and bump the header count", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    renderPanel()
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap3-task-${no}`).className).toContain(
        "cap0-checklist-item--done",
      )
    }
    expect(screen.getByText("3/3")).toBeInTheDocument()
  })

  it("renders the Thách thức Bản lĩnh widget with ALL THREE conditions (§C12c)", () => {
    renderPanel()
    const widget = screen.getByTestId("cap3-thachthuc")
    expect(widget).toBeInTheDocument()
    expect(screen.getByTestId("cap3-thachthuc-lai_pct")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-thachthuc-so_lenh")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-thachthuc-diem_ky_luat")).toBeInTheDocument()
  })

  it("each thách-thức condition shows its CURRENT value vs its target", () => {
    renderPanel()
    expect(screen.getByTestId("cap3-thachthuc-lai_pct")).toHaveTextContent("Lãi ≥ +5% trên vốn")
    expect(screen.getByTestId("cap3-thachthuc-lai_pct")).toHaveTextContent("+3.2% / +5.0%")
    expect(screen.getByTestId("cap3-thachthuc-so_lenh")).toHaveTextContent(
      "Đủ 15 lệnh Thực chiến",
    )
    expect(screen.getByTestId("cap3-thachthuc-so_lenh")).toHaveTextContent("11/15")
    expect(screen.getByTestId("cap3-thachthuc-diem_ky_luat")).toHaveTextContent(
      "Điểm kỷ luật ≥ 80%",
    )
    expect(screen.getByTestId("cap3-thachthuc-diem_ky_luat")).toHaveTextContent("76% / 80%")
  })

  it("each thách-thức condition shows its OWN giải thích from the backend (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap3-thachthuc-lai_pct")).toHaveTextContent(
      /Lãi\/lỗ đã chốt ở Cấp 3 đang là 3.2%/,
    )
    expect(screen.getByTestId("cap3-thachthuc-so_lenh")).toHaveTextContent(
      /Đã qua 11\/15 lệnh Thực chiến/,
    )
    expect(screen.getByTestId("cap3-thachthuc-diem_ky_luat")).toHaveTextContent(
      /Điểm kỷ luật đo bạn có làm đúng cam kết không/,
    )
  })

  it("marks a met condition as đạt (✅) and an unmet one as chưa đạt (🔲)", () => {
    const tt = makeThachThuc()
    useThachThucMock.mockReturnValue({
      data: {
        ...tt,
        so_lenh: { ...tt.so_lenh, gia_tri_hien_tai: 16, dat: true },
      },
    })
    renderPanel()
    expect(screen.getByTestId("cap3-thachthuc-so_lenh")).toHaveAttribute("data-dat", "true")
    expect(screen.getByTestId("cap3-thachthuc-lai_pct")).toHaveAttribute("data-dat", "false")
  })

  it("explains WHY the thách thức is strict (spec §2③ — lãi có kỷ luật)", () => {
    renderPanel()
    expect(screen.getByTestId("cap3-thachthuc")).toHaveTextContent(/lãi.*có kỷ luật/i)
  })

  it("degrades gracefully while the thách thức data is still loading", () => {
    useThachThucMock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap3-thachthuc")).toBeInTheDocument()
    expect(screen.queryByTestId("cap3-thachthuc-lai_pct")).not.toBeInTheDocument()
  })

  it("renders the Điểm kỷ luật card (spec §9 — áp dụng cả Cấp 3)", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: {
        ngay: "2026-07-29",
        co_giao_dich: true,
        co_tinh_huong: true,
        diem: 84,
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
    expect(screen.getByTestId("cap2-diem-value")).toHaveTextContent("84")
  })

  it('clicking "Xem Phân tích danh mục →" switches the sidebar to the cap3-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap3 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap3-analysis")
  })

  it('"Làm ngay →" jumps to the đặt lệnh (trading) panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap3 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  // ★★ Ô mục tiêu là MÀN CUỐI mà người tốt nghiệp cấp trần nhìn thấy (modal tốt
  // nghiệp unmount xong là về đúng đây) — nó không được hứa một cấp chưa tồn tại.
  it("★ ô mục tiêu KHÔNG hứa Cấp 4 khi trần còn ở 3", () => {
    renderPanel()
    const goal = screen.getByTestId("cap3-journey-goal")
    expect(goal).toHaveTextContent(/Cấp 4 «Thuần thục» chưa ra mắt/)
    expect(goal).toHaveTextContent(/chặng cuối của chương trình hiện tại/)
    expect(goal).not.toHaveTextContent(/lên Cấp 4/)
  })

  it("★ ô mục tiêu trỏ thẳng sang Cấp 4 ngay khi trần được nâng lên 4", () => {
    flags.CAP_MAX_ENABLED = 4
    renderPanel()
    const goal = screen.getByTestId("cap3-journey-goal")
    expect(goal).toHaveTextContent(/tốt nghiệp Cấp 3, lên/)
    expect(goal).toHaveTextContent(/Cấp 4 «Thuần thục»/)
    expect(goal).not.toHaveTextContent(/chưa ra mắt/)
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec §11 — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })

  it("does not query Cấp 3 data outside a Cap3Provider (shared app-root sidebar)", () => {
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    renderPanel()
    expect(useCap3ProgressMock).toHaveBeenCalledWith(false)
    expect(useThachThucMock).toHaveBeenCalledWith(false)
  })
})
