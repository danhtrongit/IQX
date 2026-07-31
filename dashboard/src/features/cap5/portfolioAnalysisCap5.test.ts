import { describe, expect, it } from "vitest"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import {
  computeCap5Khoi12MaTran,
  computeCap5PortfolioAnalysis,
  KHOI12_MIN_LENH,
  KHOI12_SAI_THANG_CANH_BAO,
  O4_ORDER,
  viPhamPhoBienCap5,
} from "./portfolioAnalysisCap5"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import { O4_LABEL, type Cap5Progress, type O4 } from "./types"

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
    o4: "dung_thang",
    verdictHe: "dung",
    verdictUser: "dung",
    ...overrides,
  }
}

/** `n` lệnh trong ô `o4` (P&L đặt khớp ô để dữ liệu không tự mâu thuẫn). */
function tradesInO(o4: O4, n: number, extra: Partial<Cap5TradeRecord> = {}): Cap5TradeRecord[] {
  const thang = o4 === "dung_thang" || o4 === "sai_thang"
  const verdict = o4 === "dung_thang" || o4 === "dung_thua" ? "dung" : "sai"
  return Array.from({ length: n }, () =>
    trade({
      o4,
      verdictHe: verdict,
      verdictUser: verdict,
      pnlPct: thang ? 6 : -4,
      pnlVnd: thang ? 600_000 : -400_000,
      ...extra,
    }),
  )
}

function cap2Progress(): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: "2026-05-01T00:00:00Z",
    chuoi_current: 4,
    chuoi_record: 6,
    last_chuoi_reset_at: null,
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
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: "2026-06-01T00:00:00Z",
    time_to_graduate_hours: 20,
  }
}

function cap4Progress(): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    ty_le_thang_dong_thuan_cao: 64,
    graduated_at: "2026-07-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap5Progress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "c5p",
    user_id: "u1",
    entered_at: "2026-07-02T00:00:00Z",
    task_1_done_at: "2026-07-03T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_phan_loai: 25,
    so_lan_dung_ngoai_da_cham: 4,
    ty_le_quyet_dinh_dung: 72,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("computeCap5Khoi12MaTran — ⑫ ma trận quyết định (4 ô)", () => {
  it("4 ô theo đúng thứ tự spec, kèm số lượng + % trên số lệnh đã phân loại", () => {
    // Đúng bộ số của mockup spec §6: 12 / 6 / 3 / 4 = 25 lệnh.
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 12),
      ...tradesInO("dung_thua", 6),
      ...tradesInO("sai_thang", 3),
      ...tradesInO("sai_thua", 4),
    ])
    expect(res.cells.map((c) => c.o4)).toEqual([...O4_ORDER])
    expect(res.cells.map((c) => c.label)).toEqual([
      O4_LABEL.dung_thang,
      O4_LABEL.dung_thua,
      O4_LABEL.sai_thang,
      O4_LABEL.sai_thua,
    ])
    expect(res.cells.map((c) => c.count)).toEqual([12, 6, 3, 4])
    expect(res.cells.map((c) => c.pct)).toEqual([48, 24, 12, 16])
    expect(res.soDaPhanLoai).toBe(25)
    expect(res.soQuyetDinhDung).toBe(18)
    expect(res.soQuyetDinhSai).toBe(7)
    expect(res.tyLeQuyetDinhDung).toBe(72)
    expect(res.tyLeQuyetDinhSai).toBe(28)
  })

  it("tỷ lệ thắng đo RIÊNG với tỷ lệ quyết định đúng (2 con số khác nhau)", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 12),
      ...tradesInO("dung_thua", 6),
      ...tradesInO("sai_thang", 3),
      ...tradesInO("sai_thua", 4),
    ])
    // thắng = dung_thang + sai_thang = 15/25 = 60% ≠ 72% quyết định đúng
    expect(res.soThang).toBe(15)
    expect(res.tyLeThang).toBe(60)
    expect(res.tyLeThang).not.toBe(res.tyLeQuyetDinhDung)
  })

  it("lệnh chưa phân loại được đếm RIÊNG, không gộp vào ô nào", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 3),
      trade({ o4: null, verdictHe: null, verdictUser: null }),
      trade({ o4: null, verdictHe: "dung", verdictUser: null }),
    ])
    expect(res.soDaPhanLoai).toBe(3)
    expect(res.soChuaPhanLoai).toBe(2)
    expect(res.cells.reduce((s, c) => s + c.count, 0)).toBe(3)
  })

  it("ô 4 đi theo verdict USER khi user đảo verdict hệ", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 3),
      trade({ o4: "sai_thang", verdictHe: "dung", verdictUser: "sai", pnlPct: 5 }),
    ])
    expect(res.cells.find((c) => c.o4 === "sai_thang")?.count).toBe(1)
    expect(res.soQuyetDinhSai).toBe(1)
  })

  it("chưa phân loại lệnh nào → mọi % là null (KHÔNG in 0%) + ghi chú trung thực", () => {
    const res = computeCap5Khoi12MaTran([
      trade({ o4: null, verdictHe: null, verdictUser: null }),
      trade({ o4: null, verdictHe: null, verdictUser: null }),
    ])
    expect(res.soDaPhanLoai).toBe(0)
    expect(res.cells.every((c) => c.pct === null)).toBe(true)
    expect(res.tyLeQuyetDinhDung).toBeNull()
    expect(res.tyLeQuyetDinhSai).toBeNull()
    expect(res.tyLeThang).toBeNull()
    expect(res.insufficient).toBe(true)
    expect(res.phatHien).toBeNull()
    expect(res.insufficientNote).toMatch(/Chưa có lệnh nào được phân loại/)
  })

  it("dưới ngưỡng 3 lệnh → số đếm THẬT vẫn hiện nhưng không phát hiện gì", () => {
    const res = computeCap5Khoi12MaTran(tradesInO("dung_thang", 2))
    expect(res.soDaPhanLoai).toBe(2)
    expect(res.cells[0].count).toBe(2)
    expect(res.cells[0].pct).toBe(100)
    expect(res.insufficient).toBe(true)
    expect(res.phatHien).toBeNull()
    expect(res.insufficientNote).toMatch(
      new RegExp(`Cần ít nhất ${KHOI12_MIN_LENH} lệnh đã phân loại`),
    )
  })
})

