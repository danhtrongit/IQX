import { describe, it, expect } from "vitest"
import { fmtNumber, fmtVnd, fmtPrice, fmtPercent, fmtCompact, fmtDuration } from "./format"

describe("format (en-US: comma thousands, period decimal)", () => {
  it("fmtNumber groups thousands with commas", () => {
    expect(fmtNumber(1234567)).toBe("1,234,567")
    expect(fmtNumber(35000)).toBe("35,000")
  })

  it("fmtNumber respects maximumFractionDigits", () => {
    expect(fmtNumber(1234567.89, 2)).toBe("1,234,567.89")
  })

  it("fmtVnd appends the đ sign with comma grouping", () => {
    expect(fmtVnd(299000)).toBe("299,000 ₫")
  })

  it("fmtPrice uses comma thousands + period decimal, 2 fraction digits", () => {
    expect(fmtPrice(1234.5)).toBe("1,234.50")
    expect(fmtPrice(25.65)).toBe("25.65")
  })

  it("fmtPercent keeps a period decimal", () => {
    expect(fmtPercent(1.23)).toBe("+1.23%")
    expect(fmtPercent(-1.23)).toBe("-1.23%")
  })

  it("fmtCompact keeps Vietnamese suffixes but en-US decimal separator", () => {
    expect(fmtCompact(3_400_000_000)).toBe("3.4 Tỷ")
    expect(fmtCompact(1_200_000)).toBe("1.2 Tr")
    expect(fmtCompact(1_500)).toBe("1.5 N")
    expect(fmtCompact(500)).toBe("500")
  })

  it("fmtDuration is unaffected by locale (no separators)", () => {
    expect(fmtDuration(3660)).toBe("1h 1m")
    expect(fmtDuration(90)).toBe("1m")
    expect(fmtDuration(0)).toBe("")
  })
})
