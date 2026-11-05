import { describe, expect, it } from "vitest"
import type { Bar } from "../types"
import { computeVolumeProfile, createIndicatorCache, DEFAULT_PROFILE_ROWS, getIndicator } from "./index"
import { goldenBars } from "./test-support"

const bar = (open: number, high: number, low: number, close: number, volume: number): Bar => ({ open, high, low, close, volume })
const rowsOf = (bars: readonly Bar[], range = { from: 0, to: bars.length - 1 }, rows = 5) => computeVolumeProfile(bars, range, rows).profile!.rows

describe("Volume Profile theo vùng nhìn thấy", () => {
  it("chia khối lượng từng nến đều theo biên độ giá (tính tay)", () => {
    // A: giá 10..20, khối lượng 100, nến tăng (mật độ 10 mỗi đồng). B: giá 15..25, khối lượng 200, nến giảm (mật độ 20).
    // Vùng 10..25 chia 5 hàng cao 3: [10,13) [13,16) [16,19) [19,22) [22,25].
    const rows = rowsOf([bar(11, 20, 10, 19, 100), bar(24, 25, 15, 16, 200)])
    // Tổng mỗi hàng: 30, 30+20, 30+60, 10+60, 60. Hàng lớn nhất là 90.
    expect(rows.map((row) => row.up * 90)).toEqual([30, 30, 30, 10, 0].map((value) => expect.closeTo(value, 9)))
    expect(rows.map((row) => row.down * 90)).toEqual([0, 20, 60, 60, 60].map((value) => expect.closeTo(value, 9)))
    expect(rows[2].up + rows[2].down).toBeCloseTo(1, 12)
    // bảo toàn khối lượng: 30 + 50 + 90 + 70 + 60 = 100 + 200 nến
    expect(rows.reduce((sum, row) => sum + (row.up + row.down) * 90, 0)).toBeCloseTo(300, 9)
  })

  it("các hàng liền nhau phủ kín từ giá thấp nhất tới giá cao nhất của vùng", () => {
    const rows = rowsOf([bar(11, 20, 10, 19, 100), bar(24, 25, 15, 16, 200)], undefined, 7)
    expect(rows).toHaveLength(7)
    expect(rows[0].low).toBe(10)
    expect(rows.at(-1)?.high).toBe(25)
    for (let index = 1; index < rows.length; index += 1) expect(rows[index].low).toBeCloseTo(rows[index - 1].high, 12)
  })

  it("dữ liệu thật: mọi hàng nằm trong 0..1, hàng lớn nhất bằng đúng 1, các hàng tăng dần theo giá", () => {
    const rows = rowsOf(goldenBars(120), undefined, 40)
    expect(rows).toHaveLength(40)
    expect(Math.max(...rows.map((row) => row.up + row.down))).toBeCloseTo(1, 12)
    for (const row of rows) {
      expect(row.up).toBeGreaterThanOrEqual(0)
      expect(row.down).toBeGreaterThanOrEqual(0)
      expect(row.up + row.down).toBeLessThanOrEqual(1 + 1e-12)
      expect(row.high).toBeGreaterThan(row.low)
    }
  })

  it("nến tăng (đóng >= mở) vào cột up, nến giảm vào cột down", () => {
    const up = rowsOf([bar(10, 14, 10, 14, 100)], undefined, 4)
    expect(up.every((row) => row.down === 0)).toBe(true)
    expect(up.every((row) => row.up === 1)).toBe(true)
    const down = rowsOf([bar(14, 14, 10, 10, 100)], undefined, 4)
    expect(down.every((row) => row.up === 0)).toBe(true)
    // nến doji tính là nến tăng
    expect(rowsOf([bar(12, 14, 10, 12, 100)], undefined, 4).every((row) => row.down === 0)).toBe(true)
  })

  it("chỉ tính các nến trong viewport: nến i được tính khi from <= i <= to, viewport có thể lẻ", () => {
    const bars = [bar(10, 12, 10, 11, 100), bar(20, 22, 20, 21, 100), bar(30, 32, 30, 31, 100), bar(40, 42, 40, 41, 100)]
    const range = (from: number, to: number) => computeVolumeProfile(bars, { from, to }, 4).profile!.rows
    expect(range(1, 2)[0].low).toBe(20)
    expect(range(1, 2).at(-1)?.high).toBe(32)
    // 0.4..2.6 chứa tâm các nến 1 và 2 (tâm nến 0 ở 0 và tâm nến 3 ở 3 nằm ngoài)
    expect(range(0.4, 2.6)[0].low).toBe(20)
    expect(range(0.4, 2.6).at(-1)?.high).toBe(32)
    // viewport rộng hơn dữ liệu bị kẹp
    expect(range(-50, 99)[0].low).toBe(10)
    expect(range(-50, 99).at(-1)?.high).toBe(42)
    // không có nến nào trong viewport
    expect(range(5, 9)).toEqual([])
    expect(range(0.2, 0.8)).toEqual([])
    expect(computeVolumeProfile([], { from: 0, to: 10 }).profile?.rows).toEqual([])
  })

  it("nến phẳng (high = low) đặt cả khối lượng vào hàng chứa giá đóng cửa", () => {
    const rows = rowsOf([bar(10, 20, 10, 15, 100), bar(25, 25, 25, 25, 500)], undefined, 5)
    // vùng 10..25, hàng cao 3: giá 25 nằm hàng cuối. Hàng cuối có 500 (nến phẳng, tăng) và 0 từ nến đầu.
    expect(rows[4].up).toBe(1)
    expect(rows.slice(0, 4).every((row) => row.up < 1 && row.down === 0)).toBe(true)
  })

  it("giá không đổi cả vùng: một hàng duy nhất chứa toàn bộ", () => {
    const rows = rowsOf([bar(9, 9, 9, 9, 10), bar(9, 9, 9, 9, 30)], undefined, 8)
    expect(rows).toEqual([{ low: 9, high: 9, up: 1, down: 0 }])
  })

  it("không có khối lượng: các hàng rỗng, không chia cho 0", () => {
    const rows = rowsOf([bar(10, 14, 10, 12, 0), bar(12, 15, 11, 11, 0)], undefined, 4)
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.up === 0 && row.down === 0)).toBe(true)
  })

  it("số hàng bị kẹp trong 4..200 và mặc định 24", () => {
    const bars = goldenBars(50)
    expect(computeVolumeProfile(bars, { from: 0, to: 49 }, 1).profile!.rows).toHaveLength(4)
    expect(computeVolumeProfile(bars, { from: 0, to: 49 }, 9999).profile!.rows).toHaveLength(200)
    expect(computeVolumeProfile(bars, { from: 0, to: 49 }).profile!.rows).toHaveLength(DEFAULT_PROFILE_ROWS)
  })

  it("bỏ qua nến hỏng thay vì sinh NaN", () => {
    const rows = rowsOf([bar(10, 14, 10, 12, 100), bar(Number.NaN, Number.NaN, Number.NaN, Number.NaN, 100), bar(11, 13, 10, 12, Number.NaN)], undefined, 4)
    for (const row of rows) for (const value of [row.low, row.high, row.up, row.down]) expect(Number.isFinite(value)).toBe(true)
  })

  it("kết quả không dùng series và không có màu, chỉ có cột ngang", () => {
    const plot = computeVolumeProfile(goldenBars(30), { from: 0, to: 29 })
    expect(plot.kind).toBe("over")
    expect(plot.series).toEqual([])
    expect(JSON.stringify(plot)).not.toContain("var(")
  })
})

