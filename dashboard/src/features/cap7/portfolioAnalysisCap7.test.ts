import { describe, expect, it } from "vitest"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import {
  computeCap7Khoi16DocLuc,
  computeCap7Khoi17KyLuatCo,
  computeCap7PortfolioAnalysis,
  KHOI16_MIN_DA_CHAM,
  KHOI17_MIN_LENH_MOI_NHOM,
} from "./portfolioAnalysisCap7"
import type { Cap7TradeRecord } from "./tradeLogCap7"
import type { ThachThucCap7 } from "./types"

/**
 * Khối ⑯ (đọc lực có đúng không) + ⑰ (kỷ luật cảnh giác lệnh giả) — spec §7.
 *
 * ★ Bất biến bao trùm cả file:
 *  1. **<3 lệnh đọc lực ĐÃ CHẤM → chỉ đếm, ẩn thống kê** (spec §7) — và nói rõ
 *     còn thiếu bao nhiêu, không im lặng.
 *  2. **Mua đuổi KHÔNG bị phạt** (spec §5): ⑰ không được có một chữ nào biến nó
 *     thành lỗi, kể cả khi số liệu bất lợi cho nhóm đó.
 *  3. `docLucDung === null` (chưa tới hạn chấm) không bao giờ bị tính là đọc sai.
 */
const CAM_TU = ["sai lầm", "vi phạm", "bị phạt", "không nên", "lẽ ra"]

/**
 * Gộp các câu của một khối để soi cấm từ.
 *
 * ★ Cụm PHỦ ĐỊNH `"không bị phạt"` bị gỡ TRƯỚC khi soi: đó là câu cam kết §C12c
 * mà spec §5 đòi phải nói ra ("mua đuổi không bị phạt"), tức là điều NGƯỢC LẠI
 * với lời buộc tội mà `CAM_TU` đi tìm. Chỉ đúng cụm đó được gỡ — mọi lần "bị
 * phạt" khác trong cùng đoạn văn vẫn bị bắt.
 */
function loiBuocToi(...phan: (string | null)[]): string {
  return phan
    .filter((s): s is string => s != null)
    .join(" ")
    .toLowerCase()
    .split("không bị phạt")
    .join(" ")
}

let seq = 0

function trade(overrides: Partial<Cap7TradeRecord> = {}): Cap7TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dinh_gia",
    trangThaiLucDat: "ung_ho",
    pnlPct: 6,
    pnlVnd: 600_000,
    // Mốc đóng lệnh TĂNG NGHIÊM NGẶT theo `seq`: xu hướng 2 nửa sắp lệnh theo
    // thời gian đóng, nên một mốc quay vòng (vd. ngày trong tháng) sẽ đảo thứ tự
    // hai nhóm và làm bài test đúng/sai tuỳ… vị trí của nó trong file.
    closedAt: new Date(Date.UTC(2026, 6, 1) + seq * 3_600_000).toISOString(),
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
    o4: "dung_thang",
    verdictHe: "dung",
    verdictUser: "dung",
    kieuCoPhieu: "ngan_hang",
    lopQuyetDinh: "dinh_gia",
    khopGoiY: true,
    lucChiSo: 1.94,
    lucBand: "cau_ap_dao",
    lucDocUser: "manh",
    docLucDung: true,
    dienBienPct: 1.2,
    coCanhGiac: false,
    hanhViCo: null,
    ...overrides,
  }
}

/** N lệnh giống hệt nhau — chỉ MỘT biến thay đổi giữa các lời gọi. */
function trades(n: number, overrides: Partial<Cap7TradeRecord> = {}): Cap7TradeRecord[] {
  return Array.from({ length: n }, () => trade(overrides))
}

/** Một lệnh có cờ, ở nhóm `hanhViCo`, với đúng một `dienBienPct`. */
function tradeCo(hanhVi: Cap7TradeRecord["hanhViCo"], dienBienPct: number | null) {
  return trade({ coCanhGiac: true, hanhViCo: hanhVi, dienBienPct })
}

function thachThuc(overrides: Partial<ThachThucCap7> = {}): ThachThucCap7 {
  return {
    dat_ca_3: false,
    so_lenh_doc_luc: {
      ten: "Đọc lực cho ≥ 15 lệnh",
      gia_tri_hien_tai: 12,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich: "Đã đọc lực cho 12/15 lệnh mua.",
    },
    so_lan_khong_duoi_theo_co: {
      ten: "Không đuổi theo ≥ 3 cờ cảnh giác",
      gia_tri_hien_tai: 4,
      muc_tieu: 3,
      dat: true,
      du_du_lieu: true,
      giai_thich: "Gặp cờ 7 lần, chờ xác nhận 4/3 lần.",
    },
    ty_le_doc_luc_dung: {
      ten: "Tỷ lệ đọc lực đúng ≥ 55%",
      gia_tri_hien_tai: 62,
      muc_tieu: 55,
      dat: true,
      du_du_lieu: true,
      giai_thich: "GIẢI THÍCH CỦA HỆ THỐNG",
    },
    so_lenh_da_cham: 8,
    so_lenh_chua_cham: 4,
    so_lan_gap_co: 7,
    so_lan_mua_duoi_theo: 3,
    so_phien_cham: 2,
    ...overrides,
  }
}

