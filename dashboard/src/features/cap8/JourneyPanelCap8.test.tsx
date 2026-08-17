import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap8Progress, DanhMucCap8, ThachThucCap8 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap8ProgressMock, useThachThucCap8Mock, useCap8EventsMock } = vi.hoisted(() => ({
  useCap8ProgressMock: vi.fn(),
  useThachThucCap8Mock: vi.fn(),
  useCap8EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap8Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap8Progress: (...a: unknown[]) => useCap8ProgressMock(...a),
  useThachThucCap8: (...a: unknown[]) => useThachThucCap8Mock(...a),
}))
vi.mock("./Cap8Context", () => ({
  useCap8Events: () => useCap8EventsMock(),
}))

import { JourneyPanelCap8, taskStateCap8 } from "./JourneyPanelCap8"

function makeProgress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return {
    id: "p8",
    user_id: "u1",
    entered_at: "2026-11-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_kiem_tra: 9,
    so_lan_mua_bat_chap_canh_bao: 4,
    don_nganh_max_pct: 46,
    tong_rui_ro_pct: 17,
    graduated_at: null,
    time_to_graduate_hours: null,
    so_lan_co_canh_bao: 6,
    bat_chap_gan_day: 1,
    cua_so_gan_day: 9,
    so_lenh_da_ket_so: 5,
    ...overrides,
  }
}

function makeDanhMuc(overrides: Partial<DanhMucCap8> = {}): DanhMucCap8 {
  return {
    nav_vnd: 120_000_000,
    so_vi_the: 4,
    so_vi_the_thieu_cat_lo: 0,
    so_vi_the_thieu_gia: 0,
    phan_bo_nganh: [
      { nganh: "Ngân hàng", pct: 46 },
      { nganh: "Thép", pct: 20 },
      { nganh: "Tiền mặt", pct: 34 },
    ],
    don_nganh_max: { nganh: "Ngân hàng", pct: 46 },
    tong_rui_ro_pct: 17,
    khau_vi: "can_bang",
    khau_vi_ten: "Cân bằng",
    tran_khau_vi_pct: 20,
    cap_tuong_quan_cao: [{ a: "TCB", b: "MBB", he_so: 0.82 }],
    tuong_quan_du_lieu: true,
    caveat: "",
    cross_ref_pm:
      "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở «Phân tích danh mục» (Người quản lý danh mục).",
    ...overrides,
  }
}

/** Bản `thach-thuc` "bình thường" — cả 3 điều kiện đã tính được. */
function makeThachThuc(overrides: Partial<ThachThucCap8> = {}): ThachThucCap8 {
  return {
    dat_ca_3: false,
    so_lenh_kiem_tra: {
      ten: "Kiểm tra danh mục cho ≥ 15 lệnh",
      gia_tri_hien_tai: 9,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich:
        "Đã qua bước Kiểm tra danh mục 9/15 lệnh — mỗi lần là một lần bạn nhìn lệnh mới trong bối cảnh CẢ danh mục, chứ không chỉ nhìn riêng mã đó.",
    },
    mua_bat_chap: {
      ten: "≤ 2 lần mua bất chấp cảnh báo trong 15 lệnh gần nhất",
      gia_tri_hien_tai: 1,
      muc_tieu: 2,
      dat: true,
      du_du_lieu: true,
      giai_thich:
        "Trong 9 lệnh gần nhất (cửa sổ trượt 15 lệnh gần nhất), bạn mua bất chấp cảnh báo 1/2 lần. Cả đời tài khoản là 4 lần — cửa sổ chỉ tính các lệnh gần đây, nên một giai đoạn cũ không theo bạn mãi. Vẫn mua KHÔNG bị phạt: nó chỉ được đếm ở ô kỷ luật này.",
    },
    danh_muc_an_toan: {
      ten: "Không ngành nào > 40% và tổng vốn ở rủi ro ≤ trần khẩu vị",
      gia_tri_hien_tai: 46,
      muc_tieu: 40,
      dat: false,
      du_du_lieu: true,
      giai_thich:
        "Ngành lớn nhất: Ngân hàng 46% (ngưỡng 40%). Tổng vốn ở rủi ro: 17% (nếu mọi cắt lỗ bị chạm) · trần khẩu vị Cân bằng: 20% (trần này vốn đặt cho một lệnh; Cấp 8 dùng lại làm mức trần cho cả danh mục).",
    },
    so_lenh_da_ket_so: 5,
    so_lan_co_canh_bao: 6,
    so_lan_mua_bat_chap_canh_bao: 4,
    cua_so_gan_day: 9,
    danh_muc: makeDanhMuc(),
    ...overrides,
  }
}

