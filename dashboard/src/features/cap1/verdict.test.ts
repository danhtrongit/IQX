import { describe, expect, it } from "vitest"
import { verdictFromStatusLevel, verdictFromValuation, verdictToTrangThai } from "./verdict"

describe("verdictFromStatusLevel (spec §5 5-bậc table)", () => {
  it("maps level 5 (Rất mạnh/Hỗ trợ mạnh/Rất tích cực) → ✅ Ủng hộ mạnh", () => {
    expect(verdictFromStatusLevel(5)).toBe("ung_ho_manh")
  })
  it("maps level 4 (Mạnh/Hỗ trợ nhẹ/Tích cực) → ✅ Ủng hộ", () => {
    expect(verdictFromStatusLevel(4)).toBe("ung_ho")
  })
  it("maps level 3 (Trung bình/Trung tính) → ⚪ Trung tính", () => {
    expect(verdictFromStatusLevel(3)).toBe("trung_tinh")
  })
  it("maps level 2 (Yếu/Cảnh báo nhẹ/Tiêu cực) → ⚠ Cần chú ý", () => {
    expect(verdictFromStatusLevel(2)).toBe("can_chu_y")
  })
  it("maps level 1 (Rất yếu/Cảnh báo mạnh/Rất tiêu cực) → ❌ Ngược chiều", () => {
    expect(verdictFromStatusLevel(1)).toBe("nguoc_chieu")
  })
})

describe("verdictFromValuation (spec §5 💎 Định giá)", () => {
  const base = { median: 100, rangeLow: 80, rangeHigh: 120 }

  it("price above the range (vượt đỉnh) → ❌ Ngược chiều", () => {
    expect(verdictFromValuation({ ...base, currentPrice: 121 })).toBe("nguoc_chieu")
  })
  it("price below the range → ✅ Ủng hộ mạnh (cheaper than every method's bear case)", () => {
    expect(verdictFromValuation({ ...base, currentPrice: 79 })).toBe("ung_ho_manh")
  })
  it("price in the lower half of the range (nửa dưới vùng) → ✅ Ủng hộ", () => {
    expect(verdictFromValuation({ ...base, currentPrice: 90 })).toBe("ung_ho")
  })
  it("price near the median (quanh trung vị, ±5%) → ⚪ Trung tính", () => {
    expect(verdictFromValuation({ ...base, currentPrice: 100 })).toBe("trung_tinh")
    expect(verdictFromValuation({ ...base, currentPrice: 104 })).toBe("trung_tinh")
    expect(verdictFromValuation({ ...base, currentPrice: 96 })).toBe("trung_tinh")
  })
  it("price in the upper half of the range (nửa trên) → ⚠ Cần chú ý", () => {
    expect(verdictFromValuation({ ...base, currentPrice: 110 })).toBe("can_chu_y")
  })
})

describe("verdictToTrangThai (BE's 4-state collapse)", () => {
  it("collapses ung_ho_manh → ung_ho (order_kehoach has no 'mạnh' tier)", () => {
    expect(verdictToTrangThai("ung_ho_manh")).toBe("ung_ho")
  })
  it("passes the other 3 tiers through unchanged", () => {
    expect(verdictToTrangThai("ung_ho")).toBe("ung_ho")
    expect(verdictToTrangThai("trung_tinh")).toBe("trung_tinh")
    expect(verdictToTrangThai("can_chu_y")).toBe("can_chu_y")
    expect(verdictToTrangThai("nguoc_chieu")).toBe("nguoc_chieu")
  })
})
