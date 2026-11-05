import { describe, expect, it } from "vitest"

import type { TimedBar } from "../types"
import { mergeLatestBar, prependOlderBars } from "./merge-bars"

const bar = (time: number, close = 10): TimedBar => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 100 })

describe("mergeLatestBar", () => {
  it("cùng thời gian thì thay nến cuối, không đổi các nến trước", () => {
    const bars = [bar(1), bar(2), bar(3, 10)]
    const next = mergeLatestBar(bars, bar(3, 12))
    expect(next.map((item) => item.close)).toEqual([10, 10, 12])
    expect(next[0]).toBe(bars[0])
  })

  it("nến mới hơn thì thêm vào cuối", () => {
    expect(mergeLatestBar([bar(1), bar(2)], bar(3)).map((item) => item.time)).toEqual([1, 2, 3])
  })

  it("nến cũ hơn nến cuối (thăm dò trả về muộn) bị bỏ", () => {
    const bars = [bar(1), bar(5)]
    expect(mergeLatestBar(bars, bar(3))).toBe(bars)
  })

  it("nến y hệt nến cuối thì trả đúng dãy cũ để không dựng lại dữ liệu", () => {
    const bars = [bar(1), bar(2)]
    expect(mergeLatestBar(bars, { ...bars[1] })).toBe(bars)
  })

  it("dãy rỗng và thời gian không hợp lệ", () => {
    expect(mergeLatestBar([], bar(1))).toEqual([bar(1)])
    const bars = [bar(1)]
    expect(mergeLatestBar(bars, bar(Number.NaN))).toBe(bars)
  })
})

describe("prependOlderBars", () => {
  it("thêm nến cũ vào đầu, sắp tăng dần, bỏ nến trùng thời gian", () => {
    const bars = [bar(10), bar(11)]
    const next = prependOlderBars(bars, [bar(8), bar(7), bar(8, 99), bar(10), bar(12)])
    expect(next.map((item) => item.time)).toEqual([7, 8, 10, 11])
    expect(next.slice(2)).toEqual(bars)
  })

  it("không có nến nào cũ hơn thì trả đúng dãy cũ", () => {
    const bars = [bar(10)]
    expect(prependOlderBars(bars, [bar(10), bar(11)])).toBe(bars)
    expect(prependOlderBars(bars, [])).toBe(bars)
  })

  it("dãy rỗng nhận mọi nến", () => {
    expect(prependOlderBars([], [bar(2), bar(1)]).map((item) => item.time)).toEqual([1, 2])
  })
})
