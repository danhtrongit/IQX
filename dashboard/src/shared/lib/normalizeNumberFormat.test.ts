import { describe, it, expect } from "vitest"
import { normalizeNumberFormat } from "./normalizeNumberFormat"

describe("normalizeNumberFormat", () => {
  // ── Converts UNAMBIGUOUS vi-VN decimal commas (comma + 1-2 digits) → period ──
  it("converts a comma used as decimal separator to a period", () => {
    expect(normalizeNumberFormat("0,35")).toBe("0.35")
    expect(normalizeNumberFormat("19,49")).toBe("19.49")
    expect(normalizeNumberFormat("1,5")).toBe("1.5")
  })

  it("converts comma-decimal inside a percentage", () => {
    expect(normalizeNumberFormat("1,01%")).toBe("1.01%")
    expect(normalizeNumberFormat("1,85%")).toBe("1.85%")
    expect(normalizeNumberFormat("−0,32%")).toBe("−0.32%")
  })

  it("converts comma-decimal followed by a unit word", () => {
    expect(normalizeNumberFormat("−4,9 triệu cp")).toBe("−4.9 triệu cp")
    expect(normalizeNumberFormat("15,6 triệu")).toBe("15.6 triệu")
  })

  it("converts comma-decimal inside surrounding prose", () => {
    expect(normalizeNumberFormat("bán ròng 3 phiên (−4,9 triệu cp) hôm nay")).toBe(
      "bán ròng 3 phiên (−4.9 triệu cp) hôm nay",
    )
  })

  it("converts a comma-decimal in a ratio", () => {
    expect(normalizeNumberFormat("1:2,5")).toBe("1:2.5")
  })

  it("converts multiple comma-decimals in one string", () => {
    expect(normalizeNumberFormat("0,35 và 1,85% rồi 2,75 lần")).toBe(
      "0.35 và 1.85% rồi 2.75 lần",
    )
  })

  // ── Leaves en-US thousands (comma + exactly 3 digits) UNCHANGED ──
  it("leaves en-US thousands separators unchanged", () => {
    expect(normalizeNumberFormat("35,000")).toBe("35,000")
    expect(normalizeNumberFormat("1,234,567")).toBe("1,234,567")
    expect(normalizeNumberFormat("khớp 35,000 cp")).toBe("khớp 35,000 cp")
  })

  it("leaves an already-en-US number (comma thousands + period decimal) unchanged", () => {
    expect(normalizeNumberFormat("1,824.53")).toBe("1,824.53")
  })

  // ── Leaves AMBIGUOUS period-thousands alone (prompt rule handles these) ──
  it("does not touch period separators (ambiguous thousands vs decimal)", () => {
    expect(normalizeNumberFormat("1.000")).toBe("1.000")
    expect(normalizeNumberFormat("18.804 tỷ")).toBe("18.804 tỷ")
    expect(normalizeNumberFormat("7.2M")).toBe("7.2M")
  })

  // ── Leaves non-number tokens / dates / plain text unchanged ──
  it("leaves non-numeric tokens and dates unchanged", () => {
    expect(normalizeNumberFormat("MA20")).toBe("MA20")
    expect(normalizeNumberFormat("19/06/2026")).toBe("19/06/2026")
    expect(normalizeNumberFormat("2026-06-19")).toBe("2026-06-19")
    expect(normalizeNumberFormat("Khối ngoại bán ròng")).toBe("Khối ngoại bán ròng")
  })

  it("handles empty / whitespace input", () => {
    expect(normalizeNumberFormat("")).toBe("")
    expect(normalizeNumberFormat("   ")).toBe("   ")
  })

  it("preserves the U+2212 minus glyph", () => {
    expect(normalizeNumberFormat("−2,61")).toBe("−2.61")
  })

  // ── Safe on HTML (market-analysis narrative is inline HTML) ──
  it("converts comma-decimals inside inline HTML without touching tags", () => {
    expect(
      normalizeNumberFormat('VN-Index giảm <span class="num">1,85%</span> hôm nay'),
    ).toBe('VN-Index giảm <span class="num">1.85%</span> hôm nay')
  })
})
