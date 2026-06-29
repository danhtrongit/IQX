import { describe, it, expect } from "vitest"
import { pct, signedPct, points, vnd, vndShort, num, score } from "./format"

describe("format", () => {
  it("pct uses comma decimal, no sign", () => { expect(pct(0.107)).toBe("10,7%") })
  it("signedPct adds + and real minus", () => {
    expect(signedPct(0.107)).toBe("+10,7%")
    expect(signedPct(-0.09)).toBe("−9,0%")
  })
  it("points formats difference of rates", () => { expect(points(0.035)).toBe("+3,5 điểm %") })
  it("vnd groups thousands with dots", () => { expect(vnd(534000000)).toBe("534.000.000 ₫") })
  it("vndShort renders millions with sign", () => {
    expect(vndShort(38000000)).toBe("+38tr")
    expect(vndShort(-7000000)).toBe("−7tr")
  })
  it("num uses comma decimal", () => { expect(num(1.25)).toBe("1,25") })
  it("score 1dp", () => { expect(score(3.5)).toBe("3,5") })
})
