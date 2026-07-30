import { describe, expect, it } from "vitest"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import {
  composeCoachCap3,
  pickCoachCap3,
  pickCoachIdCap3,
  type CoachSituationCap3,
} from "./coachTemplateCap3"

function situation(overrides: Partial<CoachSituationCap3> = {}): CoachSituationCap3 {
  return {
    mucTuTin: 3,
    pnlPositive: true,
    pnlPct: 5.8,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_100,
    pctVon: 19,
    ...overrides,
  }
}

describe("pickCoachIdCap3", () => {
  it("⭐⭐⭐ Cao + thắng → tu_tin_cao_thang", () => {
    expect(pickCoachIdCap3(situation({ mucTuTin: 3, pnlPositive: true }))).toBe("tu_tin_cao_thang")
  })

  it("⭐⭐⭐ Cao + thua → tu_tin_cao_thua", () => {
    expect(pickCoachIdCap3(situation({ mucTuTin: 3, pnlPositive: false }))).toBe("tu_tin_cao_thua")
  })

  it("⭐ Thấp + thắng → tu_tin_thap_thang", () => {
    expect(pickCoachIdCap3(situation({ mucTuTin: 1, pnlPositive: true }))).toBe("tu_tin_thap_thang")
  })

  it("⭐ Thấp + thua → tu_tin_thap_thua", () => {
    expect(pickCoachIdCap3(situation({ mucTuTin: 1, pnlPositive: false }))).toBe("tu_tin_thap_thua")
  })

  it("⭐⭐ Vừa keeps its own id (never mis-labelled as Cao/Thấp)", () => {
    expect(pickCoachIdCap3(situation({ mucTuTin: 2, pnlPositive: true }))).toBe("tu_tin_vua_thang")
    expect(pickCoachIdCap3(situation({ mucTuTin: 2, pnlPositive: false }))).toBe("tu_tin_vua_thua")
  })
})

describe("pickCoachCap3 — 4 tổ hợp của spec §7", () => {
  it("Cao + thắng: nêu tự tin ⭐⭐⭐ Cao, lãi và khối lượng lớn", () => {
    const { id, text } = pickCoachCap3(situation({ mucTuTin: 3, pnlPositive: true, pnlPct: 5.8 }))
    expect(id).toBe("tu_tin_cao_thang")
    expect(text).toContain("⭐⭐⭐ Cao")
    expect(text).toContain("+5.8%")
    expect(text).toMatch(/có cơ sở/)
    // %vốn + khối lượng thực tế (§C12c — con số đến từ đâu)
    expect(text).toContain("19.0% vốn")
    expect(text).toContain("1,100 cp")
  })

  it("Cao + thua: không kết luận vội, trỏ sang Cấp 4", () => {
    const { id, text } = pickCoachCap3(
      situation({ mucTuTin: 3, pnlPositive: false, pnlPct: -4.2 }),
    )
    expect(id).toBe("tu_tin_cao_thua")
    expect(text).toContain("⭐⭐⭐ Cao")
    expect(text).toContain("−4.2%")
    expect(text).toMatch(/Chưa vội kết luận/)
    expect(text).toMatch(/Cấp 4/)
  })

  it("Thấp + thắng: phòng thủ đúng nhưng lãi nhỏ", () => {
    const { id, text } = pickCoachCap3(
      situation({ mucTuTin: 1, pnlPositive: true, pnlPct: 3.1, khoiLuong: 410, pctVon: 10 }),
    )
    expect(id).toBe("tu_tin_thap_thang")
    expect(text).toContain("⭐ Thấp")
    expect(text).toMatch(/phòng thủ/)
    expect(text).toContain("410 cp")
  })

  it("Thấp + thua: mua ít nên thiệt hại nhỏ", () => {
    const { id, text } = pickCoachCap3(
      situation({ mucTuTin: 1, pnlPositive: false, pnlPct: -2.5, khoiLuong: 410, pctVon: 10 }),
    )
    expect(id).toBe("tu_tin_thap_thua")
    expect(text).toContain("⭐ Thấp")
    expect(text).toMatch(/thiệt hại nhỏ/)
  })

  it("Vừa + thắng: dùng đúng nhãn ⭐⭐ Vừa (mockup iqx-cap3-ketso.html)", () => {
    const { text } = pickCoachCap3(
      situation({ mucTuTin: 2, pnlPositive: true, pnlPct: 6.1, khoiLuong: 200, pctVon: 15 }),
    )
    expect(text).toContain("⭐⭐ Vừa")
    expect(text).not.toContain("⭐⭐⭐ Cao")
    expect(text).toContain("15.0% vốn")
  })

  it("Vừa + thua: dùng đúng nhãn ⭐⭐ Vừa", () => {
    const { text } = pickCoachCap3(
      situation({ mucTuTin: 2, pnlPositive: false, pnlPct: -3, khoiLuong: 200, pctVon: 15 }),
    )
    expect(text).toContain("⭐⭐ Vừa")
    expect(text).not.toContain("⭐ Thấp")
  })

  it("cách «linh hoạt» thêm câu ghi nhận tự tin dẫn dắt khối lượng", () => {
    const { text } = pickCoachCap3(situation({ cachKhoiLuong: "linh_hoat" }))
    expect(text).toMatch(/để mức tự tin dẫn dắt khối lượng/)
  })

  it("cách «kỷ luật» nói rõ tự tin chỉ được ghi lại để đối chiếu", () => {
    const { text } = pickCoachCap3(situation({ cachKhoiLuong: "ky_luat" }))
    expect(text).toMatch(/kỷ luật/)
    expect(text).toMatch(/ghi lại/)
    expect(text).not.toMatch(/để mức tự tin dẫn dắt khối lượng/)
  })
})

