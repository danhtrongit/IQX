import { describe, expect, it } from "vitest"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import {
  composeCoachCap4,
  lopKhacAiCap4,
  lopLabelCap4,
  pickCoachCap4,
  pickCoachIdCap4,
  type CoachSituationCap4,
} from "./coachTemplateCap4"
import { countKhacAi } from "./doc5Lop"
import type { Lop5Partial } from "./types"

const ALL_OK: Lop5Partial = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "ok",
  tin_tuc: "ok",
  dinh_gia: "ok",
}

/** Lệnh mẫu của mockup `iqx-cap4-ketso.html`: user đọc 📰 Tin tức Ủng hộ, AI Ngược chiều. */
const MOCKUP_DOC: Lop5Partial = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "ok",
  dinh_gia: "ok",
}
const MOCKUP_AI: Lop5Partial = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "bad",
  dinh_gia: "ok",
}

function situation(overrides: Partial<CoachSituationCap4> = {}): CoachSituationCap4 {
  return {
    doc5Lop: MOCKUP_DOC,
    ai5Lop: MOCKUP_AI,
    pnlPositive: true,
    pnlPct: 5.3,
    ...overrides,
  }
}

describe("lopLabelCap4", () => {
  it("ghép icon + tên lớp đúng như panel đặt lệnh", () => {
    expect(lopLabelCap4("tin_tuc")).toBe("📰 Tin tức")
    expect(lopLabelCap4("dinh_gia")).toBe("💎 Định giá")
  })
})

describe("pickCoachIdCap4 — 4 mẫu (khác-AI/cùng-AI × thắng/thua)", () => {
  it("khác AI + thắng", () => {
    expect(pickCoachIdCap4(situation())).toBe("khac_ai_thang")
  })

  it("khác AI + thua", () => {
    expect(pickCoachIdCap4(situation({ pnlPositive: false, pnlPct: -4.2 }))).toBe("khac_ai_thua")
  })

  it("cùng góc nhìn AI + thắng", () => {
    expect(pickCoachIdCap4(situation({ doc5Lop: ALL_OK, ai5Lop: ALL_OK }))).toBe("cung_ai_thang")
  })

  it("cùng góc nhìn AI + thua", () => {
    expect(
      pickCoachIdCap4(
        situation({ doc5Lop: ALL_OK, ai5Lop: ALL_OK, pnlPositive: false, pnlPct: -3 }),
      ),
    ).toBe("cung_ai_thua")
  })

  it("chưa lộ AI (ai5Lop null) → nhánh chưa đối chiếu, KHÔNG đoán bừa 1 trong 4 mẫu", () => {
    expect(pickCoachIdCap4(situation({ ai5Lop: null }))).toBe("chua_doi_chieu")
  })

  it("ai5Lop rỗng (không lớp nào so được) → cũng là chưa đối chiếu", () => {
    expect(pickCoachIdCap4(situation({ ai5Lop: {} }))).toBe("chua_doi_chieu")
  })
})

describe("pickCoachCap4 — nội dung 4 mẫu", () => {
  it("khác AI + thắng: nêu lớp lệch + mức 2 bên, nói góc nhìn của bạn đúng, chưa kết luận", () => {
    const res = pickCoachCap4(situation())
    expect(res.id).toBe("khac_ai_thang")
    expect(res.lopKhacAi).toEqual(["tin_tuc"])
    expect(res.lopNoiBat).toBe("tin_tuc")
    expect(res.text).toMatch(/📰 Tin tức/)
    expect(res.text).toMatch(/bạn đọc Ủng hộ/)
    expect(res.text).toMatch(/AI đánh giá Ngược chiều/)
    expect(res.text).toMatch(/góc nhìn của bạn đúng/)
    expect(res.text).toMatch(/một lệnh chưa đủ kết luận/i)
    expect(res.text).toMatch(/Phân tích danh mục/)
    expect(res.text).toMatch(/\+5\.3%/)
  })

  it("khác AI + thua: nói AI có lý, nhắc xem lại — nhưng KHÔNG dùng chữ «sai»", () => {
    const res = pickCoachCap4(situation({ pnlPositive: false, pnlPct: -4.2 }))
    expect(res.id).toBe("khac_ai_thua")
    expect(res.text).toMatch(/AI có lý/)
    expect(res.text).toMatch(/Xem lại cách bạn đọc lớp này/)
    expect(res.text).toMatch(/−4\.2%/)
    expect(res.text).not.toMatch(/sai/i)
  })

  it("cùng AI + thắng: «đọc chuẩn», nêu lớp đại diện", () => {
    const res = pickCoachCap4(situation({ doc5Lop: ALL_OK, ai5Lop: ALL_OK }))
    expect(res.id).toBe("cung_ai_thang")
    expect(res.lopKhacAi).toEqual([])
    expect(res.text).toMatch(/đọc chuẩn/)
    expect(res.text).toMatch(/Ủng hộ/)
  })

  it("cùng AI + thua: «thị trường thôi, không phải lỗi đọc»", () => {
    const res = pickCoachCap4(
      situation({ doc5Lop: ALL_OK, ai5Lop: ALL_OK, pnlPositive: false, pnlPct: -3 }),
    )
    expect(res.id).toBe("cung_ai_thua")
    expect(res.text).toMatch(/không phải lỗi đọc/)
  })

  it("chưa đối chiếu: nói thẳng chưa có dữ liệu AI, không phán gì", () => {
    const res = pickCoachCap4(situation({ ai5Lop: null }))
    expect(res.id).toBe("chua_doi_chieu")
    expect(res.lopNoiBat).toBeNull()
    expect(res.text).toMatch(/chưa có đối chiếu AI/i)
    expect(res.text).not.toMatch(/sai/i)
  })

  it("nhiều lớp lệch: chọn lớp lệch mạnh nhất (Ủng hộ vs Ngược chiều) + đếm đủ 5 lớp", () => {
    const res = pickCoachCap4(
      situation({
        doc5Lop: { ...MOCKUP_DOC, noi_bo: "ok" },
        // noi_bo lệch 1 bậc (ok vs neu), tin_tuc lệch 2 bậc (ok vs bad)
        ai5Lop: { ...MOCKUP_AI, noi_bo: "neu" },
      }),
    )
    expect(res.lopKhacAi).toEqual(["noi_bo", "tin_tuc"])
    expect(res.lopNoiBat).toBe("tin_tuc")
    expect(res.text).toMatch(/2\/5 lớp/)
  })

  it("lớp lệch trả về theo thứ tự lớp chuẩn (cho bảng nhìn lại nổi nền tím)", () => {
    const res = pickCoachCap4(
      situation({
        doc5Lop: ALL_OK,
        ai5Lop: { ky_thuat: "bad", dong_tien: "ok", noi_bo: "bad", tin_tuc: "ok", dinh_gia: "neu" },
      }),
    )
    expect(res.lopKhacAi).toEqual(["ky_thuat", "noi_bo", "dinh_gia"])
  })

  it("lớp AI thiếu dữ liệu (không có trong ai5Lop) KHÔNG bị tính là lệch", () => {
    const res = pickCoachCap4(
      situation({
        doc5Lop: ALL_OK,
        ai5Lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", dinh_gia: "ok" },
      }),
    )
    expect(res.lopKhacAi).toEqual([])
    expect(res.id).toBe("cung_ai_thang")
  })
})

