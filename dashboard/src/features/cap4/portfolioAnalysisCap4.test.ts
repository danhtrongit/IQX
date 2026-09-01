import { describe, expect, it } from "vitest"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import {
  computeCap4Khoi10DongThuan,
  computeCap4Khoi11GocNhinRieng,
  computeCap4PortfolioAnalysis,
  DONG_THUAN_BAND_LABEL,
  KHOI10_MIN_TRADES_PER_NHOM,
  KHOI11_MIN_LENH,
} from "./portfolioAnalysisCap4"
import type { Cap4TradeRecord } from "./tradeLogCap4"
import type { Cap4Progress } from "./types"

const NOW = new Date("2026-07-30T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap4TradeRecord> = {}): Cap4TradeRecord {
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
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    ai_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    so_lop_dong_thuan: 5,
    so_lop_khac_ai: 0,
    ...overrides,
  }
}

/** `n` lệnh có `soLopDongThuan` lớp AI ủng hộ, `wins` trong đó thắng. */
function tradesForBand(
  soLopDongThuan: number,
  n: number,
  wins: number,
  extra: Partial<Cap4TradeRecord> = {},
): Cap4TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({
      so_lop_dong_thuan: soLopDongThuan,
      pnlPct: i < wins ? 6 : -4,
      pnlVnd: i < wins ? 600_000 : -400_000,
      ...extra,
    }),
  )
}

/** `n` lệnh có ≥1 lớp đọc khác AI, `wins` trong đó thắng. */
function tradesKhacAi(n: number, wins: number): Cap4TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({
      so_lop_khac_ai: 1,
      pnlPct: i < wins ? 6 : -4,
      pnlVnd: i < wins ? 600_000 : -400_000,
    }),
  )
}

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
    graduated_at: "2026-05-02T00:00:00Z",
    time_to_graduate_hours: 12,
  }
}

function cap3Progress(): Cap3Progress {
  return {
    id: "c3p",
    user_id: "u1",
    entered_at: "2026-05-03T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_quan_ly_von: 0,
    muc_tu_tin_da_dung: [],
    so_muc_tu_tin_da_dung: 0,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: "2026-06-01T00:00:00Z",
    time_to_graduate_hours: 20,
  }
}