// ── Khối ⑯ ─────────────────────────────────────────────────────────────────

describe("computeCap7Khoi16DocLuc — ngưỡng <3 lệnh đã chấm", () => {
  it("dưới ngưỡng → CHỈ ĐẾM, ẩn tỷ lệ, và nói còn cần thêm bao nhiêu lệnh", () => {
    const khoi = computeCap7Khoi16DocLuc(
      thachThuc({
        so_lenh_da_cham: 1,
        ty_le_doc_luc_dung: {
          ten: "Tỷ lệ đọc lực đúng ≥ 55%",
          gia_tri_hien_tai: 100,
          muc_tieu: 55,
          dat: false,
          du_du_lieu: false,
          giai_thich: "Mới có 1 lệnh đã chấm.",
        },
      }),
      [],
    )
    expect(khoi.duDuLieu).toBe(false)
    expect(khoi.tyLe).toBeNull()
    expect(khoi.phatHien).toBeNull()
    expect(khoi.soDaCham).toBe(1)
    expect(khoi.thieuDuLieuNote).toContain("2")
    expect(khoi.thieuDuLieuNote).toContain(String(KHOI16_MIN_DA_CHAM))
  })

  it("dưới ngưỡng vẫn nói rõ số lệnh CHƯA chấm không bị tính là đọc sai", () => {
    const khoi = computeCap7Khoi16DocLuc(
      thachThuc({
        so_lenh_da_cham: 2,
        so_lenh_chua_cham: 5,
        ty_le_doc_luc_dung: {
          ten: "t",
          gia_tri_hien_tai: 50,
          muc_tieu: 55,
          dat: false,
          du_du_lieu: false,
          giai_thich: "g",
        },
      }),
      [],
    )
    expect(khoi.soChuaCham).toBe(5)
    expect(khoi.thieuDuLieuNote).toContain("không bị tính là đọc sai")
  })

  it("chưa tải được số từ hệ thống → fail-closed, KHÔNG tự tính từ nhật ký", () => {
    const khoi = computeCap7Khoi16DocLuc(null, trades(9))
    expect(khoi.tyLe).toBeNull()
    expect(khoi.phatHien).toBeNull()
    expect(khoi.thieuDuLieuNote).toContain("Chưa lấy được")
  })
})

describe("computeCap7Khoi16DocLuc — phát hiện (spec §7, trung thực cả hai chiều)", () => {
  it("≥60% → 'Đọc lực đang là lợi thế vào lệnh của bạn.' (nguyên văn spec)", () => {
    const khoi = computeCap7Khoi16DocLuc(thachThuc(), [])
    expect(khoi.tyLe).toBe(62)
    expect(khoi.phatHien).toContain("Đọc lực đang là lợi thế vào lệnh của bạn.")
  })

  it("~50% → 'Đọc lực chưa ổn định — dùng làm tham khảo thời điểm, đừng làm lý do chính.'", () => {
    const khoi = computeCap7Khoi16DocLuc(
      thachThuc({
        ty_le_doc_luc_dung: {
          ten: "t",
          gia_tri_hien_tai: 50,
          muc_tieu: 55,
          dat: false,
          du_du_lieu: true,
          giai_thich: "g",
        },
      }),
      [],
    )
    expect(khoi.phatHien).toContain(
      "Đọc lực chưa ổn định — dùng làm tham khảo thời điểm, đừng làm lý do chính.",
    )
  })

  it("đúng ngưỡng 60% vẫn là 'lợi thế' (biên trên tính vào nhánh cao)", () => {
    const khoi = computeCap7Khoi16DocLuc(
      thachThuc({
        ty_le_doc_luc_dung: {
          ten: "t",
          gia_tri_hien_tai: 60,
          muc_tieu: 55,
          dat: true,
          du_du_lieu: true,
          giai_thich: "g",
        },
      }),
      [],
    )
    expect(khoi.phatHien).toContain("lợi thế")
  })

  it("dưới 50% → vẫn dùng câu 'chưa ổn định' của spec, KHÔNG mắng", () => {
    const khoi = computeCap7Khoi16DocLuc(
      thachThuc({
        ty_le_doc_luc_dung: {
          ten: "t",
          gia_tri_hien_tai: 30,
          muc_tieu: 55,
          dat: false,
          du_du_lieu: true,
          giai_thich: "g",
        },
      }),
      [],
    )
    expect(khoi.phatHien).toContain("chưa ổn định")
    for (const tu of CAM_TU) expect(khoi.phatHien!.toLowerCase()).not.toContain(tu)
  })

  it("giữ NGUYÊN VĂN câu giải thích của server (§C12c)", () => {
    const khoi = computeCap7Khoi16DocLuc(thachThuc(), [])
    expect(khoi.giaiThichServer).toBe("GIẢI THÍCH CỦA HỆ THỐNG")
  })
})

