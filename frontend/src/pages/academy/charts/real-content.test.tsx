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

type Box = { x0: number; x1: number; y0: number; y1: number }
const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** Box of one printed line (0.56em per glyph, as the renderers estimate) with its baseline at `y`. */
function textBoxOf(owner: Element, text: string, x: number, y: number): Box {
  const size = Number(/text-\[(\d+(?:\.\d+)?)px\]/.exec(owner.getAttribute("class") ?? "")?.[1] ?? 11)
  const w = text.length * size * 0.56
  const anchor = owner.getAttribute("text-anchor") ?? "start"
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
  return { x0, x1: x0 + w, y0: y - size * 0.8, y1: y + size * 0.2 }
}

/** Every pair of printed lines of an SVG whose boxes overlap (lines of one label never count against each other). */
function textCollisions(svg: SVGSVGElement): string[] {
  const lines: { owner: Element; text: string; box: Box }[] = []
  svg.querySelectorAll("text").forEach((node) => {
    const spans = [...node.querySelectorAll("tspan")]
    let y = Number(node.getAttribute("y"))
    if (spans.length === 0) {
      lines.push({ owner: node, text: node.textContent ?? "", box: textBoxOf(node, node.textContent ?? "", Number(node.getAttribute("x")), y) })
      return
    }
    for (const span of spans) {
      y += Number(span.getAttribute("dy") ?? 0)
      const x = Number(span.getAttribute("x") ?? node.getAttribute("x"))
      lines.push({ owner: node, text: span.textContent ?? "", box: textBoxOf(node, span.textContent ?? "", x, y) })
    }
  })
  const problems: string[] = []
  for (let a = 0; a < lines.length; a += 1)
    for (let b = a + 1; b < lines.length; b += 1)
      if (lines[a].owner !== lines[b].owner && lines[a].text && lines[b].text && boxesOverlap(lines[a].box, lines[b].box))
        problems.push(`${lines[a].text}|${lines[b].text}`)
  return problems
}

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

  for (const width of [358, 760]) {
    for (const [lessonId, chartId] of [
      ["ch05-l01", "c5l1-g3"],
      ["ch05-l02", "c5l2-m4"],
      ["ch02-l01", "c2l1-g1"],
      ["ch05-l03", "c5l3-g2"],
      ["ch05-l03", "c5l3-g4"],
      ["ch02-l09", "c2l9-g1"],
    ] as const) {
      it(`${chartId} prints no text on top of other text at ${width}px`, () => {
        const { container } = renderLesson(lessonById(lessonId), width)
        const svgs = [...container.querySelectorAll<SVGSVGElement>(`[data-chart-id="${chartId}"] svg[viewBox]`)]
        // Milestones are an HTML list on a phone; every other chart here draws an SVG.
        if (!(chartId === "c2l9-g1" && width < 560)) expect(svgs.length).toBeGreaterThan(0)
        for (const svg of svgs) expect(textCollisions(svg)).toEqual([])
      })
    }
  }

  it("C5L1-g3 keeps the last month on the axis and spreads its end labels", () => {
    for (const width of [358, 760]) {
      const view = renderLesson(lessonById("ch05-l01"), width)
      const svg = chartSvg(view.container, "c5l1-g3")
      const shown = texts(svg)
        .filter((text) => text.startsWith("Tháng"))
        .map((text) => text.replace(/\s+/g, ""))
      expect(shown).toContain("Tháng24")
      expect(shown).toContain("Tháng1")
      expect(shown).not.toContain("Tháng23")
      const ends = ["+5%", "+36%", "72 triệu"].map((label) => Number([...svg.querySelectorAll("text")].find((node) => node.textContent === label)?.getAttribute("y")))
      const sorted = [...ends].sort((a, b) => a - b)
      for (let k = 1; k < sorted.length; k += 1) expect(sorted[k] - sorted[k - 1]).toBeGreaterThanOrEqual(13)
      view.unmount()
      restore?.()
    }
  })

  it("C5L2-g4 puts the 15% threshold label clear of every bar", () => {
    for (const width of [358, 760]) {
      const view = renderLesson(lessonById("ch05-l02"), width)
      const svg = chartSvg(view.container, "c5l2-m4")
      const label = [...svg.querySelectorAll("text")].find((node) => node.textContent === "15%") as SVGTextElement
      const box = textBoxOf(label, label.textContent ?? "", Number(label.getAttribute("x")), Number(label.getAttribute("y")))
      for (const rect of svg.querySelectorAll("rect")) {
        const bar = {
          x0: Number(rect.getAttribute("x")),
          x1: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
          y0: Number(rect.getAttribute("y")),
          y1: Number(rect.getAttribute("y")) + Number(rect.getAttribute("height")),
        }
        expect(boxesOverlap(box, bar), `15% vs bar at ${bar.x0.toFixed(0)}`).toBe(false)
      }
      view.unmount()
      restore?.()
    }
  })

  it("C2L1-g1 rounds computed values to whole customers", () => {
    const { container } = renderLesson(lessonById("ch02-l01"), 358)
    const labels = texts(chartSvg(container, "c2l1-g1"))
    expect(labels).toEqual(expect.arrayContaining(["51", "23"]))
    expect(labels.some((text) => text.includes(","))).toBe(false)
  })

  it("C5L3-g4 keeps the price with its unit and leaves out the tick label under the fair-value stem", () => {
    for (const width of [358, 760]) {
      const view = renderLesson(lessonById("ch05-l03"), width)
      const svg = chartSvg(view.container, "c5l3-g4")
      const lines = [...svg.querySelectorAll("tspan")].map((node) => node.textContent ?? "")
      expect(lines).not.toContain("đ")
      expect(lines.some((line) => line.endsWith("15.350 đ"))).toBe(true)
      expect(texts(svg)).not.toContain("30k")
      expect(texts(svg)).toContain("20k")
      view.unmount()
      restore?.()
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