function cap4Progress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: null,
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("computeCap4Khoi10DongThuan — ⑩ đọc toàn cảnh có giúp chọn lệnh tốt hơn", () => {
  it("nhóm theo 3 dải 4-5 / 2-3 / 0-1 lớp ủng hộ, đúng thứ tự mockup", () => {
    const res = computeCap4Khoi10DongThuan([
      ...tradesForBand(5, 4, 3),
      ...tradesForBand(4, 5, 4),
      ...tradesForBand(3, 6, 3),
      ...tradesForBand(2, 5, 3),
      ...tradesForBand(1, 3, 1),
      ...tradesForBand(0, 2, 0),
    ])
    expect(res.rows.map((r) => r.band)).toEqual(["cao", "vua", "thap"])
    expect(res.rows.map((r) => r.label)).toEqual([
      DONG_THUAN_BAND_LABEL.cao,
      DONG_THUAN_BAND_LABEL.vua,
      DONG_THUAN_BAND_LABEL.thap,
    ])
    // 4-5 lớp: 9 lệnh, 7 thắng → 78%
    expect(res.rows[0].count).toBe(9)
    expect(res.rows[0].wins).toBe(7)
    expect(res.rows[0].winRate).toBe(78)
    // 2-3 lớp: 11 lệnh, 6 thắng → 55%
    expect(res.rows[1].count).toBe(11)
    expect(res.rows[1].winRate).toBe(55)
    // 0-1 lớp: 5 lệnh, 1 thắng → 20%
    expect(res.rows[2].count).toBe(5)
    expect(res.rows[2].winRate).toBe(20)
    expect(res.totalTrades).toBe(25)
  })

  it('đồng thuận cao thắng hơn hẳn → phát hiện "có hiệu quả" kèm cả 2 con số', () => {
    const res = computeCap4Khoi10DongThuan([...tradesForBand(5, 4, 4), ...tradesForBand(0, 4, 1)])
    expect(res.hieuQua).toBe(true)
    expect(res.phatHien).toMatch(/Đọc toàn cảnh có hiệu quả/)
    expect(res.phatHien).toMatch(/100%/)
    expect(res.phatHien).toMatch(/25%/)
    expect(res.insufficientNote).toBeNull()
  })

  it("ngược giả thuyết → nói THẲNG là chưa có cơ sở ưu tiên lệnh đồng thuận cao", () => {
    const res = computeCap4Khoi10DongThuan([...tradesForBand(5, 4, 1), ...tradesForBand(0, 4, 4)])
    expect(res.hieuQua).toBe(false)
    expect(res.phatHien).toMatch(/ngược/i)
    expect(res.phatHien).not.toMatch(/có hiệu quả/)
  })

  it("chênh lệch chưa rõ → câu trung tính, KHÔNG kết luận hai chiều nào", () => {
    const res = computeCap4Khoi10DongThuan([...tradesForBand(5, 4, 2), ...tradesForBand(0, 4, 2)])
    expect(res.hieuQua).toBe(false)
    expect(res.phatHien).toMatch(/chưa khác biệt rõ/)
  })

  it("thiếu lệnh ở dải đầu hoặc dải cuối → ghi chú thay vì kết luận", () => {
    const res = computeCap4Khoi10DongThuan([...tradesForBand(5, 4, 3), ...tradesForBand(0, 2, 0)])
    expect(res.hieuQua).toBeNull()
    expect(res.phatHien).toBeNull()
    expect(res.insufficientNote).toMatch(
      new RegExp(`Cần ít nhất ${KHOI10_MIN_TRADES_PER_NHOM} lệnh`),
    )
    expect(res.rows[2].insufficient).toBe(true)
  })

  it("dải không có lệnh nào → winRate null (KHÔNG in 0%)", () => {
    const res = computeCap4Khoi10DongThuan(tradesForBand(5, 3, 2))
    expect(res.rows[2].count).toBe(0)
    expect(res.rows[2].winRate).toBeNull()
  })

  it("KHÔNG có lệnh nào → ghi chú chưa có dữ liệu", () => {
    const res = computeCap4Khoi10DongThuan([])
    expect(res.totalTrades).toBe(0)
    expect(res.phatHien).toBeNull()
    expect(res.insufficientNote).toMatch(/Chưa có lệnh/)
  })

  it("lệnh chưa lộ AI (so_lop_dong_thuan null) bị LOẠI và đếm riêng, không gộp vào dải 0-1", () => {
    const res = computeCap4Khoi10DongThuan([
      ...tradesForBand(5, 3, 3),
      trade({ so_lop_dong_thuan: null, ai_5_lop: null }),
      trade({ so_lop_dong_thuan: null, ai_5_lop: null }),
    ])
    expect(res.totalTrades).toBe(3)
    expect(res.excludedNoAi).toBe(2)
    expect(res.rows[2].count).toBe(0)
  })

  it("giaiThich nêu rõ đồng thuận đếm theo ĐÁNH GIÁ AI (§C12c)", () => {
    const res = computeCap4Khoi10DongThuan([])
    expect(res.giaiThich).toMatch(/AI đánh giá Ủng hộ/)
  })
})

