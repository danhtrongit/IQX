import { describe, expect, it } from "vitest"

import { leaderboardPercent, maxBuyQty, orderPreview } from "./flashback-model"

/**
 * Spec 22-10 FB-11d: cùng bộ số với `backend/test/unit/flashback.player.test.ts`.
 * [tiền mặt, giá, số cổ phiếu tối đa].
 */
const MAX_BUY_CASES: readonly [number, number, number][] = [
  [10_000_000, 28_800, 346],
  [10_000_000, 1_000, 9_985],
  [5_673_520, 29_000, 195],
  [100_150, 100, 1_000],
  [100_149, 100, 999],
  [0, 28_800, 0],
  [28_843, 28_800, 1],
  [28_842, 28_800, 0],
  [999_999_999, 33_333, 29_955],
]

describe("Flashback model", () => {
  it.each(MAX_BUY_CASES)("Mua tối đa: tiền %d, giá %d → %d cp (giống server)", (cash, price, expected) => {
    expect(maxBuyQty(cash, price)).toBe(expected)
  })

  it("Mua tối đa luôn khớp kiểm tra tiền của lệnh mua với phí làm tròn như server", () => {
    for (let cash = 0; cash < 300_000; cash += 977) {
      for (const price of [100, 999, 28_800, 51_234]) {
        const qty = maxBuyQty(cash, price)
        expect(orderPreview("buy", qty, price).total).toBeLessThanOrEqual(cash)
        expect(orderPreview("buy", qty + 1, price).total).toBeGreaterThan(cash)
      }
    }
  })

  it("phí và thuế làm tròn nửa lên theo điểm cơ bản", () => {
    // 150 × 28.800 = 4.320.000 → phí 6.480; bán 10 × 29.000 = 290.000 → phí 435, thuế 290.
    expect(orderPreview("buy", 150, 28_800)).toEqual({ value: 4_320_000, fee: 6_480, tax: 0, total: 4_326_480 })
    expect(orderPreview("sell", 10, 29_000)).toEqual({ value: 290_000, fee: 435, tax: 290, total: 289_275 })
    // 1.000đ × 0,15% = 1,5đ → 2đ.
    expect(orderPreview("buy", 1, 1_000).fee).toBe(2)
  })

  it("lãi lỗ của dòng xếp hạng: tỉ lệ đổi sang %", () => {
    expect(leaderboardPercent(0.1234)).toBeCloseTo(12.34, 6)
    expect(leaderboardPercent(null)).toBeNull()
  })
})
