import { render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * HARNESS (cùng lựa chọn đã ghi ở `Cap7PortfolioAnalysis.test.tsx`): mock đúng
 * tầng hook, KHÔNG dựng QueryClientProvider/AuthProvider.
 *
 * `Cap8PortfolioAnalysis` render `Cap7PortfolioAnalysis` bên trong (khối ①-⑰),
 * và chuỗi đó dùng `useThachThucCap7` (⑯⑰), `useThachThucCap6` (⑮),
 * `useVuKhiDiemMu` (⑨) — auth-gated
 * TanStack query.
 */
const { thachThuc } = vi.hoisted(() => ({
  thachThuc: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  useThachThucCap8: () => thachThuc.current,
}))
vi.mock("@/features/cap7/hooks", () => ({
  useThachThucCap7: () => ({ data: undefined, isPending: true, isError: false }),
}))
vi.mock("@/features/cap6/hooks", () => ({
  useThachThucCap6: () => ({ data: undefined, isPending: true, isError: false }),
  // ★ Khối ⑭⑮ của Cấp 6 «Bậc thầy» đọc `GET /cap6/phan-tich` (SERVER) — mặc định
  // "đang tải" để không bài nào ở cấp trên khẳng định một con số nhận định nào.
  usePhanTichCap6: () => ({ data: undefined, isPending: true, isError: false }),
}))
vi.mock("@/features/cap4/hooks", () => ({
  useVuKhiDiemMu: () => ({ data: undefined, isPending: true, isError: false }),
}))
vi.mock("@/features/cap5/hooks", () => ({
  // ★ Khối ⑫ của Cấp 5 đọc `GET /cap5/phan-tich` (SERVER, không phải nhật ký
  // localStorage) — mặc định "đang tải" để không bài nào ở cấp trên khẳng định
  // một con số bộ lọc nào.
  useCap5PhanTich: () => ({ data: undefined, isPending: true, isError: false }),
}))

import { Cap8PortfolioAnalysis } from "./Cap8PortfolioAnalysis"
import type { Cap8Progress, DanhMucCap8, ThachThucCap8 } from "./types"

const NOW = new Date("2026-07-31T12:00:00Z")

function danhMuc(overrides: Partial<DanhMucCap8> = {}): DanhMucCap8 {
  return {
    nav_vnd: 100_000_000,
    so_vi_the: 3,
    so_vi_the_thieu_cat_lo: 0,
    so_vi_the_thieu_gia: 0,
    phan_bo_nganh: [
      { nganh: "Ngân hàng", pct: 46 },
      { nganh: "Thép", pct: 20 },
      { nganh: "Công nghệ", pct: 18 },
      { nganh: "Tiền mặt", pct: 16 },
    ],
    don_nganh_max: { nganh: "Ngân hàng", pct: 46 },
    tong_rui_ro_pct: 17,
    khau_vi: "can_bang",
    khau_vi_ten: "Cân bằng",
    tran_khau_vi_pct: 20,
    cap_tuong_quan_cao: [{ a: "TCB", b: "MBB", he_so: 0.82 }],
    tuong_quan_du_lieu: true,
    caveat: "",
    cross_ref_pm: "CROSS REF PM CỦA SERVER",
    ...overrides,
  }
}

function thachThucCap8(dm: DanhMucCap8 | null = danhMuc()): ThachThucCap8 {
  return {
    dat_ca_3: false,
    so_lenh_kiem_tra: {
      ten: "T1",
      gia_tri_hien_tai: 9,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich: "GT1",
    },
    mua_bat_chap: {
      ten: "T2",
      gia_tri_hien_tai: 1,
      muc_tieu: 2,
      dat: true,
      du_du_lieu: true,
      giai_thich: "GT2",
    },
    danh_muc_an_toan: {
      ten: "T3",
      gia_tri_hien_tai: dm?.don_nganh_max?.pct ?? 0,
      muc_tieu: 40,
      dat: false,
      du_du_lieu: dm != null,
      giai_thich: "GIẢI THÍCH ③ CỦA SERVER",
    },
    so_lenh_da_ket_so: 9,
    so_lan_co_canh_bao: 4,
    so_lan_mua_bat_chap_canh_bao: 1,
    cua_so_gan_day: 15,
    danh_muc: dm,
  }
}

function cap8Progress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return {
    id: "c8",
    user_id: "u1",
    entered_at: "2026-07-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_kiem_tra: 9,
    so_lan_mua_bat_chap_canh_bao: 1,
    don_nganh_max_pct: 46,
    tong_rui_ro_pct: 17,
    graduated_at: null,
    time_to_graduate_hours: null,
    so_lan_co_canh_bao: 4,
    bat_chap_gan_day: 1,
    cua_so_gan_day: 15,
    so_lenh_da_ket_so: 9,
    ...overrides,
  }
}

