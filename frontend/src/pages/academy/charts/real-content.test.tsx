import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BlockRenderer } from "../blocks/block-renderer"
import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import { textWidth } from "./chart-math"
import { annotationsOnLine, textBoxes, textOverlaps } from "./test-geometry"
import type { CatalogResponse, LessonContent } from "../content-types"

/**
 * Integration: renders every real v3.2 lesson of the backend content (`content/v3/lessons` and
 * `catalog.json` only, never the private question banks) at phone and desktop reader widths.
 */
type LessonFile = Pick<LessonContent, "id" | "intro_blocks" | "sections" | "charts">

const lessonFiles = import.meta.glob("../../../../../backend/src/modules/academy/content/v3/lessons/*.vi.json", {
  eager: true,
  import: "default",
}) as Record<string, LessonFile>
const catalog = Object.values(
  import.meta.glob("../../../../../backend/src/modules/academy/content/v3/catalog.json", { eager: true, import: "default" }) as Record<
    string,
    Pick<CatalogResponse, "chapters">
  >,
)[0]

const lessons = Object.values(lessonFiles).sort((a, b) => a.id.localeCompare(b.id))

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  cleanup()
})

function renderLesson(lesson: LessonFile, width: number) {
  restore = mockReaderWidth(width)
  return render(
    <article>
      <BlockRenderer blocks={lesson.intro_blocks} charts={lesson.charts} />
      {lesson.sections.map((section) => (
        <section key={section.id}>
          <BlockRenderer blocks={section.blocks} charts={lesson.charts} renderInteractive={(block, key) => <div key={key} data-interactive={block.type} />} />
        </section>
      ))}
    </article>,
  )
}

describe("real Học viện content", () => {
  it("has the 44 lesson files of the published catalog", () => {
    expect(lessons).toHaveLength(44)
    const published = catalog.chapters.flatMap((chapter) => ("items" in chapter ? chapter.items : []))
    const readable = published.filter((item) => item.kind !== "chapter_exam").map((item) => item.id)
    expect(lessons.map((lesson) => lesson.id)).toEqual([...readable].sort())
  })

  for (const width of [358, 760]) {
    it.each(lessons.map((lesson) => [lesson.id, lesson] as const))(`renders %s at ${width}px with every chart drawn inside the reader`, (_, lesson) => {
      const { container } = renderLesson(lesson, width)
      const staticCount = [...lesson.intro_blocks, ...lesson.sections.flatMap((section) => section.blocks)].filter(
        (block) => !["scenario", "checklist", "workpad", "income_calculator", "practice_case", "roleplay_score"].includes(block.type),
      ).length
      expect(container.querySelectorAll("[data-academy-block]")).toHaveLength(staticCount)
      for (const id of Object.keys(lesson.charts)) expect(container.querySelector(`[data-chart-id="${id}"]`), id).not.toBeNull()
      expect(container.textContent).not.toContain("Biểu đồ này chưa có dữ liệu.")
      expect(svgOverflows(container, width)).toEqual([])
    })
  }
})

const lessonById = (id: string) => lessons.find((lesson) => lesson.id === id) as LessonFile
const chartSvg = (container: HTMLElement, id: string) => container.querySelector(`[data-chart-id="${id}"] svg[viewBox]`) as SVGSVGElement
const texts = (svg: SVGSVGElement) => [...svg.querySelectorAll("text")].map((node) => node.textContent ?? "")