/**
 * ★ Bản `thach-thuc` khi danh mục CHƯA định giá được — điều kiện ③ chưa xét
 * được. Đây là bản mà server gửi `gia_tri_hien_tai: 0` (mặc định) kèm
 * `du_du_lieu: false`: in "0%/40%" ở đây là nói với người dùng rằng danh mục
 * hoàn toàn không dồn ngành, trong khi thật ra chưa có gì được tính.
 *
 * ★ ĐỔI ĐÚNG MỘT THỨ so với `makeThachThuc()`: nhánh ③ + `danh_muc`. Hai điều
 * kiện đầu giữ nguyên, nên một test đỏ ở đây chỉ có thể do nhánh "chưa tính
 * được" chứ không do một thay đổi kèm theo nào khác.
 */
function makeThachThucChuaTinh(): ThachThucCap8 {
  const base = makeThachThuc()
  return {
    ...base,
    danh_muc_an_toan: {
      ...base.danh_muc_an_toan,
      gia_tri_hien_tai: 0,
      muc_tieu: 40,
      dat: false,
      du_du_lieu: false,
      giai_thich:
        "Chưa định giá được danh mục nên chưa chấm được điều kiện này — IQX để trống thay vì coi như đạt.",
    },
    danh_muc: null,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap8 />
    </SidebarProvider>,
  )
}

describe("taskStateCap8", () => {
  it("is active until the server stamps the task done", () => {
    expect(taskStateCap8(1, makeProgress())).toBe("active")
    expect(taskStateCap8(1, makeProgress({ task_1_done_at: "t" }))).toBe("done")
    expect(taskStateCap8(3, makeProgress({ task_3_done_at: "t" }))).toBe("done")
  })

  it("is active with no progress row at all (nothing is ever «locked» at Cấp 8)", () => {
    expect(taskStateCap8(2, null)).toBe("active")
    expect(taskStateCap8(2, undefined)).toBe("active")
  })
})

