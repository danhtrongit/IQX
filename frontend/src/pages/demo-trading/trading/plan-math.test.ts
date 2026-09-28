import { describe, expect, it } from "vitest"
import { computeBienDoDaoDong, computeBienDoSlTp } from "./plan-math"

describe("Cấp 2 biên độ dao động", () => {
  const bars = Array.from({ length: 15 }, (_, index) => ({
    high: 10_500 + index * 10,
    low: 9_500 + index * 10,
    close: 10_000 + index * 10,
  }))

  it("requires 15 complete bars for 14 true ranges", () => {
    expect(computeBienDoDaoDong(bars.slice(0, 14))).toBeNull()
    expect(computeBienDoDaoDong(bars)).toBe(1_000)
  })

  it("rejects incomplete bars instead of inventing an ATR", () => {
    expect(
      computeBienDoDaoDong([
        ...bars.slice(0, 14),
        { high: null, low: 10_000, close: 10_000 },
      ])
    ).toBeNull()
  })

  it("does not enable an impossible stop/take choice", () => {
    expect(computeBienDoSlTp(6_000, 10_000)).toBeNull()
    expect(computeBienDoSlTp(100, 10_000)).toMatchObject({
      catLo: 9_800,
      chotLoi: 10_400,
    })
  })
})
