import { describe, expect, it } from "vitest"

import { formatPremiumEnd, isLifetimeEnd } from "./format"

describe("isLifetimeEnd", () => {
  it("recognizes the year-9999 lifetime sentinel in any offset", () => {
    expect(isLifetimeEnd("9999-12-31T16:59:59.000Z")).toBe(true)
    expect(isLifetimeEnd("9999-12-31T23:59:59+07:00")).toBe(true)
    expect(isLifetimeEnd("9999-01-01T00:00:00Z")).toBe(true)
  })

  it("treats ordinary, missing and malformed dates as not lifetime", () => {
    expect(isLifetimeEnd("2027-01-14T00:00:00+07:00")).toBe(false)
    expect(isLifetimeEnd(null)).toBe(false)
    expect(isLifetimeEnd(undefined)).toBe(false)
    expect(isLifetimeEnd("không phải ngày")).toBe(false)
  })
})

describe("formatPremiumEnd", () => {
  it("shows Trọn đời for a 9999 end and the formatted date otherwise", () => {
    expect(formatPremiumEnd("9999-12-31T16:59:59.000Z")).toBe("Trọn đời")
    expect(formatPremiumEnd("2027-01-14T00:00:00Z", () => "14/01/2027")).toBe("14/01/2027")
    expect(formatPremiumEnd(null)).toBe("—")
  })
})
