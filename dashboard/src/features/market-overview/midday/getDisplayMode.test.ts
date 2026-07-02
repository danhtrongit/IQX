import { describe, it, expect } from "vitest"
import { getDisplayMode } from "./getDisplayMode"

const at = (h: number, m = 0) => new Date(2026, 6, 1, h, m) // Wed 2026-07-01

describe("getDisplayMode", () => {
  it("before 11:30 → eod_yesterday", () =>
    expect(getDisplayMode(at(9, 30))).toBe("eod_yesterday"))

  it("11:30–11:45 → midday_loading", () =>
    expect(getDisplayMode(at(11, 35))).toBe("midday_loading"))

  it("11:45–16:30 → midday", () => {
    expect(getDisplayMode(at(12, 0))).toBe("midday")
    expect(getDisplayMode(at(14, 45))).toBe("midday")
  })

  it("after 16:30 → eod_today", () =>
    expect(getDisplayMode(at(16, 30))).toBe("eod_today"))

  it("non-trading-day → eod_yesterday", () =>
    expect(getDisplayMode(at(12, 0), { isTradingDay: false })).toBe(
      "eod_yesterday"
    ))
})