describe("JourneyPanelCap8", () => {
  beforeEach(() => {
    useCap8ProgressMock.mockReset()
    useCap8ProgressMock.mockReturnValue({ data: makeProgress() })
    useThachThucCap8Mock.mockReset()
    useThachThucCap8Mock.mockReturnValue({ data: makeThachThuc() })
    useCap8EventsMock.mockReturnValue({ isCap8Active: true })
  })

  it("renders the Cấp 8 level card + bài học một câu + THỰC CHIẾN badge", () => {
    renderPanel()
    expect(screen.getByText("CẤP 8")).toBeInTheDocument()
    expect(screen.getByText("QUẢN TRỊ RỦI RO DANH MỤC")).toBeInTheDocument()
    expect(
      screen.getByText('"Rủi ro không nằm ở một lệnh — mà ở cả danh mục."'),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("§C12c — the chip carries the user's REAL numbers, not a slogan", () => {
    renderPanel()
    const chip = screen.getByTestId("cap8-journey-tag")
    expect(chip).toHaveTextContent("9 lệnh kiểm tra")
    expect(chip).toHaveTextContent("6 lần có cảnh báo")
  })

  // ── Rail huy hiệu 0-8 ──────────────────────────────────────────────────────
  it("★ renders the FULL 0-8 huy-hiệu rail (the CTA's destination), 9 cells", () => {
    renderPanel()
    const rail = screen.getByTestId("cap8-journey-rail")
    for (let n = 0; n <= 8; n++) {
      expect(within(rail).getByTestId(`cap8-rail-${n}`)).toBeInTheDocument()
    }
    expect(within(rail).queryByTestId("cap8-rail-9")).not.toBeInTheDocument()
  })

  it("★ each rail cell paints its own cấp colour (0-8), Cấp 8 xanh lá #3f9b5a", () => {
    renderPanel()
    const rail = screen.getByTestId("cap8-journey-rail")
    const EXPECTED = [
      "#8a90a5",
      "#c97b4a",
      "#7dd3c0",
      "#4f8ff7",
      "#a78bfa",
      "#e0b64d",
      "#d64550",
      "#c65cae",
      "#3f9b5a",
    ]
    EXPECTED.forEach((hex, n) => {
      const cell = within(rail).getByTestId(`cap8-rail-${n}`)
      // The badge is an inlined SVG string — assert the hex reaches the DOM.
      expect(cell.innerHTML, `Cấp ${n}`).toContain(hex)
      // …and that no cell rendered an undefined opacity (the fill=N bug).
      expect(cell.innerHTML, `Cấp ${n}`).not.toContain("NaN")
    })
  })

  it("marks Cấp 0-7 done and Cấp 8 current while not yet graduated", () => {
    renderPanel()
    const rail = screen.getByTestId("cap8-journey-rail")
    expect(within(rail).getByTestId("cap8-rail-7")).toHaveAttribute("data-state", "done")
    expect(within(rail).getByTestId("cap8-rail-8")).toHaveAttribute("data-state", "current")
  })

  it("marks Cấp 8 done once graduated_at is stamped", () => {
    useCap8ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        graduated_at: "2026-12-01T00:00:00Z",
      }),
    })
    renderPanel()
    const rail = screen.getByTestId("cap8-journey-rail")
    expect(within(rail).getByTestId("cap8-rail-8")).toHaveAttribute("data-state", "done")
  })

  // ── Widget "Danh mục hiện tại" ─────────────────────────────────────────────
  it("shows tổng vốn ở rủi ro + trần khẩu vị, each stating what it means", () => {
    renderPanel()
    const widget = screen.getByTestId("cap8-journey-danhmuc")
    expect(within(widget).getByTestId("cap8-journey-danhmuc-value")).toHaveTextContent("17%")
    expect(widget).toHaveTextContent("nếu mọi cắt lỗ bị chạm")
    expect(widget).toHaveTextContent("trần khẩu vị Cân bằng: 20%")
    expect(widget).toHaveTextContent("Ngân hàng 46%")
  })

  // ★★ THE `null`-AS-`0` TRAP. `tong_rui_ro_pct: null` means NOTHING WAS
  // COMPUTED. Rendering it as "0%" tells the user their portfolio is perfectly
  // safe on the strength of a measurement that never ran.
  it("★ renders a null tổng rủi ro as «chưa tính được», NEVER as 0%", () => {
    useThachThucCap8Mock.mockReturnValue({
      data: makeThachThuc({
        danh_muc: makeDanhMuc({ tong_rui_ro_pct: null, don_nganh_max: null }),
      }),
    })
    renderPanel()
    const widget = screen.getByTestId("cap8-journey-danhmuc")
    const value = within(widget).getByTestId("cap8-journey-danhmuc-value")
    expect(value).toHaveTextContent("chưa tính được")
    expect(value.textContent).not.toMatch(/\b0\s*%/)
    expect(widget.textContent).not.toMatch(/\b0%\s*\(nếu mọi cắt lỗ/)
  })

  it("★ renders an unpriced portfolio (danh_muc = null) as «chưa tính được», not as a safe one", () => {
    useThachThucCap8Mock.mockReturnValue({ data: makeThachThucChuaTinh() })
    renderPanel()
    const widget = screen.getByTestId("cap8-journey-danhmuc")
    expect(within(widget).getByTestId("cap8-journey-danhmuc-value")).toHaveTextContent(
      "chưa tính được",
    )
    expect(widget.textContent).not.toContain("phân tán tốt")
  })

  // ★ Ở ĐÂU HIỆN TỔNG RỦI RO, Ở ĐÓ CÓ CAVEAT (spec/plan honesty note 1).
  it("★ shows the «{N} vị thế chưa có cắt lỗ» caveat wherever tổng rủi ro appears", () => {
    const caveat =
      "2 vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này, nên con số trên là phần ĐÃ BIẾT, không phải toàn bộ."
    useThachThucCap8Mock.mockReturnValue({
      data: makeThachThuc({
        danh_muc: makeDanhMuc({ so_vi_the_thieu_cat_lo: 2, caveat }),
      }),
    })
    renderPanel()
    expect(screen.getByTestId("cap8-journey-danhmuc-caveat")).toHaveTextContent(caveat)
  })

  it("hides the caveat line when every position HAS a cắt lỗ (no invented warning)", () => {
    renderPanel()
    expect(screen.queryByTestId("cap8-journey-danhmuc-caveat")).not.toBeInTheDocument()
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Widget này render caveat CHỈ khi chuỗi của server
   * khác rỗng, trong khi `computeCap8Khoi18BanDoRuiRo` (khối ⑱) cố ý TỰ dựng câu
   * từ `so_vi_the_thieu_cat_lo` cho đúng trường hợp đó. Cùng một payload, hai bề
   * mặt nói hai chuyện: khối ⑱ cảnh báo, Hành trình im lặng.
   *
   * Fixture đổi ĐÚNG MỘT thứ so với test trên: `so_vi_the_thieu_cat_lo` (caveat của
   * server vẫn là chuỗi rỗng mặc định của `makeDanhMuc`).
   */
  it("★ server trả caveat RỖNG mà vẫn có vị thế thiếu cắt lỗ → widget TỰ nói ra", () => {
    useThachThucCap8Mock.mockReturnValue({
      data: makeThachThuc({
        danh_muc: makeDanhMuc({ so_vi_the_thieu_cat_lo: 2, caveat: "" }),
      }),
    })
    renderPanel()
    const caveat = screen.getByTestId("cap8-journey-danhmuc-caveat")
    expect(caveat).toHaveTextContent("2 vị thế chưa có cắt lỗ")
    expect(caveat).toHaveTextContent("phần ĐÃ BIẾT")
  })

  // ── Widget Thách thức (nhiệm vụ ③) ─────────────────────────────────────────
  it("renders ALL THREE sub-conditions with value/target + the server's giải thích verbatim", () => {
    const data = makeThachThuc()
    renderPanel()
    const soLenh = screen.getByTestId("cap8-thachthuc-so_lenh_kiem_tra")
    expect(soLenh).toHaveTextContent("9/15")
    expect(soLenh).toHaveTextContent(data.so_lenh_kiem_tra.giai_thich)

    const batChap = screen.getByTestId("cap8-thachthuc-mua_bat_chap")
    expect(batChap).toHaveTextContent("1/2")
    expect(batChap).toHaveTextContent(data.mua_bat_chap.giai_thich)
    // ★ The window is ROLLING — the copy must say so, or a user reads it as a
    // lifetime count they can never bring back down.
    expect(batChap).toHaveTextContent("15 lệnh gần nhất")

    const danhMuc = screen.getByTestId("cap8-thachthuc-danh_muc_an_toan")
    expect(danhMuc).toHaveTextContent("46%/40%")
    expect(danhMuc).toHaveTextContent(data.danh_muc_an_toan.giai_thich)
  })

  // ★★ SAME `null`-as-`0` TRAP, one widget over: the server sends
  // `gia_tri_hien_tai: 0` with `du_du_lieu: false` for condition ③.
  it("★ condition ③ shows «chưa tính được» — never «0%/40%» — when du_du_lieu is false", () => {
    useThachThucCap8Mock.mockReturnValue({ data: makeThachThucChuaTinh() })
    renderPanel()
    const cond = screen.getByTestId("cap8-thachthuc-danh_muc_an_toan")
    expect(cond).toHaveAttribute("data-du-du-lieu", "false")
    expect(within(cond).getByTestId("cap8-thachthuc-danh_muc_an_toan-value")).toHaveTextContent(
      "chưa tính được",
    )
    expect(cond.textContent).not.toContain("0%/40%")
    // ⏳ = chưa xét được. NOT ❌ — the user did nothing wrong.
    expect(cond).toHaveTextContent("⏳")
  })

  it("marks a met condition ✅ and an unmet-but-measured one 🔲", () => {
    renderPanel()
    expect(screen.getByTestId("cap8-thachthuc-mua_bat_chap")).toHaveTextContent("✅")
    expect(screen.getByTestId("cap8-thachthuc-so_lenh_kiem_tra")).toHaveTextContent("🔲")
  })

  it("shows a loading line instead of fabricated zeros while thách thức is in flight", () => {
    useThachThucCap8Mock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.getByTestId("cap8-thachthuc")).toHaveTextContent("Đang tính 3 điều kiện")
    expect(screen.queryByTestId("cap8-thachthuc-so_lenh_kiem_tra")).not.toBeInTheDocument()
  })

  // ── Checklist + điều hướng ─────────────────────────────────────────────────
  it("renders the 2 checklist items + the thách thức widget, and counts tasks done", () => {
    useCap8ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    expect(screen.getByTestId("cap8-task-1")).toHaveTextContent("Lệnh đầu qua Kiểm tra danh mục")
    expect(screen.getByTestId("cap8-task-2")).toHaveTextContent("Kết sổ đầu Cấp 8")
    expect(screen.getByTestId("cap8-thachthuc")).toHaveTextContent(
      "Thách thức Quản trị rủi ro danh mục",
    )
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('"Xem Phân tích danh mục →" switches the sidebar to the cap8-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap8 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Xem Phân tích danh mục →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap8-analysis")
  })

  it('"Làm ngay →" switches the sidebar to the trading panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap8 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(within(screen.getByTestId("cap8-task-1")).getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  // ── Cấp cuối: KHÔNG có cấp sau để bấm vào ──────────────────────────────────
  it("★ the goal box says Cấp 8 is the top level and offers NOTHING clickable for Cấp 9+", () => {
    renderPanel()
    const goal = screen.getByTestId("cap8-journey-goal")
    expect(goal).toHaveTextContent("trọn mạch")
    expect(goal).toHaveTextContent("sẽ mở dần khi ra mắt")
    expect(within(goal).queryByRole("button")).not.toBeInTheDocument()
    expect(within(goal).queryByRole("link")).not.toBeInTheDocument()
  })

  it("gates BOTH queries on isCap8Active so the panel is inert outside Cấp 8", () => {
    useCap8EventsMock.mockReturnValue({ isCap8Active: false })
    renderPanel()
    expect(useCap8ProgressMock).toHaveBeenCalledWith(false)
    expect(useThachThucCap8Mock).toHaveBeenCalledWith(false)
  })
})
