import { describe, expect, it } from "vitest"

import {
  AXIS_HEIGHT,
  CHART_TOP,
  LEGEND_ROW,
  PANE_GAP,
  PANE_HEIGHT,
  axisTicks,
  chartLayout,
  offscaleLabels,
  priceHeight,
  priceRange,
} from "./flashback-chart-layout"

const base = { narrow: false, mobile: false, overlayCount: 0, volumeCount: 0, indicatorKeys: [] as string[], available: 700 }
const keys = (count: number) => Array.from({ length: count }, (_, index) => `k${index}`)
const height = (layout: ReturnType<typeof chartLayout>, kind: string, index = 0) =>
  layout.panes.filter((pane) => pane.kind === kind)[index].height

describe("chartLayout: chiều cao các ô (spec v2.3 §2)", () => {
  it("máy tính: ô giá lấy phần màn hình còn lại, khối lượng 80px, tổng vừa đúng chiều cao còn trống", () => {
    const layout = chartLayout(base)
    expect(height(layout, "volume")).toBe(80)
    expect(height(layout, "price")).toBe(700 - CHART_TOP - AXIS_HEIGHT - 80 - PANE_GAP)
    expect(layout.height).toBe(700)
  })

  it("thêm MA, Bollinger trên ô giá không đổi chiều cao ô nào (nghiệm thu 1)", () => {
    const before = chartLayout(base)
    const after = chartLayout({ ...base, overlayCount: 4, volumeCount: 1 })
    expect(after.panes.map((pane) => pane.height)).toEqual(before.panes.map((pane) => pane.height))
    expect(after.height).toBe(before.height)
  })

  it("chú giải đè lên phần vẽ: đỉnh phần vẽ trùng đỉnh khối chú giải, không trừ chiều cao", () => {
    const layout = chartLayout({ ...base, overlayCount: 3, indicatorKeys: keys(1) })
    for (const pane of layout.panes) expect(pane.top).toBe(pane.legendTop)
    expect(layout.panes[0].legendHeight).toBe(4 * LEGEND_ROW)
  })

  it("thêm RSI, MACD, Stochastic: ô giá và khối lượng giữ nguyên khi đã ở mức tối thiểu, biểu đồ dài thêm 100px + khoảng cách mỗi ô (nghiệm thu 2)", () => {
    const small = { ...base, available: 300 }
    const zero = chartLayout(small)
    expect(height(zero, "price")).toBe(320)
    const one = chartLayout({ ...small, indicatorKeys: keys(1) })
    const three = chartLayout({ ...small, indicatorKeys: keys(3) })
    for (const layout of [one, three]) {
      expect(height(layout, "price")).toBe(320)
      expect(height(layout, "volume")).toBe(80)
    }
    expect(height(three, "indicator", 2)).toBe(100)
    expect(three.height - one.height).toBe(2 * (100 + PANE_GAP))
  })

  it("ô giá không bao giờ dưới 320px dù màn hình thấp hoặc chưa đo", () => {
    expect(priceHeight({ mobile: false, available: 100, indicatorCount: 5 })).toBe(320)
    expect(priceHeight({ mobile: false, available: null, indicatorCount: 0 })).toBe(320)
  })

  it("điện thoại: giá 240px, khối lượng 64px, ô chỉ báo 84px; thêm ô thì dài thêm 84px + khoảng cách", () => {
    expect(PANE_HEIGHT.mobile).toEqual({ priceMin: 240, volume: 64, indicator: 84 })
    const one = chartLayout({ ...base, narrow: true, mobile: true, indicatorKeys: keys(1) })
    const two = chartLayout({ ...base, narrow: true, mobile: true, indicatorKeys: keys(2) })
    expect(height(one, "price")).toBe(240)
    expect(height(one, "volume")).toBe(64)
    expect(height(one, "indicator")).toBe(84)
    expect(two.height - one.height).toBe(84 + PANE_GAP)
  })
})

describe("priceRange và offscaleLabels: trục giá theo nến (spec v2.3 §3)", () => {
  it("trục chỉ theo giá cao/thấp của các nến đang hiện, chừa 6% mỗi đầu", () => {
    const bars = [
      { high: 110, low: 100 },
      { high: 120, low: 105 },
      { high: 999, low: 1 },
    ]
    const range = priceRange(bars, 1)
    expect(range.low).toBeCloseTo(100 - 20 * 0.06)
    expect(range.high).toBeCloseTo(120 + 20 * 0.06)
  })

  it("MA nằm ngoài khung có nhãn mũi tên ở mép phải, nhiều nhãn không đè nhau", () => {
    const labels = offscaleLabels(
      [
        { key: "a", name: "MA 200", value: 80, color: "red" },
        { key: "b", name: "EMA 50", value: 70, color: "blue" },
        { key: "c", name: "MA 10", value: 105, color: "green" },
        { key: "d", name: "MA 5", value: 130, color: "white" },
      ],
      { low: 100, high: 120 },
      { top: 0, height: 320 },
      (value) => String(value),
    )
    expect(labels.map((label) => label.text)).toEqual(["MA 200 80 ↓", "EMA 50 70 ↓", "MA 5 130 ↑"])
    const below = labels.filter((label) => label.side === "below")
    expect(Math.abs(below[0].y - below[1].y)).toBeGreaterThanOrEqual(16)
  })
})

describe("axisTicks: nhãn trục ngang", () => {
  it("máy tính: Lịch sử {n} phiên, Phiên 1, phiên giữa, Phiên {số phiên chơi}", () => {
    const ticks = axisTicks(60, 30, false)
    expect(ticks.map((tick) => tick.label)).toEqual(["Lịch sử 60 phiên", "Phiên 1", "Phiên 15", "Phiên 30"])
    expect(ticks.map((tick) => tick.index)).toEqual([0, 60, 74, 89])
    expect(ticks.map((tick) => tick.anchor)).toEqual(["start", "middle", "middle", "end"])
  })

  it("điện thoại bỏ nhãn giữa và rút gọn nhãn đầu", () => {
    const ticks = axisTicks(60, 30, true)
    expect(ticks.map((tick) => tick.label)).toEqual(["Lịch sử", "Phiên 1", "Phiên 30"])
  })

  it("theo đúng số phiên chủ phòng chọn", () => {
    expect(axisTicks(45, 120, false).map((tick) => tick.label)).toEqual(["Lịch sử 45 phiên", "Phiên 1", "Phiên 60", "Phiên 120"])
  })
})
