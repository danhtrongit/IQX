import { describe, expect, it } from "vitest"
import {
  KHAU_VI_PCT,
  MUC_TU_TIN_HE_SO,
  computeKhoiLuong,
  isKhoiLuongValid,
  roundToLo,
} from "./khoiLuong"

describe("KHAU_VI_PCT / MUC_TU_TIN_HE_SO constants (spec §5.1/§6.2)", () => {
  it("exposes the 3 khẩu vị percentages", () => {
    expect(KHAU_VI_PCT).toEqual({ than_trong: 10, can_bang: 20, tan_cong: 30 })
  })

  it("exposes the 3 confidence coefficients", () => {
    expect(MUC_TU_TIN_HE_SO).toEqual({ 1: 50, 2: 75, 3: 100 })
  })
})

describe("roundToLo — làm tròn lô 100 (round-to-nearest)", () => {
  it("rounds down when closer to the lower lot", () => {
    expect(roundToLo(160)).toBe(200) // 160 → nearest 100 is 200 (dist 40 vs 60)
    expect(roundToLo(140)).toBe(100)
  })
  it("rounds to the nearest hundred generally", () => {
    expect(roundToLo(240)).toBe(200)
    expect(roundToLo(320)).toBe(300)
    expect(roundToLo(250)).toBe(300) // Math.round half-up
  })
  it("returns 0 for non-positive or non-finite input", () => {
    expect(roundToLo(0)).toBe(0)
    expect(roundToLo(-50)).toBe(0)
    expect(roundToLo(Number.NaN)).toBe(0)
  })
})

describe("computeKhoiLuong — spec §6.3 worked example (vốn 100tr, VNM 62.400, khẩu vị Cân bằng 20%)", () => {
  const vonBanDau = 100_000_000
  const giaVao = 62_400
  const khauViPct = KHAU_VI_PCT.can_bang // 20

  it("cách linh_hoat, tự tin Thấp (1): 20%×50%=10% → 10tr → ~200cp (round-to-nearest, not floor)", () => {
    const r = computeKhoiLuong({ khauViPct, mucTuTin: 1, cachKhoiLuong: "linh_hoat", vonBanDau, giaVao })
    expect(r.tienDuKien).toBeCloseTo(10_000_000, 0)
    expect(r.khoiLuong).toBe(200)
  })

  it("cách linh_hoat, tự tin Vừa (2): 20%×75%=15% → 15tr → ~200cp", () => {
    const r = computeKhoiLuong({ khauViPct, mucTuTin: 2, cachKhoiLuong: "linh_hoat", vonBanDau, giaVao })
    expect(r.tienDuKien).toBeCloseTo(15_000_000, 0)
    expect(r.khoiLuong).toBe(200)
  })

  it("cách linh_hoat, tự tin Cao (3): 20%×100%=20% → 20tr → ~300cp", () => {
    const r = computeKhoiLuong({ khauViPct, mucTuTin: 3, cachKhoiLuong: "linh_hoat", vonBanDau, giaVao })
    expect(r.tienDuKien).toBeCloseTo(20_000_000, 0)
    expect(r.khoiLuong).toBe(300)
  })

  it.each([1, 2, 3] as const)(
    "cách ky_luat ignores tự tin (%d) — always 20%% → 20tr → ~300cp",
    (mucTuTin) => {
      const r = computeKhoiLuong({ khauViPct, mucTuTin, cachKhoiLuong: "ky_luat", vonBanDau, giaVao })
      expect(r.tienDuKien).toBeCloseTo(20_000_000, 0)
      expect(r.khoiLuong).toBe(300)
    },
  )

  it("pctVon reflects the ACTUAL rounded khối lượng, not the pre-round target", () => {
    const r = computeKhoiLuong({ khauViPct, mucTuTin: 1, cachKhoiLuong: "linh_hoat", vonBanDau, giaVao })
    // 200 cp × 62,400 / 100,000,000 × 100 = 12.48%, not the 10% target.
    expect(r.pctVon).toBeCloseTo((200 * giaVao / vonBanDau) * 100, 2)
  })
})