describe("computeCap5Khoi12MaTran — phát hiện theo thứ tự ưu tiên spec §6", () => {
  it("(a) Sai-Thắng ≥3 → cảnh báo may mắn củng cố thói quen xấu, kèm vi phạm THẬT", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 4),
      ...tradesInO("sai_thang", 3, { chamSlKhongCat: true }),
    ])
    expect(res.canhBao).toBe(true)
    expect(res.phatHien).toMatch(/3 lệnh thắng dù làm sai quy trình/)
    expect(res.phatHien).toMatch(/may mắn củng cố thói quen xấu/)
    expect(res.phatHien).toMatch(/cắt lỗ chậm/)
    expect(res.viPhamPhoBien).toBe("cắt lỗ chậm")
  })

  it("(a) thắng ưu tiên tuyệt đối: Đúng-Thua cao vẫn KHÔNG che được Sai-Thắng", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thua", 8),
      ...tradesInO("sai_thang", KHOI12_SAI_THANG_CANH_BAO, { nhoiLenhKhiLo: true }),
    ])
    expect(res.canhBao).toBe(true)
    expect(res.phatHien).toMatch(/lệnh thắng dù làm sai quy trình/)
    expect(res.phatHien).toMatch(/nhồi lệnh khi lỗ/)
  })

  it("(a) không ghi được vi phạm nào → nói thẳng là chưa ghi được, KHÔNG bịa vi phạm", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 4),
      ...tradesInO("sai_thang", 3),
    ])
    expect(res.canhBao).toBe(true)
    expect(res.viPhamPhoBien).toBeNull()
    expect(res.phatHien).toMatch(/hệ chưa ghi được vi phạm cụ thể nào/)
    expect(res.phatHien).not.toMatch(/cắt lỗ|nhồi lệnh|chốt lời|bán sớm/i)
  })

  it("(b) Đúng-Thua cao (≥ Đúng-Thắng) → «đó là thị trường, không phải lỗi bạn»", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 2),
      ...tradesInO("dung_thua", 5),
      ...tradesInO("sai_thua", 1),
    ])
    expect(res.canhBao).toBe(false)
    expect(res.phatHien).toMatch(/5 lệnh làm đúng nhưng thua/)
    expect(res.phatHien).toMatch(/Đó là thị trường, không phải lỗi bạn/)
    expect(res.phatHien).toMatch(/giữ vững cách làm đúng/)
  })

  it("(c) mặc định → so tỷ lệ quyết định đúng với tỷ lệ thắng, in CẢ HAI con số", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 6),
      ...tradesInO("dung_thua", 2),
      ...tradesInO("sai_thua", 2),
    ])
    expect(res.canhBao).toBe(false)
    // đúng 8/10 = 80% · thắng 6/10 = 60%
    expect(res.tyLeQuyetDinhDung).toBe(80)
    expect(res.tyLeThang).toBe(60)
    expect(res.phatHien).toMatch(/Tỷ lệ quyết định đúng 80%/)
    expect(res.phatHien).toMatch(/thước đo năng lực thật/)
    expect(res.phatHien).toMatch(/tỷ lệ thắng 60%/)
  })

  it("Đúng-Thua đủ 3 nhưng Đúng-Thắng nhiều hơn → dùng câu mặc định, không câu (b)", () => {
    const res = computeCap5Khoi12MaTran([
      ...tradesInO("dung_thang", 8),
      ...tradesInO("dung_thua", 3),
    ])
    expect(res.phatHien).toMatch(/Tỷ lệ quyết định đúng 100%/)
    expect(res.phatHien).not.toMatch(/Đó là thị trường/)
  })

  it("giải thích (§C12c) nêu rõ nguồn verdict + luật 0% tính là thua", () => {
    const res = computeCap5Khoi12MaTran(tradesInO("dung_thang", 3))
    expect(res.giaiThich).toMatch(/verdict bạn chốt/)
    expect(res.giaiThich).toMatch(/0% tính là THUA/)
    expect(res.giaiThich).toMatch(/70%/)
  })
})

