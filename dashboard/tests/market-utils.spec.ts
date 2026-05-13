import { describe, expect, it } from "vitest"
import {
  formatImpactPoint,
  formatPercent,
  formatVND,
  formatVndBillion,
  formatVolume,
} from "../src/features/market/utils"

describe("market terminal number formatters", () => {
  it("formats terminal money values without decimal places", () => {
    expect(formatVND(1_245_000_000_000)).toBe("1T")
    expect(formatVndBillion(1_245_000_000_000)).toBe("1.245 tỷ")
  })

  it("formats terminal volume and percentage values without decimal places", () => {
    expect(formatVolume(850_000_000)).toBe("850 triệu cp")
    expect(formatVolume(1_200_000_000)).toBe("1 tỷ cp")
    expect(formatPercent(5.5)).toBe("6%")
    expect(formatImpactPoint(1.25)).toBe("+1đ")
  })
})