describe("computeKhoiLuong across all 3 khẩu vị × 3 tự tin × 2 cách (exhaustive matrix)", () => {
  const vonBanDau = 100_000_000
  const giaVao = 20_000 // clean round number for easy hand-verification

  const khauViList = Object.entries(KHAU_VI_PCT) as [keyof typeof KHAU_VI_PCT, number][]
  const mucTuTinList = [1, 2, 3] as const

  for (const [khauViName, khauViPct] of khauViList) {
    for (const mucTuTin of mucTuTinList) {
      it(`linh_hoat: ${khauViName} (${khauViPct}%) × tự tin ${mucTuTin} = vốn × khẩu vị% × hệ số%`, () => {
        const heSo = MUC_TU_TIN_HE_SO[mucTuTin]
        const expectedTien = vonBanDau * (khauViPct / 100) * (heSo / 100)
        const r = computeKhoiLuong({
          khauViPct,
          mucTuTin,
          cachKhoiLuong: "linh_hoat",
          vonBanDau,
          giaVao,
        })
        expect(r.tienDuKien).toBeCloseTo(expectedTien, 6)
        expect(r.khoiLuong).toBe(roundToLo(expectedTien / giaVao))
      })

      it(`ky_luat: ${khauViName} (${khauViPct}%) × tự tin ${mucTuTin} (ignored) = vốn × khẩu vị% only`, () => {
        const expectedTien = vonBanDau * (khauViPct / 100)
        const r = computeKhoiLuong({
          khauViPct,
          mucTuTin,
          cachKhoiLuong: "ky_luat",
          vonBanDau,
          giaVao,
        })
        expect(r.tienDuKien).toBeCloseTo(expectedTien, 6)
        expect(r.khoiLuong).toBe(roundToLo(expectedTien / giaVao))
      })
    }
  }
})

describe("computeKhoiLuong — degrades gracefully (no crash, zeroed result)", () => {
  it("returns zeros when giaVao is 0 or missing", () => {
    const r = computeKhoiLuong({
      khauViPct: 20,
      mucTuTin: 2,
      cachKhoiLuong: "linh_hoat",
      vonBanDau: 100_000_000,
      giaVao: 0,
    })
    expect(r).toEqual({ khoiLuong: 0, pctVon: 0, tienDuKien: 0 })
  })

  it("returns zeros when vonBanDau is 0", () => {
    const r = computeKhoiLuong({
      khauViPct: 20,
      mucTuTin: 2,
      cachKhoiLuong: "linh_hoat",
      vonBanDau: 0,
      giaVao: 62_400,
    })
    expect(r).toEqual({ khoiLuong: 0, pctVon: 0, tienDuKien: 0 })
  })

  it("returns zeros when khauViPct is 0", () => {
    const r = computeKhoiLuong({
      khauViPct: 0,
      mucTuTin: 2,
      cachKhoiLuong: "linh_hoat",
      vonBanDau: 100_000_000,
      giaVao: 62_400,
    })
    expect(r).toEqual({ khoiLuong: 0, pctVon: 0, tienDuKien: 0 })
  })
})

describe("isKhoiLuongValid — cổng cứng gate condition (spec §6.4)", () => {
  it("false when mức tự tin not chosen", () => {
    expect(isKhoiLuongValid(null, "linh_hoat")).toBe(false)
  })
  it("false when cách khối lượng not chosen", () => {
    expect(isKhoiLuongValid(2, null)).toBe(false)
  })
  it("false when neither chosen", () => {
    expect(isKhoiLuongValid(null, null)).toBe(false)
  })
  it("true once both are chosen", () => {
    expect(isKhoiLuongValid(1, "ky_luat")).toBe(true)
    expect(isKhoiLuongValid(3, "linh_hoat")).toBe(true)
  })
})
