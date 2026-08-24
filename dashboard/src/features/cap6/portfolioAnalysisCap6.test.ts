import { describe, expect, it } from "vitest"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"
import {
  computeCap6Khoi14LopTheoKieu,
  computeCap6Khoi15DoiChieu,
  computeCap6PortfolioAnalysis,
  KHOI14_MIN_LENH_MOI_O,
  KHOI15_DELTA_RO_RANG,
} from "./portfolioAnalysisCap6"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import type { Cap6Progress, NhomDoiChieuCap6 } from "./types"

/**
 * Khối ⑭ (kiểu × lớp quyết định → tỷ lệ thắng) + ⑮ (khớp vs lệch) — spec §7.
 *
 * ★ Hai bất biến của cả file:
 *  1. **Không bao giờ suy diễn từ 1-2 lệnh** — ô/nhóm dưới 3 lệnh chỉ được ĐẾM.
 *  2. **⑮ trung thực CẢ HAI CHIỀU** — khớp không hơn lệch thì nói thẳng, không
 *     bào chữa cho gợi ý; và lệch KHÔNG BAO GIỜ bị gọi là "sai".
 */
let seq = 0

function trade(overrides: Partial<Cap6TradeRecord> = {}): Cap6TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 4,
    pnlVnd: 400_000,
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
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "bad" },
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

function nhom(overrides: Partial<NhomDoiChieuCap6> = {}): NhomDoiChieuCap6 {
  return {
    khop: true,
    ten: "Khớp gợi ý",
    so_lenh: 6,
    so_thang: 4,
    ty_le_thang: 66.7,
    du_du_lieu: true,
    so_lenh_toi_thieu: 3,
    giai_thich: "Nhóm khớp gợi ý thắng 67% (4/6 lệnh).",
    ...overrides,
  }
}

// ── Khối ⑭ ──────────────────────────────────────────────────────────────────

