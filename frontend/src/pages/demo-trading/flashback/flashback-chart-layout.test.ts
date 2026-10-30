import { describe, expect, it } from "vitest"

import { AXIS_HEIGHT, CHART_TOP, LEGEND_ROW, PANE_GAP, PLOT_HEIGHT, axisTicks, chartLayout } from "./flashback-chart-layout"

const base = { narrow: false, overlayCount: 0, volumeCount: 0, indicatorKeys: [] as string[] }

describe("chartLayout: chiều cao các khung (spec §6.4)", () => {
  it("chiều cao phần vẽ cố định: chỉ báo 130, giá 300, khối lượng 90 trên máy tính", () => {
    expect(PLOT_HEIGHT.desktop).toEqual({ indicator: 130, price: 300, volume: 90 })
    const layout = chartLayout({ ...base, indicatorKeys: ["a"] })
    expect(layout.panes.map((pane) => [pane.kind, pane.height])).toEqual([
      ["price", 300],
      ["volume", 90],
      ["indicator", 130],
    ])
  })

  it("trên điện thoại: chỉ báo 110, giá 240, khối lượng 70", () => {
    expect(PLOT_HEIGHT.mobile).toEqual({ indicator: 110, price: 240, volume: 70 })
    const layout = chartLayout({ ...base, narrow: true, indicatorKeys: ["a"] })
    expect(layout.panes.map((pane) => pane.height)).toEqual([240, 70, 110])
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

  it("thêm chỉ báo thì biểu đồ dài thêm, các khung không bao giờ bị ép nhỏ lại", () => {
    const heights: number[] = []
    for (let count = 0; count <= 6; count += 1) {
      const layout = chartLayout({ ...base, indicatorKeys: Array.from({ length: count }, (_, index) => `k${index}`) })
      heights.push(layout.height)
      expect(layout.panes.filter((pane) => pane.kind === "indicator").every((pane) => pane.height === 130)).toBe(true)
      expect(layout.panes[0].height).toBe(300)
      expect(layout.panes[1].height).toBe(90)
    }
    for (let index = 1; index < heights.length; index += 1) {
      expect(heights[index] - heights[index - 1]).toBe(130 + 24 + 4 + PANE_GAP)
    }
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
