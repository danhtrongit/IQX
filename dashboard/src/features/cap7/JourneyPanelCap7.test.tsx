import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap7Progress, ThachThucCap7 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap7ProgressMock, useThachThucCap7Mock, useCap7EventsMock } = vi.hoisted(() => ({
  useCap7ProgressMock: vi.fn(),
  useThachThucCap7Mock: vi.fn(),
  useCap7EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap7Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap7Progress: (...a: unknown[]) => useCap7ProgressMock(...a),
  useThachThucCap7: (...a: unknown[]) => useThachThucCap7Mock(...a),
}))
vi.mock("./Cap7Context", () => ({
  useCap7Events: () => useCap7EventsMock(),
}))

import { JourneyPanelCap7, taskStateCap7 } from "./JourneyPanelCap7"

function makeProgress(overrides: Partial<Cap7Progress> = {}): Cap7Progress {
  return {
    id: "p7",
    user_id: "u1",
    entered_at: "2026-08-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_luc: 9,
    so_lan_khong_duoi_theo_co: 2,
    ty_le_doc_luc_dung: 58,
    graduated_at: null,
    time_to_graduate_hours: null,
    trong_phien: true,
    so_lenh_da_cham: 7,
    so_lenh_chua_cham: 2,
    so_lan_gap_co: 5,
    so_lan_mua_duoi_theo: 3,
    so_phien_cham: 2,
    ...overrides,
  }
}

/** Bản `thach-thuc` "bình thường" — cả 3 điều kiện đã xét được. */
function makeThachThuc(overrides: Partial<ThachThucCap7> = {}): ThachThucCap7 {
  return {
    dat_ca_3: false,
    so_lenh_doc_luc: {
      ten: "Đọc lực cho ≥ 15 lệnh",
      gia_tri_hien_tai: 9,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich:
        "Đã đọc lực cho 9/15 lệnh mua — mỗi lần là một lần bạn tự nhìn sổ dư mua/dư bán rồi tự chốt câu trả lời, thay vì mua theo cảm giác.",
    },
    so_lan_khong_duoi_theo_co: {
      ten: "Không đuổi theo ≥ 3 cờ cảnh giác",
      gia_tri_hien_tai: 2,
      muc_tieu: 3,
      dat: false,
      du_du_lieu: true,
      giai_thich:
        "Gặp cờ 5 lần, chờ xác nhận 2/3 lần (mua đuổi 3 lần). Mua đuổi KHÔNG bị phạt — nó chỉ không được tính vào ô kỷ luật này.",
    },
    ty_le_doc_luc_dung: {
      ten: "Tỷ lệ đọc lực đúng ≥ 55%",
      gia_tri_hien_tai: 58,
      muc_tieu: 55,
      dat: true,
      du_du_lieu: true,
      giai_thich:
        "Đọc lực đúng: 58% (đoán khớp diễn biến 4/7 lệnh đã chấm sau 2 phiên; mục tiêu ≥ 55%). Còn 2 lệnh chưa chấm được (chưa tới hạn hoặc chưa lấy được giá phiên đó) — những lệnh đó không nằm trong mẫu số và không bị tính là đọc sai.",
    },
    so_lenh_da_cham: 7,
    so_lenh_chua_cham: 2,
    so_lan_gap_co: 5,
    so_lan_mua_duoi_theo: 3,
    so_phien_cham: 2,
    ...overrides,
  }
}

/** Bản `thach-thuc` khi CHƯA đủ 3 lệnh đã chấm (điều kiện 3 chưa xét được). */
function makeThachThucChuaDu(): ThachThucCap7 {
  const base = makeThachThuc()
  return {
    ...base,
    ty_le_doc_luc_dung: {
      ...base.ty_le_doc_luc_dung,
      gia_tri_hien_tai: 0,
      muc_tieu: 55,
      dat: false,
      du_du_lieu: false,
      giai_thich:
        "Mới có 1 lệnh đọc lực đã chấm — cần ít nhất 3 lệnh đã chấm thì tỷ lệ mới nói được gì, nên IQX chỉ đếm và chưa hiện thống kê. Còn 4 lệnh chưa chấm được (chưa tới hạn hoặc chưa lấy được giá phiên đó) — những lệnh đó không nằm trong mẫu số và không bị tính là đọc sai.",
    },
    so_lenh_da_cham: 1,
    so_lenh_chua_cham: 4,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap7 />
    </SidebarProvider>,
  )
}