describe("computeCap6Khoi14LopTheoKieu — cổng ≥3 lệnh/ô", () => {
  it("ô đủ 3 lệnh mới được gán nhãn tỷ lệ thắng", () => {
    const result = computeCap6Khoi14LopTheoKieu([
      ...trades(2, { pnlPct: 6 }),
      ...trades(1, { pnlPct: -3 }),
    ])
    const cell = result.cells.find((c) => c.kieu === "ngan_hang" && c.lop === "dinh_gia")!
    expect(cell.soLenh).toBe(3)
    expect(cell.soThang).toBe(2)
    expect(cell.duDuLieu).toBe(true)
    expect(cell.tyLeThang).toBe(67)
    expect(cell.nhan).toContain("67%")
  })

  it("ô 1-2 lệnh: hiện 'chưa đủ dữ liệu' KÈM số lệnh, KHÔNG hiện tỷ lệ", () => {
    const result = computeCap6Khoi14LopTheoKieu(trades(2, { pnlPct: 6 }))
    const cell = result.cells[0]
    expect(cell.soLenh).toBe(2)
    expect(cell.duDuLieu).toBe(false)
    expect(cell.tyLeThang).toBeNull()
    expect(cell.nhan).toContain("chưa đủ dữ liệu")
    expect(cell.nhan).toContain("2")
    expect(cell.nhan).not.toContain("%")
  })

  it(`ngưỡng là đúng ${KHOI14_MIN_LENH_MOI_O} lệnh`, () => {
    expect(KHOI14_MIN_LENH_MOI_O).toBe(3)
    expect(computeCap6Khoi14LopTheoKieu(trades(2))!.oDuDuLieu).toBe(0)
    expect(computeCap6Khoi14LopTheoKieu(trades(3))!.oDuDuLieu).toBe(1)
  })

  it("không có ô nào đủ 3 lệnh → KHÔNG có phát hiện, có ghi chú thiếu dữ liệu", () => {
    const result = computeCap6Khoi14LopTheoKieu(trades(2))
    expect(result.phatHien).toBeNull()
    expect(result.insufficientNote).not.toBeNull()
    expect(result.insufficientNote).toContain("3")
  })

  it("phát hiện nêu ô mạnh nhất trong các ô ĐỦ dữ liệu (kiểu + lớp + số thật)", () => {
    const result = computeCap6Khoi14LopTheoKieu([
      // 🏦 Ngân hàng × 💎 Định giá: 4/4 thắng
      ...trades(4, { pnlPct: 8 }),
      // 🚀 Tăng trưởng × 🎯 Kỹ thuật: 1/3 thắng
      ...trades(1, { kieuCoPhieu: "tang_truong", lopQuyetDinh: "ky_thuat", pnlPct: 5 }),
      ...trades(2, { kieuCoPhieu: "tang_truong", lopQuyetDinh: "ky_thuat", pnlPct: -5 }),
    ])
    expect(result.phatHien).toContain("Ngân hàng")
    expect(result.phatHien).toContain("💎 Định giá")
    expect(result.phatHien).toContain("4/4")
  })

  it("lệnh chưa phân loại kiểu (kieu === null) được ĐẾM RIÊNG, không gộp vào ô nào", () => {
    const result = computeCap6Khoi14LopTheoKieu([
      ...trades(3),
      ...trades(2, { kieuCoPhieu: null }),
    ])
    expect(result.soLenhCoDoiChieu).toBe(5)
    expect(result.soLenhChuaPhanLoaiKieu).toBe(2)
    expect(result.cells.reduce((s, c) => s + c.soLenh, 0)).toBe(3)
  })

  it("lệnh KHÔNG có đối chiếu (lopQuyetDinh null) bị loại hoàn toàn", () => {
    const result = computeCap6Khoi14LopTheoKieu([
      ...trades(3),
      ...trades(4, { lopQuyetDinh: null, khopGoiY: null, kieuCoPhieu: null }),
    ])
    expect(result.soLenhCoDoiChieu).toBe(3)
    expect(result.soLenhChuaPhanLoaiKieu).toBe(0)
  })

  it("nhật ký rỗng → không ô nào, không phát hiện, ghi chú trung thực", () => {
    const result = computeCap6Khoi14LopTheoKieu([])
    expect(result.cells).toHaveLength(0)
    expect(result.kieuDaGap).toHaveLength(0)
    expect(result.phatHien).toBeNull()
    expect(result.insufficientNote).not.toBeNull()
  })

  it("kèm giải thích §C12c nói rõ số đến từ đâu", () => {
    const result = computeCap6Khoi14LopTheoKieu(trades(3))
    expect(result.giaiThich.length).toBeGreaterThan(40)
    expect(result.giaiThich).toContain("lớp quyết định")
  })

  it("KHÔNG BAO GIỜ gọi lệch gợi ý là sai", () => {
    const result = computeCap6Khoi14LopTheoKieu([
      ...trades(3, { khopGoiY: false, lopQuyetDinh: "ky_thuat" }),
    ])
    const all = [result.phatHien, result.insufficientNote, result.giaiThich].join(" ").toLowerCase()
    for (const tu of ["sai", "không nên", "lẽ ra"]) expect(all).not.toContain(tu)
  })
})

// ── Khối ⑮ ──────────────────────────────────────────────────────────────────

