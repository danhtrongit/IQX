import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeContext } from "@/lib/iqline/render/test-support"
import { layoutStatic } from "@/lib/iqline/scene/static"
import { CHARTS, mockReaderWidth } from "../blocks/test-blocks"
import type { ChartModel, LessonContent } from "../content-types"
import type { SeriesPanelsModel } from "./chart-math"
import { LessonChart } from "./lesson-chart"
import { SeriesPanelsChart } from "./series-panels-chart"
import { SeriesPanelsIQLineChart } from "./series-panels-iqline-chart"
import { seriesPanelsToIQLine } from "./series-panels-to-iqline"

type LessonFile = Pick<LessonContent, "id" | "charts">
const lessonFiles = import.meta.glob("../../../../../backend/src/modules/academy/content/v4/lessons/*.vi.json", { eager: true, import: "default" }) as Record<string, LessonFile>
const panelsModels = (model: ChartModel): SeriesPanelsModel[] =>
  model.kind === "series_panels" ? [model] : model.kind === "compare" ? model.items.flatMap((item) => panelsModels(item.model)) : []
const real = Object.values(lessonFiles).flatMap((lesson) => Object.entries(lesson.charts).flatMap(([id, model]) => panelsModels(model).map((chart, index) => ({ id: `${lesson.id} ${id}${index ? `#${index}` : ""}`, model: chart }))))

let restore: (() => void) | null = null

beforeEach(() => {
  const context = fakeContext()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never)
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
})
afterEach(() => {
  restore?.()
  restore = null
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, "", "/")
})

describe("?iqline=1 bật bản Canvas của series_panels, mặc định vẫn là SVG", () => {
  it("không có cờ: SVG cũ, không canvas", () => {
    restore = mockReaderWidth(580)
    const { container } = render(<LessonChart model={CHARTS["c4l7-g6"] as ChartModel} label="Biểu đồ" />)
    expect(container.querySelector("svg[viewBox]")).not.toBeNull()
    expect(container.querySelector("canvas")).toBeNull()
    expect(container.querySelector('[data-iqline-mode="static"]')).toBeNull()
  })

  it("có ?iqline=1: IQLineStatic với bốn canvas, không SVG biểu đồ", () => {
    window.history.replaceState({}, "", "/?iqline=1")
    restore = mockReaderWidth(580)
    const { container } = render(<LessonChart model={CHARTS["c4l7-g6"] as ChartModel} label="Biểu đồ c4l7-g6" />)
    expect(container.querySelector('[data-iqline-mode="static"]')).not.toBeNull()
    expect(container.querySelectorAll("canvas")).toHaveLength(4)
    expect(container.querySelector("svg[viewBox]")).toBeNull()
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Biểu đồ c4l7-g6")
  })

  it("giá trị khác 1 không bật", () => {
    window.history.replaceState({}, "", "/?iqline=0")
    restore = mockReaderWidth(580)
    const { container } = render(<LessonChart model={CHARTS["c4l7-g6"] as ChartModel} label="x" />)
    expect(container.querySelector("canvas")).toBeNull()
  })
})

describe("96 series_panels thật dựng được bằng IQLineStatic", () => {
  it("có đủ 96 biểu đồ", () => {
    expect(real).toHaveLength(96)
  })

  it.each([358, 760])("cùng chiều cao, cùng nhãn, cùng chú giải và cùng khả năng focus với SVG ở %ipx", (width) => {
    const differing: string[] = []
    for (const chart of real) {
      restore = mockReaderWidth(width)
      const old = render(<SeriesPanelsChart model={chart.model} label="Nhãn" />)
      const svg = old.container.querySelector("svg[viewBox]") as SVGSVGElement
      const oldHeight = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[3])
      const oldFocus = svg.getAttribute("tabindex") !== null
      const oldLegend = old.container.querySelectorAll('ul[aria-label="Chú giải"] li').length
      cleanup()

      const next = render(<SeriesPanelsIQLineChart model={chart.model} label="Nhãn" />)
      const host = next.container.querySelector<HTMLElement>('[role="img"]')!
      const height = Number.parseFloat(host.style.height)
      const legend = next.container.querySelectorAll('ul[aria-label="Chú giải"] li').length
      if (Math.abs(height - oldHeight) > 0.001) differing.push(`${chart.id}: cao ${height} khác ${oldHeight}`)
      if (host.getAttribute("aria-label") !== "Nhãn") differing.push(`${chart.id}: nhãn`)
      if ((host.getAttribute("tabindex") !== null) !== oldFocus) differing.push(`${chart.id}: focus`)
      if (legend !== oldLegend) differing.push(`${chart.id}: chú giải ${legend} khác ${oldLegend}`)
      if (next.container.querySelectorAll("canvas").length !== 4) differing.push(`${chart.id}: canvas`)
      if (Math.abs(height - layoutStatic(seriesPanelsToIQLine(chart.model), { width }).height) > 0.001) differing.push(`${chart.id}: layoutStatic`)
      cleanup()
      restore()
      restore = null
    }
    expect(differing).toEqual([])
  })
})