function renderPanel(progress: Cap8Progress | null = cap8Progress()) {
  return render(
    <Cap8PortfolioAnalysis
      cap2Progress={null}
      cap3Progress={null}
      cap4Progress={null}
      cap5Progress={null}
      cap6Progress={null}
      cap7Progress={null}
      cap8Progress={progress}
      trades={[]}
      dailyScores={[]}
      now={NOW}
    />,
  )
}

beforeEach(() => {
  thachThuc.current = { data: thachThucCap8(), isPending: false, isError: false }
})

describe("Cap8PortfolioAnalysis — cộng dồn Cấp 1-7", () => {
  it("render CẢ khối của Cấp 7 (⑯⑰) lẫn khối ⑱ của Cấp 8", () => {
    renderPanel()
    expect(screen.getByTestId("cap7-pa-khoi16")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-pa-khoi17")).toBeInTheDocument()
    expect(screen.getByTestId("cap8-pa-khoi18")).toBeInTheDocument()
    // …và cả thẻ đầu trang của Cấp 7 (nó kéo theo chuỗi Cấp 1-6).
    expect(screen.getByTestId("cap7-pa-khoi1")).toBeInTheDocument()
  })
})

describe("khối ⑱ — bản đồ rủi ro (spec §7)", () => {
  it("phân bổ ngành gồm cả tiền mặt, ngành vượt ngưỡng có ⚠", () => {
    renderPanel()
    const phanBo = screen.getByTestId("cap8-pa-phanbo")
    expect(within(phanBo).getByTestId("cap8-pa-o-Ngân hàng")).toHaveTextContent("46%")
    expect(within(phanBo).getByTestId("cap8-pa-o-Ngân hàng")).toHaveTextContent("⚠")
    expect(within(phanBo).getByTestId("cap8-pa-o-Tiền mặt")).toHaveTextContent("16%")
    expect(within(phanBo).getByTestId("cap8-pa-o-Thép")).not.toHaveTextContent("⚠")
  })

  it("cặp tương quan cao hiện theo mẫu spec", () => {
    renderPanel()
    expect(screen.getByTestId("cap8-pa-tuongquan")).toHaveTextContent(
      "TCB ↔ MBB (~0.82) — cùng nhịp, ít phân tán",
    )
  })

  it("<2 vị thế → ẩn HẲN phần tương quan, phân bổ vẫn còn", () => {
    thachThuc.current = {
      data: thachThucCap8(danhMuc({ so_vi_the: 1 })),
      isPending: false,
      isError: false,
    }
    renderPanel()
    expect(screen.queryByTestId("cap8-pa-tuongquan")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap8-pa-phanbo")).toBeInTheDocument()
  })

  it("hệ số chưa tính được → 'chưa đủ dữ liệu', KHÔNG in ra 0.0", () => {
    // Đổi ĐÚNG MỘT biến so với fixture xanh: cờ `tuong_quan_du_lieu`. Cặp vẫn
    // còn trong payload với hệ số 0 — nếu UI bỏ cờ mà chỉ nhìn danh sách, "0.00"
    // sẽ lọt lên màn hình và test này bắt được.
    thachThuc.current = {
      data: thachThucCap8(
        danhMuc({
          tuong_quan_du_lieu: false,
          cap_tuong_quan_cao: [{ a: "TCB", b: "MBB", he_so: 0 }],
        }),
      ),
      isPending: false,
      isError: false,
    }
    renderPanel()
    const dong = screen.getByTestId("cap8-pa-tuongquan")
    expect(dong).toHaveTextContent("chưa đủ dữ liệu")
    expect(dong.textContent).not.toContain("0.0")
    expect(dong.textContent).not.toContain("TCB ↔ MBB")
  })

  it("tổng vốn ở rủi ro nêu RÕ hai con số đo hai thứ khác nhau", () => {
    renderPanel()
    expect(screen.getByTestId("cap8-pa-tongruiro")).toHaveTextContent(
      "Tổng vốn ở rủi ro: 17% (nếu mọi cắt lỗ bị chạm) · trần khẩu vị Cân bằng: 20%",
    )
    expect(screen.getByTestId("cap8-pa-tran-note")).toHaveTextContent(
      "KHÔNG cùng một nghĩa",
    )
  })

  it("có vị thế thiếu cắt lỗ → caveat hiện ngay cạnh tổng rủi ro", () => {
    thachThuc.current = {
      data: thachThucCap8(
        danhMuc({ so_vi_the_thieu_cat_lo: 2, caveat: "2 vị thế chưa có cắt lỗ — CAVEAT SERVER" }),
      ),
      isPending: false,
      isError: false,
    }
    renderPanel()
    expect(screen.getByTestId("cap8-pa-caveat")).toHaveTextContent(
      "2 vị thế chưa có cắt lỗ",
    )
  })

  it("không thiếu cắt lỗ → không bịa ra caveat", () => {
    renderPanel()
    expect(screen.queryByTestId("cap8-pa-caveat")).not.toBeInTheDocument()
  })

  it("ĐÚNG MỘT dòng phát hiện — ngành > ngưỡng thắng dòng rủi ro", () => {
    renderPanel()
    const phatHien = screen.getByTestId("cap8-pa-phathien")
    expect(phatHien).toHaveTextContent(
      "Danh mục dồn Ngân hàng 46% — một cú sốc ngành sẽ ảnh hưởng lớn. Cân nhắc phân tán.",
    )
    expect(phatHien.textContent).not.toContain("vượt trần khẩu vị")
  })

  it("cross-ref Người quản lý danh mục luôn có (spec §9: KHÔNG dựng lại PM)", () => {
    renderPanel()
    expect(screen.getByTestId("cap8-pa-crossref")).toHaveTextContent(
      "CROSS REF PM CỦA SERVER",
    )
  })

  it("câu §C12c của server hiện NGUYÊN VĂN", () => {
    renderPanel()
    expect(screen.getByTestId("cap8-pa-khoi18-server")).toHaveTextContent(
      "GIẢI THÍCH ③ CỦA SERVER",
    )
  })
})

describe("khối ⑱ — fail-closed", () => {
  it("đang tải → không con số nào", () => {
    thachThuc.current = { data: undefined, isPending: true, isError: false }
    renderPanel()
    expect(screen.getByTestId("cap8-pa-khoi18-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap8-pa-phanbo")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-pa-tongruiro")).not.toBeInTheDocument()
  })

  it("chưa định giá được danh mục → nói thẳng, KHÔNG hiện 0%", () => {
    thachThuc.current = { data: thachThucCap8(null), isPending: false, isError: false }
    renderPanel()
    expect(screen.getByTestId("cap8-pa-khoi18-note")).toHaveTextContent(
      "Chưa định giá được danh mục",
    )
    expect(screen.queryByTestId("cap8-pa-tongruiro")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-pa-phathien")).not.toBeInTheDocument()
  })
})

describe("thẻ đầu trang Cấp 8 — `null` ≠ 0", () => {
  it("có số → hiện %", () => {
    renderPanel()
    expect(screen.getByTestId("cap8-pa-khoi1-so")).toHaveTextContent(
      "Ngành lớn nhất: 46% · tổng vốn ở rủi ro: 17%.",
    )
  })

  it("`null` → 'chưa tính được', TUYỆT ĐỐI không 0%", () => {
    renderPanel(cap8Progress({ don_nganh_max_pct: null, tong_rui_ro_pct: null }))
    const dong = screen.getByTestId("cap8-pa-khoi1-so")
    expect(dong).toHaveTextContent(
      "Ngành lớn nhất: chưa tính được · tổng vốn ở rủi ro: chưa tính được.",
    )
    expect(dong.textContent).not.toContain("0%")
  })

  it("chỉ MỘT trong hai là null → chỉ số đó thành 'chưa tính được'", () => {
    renderPanel(cap8Progress({ tong_rui_ro_pct: null }))
    const dong = screen.getByTestId("cap8-pa-khoi1-so")
    expect(dong).toHaveTextContent("Ngành lớn nhất: 46%")
    expect(dong).toHaveTextContent("tổng vốn ở rủi ro: chưa tính được")
  })

  it("chưa vào Cấp 8 → nói thẳng, không con số nào", () => {
    renderPanel(null)
    expect(screen.queryByTestId("cap8-pa-khoi1-so")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap8-pa-khoi1")).toHaveTextContent("Chưa có hồ sơ Cấp 8")
  })
})
