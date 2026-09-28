import { describe, expect, it } from "vitest"

import { formatISODate, parseISODate } from "./date-only"

describe("date-only values", () => {
  it("round trips a leap day without a timezone conversion", () => {
    expect(formatISODate(parseISODate("2024-02-29"))).toBe("2024-02-29")
  })

  it("rejects invalid dates", () => {
    expect(parseISODate("2023-02-29")).toBeUndefined()
    expect(parseISODate("2024-13-01")).toBeUndefined()
    expect(parseISODate("2024-02-30")).toBeUndefined()
  })

  it("keeps an empty optional date empty", () => {
    expect(formatISODate(parseISODate(""))).toBe("")
  })
})
