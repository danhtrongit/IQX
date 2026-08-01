import { describe, expect, it } from "vitest"
import {
  bandLuc,
  coCanhGiac,
  docSoLenhSnapshot,
  gaugeFill,
  lucChiSo,
  tongDu,
  type MucSoLenh,
} from "./docSoLenh"
import type { QuyTacCap7 } from "./types"

/**
 * Chỉ số Lực + cờ cảnh giác — PURE rules (spec §4/§5).
 *
 * ★ The single invariant this file exists to protect: **every threshold comes
 * from the SERVER's `quy_tac`**, never from a number typed into the frontend. If
 * the FE ever hardcoded the cut-offs, the gauge a user sees could disagree with
 * the server-side chấm that decides whether their reading was right — so the
 * tests below feed DELIBERATELY DIFFERENT thresholds and assert the answer moves
 * with them.
 */

/** Exactly what `GET /cap7/phien` publishes today (backend `Cap7Service.quy_tac`). */
const QUY_TAC: QuyTacCap7 = {
  nguong_cau_ap_dao: 1.5,
  nguong_cung_ap_dao: 1 / 1.5,
  bands: [
    {
      ma: "cau_ap_dao",
      ten: "Cầu áp đảo",
      dieu_kien_text: "Lực ≥ 1.50 : 1",
      giai_thich: "Tổng dư MUA 3 mức đang lớn hơn tổng dư BÁN ít nhất 1.5 lần.",
    },
    {
      ma: "can_bang",
      ten: "Cân bằng",
      dieu_kien_text: "0.67 : 1 < Lực < 1.50 : 1",
      giai_thich: "Dư mua và dư bán 3 mức xấp xỉ nhau.",
    },
    {
      ma: "cung_ap_dao",
      ten: "Cung áp đảo",
      dieu_kien_text: "Lực ≤ 0.67 : 1",
      giai_thich: "Tổng dư BÁN 3 mức đang lớn hơn tổng dư MUA ít nhất 1.5 lần.",
    },
  ],
  co_canh_giac_he_so: 3,
  co_canh_giac_min_muc: 3,
  co_canh_giac_copy:
    "Lệnh treo to chưa chắc là cầu/cung thật — đôi khi là 'kê giá' rồi rút. Chờ nó KHỚP THẬT rồi hãy tin.",
  so_phien_cham: 2,
  dead_band_pct: 1,
  cham_giai_thich: "Sau 2 phiên giao dịch kể từ ngày bạn mua…",
}

/** A hypothetical future server that moved its cut-offs — same code must follow. */
const QUY_TAC_KHAC: QuyTacCap7 = {
  ...QUY_TAC,
  nguong_cau_ap_dao: 3,
  nguong_cung_ap_dao: 1 / 3,
  co_canh_giac_he_so: 10,
  co_canh_giac_min_muc: 6,
}

/** spec §4's own worked example: 1,240,000 dư mua vs 640,000 dư bán. */
const BID_SPEC: MucSoLenh[] = [
  { price: 62.3, volume: 540_000 },
  { price: 62.2, volume: 400_000 },
  { price: 62.1, volume: 300_000 },
]
const ASK_SPEC: MucSoLenh[] = [
  { price: 62.4, volume: 240_000 },
  { price: 62.5, volume: 220_000 },
  { price: 62.6, volume: 180_000 },
]

describe("tongDu — tổng khối lượng dư 3 mức", () => {
  it("cộng đủ 3 mức", () => {
    expect(tongDu(BID_SPEC)).toBe(1_240_000)
    expect(tongDu(ASK_SPEC)).toBe(640_000)
  })

  it("sổ rỗng → 0 (không NaN)", () => {
    expect(tongDu([])).toBe(0)
  })

  it("bỏ qua khối lượng thiếu/không hữu hạn thay vì trả NaN", () => {
    const ban = [
      { price: 1, volume: Number.NaN },
      { price: 2, volume: 100 },
      { price: 3, volume: Number.POSITIVE_INFINITY },
    ]
    expect(tongDu(ban)).toBe(100)
  })
})

