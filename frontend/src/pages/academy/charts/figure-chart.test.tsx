import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import type { FigureChartModel } from "../content-types"
import { FIGURE_MAX_WIDTH, FigureChart } from "./figure-chart"
import { FIGURE_FORMULA, FIGURE_HBAR, FIGURE_LINES, FIGURE_STACK, FIGURE_WF } from "./test-figures"

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
})

function draw(model: FigureChartModel, width: number) {
  restore?.()
  restore = mockReaderWidth(width)
  return render(<FigureChart model={model} label="Hình" />)
}

const ALL: [string, FigureChartModel][] = [
  ["formula", FIGURE_FORMULA],
  ["lines", FIGURE_LINES],
  ["hbar", FIGURE_HBAR],
  ["stack", FIGURE_STACK],
  ["wf", FIGURE_WF],
]

describe("FigureChart (spec Học viện v5 §2.5)", () => {
  it("formats numbers as the mockup: Vietnamese separators and a real minus sign", () => {
    const { container } = draw(
      {
        kind: "figure",
        fig: "hbar",
        items: [
          { label: "A", value: 2378500 },
          { label: "B", value: -26.2 },
        ],
        decimals: 1,
      } as FigureChartModel,
      760,
    )
    const texts = [...container.querySelectorAll("text")].map((node) => node.textContent)
    expect(texts).toEqual(expect.arrayContaining(["2.378.500,0", "−26,2"]))
  })

  for (const width of [358, 760]) {
    it.each(ALL)(`%s draws at ${width}px with every text inside the box`, (_fig, model) => {
      const { container } = draw(model, width)
      const svg = container.querySelector('svg[role="img"]') as SVGSVGElement
      expect(svg).not.toBeNull()
      const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number)
      expect(w).toBe(Math.min(width, FIGURE_MAX_WIDTH))
      expect(h).toBeGreaterThan(40)
      expect(container.querySelectorAll("text").length).toBeGreaterThan(0)
      expect(svgOverflows(container, width)).toEqual([])
      // No grey text: every text carries a theme fill class.
      for (const text of container.querySelectorAll("text")) expect(text.getAttribute("class") ?? "").toMatch(/fill-/)
    })
  }

  it("never draws wider than the mockup's 760 frame", () => {
    const { container } = draw(FIGURE_HBAR, 1200)
    expect(container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2]).toBe("760")
  })

  it("formula: boxes side by side when wide, stacked with the operator between on a phone", () => {
    const height = (width: number) => Number(draw(FIGURE_FORMULA, width).container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[3])
    expect(height(358)).toBeGreaterThan(height(760))
    const { container } = draw(FIGURE_FORMULA, 358)
    const texts = [...container.querySelectorAll("text")].map((node) => node.textContent)
    expect(texts).toEqual(expect.arrayContaining(["TOI quý này", "34.329 tỷ", "so với", "=", "35,6%", "So với cùng kỳ"]))
  })

  it("formula: the `arrow` operator is a drawn arrow, never typed", () => {
    const model = { ...FIGURE_FORMULA, ops: ["arrow", "="] } as FigureChartModel
    for (const width of [358, 760]) {
      const { container } = draw(model, width)
      expect(container.querySelector('path[data-op="arrow"]')).not.toBeNull()
      expect([...container.querySelectorAll("text")].map((node) => node.textContent)).not.toContain("arrow")
    }
  })

  it("hbar: value labels with unit and decimals, a zero line for negative values, the note", () => {
    const { container } = draw(
      { ...FIGURE_HBAR, items: [...("items" in FIGURE_HBAR ? FIGURE_HBAR.items : []), { label: "Lỗ", value: -0.8, tone: "neg" }] } as FigureChartModel,
      760,
    )
    const texts = [...container.querySelectorAll("text")].map((node) => node.textContent)
    expect(texts).toEqual(expect.arrayContaining(["1,5 lần", "−0,8 lần"]))
    expect(container.querySelectorAll("line").length).toBeGreaterThanOrEqual(2)
    expect(container.textContent).toContain("đáng giá cao hơn")
  })

  it("stack: shares in the bar and legend values", () => {
    const { container } = draw(FIGURE_STACK, 760)
    expect(container.textContent).toContain("45,8%")
    expect(container.textContent).toContain("Cho vay margin: 500 tỷ")
  })

  it("wf: signed steps", () => {
    const { container } = draw(FIGURE_WF, 358)
    const texts = [...container.querySelectorAll("text")].map((node) => node.textContent)
    expect(texts).toEqual(expect.arrayContaining(["100 đồng", "−98 đồng", "+13 đồng", "12 đồng"]))
  })

  it("lines: report, line and code of every row", () => {
    const { container } = draw(FIGURE_LINES, 358)
    expect(container.textContent).toContain("Thu nhập lãi thuần")
    expect(container.textContent).toContain("Phần lớn TOI")
  })

  it("a figure without entries is never a blank frame", () => {
    const { container } = draw({ kind: "figure", fig: "hbar", items: [] } as FigureChartModel, 358)
    expect(container.querySelector("svg")).toBeNull()
    expect(container.textContent).toBe("Hình này chưa có dữ liệu.")
  })
})
