import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  groupedModel,
  lineModel,
  panelsModel,
  seriesPanelsModel,
  stackedModel,
  timelineModel,
  waterfallModel,
} from "../test-fixtures"
import { stubBrowser } from "../test-support"
import { chartTables, formatCompact, formatValue, waterfallBars } from "./chart-math"
import { ChartDataTable, LessonChart } from "./lesson-chart"

beforeEach(() => stubBrowser())
afterEach(() => vi.unstubAllGlobals())

describe("LessonChart smoke, one test per model kind", () => {
  it("series_panels: shared x axis, one SVG, panels with their own axes, A/B marks, gaps, legend and mark readout", () => {
    const { container } = render(<LessonChart model={seriesPanelsModel} label="Giá và RSI" />)
    const chart = screen.getByRole("img", { name: "Giá và RSI" })
    expect(chart.getAttribute("tabindex")).toBe("0")
    // Three panels = three titles, one shared "Phiên" axis.
    expect(within(chart as unknown as HTMLElement).getByText("RSI 14 · điểm")).toBeTruthy()
    expect(within(chart as unknown as HTMLElement).getByText("Khối lượng · triệu cổ phiếu")).toBeTruthy()
    expect(within(chart as unknown as HTMLElement).getByText("Phiên 1")).toBeTruthy()
    expect(within(chart as unknown as HTMLElement).getByText("Phiên 7")).toBeTruthy()
    // Marks A and B (absolute index 119/121 → Phiên 3 and 5), with values read below the drawing.
    expect(within(chart as unknown as HTMLElement).getByText("A")).toBeTruthy()
    expect(screen.getByText(/Giá đóng cửa: 102,50/)).toBeTruthy()
    // The dashed series is drawn dashed and a missing value breaks the line (two sub-paths).
    const dashed = [...container.querySelectorAll("path")].find((path) => path.getAttribute("stroke-dasharray") === "5 4")
    expect(dashed).toBeTruthy()
    expect((dashed?.getAttribute("d") ?? "").match(/M/g)).toHaveLength(2)
    // Levels, zones and per-bar colours.
    expect(container.querySelectorAll("rect.fill-price-up").length).toBeGreaterThan(0)
    expect(container.querySelectorAll("rect.fill-price-down").length).toBeGreaterThan(0)
    expect(screen.getByLabelText("Chú giải").textContent).toContain("RSI 7")
  })

  it("series_panels: keyboard reaches every point (arrows, Home, End) and announces the reading", () => {
    render(<LessonChart model={seriesPanelsModel} label="Giá và RSI" />)
    const chart = screen.getByRole("img", { name: "Giá và RSI" })
    chart.focus()
    expect(document.activeElement).toBe(chart)
    fireEvent.keyDown(chart, { key: "ArrowRight" })
    expect(screen.getByRole("status").textContent).toContain("Phiên 1")
    fireEvent.keyDown(chart, { key: "ArrowRight" })
    fireEvent.keyDown(chart, { key: "ArrowRight" })
    expect(screen.getByRole("status").textContent).toContain("Phiên 3: Giá đóng cửa 102,50")
    fireEvent.keyDown(chart, { key: "End" })
    expect(screen.getByRole("status").textContent).toContain("Phiên 7")
    fireEvent.keyDown(chart, { key: "Home" })
    expect(screen.getByRole("status").textContent).toContain("Phiên 1")
    // A missing value is "—", never 0.
    fireEvent.keyDown(chart, { key: "ArrowRight", repeat: true })
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(chart, { key: "ArrowRight" })
    expect(screen.getByRole("status").textContent).toContain("Giá đóng cửa —")
    fireEvent.keyDown(chart, { key: "Escape" })
    expect(screen.getByRole("status").textContent).toBe("")
  })

  it("series_panels with x.ticks labels the axis with the ticks instead of Phiên n", () => {
    render(
      <LessonChart
        model={{ kind: "series_panels", x: { start: 0, end: 2, ticks: ["Trước 2", "Trước 1", "Hiện tại"] }, marks: [], panels: [{ title: "Khối lượng", series: [{ name: "TB", role: "p1", values: [1, 2, 3] }], bars: { name: "KL", values: [1, 2, 3], colors: ["neutral", "neutral", "pos"] } }] }}
        label="Cửa sổ khối lượng"
      />,
    )
    expect(screen.getByText("Hiện tại")).toBeTruthy()
    expect(screen.getByText("Trước 2")).toBeTruthy()
  })

  it("grouped: one bar per value with labels, a legend entry per series and the unit", () => {
    const { container } = render(<LessonChart model={groupedModel} label="Doanh thu" />)
    expect(screen.getByRole("img", { name: /Doanh thu\. Đơn vị: tỷ đồng/ })).toBeTruthy()
    expect(container.querySelectorAll("svg[role=img] rect.fill-chart-1")).toHaveLength(4)
    expect(container.querySelectorAll("svg[role=img] rect.fill-chart-2")).toHaveLength(4)
    expect(screen.getByText("1.650")).toBeTruthy()
    expect(screen.getByLabelText("Chú giải").textContent).toContain("2024")
    expect(screen.getByText("Quý IV")).toBeTruthy()
  })

  it("line: series with a gap are two sub-paths, dashes differ per series, values are labelled", () => {
    const { container } = render(<LessonChart model={lineModel} label="Biên" />)
    const paths = [...container.querySelectorAll("svg[role=img] path")].filter((path) => path.getAttribute("fill") === "none")
    expect(paths).toHaveLength(2)
    expect((paths[0].getAttribute("d") ?? "").match(/M/g)).toHaveLength(2)
    expect(paths[0].getAttribute("stroke-dasharray")).toBeNull()
    expect(paths[1].getAttribute("stroke-dasharray")).not.toBeNull()
    expect(screen.getAllByText("30").length).toBeGreaterThan(0)
  })

  it("stacked: components add up to a labelled total", () => {
    render(<LessonChart model={stackedModel} label="Doanh thu" />)
    // 1.000 is both the 2024 total and an axis tick; 1.250 only exists as the 2025 total.
    expect(screen.getAllByText("1.000").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("1.250")).toBeTruthy()
    expect(screen.getByText("700")).toBeTruthy()
    expect(screen.getByText("400")).toBeTruthy()
  })

  it("timeline: one row per window over the labelled columns, not a price chart", () => {
    render(<LessonChart model={timelineModel} label="Hai cửa sổ" />)
    const chart = screen.getByRole("img", { name: "Hai cửa sổ" })
    expect(within(chart as unknown as HTMLElement).getByText("Kỳ so sánh")).toBeTruthy()
    expect(within(chart as unknown as HTMLElement).getByText("4.910 tỷ đồng")).toBeTruthy()
    expect(within(chart as unknown as HTMLElement).getByText("Q2/25")).toBeTruthy()
  })

  it("waterfall: totals are levels, deltas move the running level, signs are printed", () => {
    render(<LessonChart model={waterfallModel} label="Cầu nối" />)
    expect(screen.getByText("−850")).toBeTruthy()
    const bars = waterfallBars(waterfallModel as Extract<typeof waterfallModel, { kind: "waterfall" }>)
    expect(bars.map((bar) => bar.to)).toEqual([1250, 400, 400, 180, 110, 88, 88])
    expect(bars[2]).toMatchObject({ from: 0, to: 400, total: true })
    expect(screen.getByText("1.250")).toBeTruthy()
    expect(screen.getByText("88")).toBeTruthy()
  })

  it("panels: every sub-chart keeps its own title and unit", () => {
    render(<LessonChart model={panelsModel} label="EPS" />)
    expect(screen.getByText("Lợi nhuận trong kỳ")).toBeTruthy()
    expect(screen.getByText("Số cổ phiếu bình quân")).toBeTruthy()
    expect(screen.getByText("Lợi nhuận trên một cổ phiếu")).toBeTruthy()
    expect(screen.getAllByRole("img")).toHaveLength(3)
    expect(screen.getByRole("img", { name: /Đơn vị: triệu CP/ })).toBeTruthy()
  })
})

