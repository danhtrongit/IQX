import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap4Progress, LopWinRate, ThachThucCap4, VuKhiDiemMuCap4 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap4ProgressMock, useThachThucCap4Mock, useVuKhiDiemMuMock, useCap4EventsMock } =
  vi.hoisted(() => ({
    useCap4ProgressMock: vi.fn(),
    useThachThucCap4Mock: vi.fn(),
    useVuKhiDiemMuMock: vi.fn(),
    useCap4EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap4Active: true })),
  }))

vi.mock("./hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
  useThachThucCap4: (...a: unknown[]) => useThachThucCap4Mock(...a),
  useVuKhiDiemMu: (...a: unknown[]) => useVuKhiDiemMuMock(...a),
}))
vi.mock("./Cap4Context", () => ({
  useCap4Events: () => useCap4EventsMock(),
}))

import { JourneyPanelCap4 } from "./JourneyPanelCap4"

function makeProgress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "p4",
    user_id: "u1",
    entered_at: "2026-07-30T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 14,
    vu_khi_lop: null,
    diem_mu_lop: null,
    ty_le_thang_dong_thuan_cao: 57,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function makeThachThuc(overrides: Partial<ThachThucCap4> = {}): ThachThucCap4 {
  return {
    dat_ca_3: false,
    so_lenh_doc_du_5lop: {
      ten: "Đọc + chấm đủ 5 lớp qua ≥ 20 lệnh",
      gia_tri_hien_tai: 14,
      muc_tieu: 20,
      dat: false,
      giai_thich:
        "Đã có 14/20 lệnh bạn đọc và tự chấm cả 5 lớp trước khi đặt — đây là thói quen đọc toàn cảnh, không phải điểm đúng/sai.",
    },
    vu_khi_diem_mu: {
      ten: "Nhận ra vũ khí + điểm mù của mình",
      gia_tri_hien_tai: 1,
      muc_tieu: 2,
      dat: false,
      giai_thich:
        "Vũ khí: 💰 Dòng tiền · Điểm mù: chưa xác định. Cần ít nhất 3 lệnh đã đóng mỗi lớp mới kết luận.",
    },
    ty_le_thang_dong_thuan_cao: {
      ten: "Lệnh đồng thuận cao (≥3 lớp ủng hộ) thắng ≥ 60%",
      gia_tri_hien_tai: 57,
      muc_tieu: 60,
      dat: false,
      giai_thich:
        "Trong 7 lệnh đã đóng có ít nhất 3 lớp được đánh giá Ủng hộ, 4 lệnh thắng (57.1%) — kiểm chứng xem đọc toàn cảnh có giúp chọn lệnh tốt hơn không.",
    },
    ...overrides,
  }
}

function lopRow(overrides: Partial<LopWinRate> & Pick<LopWinRate, "lop">): LopWinRate {
  return {
    ten: "Dòng tiền",
    n_orders: 9,
    n_wins: 7,
    win_rate: 77.8,
    nhan: "vu_khi",
    giai_thich: "Bạn đọc lớp này là Ủng hộ ở 9 lệnh đã đóng, 7 lệnh thắng (77.8%).",
    ...overrides,
  }
}

