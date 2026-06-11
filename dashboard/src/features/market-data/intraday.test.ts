import { describe, expect, it } from "vitest"
import { splitIntradayRows } from "./intraday"

// 2026-06-11 00:00 (giả lập đầu ngày) — các mốc thời gian tương đối quanh nó.
const START_OF_TODAY = 1_780_000_000

describe("splitIntradayRows", () => {
  it("splits today's closes from the previous session and picks the ref close", () => {
    const rows = [
      { time: START_OF_TODAY - 7200, close: 1280.5 }, // phiên trước
      { time: START_OF_TODAY - 3600, close: 1284.2 }, // nến cuối phiên trước → ref
      { time: START_OF_TODAY + 3600, close: 1286.1 },
      { time: START_OF_TODAY + 3900, close: 1287.4 },
    ]
    const result = splitIntradayRows(rows, START_OF_TODAY)
    expect(result.refValue).toBe(1284.2)
    expect(result.times).toEqual([START_OF_TODAY + 3600, START_OF_TODAY + 3900])
    expect(result.closes).toEqual([1286.1, 1287.4])
  })

  it("returns null ref when there is no bar before today", () => {
    const rows = [{ time: START_OF_TODAY + 600, close: 100 }]
    const result = splitIntradayRows(rows, START_OF_TODAY)
    expect(result.refValue).toBeNull()
    expect(result.closes).toEqual([100])
  })

  it("tolerates close_price/t field variants and skips invalid rows", () => {
    const rows = [
      { t: START_OF_TODAY - 600, close_price: 99.5 },
      { t: START_OF_TODAY + 600, close_price: 101.25 },
      { time: START_OF_TODAY + 900, close: 0 }, // close không hợp lệ → bỏ
      { close: 102 }, // thiếu time → bỏ
    ]
    const result = splitIntradayRows(rows, START_OF_TODAY)
    expect(result.refValue).toBe(99.5)
    expect(result.times).toEqual([START_OF_TODAY + 600])
    expect(result.closes).toEqual([101.25])
  })

  it("handles an empty input", () => {
    expect(splitIntradayRows([], START_OF_TODAY)).toEqual({
      times: [],
      closes: [],
      refValue: null,
    })
  })
})
