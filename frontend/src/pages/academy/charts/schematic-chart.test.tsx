import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { mockReaderWidth } from "../blocks/test-blocks"
import type { SchematicModel } from "./chart-math"
import { SchematicChart } from "./schematic-chart"

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  cleanup()
})

function draw(model: SchematicModel, width: number) {
  restore = mockReaderWidth(width)
  const { container } = render(<SchematicChart model={model} label="Sơ đồ" />)
  return container.querySelector("svg[viewBox]") as SVGSVGElement
}

const textNode = (svg: SVGSVGElement, text: string) => [...svg.querySelectorAll("text")].find((node) => node.textContent === text) as SVGTextElement

/** Box of a single-line label at 0.6em per glyph. */
function box(node: SVGTextElement) {
  const size = Number(/text-\[(\d+(?:\.\d+)?)px\]/.exec(node.getAttribute("class") ?? "")?.[1] ?? 11)
  const w = (node.textContent ?? "").length * size * 0.6
  const x = Number(node.getAttribute("x"))
  const y = Number(node.getAttribute("y"))
  const anchor = node.getAttribute("text-anchor") ?? "start"
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
  return { x0, x1: x0 + w, y0: y - size * 0.72, y1: y + size * 0.2 }
}

/** Does segment (x0,y0)-(x1,y1) pass through box `b`? Sampled, which is enough at label scale. */
function crosses(seg: number[], b: ReturnType<typeof box>) {
  const [x0, y0, x1, y1] = seg
  for (let t = 0; t <= 1; t += 0.01) {
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true
  }
  return false
}

const WAVE: [number, number][] = [
  [40, 20],
  [180, 110],
  [250, 59],
  [450, 230],
  [530, 163],
  [680, 260],
]

const fibonacci: SchematicModel = {
  kind: "schematic",
  alt: "Sóng và vùng Fibonacci",
  domain: { x: [0, 760], y: [0, 300] },
  layers: [
    { t: "zone", tone: "warn", x: [170, 310], y: [54, 65], label: "50% đến 61,8% của sóng 1" },
    { t: "zone", tone: "warn", x: [440, 580], y: [156, 170], label: "Khoảng 38,2% của sóng 3" },
    { t: "line", tone: "pos", width: 3, pts: WAVE },
    { t: "tag", tone: "pos", at: [250, 59], pos: "below", text: "2" },
    { t: "tag", tone: "pos", at: [530, 163], pos: "below", text: "4" },
    { t: "point", tone: "pos", shape: "ring", at: [250, 59], pos: "below", label: "Vùng mua" },
  ],
}

describe("SchematicChart label layout", () => {
  for (const width of [317, 768]) {
    it(`keeps band labels off the wave and point labels off the badges at ${width}px`, () => {
      const svg = draw(fibonacci, width)
      const segs = [...svg.querySelectorAll("path[d]")]
        .map((path) => path.getAttribute("d") ?? "")
        .filter((d) => d.startsWith("M") && !d.includes("z"))
        .flatMap((d) => {
          const pts = d.slice(1).split("L").map((pair) => pair.split(",").map(Number))
          return pts.slice(1).map((point, index) => [...pts[index], ...point])
        })
      expect(segs.length).toBeGreaterThan(0)
      const badge = [...svg.querySelectorAll("text")].find((node) => node.textContent === "2") as SVGTextElement
      for (const label of ["50% đến 61,8% của sóng 1", "Khoảng 38,2% của sóng 3", "Vùng mua"]) {
        const b = box(textNode(svg, label))
        expect(segs.some((seg) => crosses(seg, b)), label).toBe(false)
        expect(b.x0, label).toBeGreaterThanOrEqual(0)
        expect(b.x1, label).toBeLessThanOrEqual(width)
        const t = box(badge)
        expect(Math.min(b.x1, t.x1) > Math.max(b.x0, t.x0) && Math.min(b.y1, t.y1) > Math.max(b.y0, t.y0), `${label} covers badge 2`).toBe(false)
      }
    })
  }

  it("draws a thin y band hatched with dashed edges, and a tall zone as a flat tint", () => {
    const svg = draw(
      { ...fibonacci, layers: [...fibonacci.layers, { t: "zone", tone: "neg", x: [0, 100], y: [0, 200] }] },
      768,
    )
    const bands = svg.querySelectorAll("[data-band]")
    expect(bands).toHaveLength(2)
    for (const band of bands) {
      expect(band.querySelector("pattern")).not.toBeNull()
      expect(band.querySelectorAll("line[stroke-dasharray]")).toHaveLength(2)
    }
  })

  it("thins crowded x ticks on a phone but always keeps the last one inside the drawing", () => {
    const ticks = Array.from({ length: 11 }, (_, k) => ({ v: 20000 + k * 2000, label: (20000 + k * 2000).toLocaleString("vi-VN") }))
    const model: SchematicModel = {
      kind: "schematic",
      alt: "Lãi lỗ",
      domain: { x: [20000, 40000], y: [-3000, 9000] },
      axes: { x: { ticks }, y: { ticks: [{ v: 0, label: "0" }] } },
      layers: [{ t: "line", tone: "p1", pts: [[20000, -2000], [30000, -2000], [40000, 8000]] }],
    }
    const phone = draw(model, 317)
    const labels = ticks.map((tick) => tick.label)
    const shown = [...phone.querySelectorAll("text")].filter((node) => labels.includes(node.textContent ?? ""))
    expect(shown.length).toBeLessThan(ticks.length)
    expect(shown[shown.length - 1].textContent).toBe(labels[labels.length - 1])
    const spans = shown.map(box)
    spans.slice(1).forEach((span, index) => expect(span.x0).toBeGreaterThanOrEqual(spans[index].x1))
    expect(spans[spans.length - 1].x1).toBeLessThanOrEqual(317)
    cleanup()
    restore?.()
    const desktop = draw(model, 768)
    expect([...desktop.querySelectorAll("text")].filter((node) => labels.includes(node.textContent ?? ""))).toHaveLength(ticks.length)
  })
})
