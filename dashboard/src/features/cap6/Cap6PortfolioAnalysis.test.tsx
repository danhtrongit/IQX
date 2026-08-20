import { render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * HARNESS (cùng lựa chọn đã ghi ở `Cap5PortfolioAnalysis.test.tsx`): mock đúng
 * tầng hook, KHÔNG dựng QueryClientProvider/AuthProvider.
 *
 * `Cap6PortfolioAnalysis` render `Cap5PortfolioAnalysis` bên trong (khối ①-⑬) và
 * `Cap4PortfolioAnalysis` dùng `useVuKhiDiemMu` (khối ⑨) — auth-gated TanStack
 * query. Mock 2 module hook cho phép điều khiển mọi trạng thái query mà không có
 * network. (`@/features/cap5/hooks` KHÔNG còn phải mock: khối ⑬ giờ là phễu săn
 * mã tính từ `Cap5Progress` truyền vào, không còn gọi `useDanhSachDungNgoai` của
 * nhật ký đứng ngoài đã nghỉ hưu.)
 */
const { thachThuc } = vi.hoisted(() => ({
  thachThuc: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  useThachThucCap6: () => thachThuc.current,
}))
vi.mock("@/features/cap4/hooks", () => ({
  useVuKhiDiemMu: () => ({ data: undefined, isPending: true, isError: false }),
}))

import { Cap6PortfolioAnalysis } from "./Cap6PortfolioAnalysis"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import type { Cap6Progress, NhomDoiChieuCap6, ThachThucCap6 } from "./types"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"

const NOW = new Date("2026-07-31T12:00:00Z")
const CAM_TU = ["sai", "không nên", "lẽ ra"]

let seq = 0

function trade(overrides: Partial<Cap6TradeRecord> = {}): Cap6TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dinh_gia",
    trangThaiLucDat: "ung_ho",
    pnlPct: 6,
    pnlVnd: 600_000,
    closedAt: "2026-07-25T10:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "neu", dinh_gia: "bad" },
    ai_5_lop: null,
    so_lop_dong_thuan: null,
    so_lop_khac_ai: null,
    huntFilter: null,
    huntSoPhienCho: null,
    huntSoLopLucVao: null,
    kieuCoPhieu: "ngan_hang",
    lopQuyetDinh: "dinh_gia",
    khopGoiY: true,
    ...overrides,
  }
}

function trades(n: number, overrides: Partial<Cap6TradeRecord> = {}): Cap6TradeRecord[] {
  return Array.from({ length: n }, () => trade(overrides))
}

function cap2Progress(): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: "2026-04-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap3Progress(): Cap3Progress {
  return {
    id: "c3p",
    user_id: "u1",
    entered_at: "2026-04-02T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 10,
    lai_pct_cap3: 4.5,
    diem_ky_luat_tb_cap3: 82,
    graduated_at: "2026-05-01T00:00:00Z",
    time_to_graduate_hours: 25,
  }
}

function cap4Progress(): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-05-02T00:00:00Z",
    task_1_done_at: null,
    so_lenh_doc_du_5lop: 12,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    graduated_at: "2026-06-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap5Progress(): Cap5Progress {
  return {
    id: "c5p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_ma_da_san: 10,
    so_ma_mua_tu_watchlist: 5,
    // `null` = mẻ chấm 5 lớp chưa chạy — KHÔNG phải 0 mã đủ lớp.
    so_ma_cho_du_lop: null,
    best_filter: null,
    graduated_at: "2026-07-01T00:00:00Z",
    time_to_graduate_hours: 40,
  }
}

function cap6Progress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    id: "c6p",
    user_id: "u1",
    entered_at: "2026-07-02T00:00:00Z",
    task_1_done_at: "2026-07-03T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doi_chieu: 11,
    so_kieu_da_gap: 2,
    ty_le_thang_khop: 70,
    ty_le_thang_lech: 45,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function nhom(overrides: Partial<NhomDoiChieuCap6> = {}): NhomDoiChieuCap6 {
  return {
    khop: true,
    ten: "Khớp gợi ý",
    so_lenh: 7,
    so_thang: 5,
    ty_le_thang: 71,
    du_du_lieu: true,
    so_lenh_toi_thieu: 3,
    giai_thich: "Nhóm khớp gợi ý thắng 71% (5/7 lệnh).",
    ...overrides,
  }
}

