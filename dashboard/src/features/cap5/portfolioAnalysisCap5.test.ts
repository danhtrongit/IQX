import { describe, expect, it } from "vitest"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import {
  computeCap5Khoi12BoLoc,
  computeCap5Khoi13Pheu,
  computeCap5PortfolioAnalysis,
  KHOI12_MIN_LENH,
} from "./portfolioAnalysisCap5"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import { type Cap5Progress, type HuntFilter } from "./types"

const NOW = new Date("2026-07-31T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap5TradeRecord> = {}): Cap5TradeRecord {
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
    huntFilter: null,
    huntSoPhienCho: null,
    huntSoLopLucVao: null,
    ...overrides,
  }
}

/** `soThang` lệnh lãi + `soThua` lệnh lỗ, cùng một bộ lọc. */
function hunts(filter: HuntFilter, soThang: number, soThua: number): Cap5TradeRecord[] {
  return [
    ...Array.from({ length: soThang }, () =>
      trade({ huntFilter: filter, pnlPct: 6, pnlVnd: 600_000 }),
    ),
    ...Array.from({ length: soThua }, () =>
      trade({ huntFilter: filter, pnlPct: -4, pnlVnd: -400_000 }),
    ),
  ]
}

function progress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_ma_da_san: 0,
    so_ma_mua_tu_watchlist: 0,
    so_ma_cho_du_lop: null,
    best_filter: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("khối ⑫ — bộ lọc nào mang lại mã thắng nhiều nhất", () => {
  it("không có lệnh nào từ săn mã ⇒ rỗng TRUNG THỰC, không bịa dòng bộ lọc", () => {
    const r = computeCap5Khoi12BoLoc([trade(), trade()])
    expect(r.rows).toEqual([])
    expect(r.soLenhSan).toBe(0)
    expect(r.soLenhKhongSan).toBe(2)
    expect(r.insufficient).toBe(true)
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).toMatch(/Chưa có lệnh nào đóng từ mã bạn săn/)
  })

  it("★★ dưới ngưỡng mẫu ⇒ tyLeThang = null, KHÔNG suy 100% từ 1 lệnh thắng", () => {
    const r = computeCap5Khoi12BoLoc(hunts("ngoai", 1, 0))
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].soLenh).toBe(1)
    expect(r.rows[0].soThang).toBe(1)
    expect(r.rows[0].tyLeThang).toBeNull()
    expect(r.rows[0].duMau).toBe(false)
    expect(r.rows[0].conThieu).toBe(KHOI12_MIN_LENH - 1)
    expect(r.insufficient).toBe(true)
    expect(r.phatHien).toBeNull()
  })

  it("trạng thái rỗng nói RÕ còn thiếu bao nhiêu lệnh", () => {
    const r = computeCap5Khoi12BoLoc([...hunts("ngoai", 2, 0), ...hunts("kl", 1, 0)])
    expect(r.insufficientNote).toMatch(/còn thiếu 1 lệnh/)
    expect(r.soLenhSan).toBe(3)
  })

  it("đủ mẫu ⇒ tính đúng tỷ lệ và sắp giảm dần", () => {
    const r = computeCap5Khoi12BoLoc([
      ...hunts("kl", 1, 3), // 25%
      ...hunts("ngoai", 3, 1), // 75%
      ...hunts("dinh", 2, 1), // 67%
    ])
    expect(r.rows.map((x) => x.filter)).toEqual(["ngoai", "dinh", "kl"])
    expect(r.rows.map((x) => x.tyLeThang)).toEqual([75, 67, 25])
    expect(r.best?.filter).toBe("ngoai")
    expect(r.worst?.filter).toBe("kl")
    expect(r.insufficient).toBe(false)
  })

  it("bộ lọc kém nhất dưới ngưỡng ⇒ phát hiện là CẢNH BÁO kèm lý do riêng của nó", () => {
    const r = computeCap5Khoi12BoLoc([...hunts("ngoai", 3, 1), ...hunts("kl", 1, 3)])
    expect(r.canhBao).toBe(true)
    expect(r.phatHien).toContain("Khối ngoại gom")
    expect(r.phatHien).toContain("Khối lượng đột biến")
    expect(r.phatHien).toContain("sóng ngắn")
  })

  it("lệnh đóng ngang giá 0% KHÔNG tính là thắng", () => {
    const r = computeCap5Khoi12BoLoc([
      trade({ huntFilter: "tudoanh", pnlPct: 0, pnlVnd: 0 }),
      trade({ huntFilter: "tudoanh", pnlPct: 0, pnlVnd: 0 }),
      trade({ huntFilter: "tudoanh", pnlPct: 0, pnlVnd: 0 }),
    ])
    expect(r.rows[0].soThang).toBe(0)
    expect(r.rows[0].tyLeThang).toBe(0)
  })

  it("bản ghi nhật ký CŨ (thiếu hẳn trường huntFilter) bị coi là không-từ-săn, không gán bừa", () => {
    const cu = trade()
    delete (cu as Partial<Cap5TradeRecord>).huntFilter
    const r = computeCap5Khoi12BoLoc([cu])
    expect(r.rows).toEqual([])
    expect(r.soLenhKhongSan).toBe(1)
  })

  it("chỉ 1 bộ lọc đủ mẫu ⇒ không có worst, không cảnh báo bịa", () => {
    const r = computeCap5Khoi12BoLoc(hunts("ngoai", 3, 1))
    expect(r.best?.filter).toBe("ngoai")
    expect(r.worst).toBeNull()
    expect(r.canhBao).toBe(false)
    expect(r.phatHien).toContain("75%")
  })
})