describe("chart data tables", () => {
  it("series_panels: Phiên + every series and bars, four decimals, — for a missing value", async () => {
    const user = userEvent.setup()
    render(<ChartDataTable model={seriesPanelsModel} label="Giá và RSI" />)
    await user.click(screen.getByText("Xem bảng số liệu của biểu đồ"))
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent)
    expect(headers).toEqual(["Phiên", "Giá đóng cửa", "RSI 14", "RSI 7", "TB 20 phiên trước", "Khối lượng"])
    const rows = screen.getAllByRole("row")
    expect(rows).toHaveLength(1 + 7)
    expect(within(rows[3]).getAllByRole("cell")[1].textContent).toBe("102,5000")
    expect(within(rows[6]).getAllByRole("cell")[1].textContent).toBe("—")
  })

  it("builds a table for every kind, with units, and a total for stacked", () => {
    expect(chartTables(groupedModel)[0].head).toEqual(["Kỳ", "2024 (tỷ đồng)", "2025 (tỷ đồng)"])
    expect(chartTables(stackedModel)[0].rows[1]).toEqual(["Q2/2025", "850", "400", "1.250"])
    expect(chartTables(timelineModel)[0].rows[0]).toEqual(["Kỳ so sánh", "Q3/23", "Q2/24", "4.050 tỷ đồng"])
    expect(chartTables(waterfallModel)[0].rows[3]).toEqual(["Bán hàng, quản lý", "-220", "180"])
    expect(chartTables(panelsModel)).toHaveLength(3)
  })

  it("formats numbers the vi-VN way", () => {
    expect(formatValue(1234.5, 2)).toBe("1.234,50")
    expect(formatValue(null)).toBe("—")
    expect(formatCompact(19.999999999999996)).toBe("20")
    expect(formatCompact(-2.7272727272727226)).toBe("-2,73")
  })
})
