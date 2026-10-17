import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CHARTS, mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import type { ChartModel } from "../content-types"
import { chartTables, formatValue, hasDataTable, niceTicks, observationLabel, seriesPanelsReadout, wrapText, type SeriesPanelsModel } from "./chart-math"
import { TONE_FILL, TONE_STROKE, textColor, textFill } from "./chart-theme"
import { ChartDataTable, LessonChart } from "./lesson-chart"

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
})

function draw(id: string, width = 760) {
  restore = mockReaderWidth(width)
  const model = CHARTS[id] as ChartModel
  return render(<LessonChart model={model} label={`Biểu đồ ${id}`} />)
}

const KINDS = ["series_panels", "category", "segment_bar", "scale", "schematic", "gantt", "milestones", "candle_glyphs", "flow", "diagram", "compare"]

describe("LessonChart", () => {
  it("has a fixture for every chart kind of the schema", () => {
    expect(new Set(Object.values(CHARTS).map((model) => model.kind))).toEqual(new Set(KINDS))
  })

  it.each(Object.keys(CHARTS))("draws %s at 358px and 760px without overflowing", (id) => {
    for (const width of [358, 760]) {
      const { container, unmount } = draw(id, width)
      expect(container.firstElementChild).not.toBeNull()
      expect(svgOverflows(container, width)).toEqual([])
      unmount()
      restore?.()
      restore = null
    }
  })

  it("series_panels: candles, bars, band, fib levels, notes, points, marks and shade labels", () => {
    const { container } = draw("c4l7-g6")
    const svg = screen.getByRole("img", { name: "Biểu đồ c4l7-g6" })
    expect(svg.getAttribute("tabindex")).toBe("0")
    expect(within(svg).getByText("Giá")).toBeTruthy()
    expect(within(svg).getByText("MACD (12, 26, 9)")).toBeTruthy()
    expect(within(svg).getByText("61,8%")).toBeTruthy()
    expect(within(svg).getByText("Cắt lỗ").getAttribute("class")).toContain("fill-price-down")
    expect(within(svg).getByText("Mua").getAttribute("class")).toContain("fill-price-up")
    expect(within(svg).getByText("Tích lũy")).toBeTruthy()
    expect(within(svg).getByText("Kháng cự")).toBeTruthy()
    expect(within(svg).getByText("Vùng cản")).toBeTruthy()
    expect(within(svg).getByText("A")).toBeTruthy()
    // 30 candle bodies and wicks plus 30 histogram bars.
    expect(container.querySelectorAll("rect.fill-price-up, rect.fill-price-down").length).toBeGreaterThanOrEqual(30)
    expect(container.querySelectorAll("path.stroke-chart-1").length).toBeGreaterThan(0)
    expect(screen.getByRole("list", { name: "Chú giải" })).toBeTruthy()
  })

  it("series_panels: keyboard reading announces the observation and its values", () => {
    draw("c4l7-g6")
    const svg = screen.getByRole("img", { name: "Biểu đồ c4l7-g6" })
    fireEvent.keyDown(svg, { key: "Home" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 71: Mở cửa/)
    fireEvent.keyDown(svg, { key: "ArrowRight" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 72:/)
    fireEvent.keyDown(svg, { key: "End" })
    expect(screen.getByRole("status").textContent).toContain("Histogram")
    fireEvent.keyDown(svg, { key: "Escape" })
    expect(screen.getByRole("status").textContent).toBe("")
  })

  it("series_panels thumbnails (axes: false) draw data only, without focus or readout", () => {
    draw("c4l1-g4")
    const svg = screen.getByRole("img", { name: "Biểu đồ c4l1-g4" })
    expect(svg.getAttribute("tabindex")).toBeNull()
    expect(svg.querySelectorAll("text")).toHaveLength(0)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("category: line end labels, value labels with sublabels, threshold tones and horizontal stacks", () => {
    draw("c1l1-g1")
    expect(screen.getByText("308 triệu")).toBeTruthy()
    expect(document.querySelector("path.academy-draw")).not.toBeNull()
    restore?.()
    const grouped = draw("c5l1-g2")
    expect(screen.getByText("20.000 đ")).toBeTruthy()
    expect(screen.getByText("Mục tiêu")).toBeTruthy()
    expect(grouped.container.querySelectorAll("rect.fill-price-down")).toHaveLength(1)
    expect(grouped.container.querySelectorAll("rect.fill-price-up")).toHaveLength(2)
    restore?.()
    draw("c3l2-g1")
    expect(screen.getByText("Kênh mạng xã hội")).toBeTruthy()
    expect(screen.getByText("50")).toBeTruthy()
  })

  it("segment_bar: pictogram icons with a clipped fraction, ghost part, totals, brackets and segment labels", () => {
    const { container } = draw("c1l1-g2")
    expect(screen.getByText("≈ 74 triệu").className).toContain("text-price-down")
    expect(container.querySelectorAll("svg.lucide-banknote").length).toBeGreaterThanOrEqual(20)
    expect([...container.querySelectorAll<HTMLElement>("[style]")].some((node) => node.style.width.startsWith("40"))).toBe(true)
    restore?.()
    draw("c1l1-a2")
    expect(screen.getByText("vài tuần đến vài tháng")).toBeTruthy()
    expect(screen.getByText("chênh lệch")).toBeTruthy()
    expect(screen.getByText("T+2")).toBeTruthy()
  })

  it("scale: vertical markers with sub lines and zones; horizontal sides and ends", () => {
    draw("c1l3-g2")
    expect(screen.getByText("Giá trần")).toBeTruthy()
    expect(screen.getByText("26.750 · +7%")).toBeTruthy()
    expect(screen.getByText("Tăng: màu xanh lá")).toBeTruthy()
    restore?.()
    draw("c5l2-g1")
    expect(screen.getByText("P/E hiện tại")).toBeTruthy()
    expect(screen.getByText("Trung bình 5 năm")).toBeTruthy()
    expect(screen.getAllByText("Rẻ").length).toBeGreaterThanOrEqual(2)
  })

  it("schematic: axis arrows are drawn markers, every layer type renders, panels stack", () => {
    const { container } = draw("c1l5-g3")
    expect(screen.getByText("Rủi ro")).toBeTruthy()
    expect(container.querySelectorAll("line[marker-end]").length).toBeGreaterThanOrEqual(3)
    for (const text of ["An toàn", "Cổ phiếu", "Tiền gửi tiết kiệm", "Mua", "Biên an toàn", "Đường kỳ vọng", "Vừa"]) expect(screen.getByText(text)).toBeTruthy()
    expect(screen.getByText("Tiền gửi tiết kiệm").getAttribute("class")).toContain("fill-academy-label")
    restore?.()
    draw("c4l6-g4")
    expect(screen.getByText("RSI")).toBeTruthy()
  })

  it("gantt: rows, segment labels inside bars or listed, markers, notes, columns and highlight", () => {
    draw("c1l3-g3")
    expect(screen.getByText("HOSE")).toBeTruthy()
    expect(screen.getAllByText("Liên tục").length).toBeGreaterThan(0)
    expect(screen.getByText("Sau giờ là phiên thỏa thuận")).toBeTruthy()
    expect(screen.getAllByText("ATC").length).toBeGreaterThan(0)
    restore?.()
    draw("c1l4-g3")
    expect(screen.getByText("T+2")).toBeTruthy()
    expect(screen.getByText("CN")).toBeTruthy()
  })

  it("milestones: horizontal on a wide reader, a vertical list below 560px", () => {
    const wide = draw("c1l7-g1", 760)
    expect(wide.container.querySelector("svg")).not.toBeNull()
    expect(screen.getByText("1 ngày làm việc")).toBeTruthy()
    wide.unmount()
    restore?.()
    const narrow = draw("c1l7-g1", 358)
    expect(narrow.container.querySelector("ol")).not.toBeNull()
    expect(screen.getByText("Mua trong giai đoạn này: được hưởng quyền")).toBeTruthy()
    expect(screen.getByText(/1 ngày làm việc/).textContent).toBe("Giao dịch đến Đăng ký: 1 ngày làm việc")
  })

  it("candle_glyphs: tone by direction, OHLC annotation, labels, titles and the join", () => {
    const { container } = draw("c4l1-g1")
    expect(screen.getByText("Nến tăng")).toBeTruthy()
    expect(screen.getByText("Cao nhất")).toBeTruthy()
    expect(screen.getByText("Đóng cửa")).toBeTruthy()
    expect(screen.getByText("Giảm")).toBeTruthy()
    expect(screen.getByText("+")).toBeTruthy()
    expect(container.querySelectorAll("rect.fill-price-up")).toHaveLength(2)
    expect(container.querySelectorAll("rect.fill-price-down")).toHaveLength(1)
  })

  it("flow: a row becomes a column below 560px when it has 4+ nodes; cycles loop back", () => {
    const wide = draw("c1l2-g3", 760)
    expect(wide.container.querySelector(".flex-row")).not.toBeNull()
    expect(screen.getByText("Ủy ban Chứng khoán Nhà nước")).toBeTruthy()
    expect(screen.getByText("Doanh nghiệp phát hành")).toBeTruthy()
    expect(wide.container.querySelectorAll("svg.lucide-arrow-right")).toHaveLength(3)
    wide.unmount()
    restore?.()
    const narrow = draw("c1l2-g3", 358)
    expect(narrow.container.querySelectorAll("svg.lucide-arrow-down")).toHaveLength(3)
    narrow.unmount()
    restore?.()
    draw("c1l8-g4")
    expect(screen.getByText("Sau bước 3, vòng lặp quay lại bước 1.")).toBeTruthy()
  })

  it("diagram: shapes, arrow markers and toned text in a scaled viewBox", () => {
    const { container } = draw("c1l1-a1")
    const svg = screen.getByRole("img", { name: "Biểu đồ c1l1-a1" })
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 120")
    expect(container.querySelector("marker")).not.toBeNull()
    expect(screen.getByText("vài triệu đồng").getAttribute("class")).toContain("fill-chart-1")
    expect(screen.getByText("hàng tỷ đồng").getAttribute("class")).toContain("fill-academy-label")
  })

  it("compare: items side by side on a wide reader, stacked on a phone, with edge labels", () => {
    const wide = draw("c4l6-g0", 760)
    expect(screen.getByRole("group", { name: "Biểu đồ c4l6-g0" })).toBeTruthy()
    expect(screen.getByText("RSI ≈ 81").className).toContain("text-price-down")
    expect(screen.getByText("Cổ phiếu")).toBeTruthy()
    const grid = wide.container.querySelector<HTMLElement>(".grid")
    expect(grid?.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    wide.unmount()
    restore?.()
    const narrow = draw("c4l6-g0", 358)
    expect(narrow.container.querySelector<HTMLElement>(".grid")?.style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))")
  })
})

describe("ChartDataTable", () => {
  it("offers tables for data kinds only", () => {
    expect(hasDataTable(CHARTS["c4l7-g6"])).toBe(true)
    expect(hasDataTable(CHARTS["c5l1-g2"])).toBe(true)
    expect(hasDataTable(CHARTS["c1l1-a2"])).toBe(true)
    expect(hasDataTable(CHARTS["c4l6-g0"])).toBe(true)
    expect(hasDataTable(CHARTS["c1l5-g3"])).toBe(false)
    expect(hasDataTable(CHARTS["c1l2-g3"])).toBe(false)
    const { container } = render(<ChartDataTable model={CHARTS["c1l5-g3"]} label="x" />)
    expect(container.innerHTML).toBe("")
  })

  it("prints every observation with its absolute session label, missing values never as zero", () => {
    render(<ChartDataTable model={CHARTS["c3l2-g1"]} label="Kênh" />)
    fireEvent.click(screen.getByText("Xem bảng số liệu"))
    const region = screen.getByRole("region", { name: "Bảng số liệu: Kênh" })
    expect(within(region).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Mục", "Tự tìm (%)", "Được giới thiệu (%)", "Tổng (%)"])
    expect(within(region).getByText("Không có")).toBeTruthy()
  })
})

describe("chart math and theme", () => {
  it("labels and reads series_panels windows by absolute index", () => {
    const model = CHARTS["c4l7-g6"] as SeriesPanelsModel
    expect(observationLabel(model, 0)).toBe("Phiên 71")
    const rows = seriesPanelsReadout(model, 0)
    expect(rows.map((row) => row.name)).toEqual(["Mở cửa", "Cao nhất", "Thấp nhất", "Đóng cửa", "Giá", "MA20", "MACD", "Đường tín hiệu", "Histogram"])
    expect(chartTables(model)[0].rows).toHaveLength(30)
  })

  it("formats vi-VN numbers and never prints a missing value as 0", () => {
    expect(formatValue(1234.5, 1)).toBe("1.234,5")
    expect(formatValue(null)).toBe("Không có")
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100])
    expect(wrapText("Mua trong giai đoạn này được hưởng quyền", 100)).toEqual(["Mua trong giai", "đoạn này được", "hưởng quyền"])
  })

  it("never colours chart text grey", () => {
    expect(textFill("p3")).toBe("fill-academy-label")
    expect(textFill("neutral")).toBe("fill-academy-label")
    expect(textFill(undefined)).toBe("fill-academy-label")
    expect(textColor("p3")).toBe("text-academy-label")
    expect(textFill("neg")).toBe("fill-price-down")
    expect(TONE_STROKE.p4).toBe("stroke-chart-7")
    expect(TONE_FILL.info).toBe("fill-chart-6")
  })
})