describe("lucChiSo — tỷ lệ dư mua / dư bán", () => {
  it("tính đúng ví dụ của spec §4 (≈ 1.9 : 1)", () => {
    expect(lucChiSo(BID_SPEC, ASK_SPEC)).toBeCloseTo(1.9375, 6)
  })

  it("★ tổng dư BÁN = 0 → null, KHÔNG BAO GIỜ Infinity", () => {
    const ratio = lucChiSo(BID_SPEC, [])
    expect(ratio).toBeNull()
    expect(ratio).not.toBe(Number.POSITIVE_INFINITY)
  })

  it("★ tổng dư BÁN = 0 dù có mức (khối lượng 0) → vẫn null", () => {
    expect(lucChiSo(BID_SPEC, [{ price: 62.4, volume: 0 }])).toBeNull()
  })

  it("★ sổ rỗng cả hai bên → null (không bịa ra tỷ lệ)", () => {
    expect(lucChiSo([], [])).toBeNull()
  })

  it("★ tổng dư MUA = 0 → null: tỷ lệ 0 không phải số server nhận (phải > 0)", () => {
    expect(lucChiSo([], ASK_SPEC)).toBeNull()
  })

  it("giá trị trả về luôn hữu hạn và > 0 khi khác null", () => {
    const ratio = lucChiSo(BID_SPEC, ASK_SPEC)
    expect(ratio).not.toBeNull()
    expect(Number.isFinite(ratio as number)).toBe(true)
    expect(ratio as number).toBeGreaterThan(0)
  })
})

describe("bandLuc — band lấy NGƯỠNG TỪ SERVER, không tự đặt", () => {
  it("1.94 : 1 → Cầu áp đảo với ngưỡng server hiện tại", () => {
    expect(bandLuc(1.9375, QUY_TAC)).toBe("cau_ap_dao")
  })

  it("1.0 : 1 → Cân bằng", () => {
    expect(bandLuc(1, QUY_TAC)).toBe("can_bang")
  })

  it("0.5 : 1 → Cung áp đảo", () => {
    expect(bandLuc(0.5, QUY_TAC)).toBe("cung_ap_dao")
  })

  it("đúng bằng ngưỡng cầu → Cầu áp đảo (≥, khớp luật server)", () => {
    expect(bandLuc(1.5, QUY_TAC)).toBe("cau_ap_dao")
  })

  it("đúng bằng ngưỡng cung → Cung áp đảo (≤, khớp luật server)", () => {
    expect(bandLuc(1 / 1.5, QUY_TAC)).toBe("cung_ap_dao")
  })

  it("★ ngưỡng server đổi thì band đổi theo — FE KHÔNG hardcode 1.5", () => {
    // Cùng một tỷ lệ 1.9375: "Cầu áp đảo" với ngưỡng 1.5, "Cân bằng" với 3.0.
    expect(bandLuc(1.9375, QUY_TAC)).toBe("cau_ap_dao")
    expect(bandLuc(1.9375, QUY_TAC_KHAC)).toBe("can_bang")
  })

  it("★ chưa có quy tắc của server → null, KHÔNG đoán band", () => {
    expect(bandLuc(1.9375, null)).toBeNull()
    expect(bandLuc(1.9375, undefined)).toBeNull()
  })

  it("tỷ lệ null / không hữu hạn / ≤ 0 → null", () => {
    expect(bandLuc(null, QUY_TAC)).toBeNull()
    expect(bandLuc(Number.POSITIVE_INFINITY, QUY_TAC)).toBeNull()
    expect(bandLuc(Number.NaN, QUY_TAC)).toBeNull()
    expect(bandLuc(0, QUY_TAC)).toBeNull()
    expect(bandLuc(-2, QUY_TAC)).toBeNull()
  })
})