describe("Volume Profile như một chỉ báo đã đăng ký", () => {
  it("chỉ ở market, nằm trên ô giá, tính trên toàn bộ nến truyền vào", () => {
    const definition = getIndicator("volume_profile")!
    expect(definition.flashback).toBe(false)
    expect(definition.kind).toBe("over")
    const bars = goldenBars(80)
    expect(definition.compute(bars, { rows: 12 }, ["chart-1"])).toEqual(computeVolumeProfile(bars, { from: 0, to: 79 }, 12))
    expect(definition.compute(bars, {}, ["chart-1"]).profile!.rows).toHaveLength(DEFAULT_PROFILE_ROWS)
  })

  it("tham số sai trả về biểu đồ rỗng, không ném lỗi", () => {
    const definition = getIndicator("volume_profile")!
    expect(definition.compute(goldenBars(10), { rows: 2 }, ["chart-1"])).toEqual({ kind: "over", series: [] })
    expect(definition.compute(goldenBars(10), { rows: 10.5 }, ["chart-1"])).toEqual({ kind: "over", series: [] })
  })

  it("cache nhớ lần tính theo viewport: cùng viewport trả cùng đối tượng, đổi viewport hoặc nến cuối thì tính lại", () => {
    const cache = createIndicatorCache()
    const bars = goldenBars(100)
    const first = cache.profile(bars, { from: 10, to: 60 }, 24)
    expect(cache.profile(bars, { from: 10, to: 60 }, 24)).toBe(first)
    expect(cache.profile([...bars], { from: 10, to: 60 }, 24)).toBe(first)
    expect(cache.profile(bars, { from: 10, to: 61 }, 24)).not.toBe(first)
    expect(cache.profile(bars, { from: 10, to: 61 }, 24)).toEqual(computeVolumeProfile(bars, { from: 10, to: 61 }, 24))
    const changed = [...bars.slice(0, -1), { ...bars[99], volume: bars[99].volume + 1 }]
    const wide = cache.profile(bars, { from: 0, to: 99 }, 24)
    expect(cache.profile(changed, { from: 0, to: 99 }, 24)).not.toBe(wide)
    expect(cache.profile([], { from: 0, to: 5 }).profile?.rows).toEqual([])
  })
})
