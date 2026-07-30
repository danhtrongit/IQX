import { describe, expect, it } from "vitest"
import { computeKhauViConsequence } from "./khauViConsequence"

describe("computeKhauViConsequence — spec §5.1/§C12c (hệ quả cụ thể của mỗi mức khẩu vị)", () => {
  const vonBanDau = 100_000_000

  it("than_trong (10%): vốn/lệnh 10tr, ~10 mã, thiệt hại tối đa nếu giảm sàn 7% = 700,000đ", () => {
    const r = computeKhauViConsequence("than_trong", vonBanDau)
    expect(r.khauViPct).toBe(10)
    expect(r.vonMoiLenh).toBe(10_000_000)
    expect(r.soMa).toBe(10)
    expect(r.thietHaiToiDa).toBeCloseTo(700_000, 0)
  })

  it("can_bang (20%): vốn/lệnh 20tr, ~5 mã, thiệt hại tối đa = 1,400,000đ", () => {
    const r = computeKhauViConsequence("can_bang", vonBanDau)
    expect(r.khauViPct).toBe(20)
    expect(r.vonMoiLenh).toBe(20_000_000)
    expect(r.soMa).toBe(5)
    expect(r.thietHaiToiDa).toBeCloseTo(1_400_000, 0)
  })

  it("tan_cong (30%): vốn/lệnh 30tr, ~3 mã, thiệt hại tối đa = 2,100,000đ", () => {
    const r = computeKhauViConsequence("tan_cong", vonBanDau)
    expect(r.khauViPct).toBe(30)
    expect(r.vonMoiLenh).toBe(30_000_000)
    expect(r.soMa).toBe(3)
    expect(r.thietHaiToiDa).toBeCloseTo(2_100_000, 0)
  })

  it("scales with a different vốn (proportional, not hard-coded to 100tr)", () => {
    const r = computeKhauViConsequence("can_bang", 50_000_000)
    expect(r.vonMoiLenh).toBe(10_000_000)
    expect(r.thietHaiToiDa).toBeCloseTo(700_000, 0)
  })

  it("honours a custom sàn % override (defaults to 7)", () => {
    const r = computeKhauViConsequence("than_trong", vonBanDau, 10)
    expect(r.thietHaiToiDa).toBeCloseTo(1_000_000, 0)
  })
})