describe("khối ⑬ — kỷ luật săn mã (phễu)", () => {
  it("chưa vào Cấp 5 ⇒ cả 3 tầng là null (KHÔNG vẽ 0)", () => {
    const r = computeCap5Khoi13Pheu(null)
    expect(r.tang.map((t) => t.value)).toEqual([null, null, null])
    expect(r.tyLeVaoLenh).toBeNull()
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).not.toBeNull()
  })

  it("★★ tầng giữa chưa có mẻ chấm 5 lớp ⇒ null, KHÔNG phải 0", () => {
    const r = computeCap5Khoi13Pheu(
      progress({ so_ma_da_san: 34, so_ma_cho_du_lop: null, so_ma_mua_tu_watchlist: 14 }),
    )
    expect(r.tang[1].value).toBeNull()
    expect(r.soMaChoDuLop).toBeNull()
    // hai tầng ngoài vẫn thật ⇒ vẫn kết luận được
    expect(r.phatHien).toContain("34")
    expect(r.phatHien).toContain("14")
  })

  it("có sàng lọc ⇒ khen đúng việc user LÀM (loại mã chưa chín)", () => {
    const r = computeCap5Khoi13Pheu(
      progress({ so_ma_da_san: 34, so_ma_cho_du_lop: 19, so_ma_mua_tu_watchlist: 14 }),
    )
    expect(r.tang.map((t) => t.value)).toEqual([34, 19, 14])
    expect(r.tyLeVaoLenh).toBe(41)
    expect(r.phatHien).toMatch(/loại 20 mã chưa chín/)
    expect(r.phatHien).toContain("kỷ luật của thợ săn")
  })

  it("★★ mua HẾT số mã săn ⇒ KHÔNG khen «biết chờ» — nói thẳng chưa sàng lọc", () => {
    const r = computeCap5Khoi13Pheu(
      progress({ so_ma_da_san: 10, so_ma_cho_du_lop: 10, so_ma_mua_tu_watchlist: 10 }),
    )
    expect(r.phatHien).not.toContain("kỷ luật của thợ săn")
    expect(r.phatHien).toContain("chưa loại mã nào")
  })

  it("chưa săn mã nào ⇒ không chia cho 0, nói mốc nhiệm vụ ①", () => {
    const r = computeCap5Khoi13Pheu(progress())
    expect(r.tyLeVaoLenh).toBeNull()
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).toContain("10")
  })
})

describe("computeCap5PortfolioAnalysis — cộng dồn", () => {
  const cap2: Cap2Progress | null = null
  const cap3: Cap3Progress | null = null
  const cap4: Cap4Progress | null = null

  it("giữ nguyên mọi khối Cấp 1-4 và thêm đúng 2 khối mới", () => {
    const r = computeCap5PortfolioAnalysis(
      hunts("ngoai", 3, 1),
      [],
      cap2,
      cap3,
      cap4,
      progress({ so_ma_da_san: 12, so_ma_mua_tu_watchlist: 5, best_filter: "ngoai" }),
      NOW,
    )
    // khối cộng dồn của Cấp 1-4 vẫn có mặt
    expect(r).toHaveProperty("khoi10DongThuan")
    expect(r).toHaveProperty("khoi11GocNhinRieng")
    expect(r.khoi12BoLoc.best?.filter).toBe("ngoai")
    expect(r.khoi13Pheu.soMaDaSan).toBe(12)
    expect(r.soMaMuaTuWatchlist).toBe(5)
    expect(r.bestFilterServer).toBe("ngoai")
    expect(r.mucTieuSan).toBe(10)
    expect(r.mucTieuMua).toBe(5)
  })

  it("chưa vào Cấp 5 ⇒ mọi số server là null, không phải 0", () => {
    const r = computeCap5PortfolioAnalysis([], [], cap2, cap3, cap4, null, NOW)
    expect(r.soMaDaSan).toBeNull()
    expect(r.soMaMuaTuWatchlist).toBeNull()
    expect(r.bestFilterServer).toBeNull()
  })
})
