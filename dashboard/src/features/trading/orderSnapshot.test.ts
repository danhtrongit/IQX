import { describe, expect, it } from "vitest"
import { actualCapitalPct } from "./orderSnapshot"

describe("actualCapitalPct", () => {
  it("snapshots the accepted quantity and price against original demo capital", () => {
    expect(actualCapitalPct(300, 62_500, 100_000_000)).toBe(18.75)
  })

  it.each([
    [0, 62_500, 100_000_000],
    [300, 0, 100_000_000],
    [300, 62_500, 0],
    [Number.NaN, 62_500, 100_000_000],
  ])("rejects an invalid snapshot (%s, %s, %s)", (quantity, price, capital) => {
    expect(actualCapitalPct(quantity, price, capital)).toBeNull()
  })
})