describe("composeCoachCap3 — cả 3 lớp (cộng dồn)", () => {
  const cap1Situation: CoachSituationCap1 = {
    pnlPositive: true,
    trangThaiLucDat: "ung_ho",
    soPhienGiu: 6,
  }
  const cap1Params: CoachParamsCap1 = {
    pnlPct: 6.1,
    lyDo: "dong_tien",
    soPhienGiu: 6,
    emotion: null,
  }
  const cap2Situation: CoachSituationCap2 = {
    phuongPhapSlTp: "ho_tro_khang_cu",
    catLo: 60_700,
    chotLoi: 65_800,
    flags: {},
  }

  it("giữ lớp Cấp 1 + lớp Cấp 2 nguyên vẹn và THÊM lớp Cấp 3", () => {
    const coach = composeCoachCap3(
      cap1Situation,
      cap1Params,
      cap2Situation,
      situation({ mucTuTin: 2, pnlPositive: true, pnlPct: 6.1, khoiLuong: 200, pctVon: 15 }),
    )
    // Lớp 1 (Cấp 1's A-F grid) — delegated verbatim.
    expect(coach.cap1Text).toMatch(/Lệnh lãi/)
    expect(coach.cap1Text).toMatch(/Dòng tiền/)
    // Lớp 2 (Cấp 2's discipline nhắc) — delegated verbatim.
    expect(coach.cap2.id).toBe("cach_dat_tot")
    expect(coach.cap2.text).toMatch(/cam kết cắt lỗ\/chốt lời/)
    // Lớp 3 (Cấp 3's tự tin vs kết quả) — added.
    expect(coach.cap3.id).toBe("tu_tin_vua_thang")
    expect(coach.cap3.text).toContain("⭐⭐ Vừa")
  })

  it("lớp Cấp 2 vẫn ưu tiên vi phạm nặng nhất, độc lập với lớp Cấp 3", () => {
    const coach = composeCoachCap3(
      { ...cap1Situation, pnlPositive: false },
      { ...cap1Params, pnlPct: -8 },
      {
        ...cap2Situation,
        flags: { cham_SL_khong_cat: true, giu_cham_SL_bao_nhieu_phien: 2 },
      },
      situation({ mucTuTin: 3, pnlPositive: false, pnlPct: -8 }),
    )
    expect(coach.cap2.id).toBe("cat_lo_cham")
    expect(coach.cap3.id).toBe("tu_tin_cao_thua")
  })
})