describe("computeCap7Khoi16DocLuc — xu hướng theo thời gian", () => {
  it("<6 lệnh đã chấm → không dựng xu hướng, nói thẳng còn thiếu", () => {
    const khoi = computeCap7Khoi16DocLuc(thachThuc(), trades(4))
    expect(khoi.xuHuong).toBeNull()
    expect(khoi.xuHuongNote).toContain("6")
  })

  it("đủ 2 nửa → so nửa sau với nửa đầu theo thứ tự đóng lệnh", () => {
    // Nửa đầu 0/3 đúng, nửa sau 3/3 đúng — CHỈ `docLucDung` khác nhau.
    const log = [
      ...trades(3, { docLucDung: false }),
      ...trades(3, { docLucDung: true }),
    ]
    const khoi = computeCap7Khoi16DocLuc(thachThuc(), log)
    expect(khoi.xuHuong).not.toBeNull()
    expect(khoi.xuHuong!.nuaDau.tyLe).toBe(0)
    expect(khoi.xuHuong!.nuaSau.tyLe).toBe(100)
    expect(khoi.xuHuong!.delta).toBe(100)
    expect(khoi.xuHuong!.cauChu).toContain("tốt lên")
  })

  it("nửa sau kém hơn → nói thẳng là đang đi xuống, không giấu", () => {
    const log = [
      ...trades(3, { docLucDung: true }),
      ...trades(3, { docLucDung: false }),
    ]
    const khoi = computeCap7Khoi16DocLuc(thachThuc(), log)
    expect(khoi.xuHuong!.delta).toBe(-100)
    expect(khoi.xuHuong!.cauChu).toContain("−100")
  })

  it("lệnh CHƯA CHẤM bị loại khỏi xu hướng, không tính là đọc sai", () => {
    const log = [
      ...trades(3, { docLucDung: true }),
      ...trades(4, { docLucDung: null, dienBienPct: null }),
      ...trades(3, { docLucDung: true }),
    ]
    const khoi = computeCap7Khoi16DocLuc(thachThuc(), log)
    expect(khoi.xuHuong!.nuaDau.soLenh).toBe(3)
    expect(khoi.xuHuong!.nuaSau.soLenh).toBe(3)
    expect(khoi.xuHuong!.nuaSau.tyLe).toBe(100)
  })
})

// ── Khối ⑰ ─────────────────────────────────────────────────────────────────

describe("computeCap7Khoi17KyLuatCo — 3 con số của server luôn hiện", () => {
  it("số lần gặp cờ · chờ xác nhận · mua đuổi đọc THẲNG từ hệ thống", () => {
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), [])
    expect(khoi.soLanGapCo).toBe(7)
    expect(khoi.soChoXacNhan).toBe(4)
    expect(khoi.soMuaDuoi).toBe(3)
  })

  it("chưa tải được → fail-closed, không đắp bằng phép tính client", () => {
    const khoi = computeCap7Khoi17KyLuatCo(null, [
      ...Array.from({ length: 4 }, () => tradeCo("cho_xac_nhan", 2)),
      ...Array.from({ length: 4 }, () => tradeCo("mua_duoi_theo", -3)),
    ])
    expect(khoi.phatHien).toBeNull()
    expect(khoi.thieuDuLieuNote).toContain("Chưa lấy được")
  })
})

describe("computeCap7Khoi17KyLuatCo — ngưỡng ≥3 lệnh MỖI NHÓM", () => {
  it("một nhóm <3 lệnh có diễn biến → KHÔNG so, nói còn cần thêm bao nhiêu", () => {
    const log = [
      ...Array.from({ length: 4 }, () => tradeCo("cho_xac_nhan", 2)),
      ...Array.from({ length: 2 }, () => tradeCo("mua_duoi_theo", -3)),
    ]
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
    expect(khoi.duCa2Nhom).toBe(false)
    expect(khoi.phatHien).toBeNull()
    expect(khoi.thieuDuLieuNote).toContain("1")
    expect(khoi.thieuDuLieuNote).toContain(String(KHOI17_MIN_LENH_MOI_NHOM))
  })

  it("lệnh chưa có diễn biến KHÔNG được tính vào mẫu số của nhóm", () => {
    const log = [
      ...Array.from({ length: 4 }, () => tradeCo("cho_xac_nhan", 2)),
      ...Array.from({ length: 5 }, () => tradeCo("mua_duoi_theo", null)),
    ]
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
    expect(khoi.muaDuoi.soLenhDaDong).toBe(5)
    expect(khoi.muaDuoi.soCoDienBien).toBe(0)
    expect(khoi.duCa2Nhom).toBe(false)
  })

  it("lệnh KHÔNG có cờ không bao giờ lọt vào nhóm nào", () => {
    const log = [...trades(10, { coCanhGiac: false, hanhViCo: null })]
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
    expect(khoi.choXacNhan.soLenhDaDong).toBe(0)
    expect(khoi.muaDuoi.soLenhDaDong).toBe(0)
  })
})