describe("lopKhacAiCap4 — cùng vị từ với countKhacAi của panel đặt lệnh", () => {
  // Bất biến chống lệch: số "khác AI" hiện ở panel (countKhacAi) và số hàng nổi
  // nền tím ở bảng nhìn lại (lopKhacAiCap4) phải LUÔN bằng nhau.
  const cases: [string, Lop5Partial, Lop5Partial | null][] = [
    ["mockup 1 lớp lệch", MOCKUP_DOC, MOCKUP_AI],
    ["không lệch lớp nào", ALL_OK, ALL_OK],
    ["AI thiếu 1 lớp", ALL_OK, { ky_thuat: "ok", dong_tien: "bad", noi_bo: "ok", tin_tuc: "ok" }],
    ["chưa có AI", ALL_OK, null],
    ["AI rỗng", ALL_OK, {}],
    ["user chấm dở dang", { ky_thuat: "ok", tin_tuc: "bad" }, ALL_OK],
  ]

  it.each(cases)("%s", (_name, doc, ai) => {
    expect(lopKhacAiCap4(doc, ai)).toHaveLength(countKhacAi(doc, ai))
  })
})

describe("composeCoachCap4 — CỘNG DỒN cả 4 lớp coach", () => {
  const cap1Situation: CoachSituationCap1 = {
    pnlPositive: true,
    trangThaiLucDat: "ung_ho",
    soPhienGiu: 7,
  }
  const cap1Params: CoachParamsCap1 = {
    pnlPct: 5.3,
    lyDo: "tin_tuc",
    soPhienGiu: 7,
    emotion: null,
  }
  const cap2Situation: CoachSituationCap2 = {
    phuongPhapSlTp: "ho_tro_khang_cu",
    catLo: 60_700,
    chotLoi: 65_800,
    flags: {},
  }
  const cap3Situation: CoachSituationCap3 = {
    mucTuTin: 2,
    pnlPositive: true,
    pnlPct: 5.3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 200,
    pctVon: 15,
  }

  it("giữ nguyên 3 đoạn Cấp 1/2/3 và THÊM đoạn Cấp 4", () => {
    const coach = composeCoachCap4(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      situation(),
    )
    // Cấp 1 — lưới lý do × kết quả
    expect(coach.cap1Text).toMatch(/Lệnh lãi \+5\.3%/)
    // Cấp 2 — kỷ luật cắt lỗ/chốt lời
    expect(coach.cap2.id).toBeTruthy()
    expect(coach.cap2.text.length).toBeGreaterThan(10)
    // Cấp 3 — tự tin vs kết quả
    expect(coach.cap3.text).toMatch(/⭐⭐ Vừa/)
    // Cấp 4 — góc nhìn khác AI
    expect(coach.cap4.id).toBe("khac_ai_thang")
    expect(coach.cap4.text).toMatch(/📰 Tin tức/)
  })

  it("4 đoạn là 4 chuỗi khác nhau (không lớp nào ghi đè lớp nào)", () => {
    const coach = composeCoachCap4(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      situation(),
    )
    const texts = [coach.cap1Text, coach.cap2.text, coach.cap3.text, coach.cap4.text]
    expect(new Set(texts).size).toBe(4)
  })
})
