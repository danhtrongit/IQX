import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap6Progress, NhomDoiChieuCap6, ThachThucCap6 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap6ProgressMock, useThachThucCap6Mock, useCap6EventsMock } = vi.hoisted(() => ({
  useCap6ProgressMock: vi.fn(),
  useThachThucCap6Mock: vi.fn(),
  useCap6EventsMock: vi.fn(() => ({ isCap6Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
  useThachThucCap6: (...a: unknown[]) => useThachThucCap6Mock(...a),
}))
vi.mock("./Cap6Context", () => ({
  useCap6Events: () => useCap6EventsMock(),
}))

import { JourneyPanelCap6, taskStateCap6 } from "./JourneyPanelCap6"

function makeProgress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    id: "p6",
    user_id: "u1",
    entered_at: "2026-07-31T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doi_chieu: 9,
    so_kieu_da_gap: 2,
    ty_le_thang_khop: 64,
    ty_le_thang_lech: 41,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function makeNhom(khop: boolean, overrides: Partial<NhomDoiChieuCap6> = {}): NhomDoiChieuCap6 {
  const ten = khop ? "Nhóm khớp gợi ý" : "Nhóm lệch gợi ý"
  return {
    khop,
    ten,
    so_lenh: khop ? 7 : 5,
    so_thang: khop ? 5 : 2,
    ty_le_thang: khop ? 64 : 41,
    du_du_lieu: true,
    so_lenh_toi_thieu: 3,
    giai_thich: `${ten}: ${khop ? 5 : 2}/${khop ? 7 : 5} lệnh đã đóng thắng.`,
    ...overrides,
  }
}

function makeThachThuc(overrides: Partial<ThachThucCap6> = {}): ThachThucCap6 {
  return {
    dat_ca_3: false,
    so_lenh_doi_chieu: {
      ten: "Đối chiếu ≥ 15 lệnh có mâu thuẫn",
      gia_tri_hien_tai: 9,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich:
        "Đã có 9/15 lệnh bạn đi qua bước Đối chiếu — mỗi lệnh là một lần bạn chọn có ý thức lớp nào đáng tin khi các lớp nói ngược nhau.",
    },
    so_kieu_da_gap: {
      ten: "Gặp ≥ 3 kiểu cổ phiếu khác nhau",
      gia_tri_hien_tai: 2,
      muc_tieu: 3,
      dat: false,
      du_du_lieu: true,
      giai_thich:
        "Đã đối chiếu trên 2/3 kiểu cổ phiếu (Ngân hàng, Bất động sản) — trọng số lớp khác nhau theo từng kiểu.",
    },
    doi_chieu_giup_ich: {
      ten: "Nhóm khớp gợi ý thắng ≥ nhóm lệch (mỗi nhóm ≥ 3 lệnh)",
      gia_tri_hien_tai: 64,
      muc_tieu: 41,
      dat: true,
      du_du_lieu: true,
      giai_thich:
        "Nhóm khớp gợi ý thắng 64% (5/7 lệnh) vs nhóm lệch 41% (2/5 lệnh) — đối chiếu theo kiểu đang giúp bạn chọn đúng lớp.",
    },
    nhom_khop: makeNhom(true),
    nhom_lech: makeNhom(false),
    ...overrides,
  }
}

/** Bản `thach-thuc` khi CHƯA đủ 3 lệnh đã đóng ở một nhóm (điều kiện 3 chưa xét được). */
function makeThachThucChuaDu(): ThachThucCap6 {
  const base = makeThachThuc()
  return {
    ...base,
    doi_chieu_giup_ich: {
      ...base.doi_chieu_giup_ich,
      gia_tri_hien_tai: 0,
      muc_tieu: 0,
      dat: false,
      du_du_lieu: false,
      giai_thich:
        "Chưa so sánh được: nhóm khớp gợi ý có 2 lệnh đã đóng, nhóm lệch có 1 — mỗi nhóm cần ít nhất 3 lệnh mới kết luận. Trên 1-2 lệnh thì con số không nói được gì, nên IQX không so.",
    },
    nhom_khop: makeNhom(true, { so_lenh: 2, so_thang: 1, ty_le_thang: 50, du_du_lieu: false }),
    nhom_lech: makeNhom(false, { so_lenh: 1, so_thang: 0, ty_le_thang: 0, du_du_lieu: false }),
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap6 />
    </SidebarProvider>,
  )
}

describe("taskStateCap6", () => {
  it("is active until the server stamps the task done", () => {
    expect(taskStateCap6(1, makeProgress())).toBe("active")
    expect(taskStateCap6(1, makeProgress({ task_1_done_at: "t" }))).toBe("done")
    expect(taskStateCap6(3, makeProgress({ task_3_done_at: "t" }))).toBe("done")
  })

  it("is active (not locked) with no progress at all", () => {
    expect(taskStateCap6(2, null)).toBe("active")
  })
})

describe("JourneyPanelCap6", () => {
  beforeEach(() => {
    useCap6ProgressMock.mockReset()
    useCap6ProgressMock.mockReturnValue({ data: makeProgress() })
    useThachThucCap6Mock.mockReset()
    useThachThucCap6Mock.mockReturnValue({ data: makeThachThuc() })
    useCap6EventsMock.mockReset()
    useCap6EventsMock.mockReturnValue({ isCap6Active: true })
  })

  it("renders the level card — CẤP 6 / ĐỐI CHIẾU / bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 6")).toBeInTheDocument()
    expect(screen.getByText("ĐỐI CHIẾU")).toBeInTheDocument()
    expect(
      screen.getByText(
        '"Khi các lớp nói ngược nhau, tin lớp nào — và điều đó tùy loại cổ phiếu."',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("renders the Cấp 6 badge in đỏ son #d64550", () => {
    renderPanel()
    const svg = document.querySelector(".cap0-badge svg")
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML).toContain("#d64550")
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 7 · 0/3" with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 7 · 0/3")).toBeInTheDocument()
  })

  it("renders all 3 nhiệm vụ names verbatim (spec §2)", () => {
    renderPanel()
    expect(screen.getByText("Lệnh đầu có đối chiếu")).toBeInTheDocument()
    expect(screen.getByText("Kết sổ đầu Cấp 6")).toBeInTheDocument()
    expect(screen.getByText(/Thách thức Đối chiếu/)).toBeInTheDocument()
  })

  it("① and ② are both active from the moment the user enters Cấp 6", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-task-1").className).toContain("cap0-checklist-item--active")
    expect(screen.getByTestId("cap6-task-2").className).toContain("cap0-checklist-item--active")
    expect(within(screen.getByTestId("cap6-task-1")).getByText(/mâu thuẫn/)).toBeInTheDocument()
    expect(within(screen.getByTestId("cap6-task-2")).getByText(/Kết sổ Cấp 6/)).toBeInTheDocument()
  })

  it("done nhiệm vụ show the done state and bump the header count", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    renderPanel()
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap6-task-${no}`).className).toContain("cap0-checklist-item--done")
    }
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 7 · 3/3")).toBeInTheDocument()
  })

  // ── Widget nổi bật "Đối chiếu theo kiểu" (spec §8 mục 2 + §C12c) ───────────
  it("renders the prominent «Đối chiếu theo kiểu» widget — khớp % vs lệch %", () => {
    renderPanel()
    const widget = screen.getByTestId("cap6-journey-doichieu")
    expect(within(widget).getByText("Đối chiếu theo kiểu")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-journey-doichieu-value")).toHaveTextContent(
      "khớp 64% vs lệch 41%",
    )
  })

  it("renders the server's giải thích VERBATIM under the widget (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-journey-doichieu-giaithich")).toHaveTextContent(
      "Nhóm khớp gợi ý thắng 64% (5/7 lệnh) vs nhóm lệch 41% (2/5 lệnh) — đối chiếu theo kiểu đang giúp bạn chọn đúng lớp.",
    )
  })

  it('never says "sai" about lệch gợi ý — it is a neutral second group', () => {
    renderPanel()
    const widget = screen.getByTestId("cap6-journey-doichieu")
    expect(widget.textContent).not.toMatch(/\bsai\b/i)
    expect(widget).toHaveTextContent(/trung tính/i)
  })

  it("does NOT print 0% vs 0% before both groups have ≥3 closed trades — says what is missing", () => {
    useThachThucCap6Mock.mockReturnValue({ data: makeThachThucChuaDu() })
    renderPanel()
    expect(screen.queryByTestId("cap6-journey-doichieu-value")).not.toBeInTheDocument()
    const empty = screen.getByTestId("cap6-journey-doichieu-empty")
    // Còn thiếu bao nhiêu lệnh MỖI nhóm — không phải một phán quyết.
    expect(empty).toHaveTextContent("Nhóm khớp gợi ý: 2/3 lệnh đã đóng")
    expect(empty).toHaveTextContent("Nhóm lệch gợi ý: 1/3 lệnh đã đóng")
  })

  // ── Widget "Thách thức Đối chiếu" = nhiệm vụ ③ (spec §2③) ─────────────────
  it("renders the Thách thức widget with ALL THREE conditions", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-thachthuc")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-thachthuc-so_lenh_doi_chieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-thachthuc-so_kieu_da_gap")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-thachthuc-doi_chieu_giup_ich")).toBeInTheDocument()
  })

  it("each condition shows its CURRENT value vs its target + the server's giải thích", () => {
    renderPanel()
    const soLenh = screen.getByTestId("cap6-thachthuc-so_lenh_doi_chieu")
    expect(soLenh).toHaveTextContent("Đối chiếu ≥ 15 lệnh có mâu thuẫn")
    expect(soLenh).toHaveTextContent("9/15")
    expect(soLenh).toHaveTextContent("Đã có 9/15 lệnh bạn đi qua bước Đối chiếu")

    const soKieu = screen.getByTestId("cap6-thachthuc-so_kieu_da_gap")
    expect(soKieu).toHaveTextContent("Gặp ≥ 3 kiểu cổ phiếu khác nhau")
    expect(soKieu).toHaveTextContent("2/3")
    expect(soKieu).toHaveTextContent("(Ngân hàng, Bất động sản)")

    const giupIch = screen.getByTestId("cap6-thachthuc-doi_chieu_giup_ich")
    expect(giupIch).toHaveTextContent("Nhóm khớp gợi ý thắng ≥ nhóm lệch (mỗi nhóm ≥ 3 lệnh)")
    expect(giupIch).toHaveTextContent("64% vs 41%")
    expect(giupIch).toHaveAttribute("data-dat", "true")
  })

  it("the 3rd condition shows «chưa đủ dữ liệu» — not a verdict — when a group is short", () => {
    useThachThucCap6Mock.mockReturnValue({ data: makeThachThucChuaDu() })
    renderPanel()
    const giupIch = screen.getByTestId("cap6-thachthuc-doi_chieu_giup_ich")
    expect(giupIch).toHaveAttribute("data-du-du-lieu", "false")
    expect(giupIch).toHaveAttribute("data-dat", "false")
    expect(giupIch).toHaveTextContent("chưa đủ dữ liệu")
    // KHÔNG hiện "0% vs 0%" — con số đó là bịa.
    expect(giupIch.textContent).not.toMatch(/0% vs 0%/)
    // Vẫn hiện câu giải thích của server, nguyên văn.
    expect(giupIch).toHaveTextContent("Chưa so sánh được: nhóm khớp gợi ý có 2 lệnh đã đóng")
    // … và còn thiếu bao nhiêu.
    expect(giupIch).toHaveTextContent("Nhóm khớp gợi ý: 2/3 lệnh đã đóng")
    expect(giupIch).toHaveTextContent("Nhóm lệch gợi ý: 1/3 lệnh đã đóng")
  })

  it("says all 3 conditions must hold at once (tốt nghiệp = 3/3)", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-thachthuc")).toHaveTextContent(/CẢ 3 điều kiện/)
  })

  it("shows a loading line instead of fake numbers while thach-thuc is in flight", () => {
    useThachThucCap6Mock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap6-thachthuc")).toHaveTextContent(/Đang tính 3 điều kiện/)
    expect(screen.queryByTestId("cap6-thachthuc-so_lenh_doi_chieu")).not.toBeInTheDocument()
  })

  // ── Điều hướng + ô đích ───────────────────────────────────────────────────
  it('"Xem Phân tích danh mục →" switches the sidebar to the cap6-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap6 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap6-analysis")
  })

  it("the goal box points at Cấp 7 «Đọc sổ lệnh» and says it is sắp ra mắt", () => {
    renderPanel()
    const goal = screen.getByTestId("cap6-journey-goal")
    expect(goal).toHaveTextContent(/tốt nghiệp Cấp 6/)
    expect(goal).toHaveTextContent(/Cấp 7 «Đọc sổ lệnh»/)
    expect(goal).toHaveTextContent(/sắp ra mắt/)
  })

  it("does not query anything outside a Cap6Provider", () => {
    useCap6EventsMock.mockReturnValue({ isCap6Active: false })
    renderPanel()
    expect(useCap6ProgressMock).toHaveBeenCalledWith(false)
    expect(useThachThucCap6Mock).toHaveBeenCalledWith(false)
  })

  it("shows no huy chương / confetti / leaderboard (spec §10)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Bb]ảng xếp hạng/)).not.toBeInTheDocument()
  })
})
