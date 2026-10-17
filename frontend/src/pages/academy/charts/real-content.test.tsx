import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BlockRenderer } from "../blocks/block-renderer"
import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
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
function schematicTextIssues(svg: SVGSVGElement): string[] {
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
      expect(schematicTextIssues(chartSvg(container, chartId))).toEqual([])
    })
  }
})
