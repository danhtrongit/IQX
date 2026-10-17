/**
 * Test helpers that read back the geometry of a rendered chart SVG: estimated text boxes (0.56em per glyph, as the
 * renderers estimate) and the polylines of stroked paths, to assert that labels neither overlap each other nor sit
 * on a series.
 */
import { segmentHitsBox, type Box } from "./series-panels-labels"

export type TextBox = { text: string; box: Box; annotation: string | null }

function fontSize(node: Element): number {
  const owner = node.tagName.toLowerCase() === "text" ? node : node.closest("text")
  return Number(/text-\[(\d+(?:\.\d+)?)px\]/.exec(owner?.getAttribute("class") ?? "")?.[1] ?? 11)
}

/** One box per drawn line of text (a `<text>` without `<tspan x>`, or each `<tspan x>`). */
export function textBoxes(svg: SVGSVGElement): TextBox[] {
  const boxes: TextBox[] = []
  svg.querySelectorAll("text").forEach((node) => {
    const annotation = node.getAttribute("data-annotation")
    const anchor = node.getAttribute("text-anchor") ?? "start"
    const size = fontSize(node)
    const spans = [...node.querySelectorAll("tspan[x]")]
    const lines =
      spans.length > 0
        ? (() => {
            let y = Number(node.getAttribute("y"))
            return spans.map((span) => {
              y += Number(span.getAttribute("dy") ?? 0)
              return { text: span.textContent ?? "", x: Number(span.getAttribute("x")), y }
            })
          })()
        : [{ text: node.textContent ?? "", x: Number(node.getAttribute("x")), y: Number(node.getAttribute("y")) }]
    for (const line of lines) {
      if (!line.text) continue
      const w = line.text.length * size * 0.56
      const l = anchor === "middle" ? line.x - w / 2 : anchor === "end" ? line.x - w : line.x
      boxes.push({ text: line.text, annotation, box: { l, r: l + w, t: line.y - size * 0.78, b: line.y + size * 0.2 } })
    }
  })
  return boxes
}

const overlaps = (a: Box, b: Box, slack = 0.5) => a.l < b.r - slack && b.l < a.r - slack && a.t < b.b - slack && b.t < a.b - slack

/** Pairs of text lines whose boxes overlap. */
export function textOverlaps(svg: SVGSVGElement): string[] {
  const boxes = textBoxes(svg)
  const problems: string[] = []
  for (let a = 0; a < boxes.length; a += 1)
    for (let b = a + 1; b < boxes.length; b += 1)
      if (overlaps(boxes[a].box, boxes[b].box)) problems.push(`${boxes[a].text} | ${boxes[b].text}`)
  return problems
}

/** Polyline points of a path drawn with M/L commands only (series lines and band edges). */
export function pathPoints(path: Element): [number, number][][] {
  const runs: [number, number][][] = []
  for (const match of (path.getAttribute("d") ?? "").matchAll(/([ML])(-?[\d.]+),(-?[\d.]+)/g)) {
    if (match[1] === "M") runs.push([])
    runs[runs.length - 1]?.push([Number(match[2]), Number(match[3])])
  }
  return runs
}

/** Annotations (`data-annotation` texts) whose box is crossed by a stroked path with the given class. */
export function annotationsOnLine(svg: SVGSVGElement, strokeClass: string): string[] {
  const paths = [...svg.querySelectorAll(`path[fill="none"]`)].filter((path) => path.classList.contains(strokeClass))
  const segments = paths.flatMap((path) =>
    pathPoints(path).flatMap((run) => run.slice(1).map((point, k) => ({ x1: run[k][0], y1: run[k][1], x2: point[0], y2: point[1] }))),
  )
  return textBoxes(svg)
    .filter((box) => box.annotation !== null && segments.some((segment) => segmentHitsBox(segment, box.box)))
    .map((box) => box.text)
}
