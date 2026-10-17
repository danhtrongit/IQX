import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BlockRenderer } from "../blocks/block-renderer"
import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import { textWidth } from "./chart-math"
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

type TextBox = { text: string; x0: number; x1: number; y0: number; y1: number }

/** Boxes of every text line of an SVG at 0.6em per glyph, a semibold estimate wider than the 0.56em renderers use. */
function svgTextBoxes(svg: SVGSVGElement): TextBox[] {
  const boxes: TextBox[] = []
  svg.querySelectorAll("text").forEach((node) => {
    const size = Number(/text-\[(\d+(?:\.\d+)?)px\]/.exec(node.getAttribute("class") ?? "")?.[1] ?? 11)
    const anchor = node.getAttribute("text-anchor") ?? "start"
    const x = Number(node.getAttribute("x"))
    let y = Number(node.getAttribute("y"))
    const spans = [...node.querySelectorAll("tspan")]
    const lines = spans.length ? spans.map((span) => [span.textContent ?? "", Number(span.getAttribute("dy") ?? 0)] as const) : [[node.textContent ?? "", 0] as const]
    for (const [text, dy] of lines) {
      y += dy
      const w = text.length * size * 0.6
      const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
      boxes.push({ text, x0, x1: x0 + w, y0: y - size * 0.72, y1: y + size * 0.2 })
    }
  })
  return boxes
}

/** Text lines that leave the drawing or overlap another text line. */
function textCollisions(svg: SVGSVGElement): string[] {
  const boxes = svgTextBoxes(svg)
  const width = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[2])
  const found: string[] = []
  boxes.forEach((a, index) => {
    if (a.x0 < 0 || a.x1 > width) found.push(`outside: ${a.text}`)
    for (const b of boxes.slice(index + 1)) {
      if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0)) found.push(`${a.text} | ${b.text}`)
    }
  })
  return found
}

const schematics = lessons.flatMap((lesson) =>
  Object.entries(lesson.charts)
    .filter(([, chart]) => (chart as { kind?: string }).kind === "schematic")
    .map(([id]) => [lesson.id, id] as const),
)

describe("real content: schematic labels", () => {
  for (const width of [317, 768]) {
    it.each(schematics)(`%s %s keeps every label apart and inside at ${width}px`, (lessonId, chartId) => {
      const { container } = renderLesson(lessonById(lessonId), width)
      expect(textCollisions(chartSvg(container, chartId))).toEqual([])
    })
  }
})
