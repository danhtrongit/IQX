import { describe, expect, it } from "vitest"

import { displayInputText, formatDisplayNumber, formatFixed, formatSigned, parseDisplayInput, toApiValue, toDisplayValue } from "./units"

describe("unit codec", () => {
  it("converts percent display units to ratios once, without float noise", () => {
    expect(toApiValue(15, "ratio")).toBe(0.15)
    expect(toApiValue(15.5, "ratio")).toBe(0.155)
    expect(toDisplayValue(0.155, "ratio")).toBe(15.5)
    expect(toApiValue(2.5, "lần")).toBe(2.5)
    expect(toDisplayValue(30, "ngày")).toBe(30)
    expect(displayInputText(0.07, "ratio")).toBe("7")
    expect(displayInputText(0.155, "ratio")).toBe("15,5")
  })

  it("reads a threshold with a comma or a dot and refuses anything that is not a number", () => {
    expect(parseDisplayInput("15,5")).toBe(15.5)
    expect(parseDisplayInput(" -3.25 ")).toBe(-3.25)
    expect(parseDisplayInput("")).toBeNull()
    expect(parseDisplayInput("abc")).toBeNull()
    expect(parseDisplayInput("1e3")).toBeNull()
    expect(formatDisplayNumber(8.164965)).toBe("8,16")
    expect(formatDisplayNumber(null)).toBe("—")
  })
})

describe("fixed and signed formats", () => {
  it("shows a fixed number of decimals in the vi-VN format and a dash for anything that is not a number", () => {
    expect(formatFixed(124.5, 2)).toBe("124,50")
    expect(formatFixed(183000, 0)).toBe("183.000")
    expect(formatFixed(480.46, 1)).toBe("480,5")
    expect(formatFixed(null, 2)).toBe("—")
    expect(formatFixed(Number.NaN, 2)).toBe("—")
  })

  it("signs a change in percentage points, with a real minus sign and no sign for zero", () => {
    expect(formatSigned(1.234, 2)).toBe("+1,23")
    expect(formatSigned(-0.55, 2)).toBe("−0,55")
    expect(formatSigned(0, 2)).toBe("0,00")
    expect(formatSigned(0.004, 2)).toBe("0,00")
    expect(formatSigned(undefined, 2)).toBe("—")
  })
})