describe("viPhamPhoBienCap5", () => {
  it("chọn loại vi phạm nhiều lần nhất, viết bằng lời user hiểu", () => {
    expect(
      viPhamPhoBienCap5([
        ...tradesInO("sai_thang", 3, { nhoiLenhKhiLo: true }),
        ...tradesInO("sai_thang", 1, { chamSlKhongCat: true }),
      ]),
    ).toBe("nhồi lệnh khi lỗ")
  })

  it("không lệnh nào có cờ vi phạm → null (KHÔNG bịa)", () => {
    expect(viPhamPhoBienCap5(tradesInO("sai_thang", 3))).toBeNull()
  })

  it("hoà số lần → giữ thứ tự ưu tiên của Cấp 2", () => {
    expect(
      viPhamPhoBienCap5([
        ...tradesInO("sai_thang", 1, { nhoiLenhKhiLo: true }),
        ...tradesInO("sai_thang", 1, { chamSlKhongCat: true }),
      ]),
    ).toBe("cắt lỗ chậm")
  })
})

describe("computeCap5PortfolioAnalysis — cộng dồn: giữ MỌI khối Cấp 1-4", () => {
  function run(trades: Cap5TradeRecord[], progress: Cap5Progress | null = cap5Progress()) {
    return computeCap5PortfolioAnalysis(
      trades,
      [{ ngay: "2026-07-28", diem: 88, xepLoai: "xanh" }],
      cap2Progress(),
      cap3Progress(),
      cap4Progress(),
      progress,
      NOW,
    )
  }

  it("delegate xuống Cấp 4 (chính nó xuống Cấp 3/2/1) — mọi khối cũ còn nguyên", () => {
    const res = run([...tradesInO("dung_thang", 3), ...tradesInO("sai_thua", 2)])
    // khối Cấp 4
    expect(res.khoi10DongThuan).toBeDefined()
    expect(res.khoi11GocNhinRieng).toBeDefined()
    expect(res.soLenhDocDu5Lop).toBe(22)
    // khối Cấp 3
    expect(res.khoi7TuTin).toBeDefined()
    expect(res.khoi8KhoiLuong).toBeDefined()
    // khối Cấp 2 / Cấp 1
    expect(res.khoi1).toBeDefined()
    expect(res.khoi2).toBeDefined()
    expect(res.khoi3).toBeDefined()
    expect(res.khoi4).toBeDefined()
    expect(res.khoi5).toBeDefined()
    expect(res.khoi6).toBeDefined()
    expect(res.khoi7).toBeDefined()
  })

  it("thêm khối ⑫ + 3 số server của Cấp 5", () => {
    const res = run(tradesInO("dung_thang", 5))
    expect(res.khoi12MaTran.soDaPhanLoai).toBe(5)
    expect(res.soLenhPhanLoai).toBe(25)
    expect(res.soLanDungNgoaiDaCham).toBe(4)
    expect(res.tyLeQuyetDinhDungServer).toBe(72)
  })

  it("chưa vào Cấp 5 → 3 số server là null, KHÔNG quy về 0", () => {
    const res = run(tradesInO("dung_thang", 5), null)
    expect(res.soLenhPhanLoai).toBeNull()
    expect(res.soLanDungNgoaiDaCham).toBeNull()
    expect(res.tyLeQuyetDinhDungServer).toBeNull()
  })

  it("số server và số nhật ký client được giữ RIÊNG (không ghi đè nhau)", () => {
    const res = run(tradesInO("dung_thang", 5), cap5Progress({ ty_le_quyet_dinh_dung: 72 }))
    expect(res.tyLeQuyetDinhDungServer).toBe(72)
    expect(res.khoi12MaTran.tyLeQuyetDinhDung).toBe(100)
  })
})
