import { describe, expect, it } from "vitest"
import {
  formatVietnamDateKey,
  formatVietnamDateParam,
} from "../src/lib/tradingview-timezone"

describe("tradingview Vietnam timezone helpers", () => {
  it("formats a UTC timestamp into the Vietnam calendar date", () => {
    const date = new Date("2026-04-09T18:30:00.000Z")

    expect(formatVietnamDateKey(date)).toBe("2026-04-10")
    expect(formatVietnamDateParam(date)).toBe("10-04-2026")
  })
})
