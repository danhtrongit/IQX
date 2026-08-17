import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap5Progress, ThachThucCap5 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap5ProgressMock, useThachThucCap5Mock, useCap5EventsMock } = vi.hoisted(() => ({
  useCap5ProgressMock: vi.fn(),
  useThachThucCap5Mock: vi.fn(),
  useCap5EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap5Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
  useThachThucCap5: (...a: unknown[]) => useThachThucCap5Mock(...a),
}))
vi.mock("./Cap5Context", () => ({
  useCap5Events: () => useCap5EventsMock(),
}))

import { JourneyPanelCap5 } from "./JourneyPanelCap5"

function makeProgress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p5",
    user_id: "u1",
    entered_at: "2026-07-31T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_phan_loai: 25,
    so_lan_dung_ngoai_da_cham: 3,
    ty_le_quyet_dinh_dung: 72,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function makeThachThuc(overrides: Partial<ThachThucCap5> = {}): ThachThucCap5 {
  return {
    dat_ca_3: false,
    so_lenh_phan_loai: {
      ten: "Phân loại 4 ô cho ≥ 20 lệnh",
      gia_tri_hien_tai: 25,
      muc_tieu: 20,
      dat: true,
      giai_thich:
        "Đã có 25/20 lệnh bạn nhìn lại qua 4 ô — mỗi lệnh được xếp theo quyết định đúng/sai × thắng/thua.",
    },
    so_lan_dung_ngoai_da_cham: {
      ten: "≥ 5 lần đứng ngoài đã tới hạn chấm",
      gia_tri_hien_tai: 3,
      muc_tieu: 5,
      dat: false,
      giai_thich:
        "Đã chấm 3/5 nước đứng ngoài (trên tổng 4 lần đã ghi) — chỉ tính các lần đã đủ 5 phiên để biết né đúng hay hụt. Đứng ngoài nhiều hơn KHÔNG được thưởng thêm.",
    },
    ty_le_quyet_dinh_dung: {
      ten: "Tỷ lệ quyết định đúng ≥ 70%",
      gia_tri_hien_tai: 72,
      muc_tieu: 70,
      dat: true,
      giai_thich:
        "72% (18/25 lệnh) làm đúng quy trình — bất kể lãi/lỗ. Đây là thước đo CHẤT LƯỢNG QUYẾT ĐỊNH, không phải tỷ lệ thắng.",
    },
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap5 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap5", () => {
  beforeEach(() => {
    useCap5ProgressMock.mockReset()
    useCap5ProgressMock.mockReturnValue({ data: makeProgress() })
    useThachThucCap5Mock.mockReset()
    useThachThucCap5Mock.mockReturnValue({ data: makeThachThuc() })
    useCap5EventsMock.mockReset()
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
  })

  it("renders the level card — CẤP 5 / LÃO LUYỆN / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 5")).toBeInTheDocument()
    expect(screen.getByText("LÃO LUYỆN")).toBeInTheDocument()
    expect(
      screen.getByText(
        '"Kết quả tốt không chắc là quyết định đúng — và đứng ngoài cũng là một quyết định."',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("renders the Cấp 5 badge (vàng kim #e0b64d, fill=5)", () => {
    renderPanel()
    const svg = document.querySelector(".cap0-badge svg")
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML).toContain("#e0b64d")
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 6 · 0/3" with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 6 · 0/3")).toBeInTheDocument()
  })

  it("renders all 3 nhiệm vụ names verbatim (spec §2)", () => {
    renderPanel()
    expect(screen.getByText("Lệnh đầu Cấp 5 — phân loại 4 ô")).toBeInTheDocument()
    expect(screen.getByText("Đứng ngoài đầu tiên")).toBeInTheDocument()
    expect(screen.getByText(/Thách thức Lão luyện — chất lượng quyết định/)).toBeInTheDocument()
  })

  it("① and ② are BOTH active from the moment the user enters Cấp 5 (spec §2 «Điều kiện mở: vào Cấp 5»)", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-task-1").className).toContain("cap0-checklist-item--active")
    expect(screen.getByTestId("cap5-task-2").className).toContain("cap0-checklist-item--active")
    expect(
      within(screen.getByTestId("cap5-task-1")).getByText(/verdict hệ gợi ý/),
    ).toBeInTheDocument()
    // Copy VERBATIM spec §2②.
    expect(
      within(screen.getByTestId("cap5-task-2")).getByText(
        /Không phải lúc nào cũng phải mua\. Chọn một mã bạn đang xem nhưng quyết định KHÔNG mua/,
      ),
    ).toBeInTheDocument()
  })

  it("done nhiệm vụ show the done state and bump the header count", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    renderPanel()
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap5-task-${no}`).className).toContain(
        "cap0-checklist-item--done",
      )
    }
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 6 · 3/3")).toBeInTheDocument()
  })

  // ── Widget nổi bật "Tỷ lệ quyết định đúng" (spec §7 mục 2 + §C12c) ─────────
  it("renders the prominent Tỷ lệ quyết định đúng widget from the hồ sơ", () => {
    renderPanel()
    const widget = screen.getByTestId("cap5-journey-tyle")
    expect(within(widget).getByText("Tỷ lệ quyết định đúng")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-journey-tyle-value")).toHaveTextContent("72%")
  })

  it("shows the COUNTS the tỷ lệ came from (§C12c — never a bare number)", () => {
    renderPanel()
    // Số lệnh đã phân loại — từ chính hồ sơ server.
    expect(screen.getByTestId("cap5-journey-tyle-counts")).toHaveTextContent("25 lệnh")
    // Câu giải thích của server kèm đúng/tổng.
    expect(screen.getByTestId("cap5-journey-tyle-giaithich")).toHaveTextContent("18/25 lệnh")
  })

  it("says the tỷ lệ measures PROCESS, not win rate (§C12c)", () => {
    renderPanel()
    const widget = screen.getByTestId("cap5-journey-tyle")
    expect(widget).toHaveTextContent(/quy trình/i)
    expect(widget).toHaveTextContent(/không phải tỷ lệ thắng/i)
  })

  it("says so honestly when nothing has been classified yet instead of showing 0%", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_phan_loai: 0, ty_le_quyet_dinh_dung: 0 }),
    })
    renderPanel()
    expect(screen.queryByTestId("cap5-journey-tyle-value")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap5-journey-tyle-empty")).toHaveTextContent(
      /Chưa có lệnh nào được phân loại/,
    )
  })

  // ── Widget "Thách thức Lão luyện" = nhiệm vụ ③ (spec §2③) ─────────────────
  it("renders the Thách thức Lão luyện widget with ALL THREE conditions (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-thachthuc")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-thachthuc-so_lenh_phan_loai")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-thachthuc-so_lan_dung_ngoai_da_cham")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-thachthuc-ty_le_quyet_dinh_dung")).toBeInTheDocument()
  })

  it("each thách-thức condition shows its CURRENT value vs its target", () => {
    renderPanel()
    const soLenh = screen.getByTestId("cap5-thachthuc-so_lenh_phan_loai")
    expect(soLenh).toHaveTextContent("Phân loại 4 ô cho ≥ 20 lệnh")
    expect(soLenh).toHaveTextContent("25/20")

    const dungNgoai = screen.getByTestId("cap5-thachthuc-so_lan_dung_ngoai_da_cham")
    expect(dungNgoai).toHaveTextContent("≥ 5 lần đứng ngoài đã tới hạn chấm")
    expect(dungNgoai).toHaveTextContent("3/5")

    const tyLe = screen.getByTestId("cap5-thachthuc-ty_le_quyet_dinh_dung")
    expect(tyLe).toHaveTextContent("Tỷ lệ quyết định đúng ≥ 70%")
    expect(tyLe).toHaveTextContent("72% / 70%")
  })

  it("each thách-thức condition shows its OWN giải thích from the backend (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-thachthuc-so_lenh_phan_loai")).toHaveTextContent(
      /quyết định đúng\/sai × thắng\/thua/,
    )
    expect(screen.getByTestId("cap5-thachthuc-so_lan_dung_ngoai_da_cham")).toHaveTextContent(
      /Đứng ngoài nhiều hơn KHÔNG được thưởng thêm/,
    )
    expect(screen.getByTestId("cap5-thachthuc-ty_le_quyet_dinh_dung")).toHaveTextContent(
      /thước đo CHẤT LƯỢNG QUYẾT ĐỊNH, không phải tỷ lệ thắng/,
    )
  })

  it("marks a met condition as đạt and an unmet one as chưa đạt", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-thachthuc-so_lenh_phan_loai")).toHaveAttribute(
      "data-dat",
      "true",
    )
    expect(screen.getByTestId("cap5-thachthuc-so_lan_dung_ngoai_da_cham")).toHaveAttribute(
      "data-dat",
      "false",
    )
  })

  it("degrades gracefully while the thách thức data is still loading", () => {
    useThachThucCap5Mock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap5-thachthuc")).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-thachthuc-so_lenh_phan_loai")).not.toBeInTheDocument()
  })

  it("explains that all 3 conditions must hold at once and that đứng ngoài is not rewarded by volume", () => {
    renderPanel()
    const widget = screen.getByTestId("cap5-thachthuc")
    expect(widget).toHaveTextContent(/CẢ 3 điều kiện/i)
  })

  it('clicking "Xem Phân tích danh mục →" switches the sidebar to the cap5-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap5 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap5-analysis")
  })

  it('"Làm ngay →" jumps to the đặt lệnh (trading) panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap5 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getAllByText("Làm ngay →")[0])
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("shows the goal box: 3/3 closes the 0-5 foundational arc, next is Cấp 6 (now live)", () => {
    renderPanel()
    const goal = screen.getByTestId("cap5-journey-goal")
    expect(goal).toHaveTextContent(/tốt nghiệp Cấp 5/)
    expect(goal).toHaveTextContent(/mạch nền tảng/)
    expect(goal).toHaveTextContent(/Cấp 6 «Đối chiếu»/)
    // Cấp 6 đã có thật (Cấp 6 Task FE3) — không còn hứa "sắp ra mắt".
    expect(goal.textContent).not.toMatch(/sắp ra mắt/)
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec §9 — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })

  it("does not query Cấp 5 data outside a Cap5Provider (shared app-root sidebar)", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    renderPanel()
    expect(useCap5ProgressMock).toHaveBeenCalledWith(false)
    expect(useThachThucCap5Mock).toHaveBeenCalledWith(false)
  })
})