describe("coCanhGiac — heuristic 1 mức lớn bất thường (spec §5)", () => {
  const DEU: MucSoLenh[] = [
    { price: 62.3, volume: 100_000 },
    { price: 62.2, volume: 90_000 },
    { price: 62.1, volume: 110_000 },
    { price: 62.4, volume: 95_000 },
  ]

  it("không mức nào lệch → null (không kêu oan)", () => {
    expect(coCanhGiac(DEU, QUY_TAC)).toBeNull()
  })

  it("1 mức > 3× trung bình các mức còn lại → báo, kèm giá và khối lượng", () => {
    const levels = [...DEU]
    levels[2] = { price: 62.1, volume: 2_000_000 }
    const co = coCanhGiac(levels, QUY_TAC)
    expect(co).not.toBeNull()
    expect(co?.hit).toBe(true)
    expect(co?.price).toBe(62.1)
    expect(co?.volume).toBe(2_000_000)
  })

  it("đúng bằng 3× trung bình còn lại → im lặng (luật là > , không ≥)", () => {
    // Ba mức 100k + một mức 300k: 300k = 3 × trung bình(100k).
    const levels: MucSoLenh[] = [
      { price: 1, volume: 100 },
      { price: 2, volume: 100 },
      { price: 3, volume: 100 },
      { price: 4, volume: 300 },
    ]
    expect(coCanhGiac(levels, QUY_TAC)).toBeNull()
  })

  it("ít hơn số mức tối thiểu của server → im lặng", () => {
    const levels: MucSoLenh[] = [
      { price: 1, volume: 10 },
      { price: 2, volume: 5_000 },
    ]
    expect(coCanhGiac(levels, QUY_TAC)).toBeNull()
  })

  it("các mức còn lại không có khối lượng nào → im lặng (không có gì để so)", () => {
    const levels: MucSoLenh[] = [
      { price: 1, volume: 0 },
      { price: 2, volume: 0 },
      { price: 3, volume: 900_000 },
    ]
    expect(coCanhGiac(levels, QUY_TAC)).toBeNull()
  })

  it("★ HỆ SỐ lấy TỪ SERVER, không hardcode 3 (chỉ đổi hệ số, giữ nguyên min mức)", () => {
    const levels = [...DEU]
    levels[2] = { price: 62.1, volume: 500_000 }
    // Trung bình các mức còn lại = 95,000 → 500,000 vượt 3× nhưng chưa vượt 10×.
    expect(coCanhGiac(levels, QUY_TAC)?.hit).toBe(true)
    expect(coCanhGiac(levels, { ...QUY_TAC, co_canh_giac_he_so: 10 })).toBeNull()
  })

  it("★ SỐ MỨC TỐI THIỂU lấy TỪ SERVER, không hardcode 3", () => {
    const levels = [...DEU]
    levels[2] = { price: 62.1, volume: 2_000_000 }
    expect(coCanhGiac(levels, QUY_TAC)?.hit).toBe(true)
    expect(coCanhGiac(levels, QUY_TAC_KHAC)).toBeNull()
  })

  it("★ chưa có quy tắc của server → null, KHÔNG tự dựng luật", () => {
    const levels = [...DEU]
    levels[2] = { price: 62.1, volume: 2_000_000 }
    expect(coCanhGiac(levels, null)).toBeNull()
    expect(coCanhGiac(levels, undefined)).toBeNull()
  })
})

describe("gaugeFill — số ô sáng của thanh Lực", () => {
  it("ví dụ spec §4 (1,240,000 / 640,000) → 7/10 ô, đúng ▓▓▓▓▓▓▓░░░", () => {
    expect(gaugeFill(1_240_000, 640_000)).toBe(7)
  })

  it("cân bằng tuyệt đối → 5/10 ô", () => {
    expect(gaugeFill(500_000, 500_000)).toBe(5)
  })

  it("không có dư nào → 0 ô (không NaN)", () => {
    expect(gaugeFill(0, 0)).toBe(0)
  })

  it("luôn nằm trong 0..10", () => {
    expect(gaugeFill(1, 0)).toBeLessThanOrEqual(10)
    expect(gaugeFill(0, 1)).toBeGreaterThanOrEqual(0)
  })
})

describe("docSoLenhSnapshot — một ảnh chụp dùng chung cho khối và cho lúc ghi", () => {
  it("gộp tổng dư, chỉ số, band và cờ trong một lần đọc sổ", () => {
    const snap = docSoLenhSnapshot(BID_SPEC, ASK_SPEC, QUY_TAC)
    expect(snap.tongMua).toBe(1_240_000)
    expect(snap.tongBan).toBe(640_000)
    expect(snap.chiSo).toBeCloseTo(1.9375, 6)
    expect(snap.band).toBe("cau_ap_dao")
    expect(snap.co).toBeNull()
    expect(snap.docDuoc).toBe(true)
  })

  it("sổ quá mỏng → docDuoc = false, chỉ số và band đều null", () => {
    const snap = docSoLenhSnapshot(BID_SPEC, [], QUY_TAC)
    expect(snap.docDuoc).toBe(false)
    expect(snap.chiSo).toBeNull()
    expect(snap.band).toBeNull()
  })

  it("cờ xét trên CẢ hai bên sổ gộp lại (mua + bán)", () => {
    const ask: MucSoLenh[] = [
      { price: 62.4, volume: 240_000 },
      { price: 62.5, volume: 220_000 },
      { price: 62.6, volume: 9_000_000 },
    ]
    const snap = docSoLenhSnapshot(BID_SPEC, ask, QUY_TAC)
    expect(snap.co?.price).toBe(62.6)
    expect(snap.co?.volume).toBe(9_000_000)
  })

  it("chưa có quy tắc server → band và cờ đều null, tổng dư vẫn tính được", () => {
    const snap = docSoLenhSnapshot(BID_SPEC, ASK_SPEC, null)
    expect(snap.tongMua).toBe(1_240_000)
    expect(snap.band).toBeNull()
    expect(snap.co).toBeNull()
  })
})
