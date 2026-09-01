import { describe, expect, it } from "vitest"
import { boardLotPartialBounds } from "./ExitModalCap8"

/** The rendered modal consumes these bounds; pin board-lot partial quantities. */
describe("ExitModalCap8 board-lot quantities", () => {
  it("keeps a full sell separate from partial board-lot quantities and preserves remaining shares", () => {
    const partial = boardLotPartialBounds(550, 100, 300)
    expect(partial).toEqual({ min: 100, max: 500, value: 300, available: true })
    expect(550 - partial.value).toBe(250)
  })

  it("does not expose a partial sale where only one board lot is sellable", () => {
    expect(boardLotPartialBounds(100, 100)).toMatchObject({ available: false, max: 0 })
  })
})
