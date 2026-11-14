import { describe, expect, it } from "vitest"

import {
  QUE_LIST,
  RITUAL_RULES,
  TICKER_RE,
  normaliseTickers,
  queById,
  vnDay,
} from "./ritual.ts"

describe("vnDay", () => {
  it("rolls the day at Vietnam midnight, not UTC midnight", () => {
    expect(vnDay(Date.UTC(2026, 10, 12, 16, 59))).toBe("2026-11-12")
    expect(vnDay(Date.UTC(2026, 10, 12, 17, 0))).toBe("2026-11-13")
  })

  it("shifts by whole days", () => {
    expect(vnDay(Date.UTC(2026, 10, 12, 3, 0), 1)).toBe("2026-11-13")
    expect(vnDay(Date.UTC(2026, 10, 12, 3, 0), -12)).toBe("2026-10-31")
  })
})

describe("normaliseTickers", () => {
  it("upper-cases and trims", () => {
    expect(normaliseTickers([" fpt", "Hpg ", "VCB"])).toEqual([
      "FPT",
      "HPG",
      "VCB",
    ])
  })

  it("needs three different well-formed codes", () => {
    expect(normaliseTickers(["FPT", "fpt", "VCB"])).toBeNull()
    expect(normaliseTickers(["FPT", "HPG"])).toBeNull()
    expect(normaliseTickers(["FPT", "HPG", "VCB", "MWG"])).toBeNull()
    expect(normaliseTickers(["FPT", "HPG", "VCBX"])).toBeNull()
    expect(normaliseTickers(["FPT", "HPG", "V-B"])).toBeNull()
  })

  it("agrees with the rule constant and the code pattern", () => {
    expect(RITUAL_RULES.tickersToPray).toBe(3)
    expect(TICKER_RE.test("FPT")).toBe(true)
    expect(TICKER_RE.test("fpt")).toBe(false)
  })
})

describe("quẻ list", () => {
  it("has 12 quẻ with unique ids and a luck from 1 to 5", () => {
    expect(QUE_LIST).toHaveLength(12)
    expect(new Set(QUE_LIST.map((q) => q.id)).size).toBe(12)
    expect(QUE_LIST.every((q) => q.luck >= 1 && q.luck <= 5)).toBe(true)
  })

  it("finds a quẻ by id", () => {
    expect(queById(1)?.name).toBe("Đại Cát")
    expect(queById(999)).toBeUndefined()
  })
})
