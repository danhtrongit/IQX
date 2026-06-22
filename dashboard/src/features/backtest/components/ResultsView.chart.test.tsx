import { describe, it, expect } from "vitest"
import { toPctSeries } from "./ResultsView"
import type { EquityPoint } from "../types"

describe("toPctSeries", () => {
  it("first point strategy and buy_hold are 0", () => {
    const points: EquityPoint[] = [
      { date: "2023-01-02", strategy: 100, buy_hold: 100 },
      { date: "2023-01-03", strategy: 110, buy_hold: 105 },
    ]
    const result = toPctSeries(points)
    expect(result[0].strategy).toBe(0)
    expect(result[0].buy_hold).toBe(0)
  })

  it("first point vnindex is 0 when input has vnindex", () => {
    const points: EquityPoint[] = [
      { date: "2023-01-02", strategy: 100, buy_hold: 100, vnindex: 1200 },
      { date: "2023-01-03", strategy: 110, buy_hold: 105, vnindex: 1260 },
    ]
    const result = toPctSeries(points)
    expect(result[0].vnindex).toBe(0)
  })

  it("later point equals (v/first-1)*100 for strategy", () => {
    const points: EquityPoint[] = [
      { date: "2023-01-02", strategy: 100, buy_hold: 100 },
      { date: "2023-01-03", strategy: 115, buy_hold: 108 },
    ]
    const result = toPctSeries(points)
    expect(result[1].strategy).toBeCloseTo((115 / 100 - 1) * 100, 8)
    expect(result[1].buy_hold).toBeCloseTo((108 / 100 - 1) * 100, 8)
  })

  it("later point equals (v/first-1)*100 for vnindex", () => {
    const points: EquityPoint[] = [
      { date: "2023-01-02", strategy: 100, buy_hold: 100, vnindex: 1000 },
      { date: "2023-01-03", strategy: 110, buy_hold: 105, vnindex: 1050 },
    ]
    const result = toPctSeries(points)
    expect(result[1].vnindex).toBeCloseTo((1050 / 1000 - 1) * 100, 8)
  })

  it("output points have no vnindex key when input has no vnindex", () => {
    const points: EquityPoint[] = [
      { date: "2023-01-02", strategy: 100, buy_hold: 100 },
      { date: "2023-01-03", strategy: 110, buy_hold: 105 },
    ]
    const result = toPctSeries(points)
    result.forEach((p) => {
      expect(Object.prototype.hasOwnProperty.call(p, "vnindex")).toBe(false)
    })
  })

  it("handles non-100 base correctly", () => {
    const points: EquityPoint[] = [
      { date: "2023-01-02", strategy: 120, buy_hold: 80 },
      { date: "2023-01-03", strategy: 132, buy_hold: 84 },
    ]
    const result = toPctSeries(points)
    expect(result[0].strategy).toBe(0)
    expect(result[0].buy_hold).toBe(0)
    expect(result[1].strategy).toBeCloseTo((132 / 120 - 1) * 100, 8)
    expect(result[1].buy_hold).toBeCloseTo((84 / 80 - 1) * 100, 8)
  })
})
