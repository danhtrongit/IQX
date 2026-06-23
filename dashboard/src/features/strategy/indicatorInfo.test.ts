import { INDICATOR_INFO, indicatorInfo } from "./indicatorInfo"

it("has all 38 indicators with tagline + archetype", () => {
  expect(Object.keys(INDICATOR_INFO)).toHaveLength(38)
  for (const [id, info] of Object.entries(INDICATOR_INFO)) {
    expect(info.tagline.length, id).toBeGreaterThan(0)
    expect(info.archetype, id).toBeTruthy()
  }
  expect(INDICATOR_INFO.rsi_14.archetype).toBe("oscillator")
  expect(INDICATOR_INFO.rsi_14.levels.length).toBeGreaterThan(0)
  expect(INDICATOR_INFO.hammer.archetype).toBe("candlestick")
})
it("falls back to null", () => { expect(indicatorInfo("nope")).toBeNull() })
