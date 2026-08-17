import { describe, expect, it } from "vitest"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import type { CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import type { CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import {
  composeCoachCap6,
  deriveCoachIdCap6,
  pickCoachCap6,
  type CoachSituationCap6,
} from "./coachTemplateCap6"

/**
 * Lớp coach thứ 6 = "đối chiếu vs kết quả" — 4 ô theo `khop_goi_y` × thắng/thua.
 *
 * ★ Bất biến bao trùm cả file: **lệch gợi ý KHÔNG BAO GIỜ là "sai"**. Không ô nào
 * được nói "sai" / "không nên" / "lẽ ra", và `khop_goi_y === null` (kiểu chưa
 * phân loại) KHÔNG được coi là lệch — nó không có đoạn coach nào cả.
 */
const CAM_TU = ["sai", "không nên", "lẽ ra", "may mắn"]

function situation(overrides: Partial<CoachSituationCap6> = {}): CoachSituationCap6 {
  return {
    khopGoiY: true,
    pnlPct: 5.3,
    lopQuyetDinh: "dinh_gia",
    kieuTen: "Ngân hàng",
    lopUuTien: ["dinh_gia", "noi_bo"],
    ...overrides,
  }
}

describe("deriveCoachIdCap6 — 4 ô = khớp/lệch × thắng/thua", () => {
  it("khớp + lãi → khop_thang; khớp + lỗ → khop_thua", () => {
    expect(deriveCoachIdCap6(true, 5.3)).toBe("khop_thang")
    expect(deriveCoachIdCap6(true, -2.1)).toBe("khop_thua")
  })

  it("lệch + lãi → lech_thang; lệch + lỗ → lech_thua", () => {
    expect(deriveCoachIdCap6(false, 5.3)).toBe("lech_thang")
    expect(deriveCoachIdCap6(false, -2.1)).toBe("lech_thua")
  })

  it("lệnh đóng ngang giá (0%) tính là THUA — mirror server `pnl_pct > 0`", () => {
    expect(deriveCoachIdCap6(true, 0)).toBe("khop_thua")
    expect(deriveCoachIdCap6(false, 0)).toBe("lech_thua")
  })
})

describe("pickCoachCap6 — ô khớp + thắng", () => {
  it("nêu lớp + kiểu + %lãi và gọi đây là MỘT điểm dữ liệu, chưa phải bằng chứng", () => {
    const coach = pickCoachCap6(situation())
    expect(coach).not.toBeNull()
    expect(coach!.id).toBe("khop_thang")
    expect(coach!.khop).toBe(true)
    expect(coach!.text).toContain("💎 Định giá")
    expect(coach!.text).toContain("Ngân hàng")
    expect(coach!.text).toContain("+5.3%")
    expect(coach!.text).toContain("một điểm dữ liệu")
    expect(coach!.text).toContain("⑮")
  })
})

describe("pickCoachCap6 — ô khớp + thua", () => {
  it("nói trọng số là xác suất khởi điểm, KHÔNG bảo đảm — và đừng vội đổi cách", () => {
    const coach = pickCoachCap6(situation({ pnlPct: -4.2 }))!
    expect(coach.id).toBe("khop_thua")
    expect(coach.khop).toBe(true)
    expect(coach.text).toContain("−4.2%")
    expect(coach.text).toContain("đừng vội đổi")
    expect(coach.text).toContain("không phải bảo đảm")
  })

  it("KHÔNG quy lỗi cho gợi ý (không có 'gợi ý sai'/'không nên')", () => {
    const coach = pickCoachCap6(situation({ pnlPct: -4.2 }))!
    for (const tu of CAM_TU) expect(coach.text.toLowerCase()).not.toContain(tu)
  })
})

describe("pickCoachCap6 — ô lệch + thắng", () => {
  it("ghi nhận thẳng: tin lớp khác gợi ý và thắng, theo dõi xem có lặp lại", () => {
    const coach = pickCoachCap6(
      situation({ khopGoiY: false, lopQuyetDinh: "ky_thuat", pnlPct: 7.8 }),
    )!
    expect(coach.id).toBe("lech_thang")
    expect(coach.khop).toBe(false)
    expect(coach.text).toContain("🎯 Kỹ thuật")
    expect(coach.text).toContain("khác gợi ý")
    expect(coach.text).toContain("lặp lại")
  })

  it("KHÔNG nói người dùng may mắn, KHÔNG nói gợi ý sai", () => {
    const coach = pickCoachCap6(
      situation({ khopGoiY: false, lopQuyetDinh: "ky_thuat", pnlPct: 7.8 }),
    )!
    for (const tu of CAM_TU) expect(coach.text.toLowerCase()).not.toContain(tu)
  })

  it("nêu nhóm lớp gợi ý THẬT khi có (provenance, không bịa)", () => {
    const coach = pickCoachCap6(
      situation({ khopGoiY: false, lopQuyetDinh: "ky_thuat", lopUuTien: ["noi_bo"] }),
    )!
    expect(coach.text).toContain("👤 Nội bộ")
    expect(coach.text).not.toContain("💎 Định giá")
  })
})

describe("pickCoachCap6 — ô lệch + thua", () => {
  it("vẫn là MỘT điểm dữ liệu và chỉ về khối ⑮, không phán xét", () => {
    const coach = pickCoachCap6(
      situation({ khopGoiY: false, lopQuyetDinh: "ky_thuat", pnlPct: -6.5 }),
    )!
    expect(coach.id).toBe("lech_thua")
    expect(coach.khop).toBe(false)
    expect(coach.text).toContain("−6.5%")
    expect(coach.text).toContain("một điểm dữ liệu")
    expect(coach.text).toContain("⑮")
    for (const tu of CAM_TU) expect(coach.text.toLowerCase()).not.toContain(tu)
  })
})

describe("pickCoachCap6 — khop_goi_y === null (chưa phân loại)", () => {
  it("trả null: KHÔNG có ô nào, và tuyệt đối không coi là lệch", () => {
    expect(pickCoachCap6(situation({ khopGoiY: null }))).toBeNull()
    expect(pickCoachCap6(situation({ khopGoiY: null, pnlPct: -3 }))).toBeNull()
  })
})

describe("pickCoachCap6 — trường thiếu thì NÓI THẲNG, không bịa", () => {
  it("thiếu lớp quyết định → nói hệ chưa ghi lại được lớp, không nêu tên lớp nào", () => {
    const coach = pickCoachCap6(situation({ lopQuyetDinh: null }))!
    expect(coach.text).toContain("chưa ghi lại được")
    expect(coach.text).not.toContain("💎 Định giá")
  })

  it("thiếu tên kiểu → nói hệ chưa ghi lại được tên kiểu", () => {
    const coach = pickCoachCap6(situation({ kieuTen: null }))!
    expect(coach.text).toContain("chưa ghi lại được")
    expect(coach.text).not.toContain("Ngân hàng")
  })

  it("lopUuTien rỗng → không nặn ra nhóm lớp gợi ý nào", () => {
    const coach = pickCoachCap6(situation({ khopGoiY: false, lopUuTien: [] }))!
    expect(coach.text).not.toContain("gợi ý: ")
  })
})

describe("pickCoachCap6 — nhanManh luôn có mặt nguyên văn trong text", () => {
  const cases: CoachSituationCap6[] = [
    situation(),
    situation({ pnlPct: -4 }),
    situation({ khopGoiY: false }),
    situation({ khopGoiY: false, pnlPct: -4 }),
  ]
  it.each(cases.map((s, i) => [i, s] as const))("ô #%i", (_i, s) => {
    const coach = pickCoachCap6(s)!
    expect(coach.nhanManh.length).toBeGreaterThan(0)
    for (const phrase of coach.nhanManh) expect(coach.text).toContain(phrase)
  })
})

// ── composeCoachCap6 — cộng dồn, KHÔNG thay thế ─────────────────────────────

const cap1Situation: CoachSituationCap1 = {
  pnlPositive: true,
  trangThaiLucDat: "ung_ho",
  soPhienGiu: 6,
}
const cap1Params: CoachParamsCap1 = {
  pnlPct: 5.3,
  lyDo: "dinh_gia",
  soPhienGiu: 6,
  emotion: null,
}
const cap2Situation: CoachSituationCap2 = {
  phuongPhapSlTp: "ho_tro_khang_cu",
  catLo: 28_500,
  chotLoi: 32_500,
  // `CoachFlagsCap2` chỉ gồm 6 cờ vi phạm — KHÔNG có `order_id` (nó thuộc
  // `KetsoInputCap2`, không phải đầu vào của coach).
  flags: {},
  giaSauKhiCat: null,
}
const cap3Situation: CoachSituationCap3 = {
  mucTuTin: 3,
  pnlPositive: true,
  pnlPct: 5.3,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 200,
  pctVon: 15,
}
const cap4Situation: CoachSituationCap4 = {
  doc5Lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "bad" },
  ai5Lop: null,
  pnlPositive: true,
  pnlPct: 5.3,
}
const cap5Situation: CoachSituationCap5 = {
  o4: "dung_thang",
  verdict: "dung",
  pnlPct: 5.3,
  signals: [],
}

describe("composeCoachCap6 — 6 lớp coach cạnh nhau", () => {
  it("giữ NGUYÊN 5 đoạn Cấp 1-5 và THÊM đoạn Cấp 6", () => {
    const composed = composeCoachCap6(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      situation(),
    )
    expect(composed.cap1Text.length).toBeGreaterThan(0)
    expect(composed.cap2.text.length).toBeGreaterThan(0)
    expect(composed.cap3.text.length).toBeGreaterThan(0)
    expect(composed.cap4.text.length).toBeGreaterThan(0)
    expect(composed.cap5?.text.length).toBeGreaterThan(0)
    expect(composed.cap6?.id).toBe("khop_thang")
  })

  it("cap6Situation === null → 5 lớp dưới VẪN đủ, cap6 là null", () => {
    const composed = composeCoachCap6(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      null,
    )
    expect(composed.cap6).toBeNull()
    expect(composed.cap5?.text.length).toBeGreaterThan(0)
    expect(composed.cap1Text.length).toBeGreaterThan(0)
  })

  it("cap5Situation === null (chưa chốt phân loại) không chặn đoạn Cấp 6", () => {
    const composed = composeCoachCap6(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      null,
      situation(),
    )
    expect(composed.cap5).toBeNull()
    expect(composed.cap6?.id).toBe("khop_thang")
  })

  it("KHÔNG viết lại đoạn Cấp 5: text giống hệt composeCoachCap5 cho cùng tình huống", async () => {
    const { composeCoachCap5 } = await import("@/features/cap5/coachTemplateCap5")
    const cap5Composed = composeCoachCap5(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
    )
    const composed = composeCoachCap6(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      situation(),
    )
    expect(composed.cap1Text).toBe(cap5Composed.cap1Text)
    expect(composed.cap2.text).toBe(cap5Composed.cap2.text)
    expect(composed.cap3.text).toBe(cap5Composed.cap3.text)
    expect(composed.cap4.text).toBe(cap5Composed.cap4.text)
    expect(composed.cap5?.text).toBe(cap5Composed.cap5?.text)
  })
})
