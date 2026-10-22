import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import type { ScaleModel } from "./chart-math"
import { ScaleChart } from "./scale-chart"

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  cleanup()
})

function draw(model: ScaleModel, width: number) {
  restore = mockReaderWidth(width)
  const { container } = render(<ScaleChart model={model} label="Thang đo" />)
  return {
    container,
    svg: container.querySelector("svg[viewBox]") as SVGSVGElement,
  }
}

const textOf = (svg: SVGSVGElement, text: string) =>
  [...svg.querySelectorAll("text")].find(
    (node) => node.textContent === text
  ) as SVGTextElement

/** Width of a label at the 0.56em per glyph the renderers estimate. */
const labelWidth = (text: string, size = 10.5) => text.length * size * 0.56

/**
 * The v3.3 shape: a left-edge tick label longer than the edge can hold and a zone label wider than
 * its own zone (the reference scale of a "giá trần" lesson).
 */
const HORIZONTAL: ScaleModel = {
  kind: "scale",
  orientation: "h",
  domain: [0, 2],
  ticks: [
    { v: 0, label: "0 điểm %" },
    { v: 1, label: "1" },
    { v: 2, label: "2" },
  ],
  zones: [
    { from: 0, to: 0.5, tone: "neg", label: "Lợi nhuận trên giấy" },
    { from: 0.5, to: 2, tone: "pos", label: "Có tiền thật" },
  ],
  markers: [
    { v: 0.4, label: "Doanh nghiệp B · 0,4", tone: "p1", side: "a" },
    { v: 1.6, label: "Doanh nghiệp C · 1,6", tone: "p2", side: "b" },
  ],
  ends: ["Thấp", "Cao"],
}

const VERTICAL: ScaleModel = {
  kind: "scale",
  orientation: "v",
  domain: [0, 10],
  ticks: [
    { v: 0, label: "0" },
    { v: 10, label: "10" },
  ],
  zones: [
    { from: 0, to: 5, tone: "pos", label: "Vùng an toàn" },
    { from: 5, to: 10, tone: "neg", label: "Vùng rủi ro cao" },
  ],
  markers: [{ v: 7, label: "Doanh nghiệp C", tone: "p1" }],
}

describe("ScaleChart", () => {
  it("keeps the tick label of the left edge inside the drawing", () => {
    for (const width of [358, 760]) {
      const { container, svg } = draw(HORIZONTAL, width)
      const tick = textOf(svg, "0 điểm %")
      // A centred label would cross the edge: it is anchored to the edge instead.
      expect(tick.getAttribute("text-anchor")).toBe("start")
      const x = Number(tick.getAttribute("x"))
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x + labelWidth("0 điểm %")).toBeLessThanOrEqual(width)
      expect(svgOverflows(container, width)).toEqual([])
      cleanup()
      restore?.()
      restore = null
    }
  })

  it("wraps a zone label wider than its zone and keeps every line inside that zone", () => {
    const { container, svg } = draw(HORIZONTAL, 358)
    const zone = [...svg.querySelectorAll("text")].find((node) =>
      (node.textContent ?? "").includes("Lợi nhuận")
    ) as SVGTextElement
    const lines = [...zone.querySelectorAll("tspan")].map(
      (span) => span.textContent ?? ""
    )
    expect(lines).toEqual(["Lợi nhuận", "trên giấy"])
    // The zone runs from 0 to 0,5 of the domain [0, 2]: no line reaches outside it.
    const zoneRight = 12 + (0.5 / 2) * (358 - 24)
    for (const span of zone.querySelectorAll("tspan")) {
      const x = Number(span.getAttribute("x"))
      const w = labelWidth(span.textContent ?? "")
      expect(x - w / 2).toBeGreaterThanOrEqual(12)
      expect(x + w / 2).toBeLessThanOrEqual(zoneRight)
    }
    expect(svgOverflows(container, 358)).toEqual([])
  })

  it("draws the zones, the markers and the end labels of the scale", () => {
    const { svg } = draw(HORIZONTAL, 760)
    expect(textOf(svg, "Có tiền thật")).toBeTruthy()
    expect(textOf(svg, "Doanh nghiệp B · 0,4")).toBeTruthy()
    expect(textOf(svg, "Thấp")).toBeTruthy()
    expect(textOf(svg, "Cao")).toBeTruthy()
    // One track per zone plus the track itself.
    expect(svg.querySelectorAll("rect").length).toBeGreaterThanOrEqual(3)
  })

  it("keeps the zone and marker labels of a vertical scale inside the drawing", () => {
    for (const width of [358, 760]) {
      const { container, svg } = draw(VERTICAL, width)
      expect(textOf(svg, "Vùng rủi ro cao")).toBeTruthy()
      expect(textOf(svg, "Doanh nghiệp C")).toBeTruthy()
      expect(svgOverflows(container, width)).toEqual([])
      cleanup()
      restore?.()
      restore = null
    }
  })
})