describe("computeCap6Khoi15DoiChieu — khớp vs lệch, trung thực cả hai chiều", () => {
  it("khớp hơn lệch ≥ ngưỡng → nói đối chiếu đang giúp", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ so_lenh: 6, so_thang: 5, ty_le_thang: 83 }),
      nhom({ khop: false, ten: "Lệch gợi ý", so_lenh: 5, so_thang: 2, ty_le_thang: 40 }),
    )
    expect(result.duCa2Nhom).toBe(true)
    expect(result.delta).toBe(43)
    expect(result.goiYChuaGiupIch).toBe(false)
    expect(result.phatHien).toContain("đang giúp")
    expect(result.phatHien).toContain("83%")
    expect(result.phatHien).toContain("40%")
  })

  it("khớp THẤP HƠN lệch → nói thẳng gợi ý chưa cho kết quả tốt hơn (không bào chữa)", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ so_lenh: 5, so_thang: 2, ty_le_thang: 40 }),
      nhom({ khop: false, ten: "Lệch gợi ý", so_lenh: 6, so_thang: 5, ty_le_thang: 83 }),
    )
    expect(result.goiYChuaGiupIch).toBe(true)
    expect(result.phatHien).toContain("chưa cho kết quả tốt hơn")
    expect(result.phatHien).toContain("⑭")
    expect(result.phatHien!.toLowerCase()).not.toContain("sai")
  })

  it("khớp hơn nhưng chưa tới ngưỡng → nói khoảng cách còn nhỏ, KHÔNG kết luận", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ so_lenh: 6, so_thang: 4, ty_le_thang: 67 }),
      nhom({ khop: false, ten: "Lệch gợi ý", so_lenh: 5, so_thang: 3, ty_le_thang: 60 }),
    )
    expect(result.delta).toBe(7)
    expect(result.delta! < KHOI15_DELTA_RO_RANG).toBe(true)
    expect(result.goiYChuaGiupIch).toBe(false)
    expect(result.phatHien).toContain("chưa")
    expect(result.phatHien).not.toContain("đang giúp")
  })

  it("hai nhóm bằng nhau → nói chưa thấy khác biệt, không nghiêng bên nào", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ so_lenh: 4, so_thang: 2, ty_le_thang: 50 }),
      nhom({ khop: false, ten: "Lệch gợi ý", so_lenh: 4, so_thang: 2, ty_le_thang: 50 }),
    )
    expect(result.delta).toBe(0)
    expect(result.goiYChuaGiupIch).toBe(false)
    expect(result.phatHien).toContain("chưa thấy khác biệt")
  })

  it("một nhóm <3 lệnh → KHÔNG kết luận, nói còn thiếu bao nhiêu lệnh", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ so_lenh: 6, so_thang: 5, ty_le_thang: 83 }),
      nhom({
        khop: false,
        ten: "Lệch gợi ý",
        so_lenh: 1,
        so_thang: 1,
        ty_le_thang: null,
        du_du_lieu: false,
      }),
    )
    expect(result.duCa2Nhom).toBe(false)
    expect(result.phatHien).toBeNull()
    expect(result.goiYChuaGiupIch).toBe(false)
    expect(result.thieuDuLieuNote).toContain("2")
    expect(result.thieuDuLieuNote).toContain("lệch")
  })

  it("cả hai nhóm rỗng → nói thẳng chưa có gì để so", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ so_lenh: 0, so_thang: 0, ty_le_thang: null, du_du_lieu: false }),
      nhom({
        khop: false,
        ten: "Lệch gợi ý",
        so_lenh: 0,
        so_thang: 0,
        ty_le_thang: null,
        du_du_lieu: false,
      }),
    )
    expect(result.duCa2Nhom).toBe(false)
    expect(result.phatHien).toBeNull()
    expect(result.thieuDuLieuNote).not.toBeNull()
  })

  it("chưa lấy được dữ liệu server (null) → fail-closed, không tự tính con số thứ hai", () => {
    const result = computeCap6Khoi15DoiChieu(null, null)
    expect(result.duCa2Nhom).toBe(false)
    expect(result.phatHien).toBeNull()
    expect(result.khop.soLenh).toBe(0)
    expect(result.lech.tyLeThang).toBeNull()
    expect(result.thieuDuLieuNote).not.toBeNull()
  })

  it("kèm giải thích §C12c + giữ NGUYÊN VĂN câu giải thích của server", () => {
    const result = computeCap6Khoi15DoiChieu(
      nhom({ giai_thich: "CÂU CỦA SERVER" }),
      nhom({ khop: false, ten: "Lệch gợi ý", giai_thich: "CÂU LỆCH CỦA SERVER" }),
    )
    expect(result.khop.giaiThichServer).toBe("CÂU CỦA SERVER")
    expect(result.lech.giaiThichServer).toBe("CÂU LỆCH CỦA SERVER")
    expect(result.giaiThich).toContain("khớp")
  })

  it("KHÔNG BAO GIỜ dùng chữ 'sai' ở bất kỳ nhánh nào", () => {
    const cases = [
      computeCap6Khoi15DoiChieu(
        nhom({ ty_le_thang: 20, so_thang: 1, so_lenh: 5 }),
        nhom({ khop: false, ty_le_thang: 90, so_thang: 9, so_lenh: 10 }),
      ),
      computeCap6Khoi15DoiChieu(nhom(), nhom({ khop: false })),
      computeCap6Khoi15DoiChieu(null, null),
    ]
    for (const c of cases) {
      const all = [c.phatHien, c.thieuDuLieuNote, c.giaiThich].join(" ").toLowerCase()
      for (const tu of ["sai", "không nên", "lẽ ra"]) expect(all).not.toContain(tu)
    }
  })
})

