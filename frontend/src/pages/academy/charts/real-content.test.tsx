import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BlockRenderer } from "../blocks/block-renderer"
import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
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
    it.each([262, 298, 317, 358])(`${chartId} keeps its time axis labels apart at %ipx and keeps the last tick`, (width) => {
      const { container } = renderLesson(lessonById(lessonId), width)
      const svg = chartSvg(container, chartId)
      const lastTick = lessonById(lessonId).charts?.[chartId] as { ticks: { label: string }[] }
      const height = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[3])
      const axis = [...svg.querySelectorAll("text")].filter((node) => Number(node.getAttribute("y")) === height - 6)
      expect(axis.length).toBeGreaterThan(1)
      expect(axis.map((node) => node.textContent)).toContain(lastTick.ticks[lastTick.ticks.length - 1].label)
      // Digits and colons render a little wider than the 0.56em estimate: check with 0.62em.
      const spans = axis
        .map((node) => {
          const w = (node.textContent ?? "").length * 10.5 * 0.62
          const x = Number(node.getAttribute("x"))
          const anchor = node.getAttribute("text-anchor")
          const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2
          return [left, left + w] as const
        })
        .sort((a, b) => a[0] - b[0])
      for (let index = 1; index < spans.length; index += 1) expect(spans[index][0]).toBeGreaterThanOrEqual(spans[index - 1][1])
    })
  }

  it.each([262, 317, 768])("c1l4-g1 draws T / T+2 pills joined by a dashed line, fitted headers and notes beside the marker at %ipx", (width) => {
    const { container } = renderLesson(lessonById("ch01-l04"), width)
    const svg = chartSvg(container, "c1l4-g1")
    const viewWidth = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[2])
    expect(svg.querySelectorAll(`line[stroke-dasharray="4 4"]`)).toHaveLength(3)
    const pill = (text: string) => [...svg.querySelectorAll("text")].filter((node) => node.textContent === text)
    expect(pill("T")).toHaveLength(3)
    expect(pill("T+2.5")).toHaveLength(2)
    expect(pill("T+2")).toHaveLength(1)
    // Headers: every line fits its own column at the bold-safe 0.66em, so neighbours never touch.
    const headers = [...svg.querySelectorAll("text[font-size]")]
    expect(headers).toHaveLength(8)
    const columnWidth = Number(headers[1].getAttribute("x")) - Number(headers[0].getAttribute("x"))
    for (const header of headers) {
      const size = Number(header.getAttribute("font-size"))
      for (const line of header.querySelectorAll("tspan")) expect((line.textContent ?? "").length * size * 0.66).toBeLessThanOrEqual(columnWidth)
    }
    // Notes start right of the row's last pill, on the same row, and stay inside the drawing.
    for (const [note, marker] of [
      ["Cổ phiếu về", "T+2.5"],
      ["Tiền về tài khoản", "T+2"],
    ]) {
      const noteNode = [...svg.querySelectorAll("text")].find((node) => node.textContent?.startsWith(note)) as SVGTextElement
      const markerNode = pill(marker)[0]
      const markerRight = Number(markerNode.getAttribute("x")) + (marker.length * 11 * 0.66) / 2
      const noteX = Number(noteNode.getAttribute("x"))
      expect(noteX).toBeGreaterThanOrEqual(markerRight)
      expect(Math.abs(Number(noteNode.getAttribute("y")) - Number(markerNode.getAttribute("y")))).toBeLessThan(20)
      for (const line of noteNode.querySelectorAll("tspan")) expect(noteX + (line.textContent ?? "").length * 11 * 0.56).toBeLessThanOrEqual(viewWidth)
    }
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
