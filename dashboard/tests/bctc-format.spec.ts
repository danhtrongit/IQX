import { describe, it, expect } from "vitest"
import { fmtPercent, fmtMultiple, statusColorClass, fmtSignedPercent } from "../src/components/stock/bctc-format"

describe("bctc-format", () => {
  it("fmtPercent: phân số → phần trăm 1 chữ số", () => {
    expect(fmtPercent(0.241)).toBe("24.1%")
    expect(fmtPercent(null)).toBe("—")
  })
  it("fmtMultiple: hậu tố ×", () => {
    expect(fmtMultiple(-0.2)).toBe("−0.2×")
    expect(fmtMultiple(null)).toBe("—")
  })
  it("statusColorClass: map trạng thái → lớp Tailwind state", () => {
    expect(statusColorClass("green")).toContain("emerald")
    expect(statusColorClass("red")).toContain("red")
    expect(statusColorClass("amber")).toContain("amber")
    expect(statusColorClass("na")).toContain("muted")
  })
  it("fmtSignedPercent: có dấu", () => {
    expect(fmtSignedPercent(0.027)).toBe("+2.7%")
    expect(fmtSignedPercent(-0.05)).toBe("−5.0%")
  })
})