// ── Top-level: delegation ───────────────────────────────────────────────────

function cap2Progress(): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
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
    khau_vi: "can_bang",
    khau_vi_da_dat: true,
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
    // ★ Sáu trường của Cấp 6 «Bậc thầy» (wire mới). Mốc 7/5 KHÁC mặc định 3/2.
    so_lan_xu_ly_nhat_quan: 7,
    so_lan_xu_ly_veto_nhat_quan: 5,
    muc_tieu_nhat_quan: 7,
    muc_tieu_veto: 5,
    tong_lai_lenh_cap6_pct: null,
    da_xem_tour_mauthuan: true,
    // ── di sản «Đối chiếu» ──
    id: "c6p",
    user_id: "u1",
    entered_at: "2026-07-02T00:00:00Z",
    task_1_done_at: "2026-07-03T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doi_chieu: 9,
    so_kieu_da_gap: 2,
    ty_le_thang_khop: 60,
    ty_le_thang_lech: 40,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

const scores: Cap2DailyScoreRecord[] = []
const NOW = new Date("2026-07-31T12:00:00Z")

describe("computeCap6PortfolioAnalysis — cộng dồn bằng DELEGATION", () => {
  it("giữ mọi khối Cấp 1-5 (delegate) và thêm ⑭ + ⑮ + 4 số server", async () => {
    const { computeCap5PortfolioAnalysis } = await import(
      "@/features/cap5/portfolioAnalysisCap5"
    )
    const log = trades(3)
    const cap5Result = computeCap5PortfolioAnalysis(
      log,
      scores,
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      cap5Progress(),
      NOW,
    )
    const result = computeCap6PortfolioAnalysis(
      log,
      scores,
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      cap5Progress(),
      cap6Progress(),
      { khop: nhom(), lech: nhom({ khop: false, ten: "Lệch gợi ý" }) },
      NOW,
    )
    // Khối ⑫/⑬ của Cấp 5 (và qua chúng mọi khối ①-⑪) không bị tính lại khác đi.
    expect(result.khoi12BoLoc).toEqual(cap5Result.khoi12BoLoc)
    expect(result.khoi13Pheu).toEqual(cap5Result.khoi13Pheu)
    // ★★ …và ⑫ ở đây là FAIL-CLOSED, không phải "0 lệnh săn": hàm tổng của Cấp 6
    // không mang theo payload `GET /cap5/phan-tich`, mà ⑫ CHỈ được nói bằng số
    // của máy chủ. Bài này ghim điều đó để không ai "sửa" nó bằng cách cho ⑫
    // tính lại từ `trades` (nhật ký per-browser) — đúng lỗi B1 đã phải vá.
    expect(result.khoi12BoLoc.chuaLayDuoc).toBe(true)
    expect(result.khoi12BoLoc.rows).toEqual([])
    // Cấp 6 thêm.
    expect(result.khoi14LopTheoKieu.cells).toHaveLength(1)
    expect(result.khoi15DoiChieu.duCa2Nhom).toBe(true)
    expect(result.soLenhDoiChieuServer).toBe(9)
    expect(result.soKieuDaGapServer).toBe(2)
    expect(result.tyLeThangKhopServer).toBe(60)
    expect(result.tyLeThangLechServer).toBe(40)
  })

  it("chưa vào Cấp 6 → 4 số server là null, khối vẫn tính được từ nhật ký", () => {
    const result = computeCap6PortfolioAnalysis(
      trades(3),
      scores,
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      cap5Progress(),
      null,
      null,
      NOW,
    )
    expect(result.soLenhDoiChieuServer).toBeNull()
    expect(result.soKieuDaGapServer).toBeNull()
    expect(result.tyLeThangKhopServer).toBeNull()
    expect(result.tyLeThangLechServer).toBeNull()
    expect(result.khoi14LopTheoKieu.oDuDuLieu).toBe(1)
    expect(result.khoi15DoiChieu.duCa2Nhom).toBe(false)
  })
})
