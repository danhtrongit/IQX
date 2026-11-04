import { describe, expect, it } from "vitest"

import {
  AXIS_HEIGHT,
  CHART_HEIGHT_MIN,
  CHART_HEIGHT_MOBILE,
  CHART_TOP,
  LEGEND_ROW,
  PANE_GAP,
  PLOT_TOTAL_MIN,
  PLOT_WEIGHT,
  axisTicks,
  chartLayout,
  chartTotalHeight,
} from "./flashback-chart-layout"

const base = { narrow: false, overlayCount: 0, volumeCount: 0, indicatorKeys: [] as string[], totalHeight: 600 }
const keys = (count: number) => Array.from({ length: count }, (_, index) => `k${index}`)

describe("chartTotalHeight: tổng chiều cao biểu đồ (spec v2.1 §8)", () => {
  it("điện thoại: cao cố định 380px, không phụ thuộc chiều cao màn hình", () => {
    expect(CHART_HEIGHT_MOBILE).toBe(380)
    expect(chartTotalHeight({ fixed: true, available: 900 })).toBe(380)
    expect(chartTotalHeight({ fixed: true, available: null })).toBe(380)
  })

  it("máy tính: lấy hết chiều cao còn trống, không dưới 300px", () => {
    expect(CHART_HEIGHT_MIN).toBe(300)
    expect(chartTotalHeight({ fixed: false, available: 612.7 })).toBe(612)
    expect(chartTotalHeight({ fixed: false, available: 120 })).toBe(300)
    expect(chartTotalHeight({ fixed: false, available: -40 })).toBe(300)
    expect(chartTotalHeight({ fixed: false, available: null })).toBe(300)
  })
})

describe("chartLayout: chiều cao các khung (spec v2.1 §8)", () => {
  it("tỷ lệ phần vẽ: giá 3,2 · khối lượng 1 · mỗi chỉ báo riêng 1,15", () => {
    expect(PLOT_WEIGHT).toEqual({ price: 3.2, volume: 1, indicator: 1.15 })
    const layout = chartLayout({ ...base, totalHeight: 900, indicatorKeys: keys(2) })
    const [price, volume, first, second] = layout.panes.map((pane) => pane.height)
    expect(price / volume).toBeCloseTo(3.2, 1)
    expect(first / volume).toBeCloseTo(1.15, 1)
    expect(second).toBe(first)
  })

  it("tổng chiều cao biểu đồ đúng bằng chiều cao cho trước, với mọi số chỉ báo", () => {
    for (const count of [0, 1, 2, 3, 5]) {
      const layout = chartLayout({ ...base, totalHeight: 560, indicatorKeys: keys(count) })
      expect(layout.height).toBe(560)
    }
    const mobile = chartLayout({ ...base, narrow: true, totalHeight: CHART_HEIGHT_MOBILE, indicatorKeys: keys(3) })
    expect(mobile.height).toBe(380)
    const [price, volume, indicator] = mobile.panes.map((pane) => pane.height)
    expect(price / volume).toBeCloseTo(3.2, 0)
    expect(indicator / volume).toBeCloseTo(1.15, 0)
  })

  it("thêm chỉ báo thì các khung chia lại, biểu đồ không dài thêm và ô giá bị thu nhỏ", () => {
    const priceHeights: number[] = []
    for (let count = 0; count <= 5; count += 1) {
      const layout = chartLayout({ ...base, totalHeight: 560, indicatorKeys: keys(count) })
      expect(layout.height).toBe(560)
      priceHeights.push(layout.panes[0].height)
    }
    for (let index = 1; index < priceHeights.length; index += 1) {
      expect(priceHeights[index]).toBeLessThan(priceHeights[index - 1])
    }
  })

  it("máy tính 1440×900 bật 5 chỉ báo riêng: biểu đồ vẫn vừa chiều cao còn trống, mọi khung có chỗ vẽ", () => {
    const available = 480
    const layout = chartLayout({ ...base, totalHeight: chartTotalHeight({ fixed: false, available }), indicatorKeys: keys(5) })
    expect(layout.height).toBe(available)
    expect(layout.panes).toHaveLength(7)
    for (const pane of layout.panes) expect(pane.height).toBeGreaterThan(0)
  })

  it("quá nhiều chỉ báo thì tổng phần vẽ không dưới mức tối thiểu: biểu đồ dài thêm chứ không bị bóp", () => {
    const layout = chartLayout({ ...base, totalHeight: 300, indicatorKeys: keys(12) })
    const plotTotal = layout.panes.reduce((sum, pane) => sum + pane.height, 0)
    expect(plotTotal).toBe(PLOT_TOTAL_MIN)
    expect(layout.height).toBeGreaterThan(300)
  })

  it("mỗi khung có dải chú giải riêng nằm trên phần vẽ, không đè lên đường vẽ", () => {
    const layout = chartLayout({ ...base, overlayCount: 2, volumeCount: 1, indicatorKeys: ["a", "b"] })
    for (const pane of layout.panes) {
      expect(pane.top).toBe(pane.legendTop + pane.legendHeight)
      expect(pane.legendHeight).toBeGreaterThanOrEqual(LEGEND_ROW)
    }
    // Ô giá: một dòng O/H/L/C và một dòng cho mỗi chỉ báo trên giá; ô khối lượng: một dòng và một dòng cho mỗi chỉ báo khối lượng.
    expect(layout.panes[0].legendHeight).toBe(LEGEND_ROW * 3 + 4)
    expect(layout.panes[1].legendHeight).toBe(LEGEND_ROW * 2)
    expect(layout.panes[2].legendHeight).toBe(LEGEND_ROW + 4)
  })

  it("điện thoại: dòng O/H/L/C của ô giá chiếm hai dòng", () => {
    expect(chartLayout({ ...base, narrow: true }).panes[0].legendHeight).toBe(LEGEND_ROW * 2 + 4)
  })

  it("các khung xếp liên tiếp, cách nhau một khoảng và không chồng lên nhau", () => {
    const layout = chartLayout({ ...base, overlayCount: 1, indicatorKeys: ["a", "b", "c"] })
    let cursor = CHART_TOP
    for (const pane of layout.panes) {
      expect(pane.legendTop).toBe(cursor)
      cursor = pane.top + pane.height + PANE_GAP
    }
    const last = layout.panes[layout.panes.length - 1]
    expect(layout.height).toBe(last.top + last.height + AXIS_HEIGHT)
  })

  it("khoá mỗi khung theo khoá của chỉ báo", () => {
    const layout = chartLayout({ ...base, indicatorKeys: ["x1", "x2"] })
    expect(layout.panes.map((pane) => pane.key)).toEqual(["p", "v", "ix1", "ix2"])
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