describe("taskStateCap7", () => {
  it("is active until the server stamps the task done", () => {
    expect(taskStateCap7(1, makeProgress())).toBe("active")
    expect(taskStateCap7(1, makeProgress({ task_1_done_at: "t" }))).toBe("done")
    expect(taskStateCap7(3, makeProgress({ task_3_done_at: "t" }))).toBe("done")
  })

  it("is active (not locked) with no progress at all", () => {
    expect(taskStateCap7(2, null)).toBe("active")
  })
})

describe("JourneyPanelCap7", () => {
  beforeEach(() => {
    useCap7ProgressMock.mockReset()
    useCap7ProgressMock.mockReturnValue({ data: makeProgress() })
    useThachThucCap7Mock.mockReset()
    useThachThucCap7Mock.mockReturnValue({ data: makeThachThuc() })
    useCap7EventsMock.mockReset()
    useCap7EventsMock.mockReturnValue({ isCap7Active: true })
  })

  it("renders the level card — CẤP 7 / ĐỌC SỔ LỆNH / bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 7")).toBeInTheDocument()
    expect(screen.getByText("ĐỌC SỔ LỆNH")).toBeInTheDocument()
    expect(
      screen.getByText(
        '"Sổ lệnh cho thấy lực mua/bán ngay lúc này — nhưng lệnh treo chưa phải lệnh thật."',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("renders the Cấp 7 badge in hồng magenta #c65cae (fill=7, no NaN)", () => {
    renderPanel()
    const svg = document.querySelector(".cap0-badge svg")
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML).toContain("#c65cae")
    expect(svg?.innerHTML).not.toContain("NaN")
  })

  it("the chip carries the user's REAL numbers, not a slogan (§C12c)", () => {
    renderPanel()
    const tag = screen.getByTestId("cap7-journey-tag")
    expect(tag).toHaveTextContent("9 lệnh đọc lực")
    expect(tag).toHaveTextContent("2 lần chờ xác nhận")
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 8 · 0/3" with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 8 · 0/3")).toBeInTheDocument()
  })

  it("renders all 3 nhiệm vụ names verbatim (spec §2)", () => {
    renderPanel()
    expect(screen.getByText("Lệnh đầu đọc sổ lệnh")).toBeInTheDocument()
    expect(screen.getByText("Kết sổ đầu Cấp 7")).toBeInTheDocument()
    expect(screen.getByText(/Thách thức Đọc sổ lệnh/)).toBeInTheDocument()
  })

  it("① and ② are both active from the moment the user enters Cấp 7", () => {
    renderPanel()
    expect(screen.getByTestId("cap7-task-1").className).toContain("cap0-checklist-item--active")
    expect(screen.getByTestId("cap7-task-2").className).toContain("cap0-checklist-item--active")
    expect(
      within(screen.getByTestId("cap7-task-1")).getByText(/trong giờ giao dịch/i),
    ).toBeInTheDocument()
    expect(within(screen.getByTestId("cap7-task-2")).getByText(/Kết sổ Cấp 7/)).toBeInTheDocument()
  })

  it("done nhiệm vụ show the done state and bump the header count", () => {
    useCap7ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    renderPanel()
    for (const no of [1, 2]) {
      expect(screen.getByTestId(`cap7-task-${no}`).className).toContain("cap0-checklist-item--done")
    }
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 8 · 3/3")).toBeInTheDocument()
  })

  // ── Widget nổi bật "Đọc lực đúng" (spec §3 header + §C12c) ─────────────────
  it("renders the prominent «Đọc lực đúng» widget with the server's rate", () => {
    renderPanel()
    const widget = screen.getByTestId("cap7-journey-docluc")
    expect(within(widget).getByText("Đọc lực đúng")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-journey-docluc-value")).toHaveTextContent("58%")
  })

  it("renders the server's giải thích VERBATIM under the widget (§C12c)", () => {
    renderPanel()
    expect(screen.getByTestId("cap7-journey-docluc-giaithich")).toHaveTextContent(
      "Đọc lực đúng: 58% (đoán khớp diễn biến 4/7 lệnh đã chấm sau 2 phiên; mục tiêu ≥ 55%).",
    )
  })

  it("says the Lực is only about timing — never the reason to buy (spec §9)", () => {
    renderPanel()
    const widget = screen.getByTestId("cap7-journey-docluc")
    expect(widget).toHaveTextContent(/thời điểm/i)
    expect(widget).toHaveTextContent(/lý do mua/i)
  })

  it("does NOT print a rate before 3 scored đọc-lực orders — says what is missing", () => {
    useThachThucCap7Mock.mockReturnValue({ data: makeThachThucChuaDu() })
    renderPanel()
    expect(screen.queryByTestId("cap7-journey-docluc-value")).not.toBeInTheDocument()
    const empty = screen.getByTestId("cap7-journey-docluc-empty")
    expect(empty).toHaveTextContent("1/3 lệnh đọc lực đã chấm")
    expect(empty).toHaveTextContent("4 lệnh chưa tới hạn chấm")
  })

  /**
   * ★ REGRESSION (fix wave FE-2). `KHOI16_MIN_DA_CHAM = 3` là bản MIRROR bằng tay
   * của `MIN_DA_CHAM_THONG_KE` phía server, và server KHÔNG công bố con số đó trên
   * wire — chỉ công bố cờ `du_du_lieu`. Cái CỔNG thì an toàn (nó AND với cờ của
   * server nên không trôi được), nhưng CÂU CHỮ thì trôi: server nâng lên 5 là
   * widget in "4/3 lệnh đọc lực đã chấm" ngay cạnh dòng "chưa đủ dữ liệu" — một
   * phân số đã đạt, đứng cạnh một câu nói chưa đạt.
   *
   * Fixture đổi ĐÚNG MỘT thứ so với `makeThachThucChuaDu()`: `so_lenh_da_cham` từ
   * 1 lên 4 (vượt hằng số FE) trong khi `du_du_lieu` vẫn `false`.
   */
  it("★ server nâng ngưỡng (đã chấm > hằng số FE mà vẫn chưa đủ) → KHÔNG in '4/3'", () => {
    const base = makeThachThucChuaDu()
    useThachThucCap7Mock.mockReturnValue({
      data: { ...base, so_lenh_da_cham: 4 },
    })
    renderPanel()
    const empty = screen.getByTestId("cap7-journey-docluc-empty").textContent!
    expect(empty).not.toContain("4/3")
    // Vẫn phải nói ra con số THẬT của user + nói rõ hệ chưa chốt được tỷ lệ.
    expect(empty).toContain("4 lệnh đọc lực đã chấm")
    expect(empty).toMatch(/chưa chốt được|chưa đủ/i)

    const tyLe = screen.getByTestId("cap7-thachthuc-ty_le_doc_luc_dung").textContent!
    expect(tyLe).not.toContain("4/3")
  })

  it("dưới hằng số FE và server cũng nói chưa đủ → VẪN in phân số 1/3 như cũ", () => {
    useThachThucCap7Mock.mockReturnValue({ data: makeThachThucChuaDu() })
    renderPanel()
    expect(screen.getByTestId("cap7-journey-docluc-empty").textContent).toContain(
      "1/3 lệnh đọc lực đã chấm",
    )
  })

  // ── Widget "Thách thức Đọc sổ lệnh" = nhiệm vụ ③ (spec §2③) ───────────────
  it("renders the Thách thức widget with ALL THREE conditions", () => {
    renderPanel()
    expect(screen.getByTestId("cap7-thachthuc")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-thachthuc-so_lenh_doc_luc")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-thachthuc-so_lan_khong_duoi_theo_co")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-thachthuc-ty_le_doc_luc_dung")).toBeInTheDocument()
  })

  it("each condition shows its CURRENT value vs its target + the server's giải thích", () => {
    renderPanel()
    const soLenh = screen.getByTestId("cap7-thachthuc-so_lenh_doc_luc")
    expect(soLenh).toHaveTextContent("Đọc lực cho ≥ 15 lệnh")
    expect(soLenh).toHaveTextContent("9/15")
    expect(soLenh).toHaveTextContent("Đã đọc lực cho 9/15 lệnh mua")

    const co = screen.getByTestId("cap7-thachthuc-so_lan_khong_duoi_theo_co")
    expect(co).toHaveTextContent("Không đuổi theo ≥ 3 cờ cảnh giác")
    expect(co).toHaveTextContent("2/3")
    expect(co).toHaveTextContent("Gặp cờ 5 lần, chờ xác nhận 2/3 lần (mua đuổi 3 lần).")

    const tyLe = screen.getByTestId("cap7-thachthuc-ty_le_doc_luc_dung")
    expect(tyLe).toHaveTextContent("Tỷ lệ đọc lực đúng ≥ 55%")
    expect(tyLe).toHaveTextContent("58%/55%")
    expect(tyLe).toHaveAttribute("data-dat", "true")
  })

  it("★ names the unscored orders and says they are NOT counted as wrong", () => {
    renderPanel()
    const tyLe = screen.getByTestId("cap7-thachthuc-ty_le_doc_luc_dung")
    expect(tyLe).toHaveTextContent("2 lệnh chưa tới hạn chấm")
    expect(tyLe).toHaveTextContent(/không bị tính là đọc sai/i)
  })

  it("the 3rd condition shows «chưa đủ dữ liệu» — not a verdict — when < 3 scored", () => {
    useThachThucCap7Mock.mockReturnValue({ data: makeThachThucChuaDu() })
    renderPanel()
    const tyLe = screen.getByTestId("cap7-thachthuc-ty_le_doc_luc_dung")
    expect(tyLe).toHaveAttribute("data-du-du-lieu", "false")
    expect(tyLe).toHaveAttribute("data-dat", "false")
    expect(tyLe).toHaveTextContent("chưa đủ dữ liệu")
    // KHÔNG hiện "0%/55%" — con số đó vu cho user đọc sai sạch.
    expect(tyLe.textContent).not.toMatch(/0%\/55%/)
    expect(tyLe).toHaveTextContent("Mới có 1 lệnh đọc lực đã chấm")
    expect(tyLe).toHaveTextContent("1/3 lệnh đọc lực đã chấm")
  })

  it("says all 3 conditions must hold at once (tốt nghiệp = 3/3)", () => {
    renderPanel()
    expect(screen.getByTestId("cap7-thachthuc")).toHaveTextContent(/CẢ 3 điều kiện/)
  })

  it("shows a loading line instead of fake numbers while thach-thuc is in flight", () => {
    useThachThucCap7Mock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap7-thachthuc")).toHaveTextContent(/Đang tính 3 điều kiện/)
    expect(screen.queryByTestId("cap7-thachthuc-so_lenh_doc_luc")).not.toBeInTheDocument()
  })

  it("NEVER claims IQX detects fake orders (spec §9)", () => {
    renderPanel()
    const text = document.body.textContent ?? ""
    expect(text).not.toMatch(/phát hiện lệnh giả/i)
    expect(text).not.toMatch(/lệnh giả\b/i)
  })

  // ── Điều hướng + ô đích ───────────────────────────────────────────────────
  it('"Xem Phân tích danh mục →" switches the sidebar to the cap7-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap7 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap7-analysis")
  })

  it("the goal box points at Cấp 8 «Quản trị rủi ro danh mục» and says it is sắp ra mắt", () => {
    renderPanel()
    const goal = screen.getByTestId("cap7-journey-goal")
    expect(goal).toHaveTextContent(/tốt nghiệp Cấp 7/)
    expect(goal).toHaveTextContent(/Cấp 8 «Quản trị rủi ro danh mục»/)
    expect(goal).toHaveTextContent(/sắp ra mắt/)
  })

  it("does not query anything outside a Cap7Provider", () => {
    useCap7EventsMock.mockReturnValue({ isCap7Active: false })
    renderPanel()
    expect(useCap7ProgressMock).toHaveBeenCalledWith(false)
    expect(useThachThucCap7Mock).toHaveBeenCalledWith(false)
  })

  it("shows no huy chương / confetti / leaderboard (spec §9)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Bb]ảng xếp hạng/)).not.toBeInTheDocument()
  })
})