describe("real content: review regressions", () => {
  it("C1L5-g2 draws the purchase below zero and labels −100.000, +8.000, +8.000, +108.000", () => {
    const { container } = renderLesson(lessonById("ch01-l05"), 760)
    const svg = chartSvg(container, "c1l5-g2")
    expect(texts(svg).filter((text) => /^[+\u2212]\d/.test(text))).toEqual(expect.arrayContaining(["\u2212100.000", "+8.000", "+8.000", "+108.000"]))
    const heights = [...svg.querySelectorAll("rect")].map((rect) => Number(rect.getAttribute("height")))
    // The purchase bar is as tall as the principal repayment, never a 0.8px sliver.
    expect(Math.max(...heights)).toBeGreaterThan(40)
    expect(heights.filter((height) => height > 40)).toHaveLength(2)
  })

  it("C1L10-g2 and C1L4-g4 print signed percentages", () => {
    const loss = renderLesson(lessonById("ch01-l10"), 760)
    const lossTexts = texts(chartSvg(loss.container, "c1l10-g2"))
    for (const label of ["\u221210%", "+11%", "\u221250%", "+100%"]) expect(lossTexts).toContain(label)
    loss.unmount()
    restore?.()
    const margin = renderLesson(lessonById("ch01-l04"), 760)
    const marginTexts = texts(chartSvg(margin.container, "c1l4-g4"))
    for (const label of ["+20%", "\u221220%", "+40%", "\u221240%"]) expect(marginTexts).toContain(label)
  })

  for (const [lessonId, chartId] of [
    ["ch01-l03", "c1l3-g3"],
    ["ch02-l10", "c2l10-g1"],
  ] as const) {
    it(`${chartId} keeps its time axis labels apart at phone width`, () => {
      const { container } = renderLesson(lessonById(lessonId), 298)
      const svg = chartSvg(container, chartId)
      const height = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[3])
      const axis = [...svg.querySelectorAll("text")].filter((node) => Number(node.getAttribute("y")) === height - 6)
      expect(axis.length).toBeGreaterThan(1)
      const spans = axis
        .map((node) => {
          const w = textWidth(node.textContent ?? "", 10.5)
          const x = Number(node.getAttribute("x"))
          const anchor = node.getAttribute("text-anchor")
          const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2
          return [left, left + w] as const
        })
        .sort((a, b) => a[0] - b[0])
      for (let index = 1; index < spans.length; index += 1) expect(spans[index][0]).toBeGreaterThanOrEqual(spans[index - 1][1])
    })
  }

  // Annotated price panels: no label may print over another one, over the price line or outside the drawing, at
  // phone and desktop reader widths.
  const annotated = [
    ["ch01-l09", "c1l9-g3"],
    ["ch04-l08", "c4l8-g2"],
    ["ch04-l08", "c4l8-g4"],
    ["ch04-l09", "c4l9-g2"],
    ["ch04-l09", "c4l9-g3"],
    ["ch04-l09", "c4l9-g4"],
    ["ch05-l02", "c5l2-m2"],
    ["ch05-l02", "c5l2-m3"],
    ["ch05-l04", "c5l4-g3"],
    ["ch05-l04", "c5l4-g5"],
  ] as const
  for (const width of [298, 358, 760]) {
    it.each(annotated)(`%s %s keeps its labels apart and off the price line at ${width}px`, (lessonId, chartId) => {
      const { container } = renderLesson(lessonById(lessonId), width)
      const svgs = [...container.querySelectorAll(`[data-chart-id="${chartId}"] svg[viewBox]`)] as SVGSVGElement[]
      expect(svgs.length).toBeGreaterThan(0)
      for (const svg of svgs) {
        expect(textOverlaps(svg)).toEqual([])
        expect(annotationsOnLine(svg, "stroke-foreground")).toEqual([])
        const viewWidth = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[2])
        for (const { text, box } of textBoxes(svg)) {
          expect(box.l, text).toBeGreaterThanOrEqual(-0.5)
          expect(box.r, text).toBeLessThanOrEqual(viewWidth + 0.5)
        }
      }
    })
  }

  it("C4L8 Bollinger panels draw the upper and lower band as lines", () => {
    const { container } = renderLesson(lessonById("ch04-l08"), 760)
    for (const id of ["c4l8-g1", "c4l8-g2", "c4l8-g4"]) {
      const svg = chartSvg(container, id)
      for (const edge of ["upper", "lower"]) {
        const path = svg.querySelector(`path[data-band-edge="${edge}"]`)
        expect(path, `${id} ${edge}`).not.toBeNull()
        expect(path?.getAttribute("d")?.length ?? 0).toBeGreaterThan(100)
      }
    }
  })

  it("C5L2 ratio panels close the plot just above the year axis", () => {
    const { container } = renderLesson(lessonById("ch05-l02"), 760)
    for (const id of ["c5l2-m2", "c5l2-m3"]) {
      const svg = chartSvg(container, id)
      const height = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[3])
      const lines = [...svg.querySelectorAll("line")].filter((line) => line.getAttribute("y1") === line.getAttribute("y2"))
      const lowest = Math.max(...lines.map((line) => Number(line.getAttribute("y1"))))
      // The year labels sit at height - 5: the plot's bottom edge is drawn no more than 22px above them.
      expect(height - 5 - lowest).toBeLessThanOrEqual(22)
    }
  })

  it("C4L1 full candle chart grows with the reader width instead of staying a 96px strip", () => {
    const { container } = renderLesson(lessonById("ch04-l01"), 760)
    const svg = chartSvg(container, "c4l1-g4")
    const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number)
    expect(h / w).toBeGreaterThan(0.3)
  })

  it("a chart_grid of axis charts takes one column on a phone; thumbnail grids keep two", () => {
    const axisGrid = renderLesson(lessonById("ch05-l02"), 358)
    const axisFigure = axisGrid.container.querySelector('[data-chart-id="c5l2-m1"]') as HTMLElement
    expect(axisFigure.parentElement?.className).toContain("grid-cols-1")
    expect(axisFigure.innerHTML).not.toContain("max-w-[180px]")
    axisGrid.unmount()
    restore?.()
    for (const [lessonId, chartId] of [
      ["ch04-l01", "c4l1-p1"],
      ["ch04-l04", "c4l4-s1"],
    ] as const) {
      const view = renderLesson(lessonById(lessonId), 358)
      const figure = view.container.querySelector(`[data-chart-id="${chartId}"]`) as HTMLElement
      expect(figure.parentElement?.className).toContain("grid-cols-2")
      expect(figure.innerHTML).toContain("max-w-[180px]")
      view.unmount()
      restore?.()
    }
  })
})