describe("computeCap4Khoi11GocNhinRieng — ⑪ góc nhìn riêng của bạn", () => {
  it("đếm 3 số: lần khác AI · bạn đúng (thắng) · AI đúng (thua)", () => {
    const res = computeCap4Khoi11GocNhinRieng([
      ...tradesKhacAi(12, 7),
      // Lệnh cùng góc nhìn AI không tính vào khối này.
      ...tradesForBand(5, 4, 4, { so_lop_khac_ai: 0 }),
    ])
    expect(res.soLanKhacAi).toBe(12)
    expect(res.soLanBanDung).toBe(7)
    expect(res.soLanAiDung).toBe(5)
  })

  it("bạn đúng nhiều hơn → trực giác có cơ sở, vẫn nhắc cân nhắc khi AI cảnh báo", () => {
    const res = computeCap4Khoi11GocNhinRieng(tradesKhacAi(12, 7))
    expect(res.phatHien).toMatch(/Trực giác riêng của bạn đang có cơ sở/)
    expect(res.phatHien).toMatch(/7\/12/)
    expect(res.phatHien).toMatch(/AI cảnh báo/)
  })

  it("AI đúng nhiều hơn → nói THẲNG, không xu nịnh, nhưng KHÔNG dùng chữ «sai»", () => {
    const res = computeCap4Khoi11GocNhinRieng(tradesKhacAi(12, 4))
    expect(res.phatHien).toMatch(/phần lớn AI đúng/)
    expect(res.phatHien).toMatch(/8\/12/)
    expect(res.phatHien).not.toMatch(/sai/i)
  })

  it("chia đều → câu trung tính, không phán bên nào giỏi hơn", () => {
    const res = computeCap4Khoi11GocNhinRieng(tradesKhacAi(12, 6))
    expect(res.phatHien).toMatch(/chia đều/)
    expect(res.phatHien).not.toMatch(/có cơ sở/)
  })

  it("chưa đủ lệnh khác AI → ghi chú, KHÔNG kết luận từ vài lệnh", () => {
    const res = computeCap4Khoi11GocNhinRieng(tradesKhacAi(2, 2))
    expect(res.soLanKhacAi).toBe(2)
    expect(res.soLanBanDung).toBe(2)
    expect(res.phatHien).toBeNull()
    expect(res.insufficientNote).toMatch(new RegExp(`${KHOI11_MIN_LENH} lệnh`))
  })

  it("chưa có lệnh nào khác AI → ghi chú riêng (không phải 0% xấu)", () => {
    const res = computeCap4Khoi11GocNhinRieng(tradesForBand(5, 6, 4, { so_lop_khac_ai: 0 }))
    expect(res.soLanKhacAi).toBe(0)
    expect(res.phatHien).toBeNull()
    expect(res.insufficientNote).toMatch(/Chưa có lệnh nào bạn đọc khác AI/)
  })

  it("lệnh chưa lộ AI không được coi là «cùng góc nhìn» hay «khác AI»", () => {
    const res = computeCap4Khoi11GocNhinRieng([
      trade({ so_lop_khac_ai: null, ai_5_lop: null }),
      trade({ so_lop_khac_ai: null, ai_5_lop: null }),
    ])
    expect(res.soLanKhacAi).toBe(0)
    expect(res.soLanBanDung).toBe(0)
    expect(res.soLanAiDung).toBe(0)
  })

  it("bạn đúng + AI đúng luôn cộng lại bằng số lần khác AI", () => {
    const res = computeCap4Khoi11GocNhinRieng(tradesKhacAi(9, 4))
    expect(res.soLanBanDung + res.soLanAiDung).toBe(res.soLanKhacAi)
  })
})

describe("computeCap4PortfolioAnalysis — DELEGATE Cấp 1/2/3, chỉ THÊM ⑩/⑪", () => {
  const trades = [...tradesForBand(5, 4, 4), ...tradesForBand(0, 4, 1)]

  it("giữ nguyên mọi khối của Cấp 1/2/3 (không tính lại, không mất khối nào)", () => {
    const res = computeCap4PortfolioAnalysis(
      trades,
      [],
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      NOW,
    )
    // Cấp 1/2 (khối ①②③④ sau khi Cấp 2 rút về mô hình 2 nhiệm vụ) + Cấp 3
    // (⑦/⑧ + khẩu vị). Khối 5/6/7 cũ của Cấp 2 đã bỏ hẳn, không phải "mất".
    expect(res.khoi1).toBeTruthy()
    expect(res.khoi2).toBeTruthy()
    expect(res.khoi3).toBeTruthy()
    expect(res.khoi4).toBeTruthy()
    const stale = res as unknown as Record<string, unknown>
    expect(stale.khoi5).toBeUndefined()
    expect(stale.khoi6).toBeUndefined()
    expect(stale.khoi7).toBeUndefined()
    expect(res.khoi7TuTin).toBeTruthy()
    expect(res.khoi8KhoiLuong).toBeTruthy()
    expect(res.khauVi).toBe("can_bang")
  })

  it("thêm ⑩ + ⑪ đúng bằng 2 hàm khối lẻ", () => {
    const res = computeCap4PortfolioAnalysis(
      trades,
      [],
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      NOW,
    )
    expect(res.khoi10DongThuan).toEqual(computeCap4Khoi10DongThuan(trades))
    expect(res.khoi11GocNhinRieng).toEqual(computeCap4Khoi11GocNhinRieng(trades))
  })

  it("surface số của SERVER cho khối ⑨/③ (không tự tính lại vũ khí/điểm mù)", () => {
    const res = computeCap4PortfolioAnalysis(
      trades,
      [],
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      NOW,
    )
    expect(res.soLenhDocDu5Lop).toBe(22)
    expect(res.vuKhiLop).toBe("dong_tien")
    expect(res.diemMuLop).toBe("tin_tuc")
  })

  it("chưa vào Cấp 4 (progress null) → 3 số server là null, KHÔNG bịa 0", () => {
    const res = computeCap4PortfolioAnalysis(trades, [], cap2Progress(), cap3Progress(), null, NOW)
    expect(res.soLenhDocDu5Lop).toBeNull()
    expect(res.vuKhiLop).toBeNull()
    expect(res.diemMuLop).toBeNull()
  })
})