function makeVuKhi(overrides: Partial<VuKhiDiemMuCap4> = {}): VuKhiDiemMuCap4 {
  return {
    lop: [
      lopRow({ lop: "dong_tien" }),
      lopRow({
        lop: "tin_tuc",
        ten: "Tin tức",
        n_orders: 6,
        n_wins: 2,
        win_rate: 33.3,
        nhan: "diem_mu",
        giai_thich: "Bạn đọc lớp này là Ủng hộ ở 6 lệnh đã đóng, 2 lệnh thắng (33.3%).",
      }),
    ],
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    so_lenh_toi_thieu: 3,
    nguong_vu_khi: 70,
    nguong_diem_mu: 50,
    giai_thich:
      "Số liệu tính từ lệnh THẬT đã đóng: mỗi lớp cần ít nhất 3 lệnh; ≥70% thắng là vũ khí, <50% là điểm mù.",
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap4 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap4", () => {
  beforeEach(() => {
    useCap4ProgressMock.mockReset()
    useCap4ProgressMock.mockReturnValue({ data: makeProgress() })
    useThachThucCap4Mock.mockReset()
    useThachThucCap4Mock.mockReturnValue({ data: makeThachThuc() })
    useVuKhiDiemMuMock.mockReset()
    useVuKhiDiemMuMock.mockReturnValue({ data: makeVuKhi() })
    useCap4EventsMock.mockReset()
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
  })

  it("renders the level card — CẤP 4 / THUẦN THỤC / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 4")).toBeInTheDocument()
    expect(screen.getByText("THUẦN THỤC")).toBeInTheDocument()
    expect(
      screen.getByText(
        '"Đọc trọn bức tranh, không chỉ một lý do — và biết mình đọc giỏi ở đâu."',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("renders the Cấp 4 badge (tím #a78bfa, fill=4)", () => {
    renderPanel()
    const svg = document.querySelector(".cap0-badge svg")
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML).toContain("#a78bfa")
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 5 · 0/3" with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 5 · 0/3")).toBeInTheDocument()
  })

  it("renders all 3 nhiệm vụ names verbatim (spec §2)", () => {
    renderPanel()
    expect(screen.getByText("Lệnh đầu tiên đọc + chấm đủ 5 lớp")).toBeInTheDocument()
    expect(screen.getByText("Kết sổ lệnh đầu Cấp 4")).toBeInTheDocument()
    expect(screen.getByText(/Thách thức Thuần thục — đọc toàn cảnh/)).toBeInTheDocument()
  })

  it("① is active from the moment the user enters Cấp 4, with its spec copy + Làm ngay", () => {
    renderPanel()
    expect(screen.getByTestId("cap4-task-1").className).toContain("cap0-checklist-item--active")
    expect(
      within(screen.getByTestId("cap4-task-1")).getByText(/không chọn 1 lý do nữa/),
    ).toBeInTheDocument()
    expect(within(screen.getByTestId("cap4-task-1")).getByText("Làm ngay →")).toBeInTheDocument()
  })

  it("② is locked until ① is done", () => {
    renderPanel()
    expect(screen.getByTestId("cap4-task-2").className).toContain("cap0-checklist-item--locked")
  })

  it("② becomes active once ① is done", () => {
    useCap4ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    expect(screen.getByTestId("cap4-task-2").className).toContain("cap0-checklist-item--active")
  })

  it("done nhiệm vụ show the done state and bump the header count", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    renderPanel()
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap4-task-${no}`).className).toContain(
        "cap0-checklist-item--done",
      )
    }
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 5 · 3/3")).toBeInTheDocument()
  })

  it("renders the Thách thức Thuần thục widget with ALL THREE conditions (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap4-thachthuc")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-thachthuc-so_lenh_doc_du_5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-thachthuc-vu_khi_diem_mu")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-thachthuc-ty_le_thang_dong_thuan_cao")).toBeInTheDocument()
  })

  it("each thách-thức condition shows its CURRENT value vs its target", () => {
    renderPanel()
    const soLenh = screen.getByTestId("cap4-thachthuc-so_lenh_doc_du_5lop")
    expect(soLenh).toHaveTextContent("Đọc + chấm đủ 5 lớp qua ≥ 20 lệnh")
    expect(soLenh).toHaveTextContent("14/20")

    const vuKhi = screen.getByTestId("cap4-thachthuc-vu_khi_diem_mu")
    expect(vuKhi).toHaveTextContent("Nhận ra vũ khí + điểm mù của mình")
    expect(vuKhi).toHaveTextContent("1/2")

    const tyLe = screen.getByTestId("cap4-thachthuc-ty_le_thang_dong_thuan_cao")
    expect(tyLe).toHaveTextContent("Lệnh đồng thuận cao (≥3 lớp ủng hộ) thắng ≥ 60%")
    expect(tyLe).toHaveTextContent("57% / 60%")
  })

  it("each thách-thức condition shows its OWN giải thích from the backend (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap4-thachthuc-so_lenh_doc_du_5lop")).toHaveTextContent(
      /thói quen đọc toàn cảnh/,
    )
    expect(screen.getByTestId("cap4-thachthuc-vu_khi_diem_mu")).toHaveTextContent(
      /Cần ít nhất 3 lệnh đã đóng mỗi lớp/,
    )
    expect(screen.getByTestId("cap4-thachthuc-ty_le_thang_dong_thuan_cao")).toHaveTextContent(
      /kiểm chứng xem đọc toàn cảnh có giúp chọn lệnh tốt hơn không/,
    )
  })

  it("marks a met condition as đạt and an unmet one as chưa đạt", () => {
    const tt = makeThachThuc()
    useThachThucCap4Mock.mockReturnValue({
      data: {
        ...tt,
        so_lenh_doc_du_5lop: { ...tt.so_lenh_doc_du_5lop, gia_tri_hien_tai: 21, dat: true },
      },
    })
    renderPanel()
    expect(screen.getByTestId("cap4-thachthuc-so_lenh_doc_du_5lop")).toHaveAttribute(
      "data-dat",
      "true",
    )
    expect(screen.getByTestId("cap4-thachthuc-ty_le_thang_dong_thuan_cao")).toHaveAttribute(
      "data-dat",
      "false",
    )
  })

  it("explains WHY the thách thức is strict — and that the goal is NOT matching AI (spec §2③)", () => {
    renderPanel()
    const widget = screen.getByTestId("cap4-thachthuc")
    expect(widget).toHaveTextContent(/kết quả thật/i)
    expect(widget).toHaveTextContent(/không phải.*khớp AI/i)
  })

  it("degrades gracefully while the thách thức data is still loading", () => {
    useThachThucCap4Mock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap4-thachthuc")).toBeInTheDocument()
    expect(screen.queryByTestId("cap4-thachthuc-so_lenh_doc_du_5lop")).not.toBeInTheDocument()
  })

  it("shows the current vũ khí + điểm mù lớp with the REAL win rate behind each (§C12c)", () => {
    renderPanel()
    const box = screen.getByTestId("cap4-journey-vukhi")
    expect(within(box).getByTestId("cap4-journey-vukhi-lop")).toHaveTextContent("💰 Dòng tiền")
    expect(within(box).getByTestId("cap4-journey-vukhi-lop")).toHaveTextContent("78%")
    expect(within(box).getByTestId("cap4-journey-vukhi-lop")).toHaveTextContent("7/9 lệnh")
    expect(within(box).getByTestId("cap4-journey-diemmu-lop")).toHaveTextContent("📰 Tin tức")
    expect(within(box).getByTestId("cap4-journey-diemmu-lop")).toHaveTextContent("33%")
    expect(within(box).getByTestId("cap4-journey-diemmu-lop")).toHaveTextContent("2/6 lệnh")
    // Nguồn gốc con số (ngưỡng + số lệnh tối thiểu) — câu của server.
    expect(box).toHaveTextContent(/Số liệu tính từ lệnh THẬT đã đóng/)
  })

  it("says chưa đủ dữ liệu for vũ khí/điểm mù when the system cannot conclude yet", () => {
    useVuKhiDiemMuMock.mockReturnValue({
      data: makeVuKhi({ vu_khi_lop: null, diem_mu_lop: null }),
    })
    renderPanel()
    expect(screen.getByTestId("cap4-journey-vukhi-lop")).toHaveTextContent(/chưa đủ dữ liệu/)
    expect(screen.getByTestId("cap4-journey-diemmu-lop")).toHaveTextContent(/chưa đủ dữ liệu/)
  })

  it("prefers the hồ sơ's own vũ khí/điểm mù when the server progress already concluded", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({ vu_khi_lop: "ky_thuat", diem_mu_lop: "dinh_gia" }),
    })
    useVuKhiDiemMuMock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap4-journey-vukhi-lop")).toHaveTextContent("Kỹ thuật")
    expect(screen.getByTestId("cap4-journey-diemmu-lop")).toHaveTextContent("Định giá")
  })

  it('clicking "Xem Phân tích danh mục →" switches the sidebar to the cap4-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap4 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap4-analysis")
  })

  it('"Làm ngay →" jumps to the đặt lệnh (trading) panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap4 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("shows the graduation goal box pointing at Cấp 5 «Lão luyện»", () => {
    renderPanel()
    expect(screen.getByText(/tốt nghiệp Cấp 4/)).toBeInTheDocument()
    expect(screen.getByText(/Cấp 5 «Lão luyện»/)).toBeInTheDocument()
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec §11 — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })

  it("does not query Cấp 4 data outside a Cap4Provider (shared app-root sidebar)", () => {
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    renderPanel()
    expect(useCap4ProgressMock).toHaveBeenCalledWith(false)
    expect(useThachThucCap4Mock).toHaveBeenCalledWith(false)
    expect(useVuKhiDiemMuMock).toHaveBeenCalledWith(false)
  })
})