describe("computeCap7Khoi17KyLuatCo — so 2 nhóm, trung thực cả hai chiều", () => {
  it("chờ xác nhận vào giá tốt hơn rõ rệt → nói ra kèm 2 số trung bình", () => {
    const log = [
      ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", 3)),
      ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", -2)),
    ]
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
    expect(khoi.duCa2Nhom).toBe(true)
    expect(khoi.choXacNhan.dienBienTb).toBe(3)
    expect(khoi.muaDuoi.dienBienTb).toBe(-2)
    expect(khoi.delta).toBe(5)
    expect(khoi.phatHien).toContain("+3.0%")
    expect(khoi.phatHien).toContain("−2.0%")
  })

  it("mua đuổi KHÔNG xấu hơn → nói thẳng, KHÔNG bênh cái cờ", () => {
    const log = [
      ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", -1)),
      ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", 4)),
    ]
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
    expect(khoi.delta).toBe(-5)
    expect(khoi.phatHien).toContain("chưa")
    expect(khoi.muaDuoiXauHon).toBe(false)
  })

  it("chênh lệch nhỏ hơn 1 điểm % → KHÔNG kết luận nhóm nào hơn", () => {
    const log = [
      ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", 1.2)),
      ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", 0.9)),
    ]
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
    expect(khoi.duCa2Nhom).toBe(true)
    expect(khoi.muaDuoiXauHon).toBe(false)
    expect(khoi.phatHien).toContain("chưa thấy khác biệt")
  })

  it("KHÔNG BAO GIỜ gọi mua đuổi là lỗi, ở MỌI trạng thái", () => {
    const cases = [
      [] as Cap7TradeRecord[],
      [
        ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", 3)),
        ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", -4)),
      ],
      [
        ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", -3)),
        ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", 4)),
      ],
    ]
    for (const log of cases) {
      const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), log)
      const text = loiBuocToi(khoi.phatHien, khoi.thieuDuLieuNote, khoi.giaiThich)
      for (const tu of CAM_TU) expect(text).not.toContain(tu)
    }
  })

  it("giải thích §C12c nói rõ mua đuổi KHÔNG bị phạt và cờ chỉ là heuristic", () => {
    const khoi = computeCap7Khoi17KyLuatCo(thachThuc(), [])
    expect(khoi.giaiThich).toContain("không bị phạt")
    expect(khoi.giaiThich).not.toMatch(/phát hiện lệnh giả/i)
  })
})

// ── Top-level: delegation ───────────────────────────────────────────────────

describe("computeCap7PortfolioAnalysis — delegate ①-⑮ xuống Cấp 6", () => {
  const scores: Cap2DailyScoreRecord[] = []

  it("kết quả chứa MỌI khối Cấp 1-6 + ⑯ + ⑰", () => {
    const result = computeCap7PortfolioAnalysis(
      trades(4),
      scores,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      thachThuc(),
      new Date("2026-07-31T12:00:00Z"),
    )
    // Khối của Cấp 6 / 5 / 4 vẫn còn nguyên trên cùng một object.
    expect(result.khoi14LopTheoKieu).toBeDefined()
    expect(result.khoi15DoiChieu).toBeDefined()
    expect(result.khoi16DocLuc).toBeDefined()
    expect(result.khoi17KyLuatCo).toBeDefined()
  })

  it("KHÔNG tính lại ①-⑮: khối ⑭ giống HỆT computeCap6PortfolioAnalysis", async () => {
    const { computeCap6PortfolioAnalysis } = await import(
      "@/features/cap6/portfolioAnalysisCap6"
    )
    const log = trades(4)
    const now = new Date("2026-07-31T12:00:00Z")
    const cap6 = computeCap6PortfolioAnalysis(log, scores, null, null, null, null, null, null, now)
    const cap7 = computeCap7PortfolioAnalysis(
      log,
      scores,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      thachThuc(),
      now,
    )
    expect(cap7.khoi14LopTheoKieu).toEqual(cap6.khoi14LopTheoKieu)
    expect(cap7.khoi15DoiChieu).toEqual(cap6.khoi15DoiChieu)
  })
})