function thachThucData(overrides: Partial<ThachThucCap6> = {}): ThachThucCap6 {
  return {
    dat_ca_3: false,
    so_lenh_doi_chieu: {
      ten: "Đối chiếu ≥ 15 lệnh có mâu thuẫn",
      gia_tri_hien_tai: 11,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich: "Đã có 11/15 lệnh.",
    },
    so_kieu_da_gap: {
      ten: "Gặp ≥ 3 kiểu cổ phiếu khác nhau",
      gia_tri_hien_tai: 2,
      muc_tieu: 3,
      dat: false,
      du_du_lieu: true,
      giai_thich: "Đã đối chiếu trên 2/3 kiểu.",
    },
    doi_chieu_giup_ich: {
      ten: "Nhóm khớp gợi ý thắng ≥ nhóm lệch (mỗi nhóm ≥ 3 lệnh)",
      gia_tri_hien_tai: 71,
      muc_tieu: 40,
      dat: true,
      du_du_lieu: true,
      giai_thich: "GIẢI THÍCH CỦA HỆ THỐNG",
    },
    nhom_khop: nhom(),
    nhom_lech: nhom({
      khop: false,
      ten: "Lệch gợi ý",
      so_lenh: 5,
      so_thang: 2,
      ty_le_thang: 40,
      giai_thich: "Nhóm lệch thắng 40% (2/5 lệnh).",
    }),
    ...overrides,
  }
}

const scores: Cap2DailyScoreRecord[] = []

function renderPanel(
  log: Cap6TradeRecord[],
  progress: Cap6Progress | null = cap6Progress(),
) {
  return render(
    <Cap6PortfolioAnalysis
      cap2Progress={cap2Progress()}
      cap3Progress={cap3Progress()}
      cap4Progress={cap4Progress()}
      cap5Progress={cap5Progress()}
      cap6Progress={progress}
      trades={log}
      dailyScores={scores}
      now={NOW}
    />,
  )
}

beforeEach(() => {
  thachThuc.current = { data: thachThucData(), isPending: false, isError: false }
})

describe("Cap6PortfolioAnalysis — cộng dồn bằng DELEGATION", () => {
  it("render lại mọi khối Cấp 1-5 bằng chính component của Cấp 5", () => {
    renderPanel(trades(3))
    // Khối ⑫ (Cấp 5) + ⑬ (Cấp 5) + khối ① của Cấp 5 vẫn còn nguyên.
    expect(screen.getByTestId("cap5-pa-khoi12")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-pa-khoi13")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-pa-khoi1")).toBeInTheDocument()
  })

  it("thẻ đầu trang Cấp 6 hiện 4 số server + mốc nhiệm vụ ③", () => {
    renderPanel(trades(3))
    const khoi1 = screen.getByTestId("cap6-pa-khoi1")
    expect(khoi1.textContent).toContain("11")
    expect(khoi1.textContent).toContain("70%")
    expect(khoi1.textContent).toContain("45%")
  })

  it("chưa vào Cấp 6 → nói thẳng chưa có hồ sơ, không in 0", () => {
    renderPanel(trades(3), null)
    expect(screen.getByTestId("cap6-pa-khoi1").textContent).toContain("Chưa có hồ sơ Cấp 6")
  })

  /**
   * ★ HỢP ĐỒNG BACKEND MỚI (commit `4b01918`): `ty_le_thang_khop`/`_lech` NULLABLE.
   * `null` = nhóm chưa có lệnh đã đóng nào · `0.0` = có lệnh đã đóng, không lệnh
   * nào thắng. Hai câu chuyện KHÁC NHAU, và `Math.round(null)` = 0 gộp chúng lại.
   *
   * Ba case dưới đổi ĐÚNG MỘT biến (hai trường tỷ lệ), mọi thứ khác giữ nguyên.
   */
  it("null ≠ 0: nhóm chưa có lệnh hiện 'chưa đủ dữ liệu', KHÔNG phải 0%", () => {
    renderPanel(trades(3), {
      ...cap6Progress(),
      ty_le_thang_khop: null,
      ty_le_thang_lech: null,
    })
    const tyLe = screen.getByTestId("cap6-pa-khoi1-tyle").textContent!
    expect(tyLe).not.toMatch(/0%/)
    expect(tyLe).toContain("chưa đủ dữ liệu")
  })

  it("0% là KẾT QUẢ THẬT (có lệnh đã đóng, không lệnh nào thắng) → in 0%", () => {
    renderPanel(trades(3), {
      ...cap6Progress(),
      ty_le_thang_khop: 0,
      ty_le_thang_lech: 0,
    })
    const tyLe = screen.getByTestId("cap6-pa-khoi1-tyle").textContent!
    expect(tyLe).toContain("nhóm khớp gợi ý: 0%")
    expect(tyLe).toContain("nhóm lệch: 0%")
    expect(tyLe).not.toContain("chưa đủ dữ liệu")
  })

  it("một nhóm null, nhóm kia 0 → mỗi nhóm nói đúng chuyện của nó", () => {
    renderPanel(trades(3), {
      ...cap6Progress(),
      ty_le_thang_khop: null,
      ty_le_thang_lech: 0,
    })
    const tyLe = screen.getByTestId("cap6-pa-khoi1-tyle").textContent!
    expect(tyLe).toContain("nhóm khớp gợi ý: chưa đủ dữ liệu")
    expect(tyLe).toContain("nhóm lệch: 0%")
  })
})

describe("Cap6PortfolioAnalysis — khối ⑭ lớp nào đúng cho kiểu nào", () => {
  it("ô ≥3 lệnh hiện tỷ lệ thắng; ô 1-2 lệnh hiện 'chưa đủ dữ liệu' kèm số", () => {
    renderPanel([
      ...trades(3),
      ...trades(2, { kieuCoPhieu: "tang_truong", lopQuyetDinh: "ky_thuat", khopGoiY: false }),
    ])
    const table = within(screen.getByTestId("cap6-pa-khoi14-table"))
    expect(table.getByTestId("cap6-pa-khoi14-cell-ngan_hang-dinh_gia").textContent).toContain(
      "100%",
    )
    const thin = table.getByTestId("cap6-pa-khoi14-cell-tang_truong-ky_thuat")
    expect(thin.textContent).toContain("chưa đủ dữ liệu")
    expect(thin.textContent).toContain("2")
  })

  it("phát hiện chỉ hiện khi CÓ ô đủ dữ liệu", () => {
    renderPanel(trades(2))
    expect(screen.queryByTestId("cap6-pa-khoi14-phathien")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi14-note")).toBeInTheDocument()
  })

  it("có ô đủ dữ liệu → phát hiện nêu kiểu + lớp + số lệnh thật", () => {
    renderPanel(trades(4))
    const phatHien = screen.getByTestId("cap6-pa-khoi14-phathien")
    expect(phatHien.textContent).toContain("Ngân hàng")
    expect(phatHien.textContent).toContain("💎 Định giá")
    expect(phatHien.textContent).toContain("4/4")
  })

  it("nói rõ số lệnh chưa phân loại kiểu bị để riêng", () => {
    renderPanel([...trades(3), ...trades(2, { kieuCoPhieu: null })])
    expect(screen.getByTestId("cap6-pa-khoi14-chuaphanloai").textContent).toContain("2")
  })

  it("kèm giải thích §C12c", () => {
    renderPanel(trades(3))
    expect(screen.getByTestId("cap6-pa-khoi14-giaithich").textContent).toContain("lớp quyết định")
  })
})

describe("Cap6PortfolioAnalysis — khối ⑮ đối chiếu có giúp không", () => {
  it("khớp hơn lệch rõ rệt → nói đối chiếu đang giúp, kèm 2 tỷ lệ", () => {
    renderPanel(trades(3))
    const khoi15 = screen.getByTestId("cap6-pa-khoi15")
    expect(khoi15.textContent).toContain("71%")
    expect(khoi15.textContent).toContain("40%")
    expect(screen.getByTestId("cap6-pa-khoi15-phathien").textContent).toContain("đang giúp")
  })

  it("khớp THẤP HƠN lệch → nói thẳng gợi ý chưa cho kết quả tốt hơn", () => {
    thachThuc.current = {
      data: thachThucData({
        nhom_khop: nhom({ so_lenh: 5, so_thang: 2, ty_le_thang: 40 }),
        nhom_lech: nhom({ khop: false, ten: "Lệch gợi ý", so_lenh: 7, so_thang: 6, ty_le_thang: 86 }),
      }),
      isPending: false,
      isError: false,
    }
    renderPanel(trades(3))
    const phatHien = screen.getByTestId("cap6-pa-khoi15-phathien")
    expect(phatHien.textContent).toContain("chưa cho kết quả tốt hơn")
    expect(phatHien.textContent).toContain("⑭")
    expect(phatHien.textContent!.toLowerCase()).not.toContain("sai")
  })

  it("một nhóm <3 lệnh → KHÔNG kết luận, nói còn cần thêm bao nhiêu lệnh", () => {
    thachThuc.current = {
      data: thachThucData({
        nhom_lech: nhom({
          khop: false,
          ten: "Lệch gợi ý",
          so_lenh: 1,
          so_thang: 0,
          ty_le_thang: null,
          du_du_lieu: false,
        }),
      }),
      isPending: false,
      isError: false,
    }
    renderPanel(trades(3))
    expect(screen.queryByTestId("cap6-pa-khoi15-phathien")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi15-note").textContent).toContain("2")
  })

  it("query lỗi → fail-closed: nói chưa lấy được số, KHÔNG tự tính", () => {
    thachThuc.current = { data: undefined, isPending: false, isError: true }
    renderPanel(trades(3))
    expect(screen.queryByTestId("cap6-pa-khoi15-phathien")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi15-note").textContent).toContain(
      "Chưa lấy được số khớp/lệch",
    )
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Nhánh lỗi từng render 2 ô nhóm bằng số PLACEHOLDER
   * của tầng compute (`0/0 lệnh đã đóng`, `—`) NGAY TRÊN câu "Chưa lấy được số
   * khớp/lệch" — một người có 8 lệnh khớp thắng 6 bị nói thẳng vào mặt là 0/0. Test
   * cũ chỉ kiểm `phatHien` vắng + note có mặt, nên con số bịa lọt qua.
   */
  it("query lỗi → KHÔNG in ô nhóm `0/0 lệnh đã đóng` bịa cạnh câu 'chưa lấy được'", () => {
    thachThuc.current = { data: undefined, isPending: false, isError: true }
    renderPanel(trades(3))
    expect(screen.queryByTestId("cap6-pa-khoi15-counts")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-pa-khoi15-nhom-khop")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-pa-khoi15-nhom-lech")).not.toBeInTheDocument()
    const khoi = screen.getByTestId("cap6-pa-khoi15").textContent!
    expect(khoi).not.toContain("0/0 lệnh đã đóng")
    expect(khoi).toContain("Chưa lấy được số khớp/lệch")
  })

  /**
   * ★ Cùng lỗi, chiều ngược lại: khi CÓ số của server thì 2 ô phải còn nguyên. Nếu
   * không có test này, "sửa" bằng cách xoá hẳn 2 ô sẽ vẫn xanh.
   */
  it("có số của server → 2 ô nhóm VẪN hiện đầy đủ (không bị ẩn oan)", () => {
    renderPanel(trades(3))
    expect(screen.getByTestId("cap6-pa-khoi15-counts")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi15-nhom-khop").textContent).toContain("lệnh đã đóng")
    expect(screen.getByTestId("cap6-pa-khoi15-nhom-lech").textContent).toContain("lệnh đã đóng")
  })

  it("đang tải → nói đang tải, không hiện con số nào", () => {
    thachThuc.current = { data: undefined, isPending: true, isError: false }
    renderPanel(trades(3))
    expect(screen.getByTestId("cap6-pa-khoi15-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-pa-khoi15-phathien")).not.toBeInTheDocument()
  })

  it("giữ NGUYÊN VĂN câu giải thích của server (§C12c)", () => {
    renderPanel(trades(3))
    expect(screen.getByTestId("cap6-pa-khoi15-server").textContent).toContain(
      "GIẢI THÍCH CỦA HỆ THỐNG",
    )
  })

  it("KHÔNG BAO GIỜ gọi lệch gợi ý là 'sai' ở bất kỳ trạng thái nào", () => {
    for (const state of [
      { data: thachThucData(), isPending: false, isError: false },
      {
        data: thachThucData({
          nhom_khop: nhom({ ty_le_thang: 20, so_thang: 1, so_lenh: 5 }),
          nhom_lech: nhom({ khop: false, ten: "Lệch gợi ý", ty_le_thang: 90, so_thang: 9, so_lenh: 10 }),
        }),
        isPending: false,
        isError: false,
      },
      { data: undefined, isPending: false, isError: true },
    ]) {
      thachThuc.current = state
      const { unmount } = renderPanel(trades(3))
      const khoi15 = screen.getByTestId("cap6-pa-khoi15")
      for (const tu of CAM_TU) {
        expect(khoi15.textContent!.toLowerCase()).not.toContain(tu)
      }
      unmount()
    }
  })
})
