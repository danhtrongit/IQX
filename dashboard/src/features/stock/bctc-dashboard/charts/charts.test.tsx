import React from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import { StackedBarAbsolute } from "./StackedBarAbsolute"
import { ComboBarLine } from "./ComboBarLine"
import { LineChart } from "./LineChart"
import { PeerBar } from "./PeerBar"
import { Waterfall } from "./Waterfall"
import { FootballField } from "./FootballField"
import { RadarScorecard } from "./RadarScorecard"

// SPEC §5 hard rule: charts must colour via CSS vars, never raw hex.
// (rgba() literals are also forbidden — every fill/stroke goes through a token.)
const HEX = /#[0-9a-fA-F]{3,8}\b/
const RGBA = /rgba?\(/

function assertTokenized(html: string) {
  expect(html).toMatch(/var\(--/)
  expect(html).not.toMatch(HEX)
  expect(html).not.toMatch(RGBA)
  expect(html).not.toMatch(/NaN/)
}

describe("StackedBarAbsolute", () => {
  const series = [
    {
      year: 2024,
      parts: [
        { label: "Vốn", value: 10, cls: "fill-g" },
        { label: "Nợ", value: 5, cls: "fill-a" },
      ],
    },
    {
      year: 2025,
      parts: [
        { label: "Vốn", value: 12, cls: "fill-g" },
        { label: "Nợ", value: 6, cls: "fill-a" },
      ],
    },
  ]

  it("renders an <svg> image", () => {
    const { getAllByRole } = render(<StackedBarAbsolute series={series} />)
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
  })

  it("renders one group per year", () => {
    const { container } = render(<StackedBarAbsolute series={series} />)
    expect(container.querySelectorAll("g[data-year]").length).toBe(series.length)
  })

  it("renders one rect per stacked part", () => {
    const { container } = render(<StackedBarAbsolute series={series} />)
    expect(container.querySelectorAll("rect[data-seg]").length).toBe(4)
  })

  it("clamps negative segment values to a non-negative bar height", () => {
    // B1 gotcha: oneoff_pct can be negative (1 - core_pct when op profit > pbt).
    const { container } = render(
      <StackedBarAbsolute
        series={[
          {
            year: 2025,
            parts: [
              { label: "core", value: 120, cls: "fill-g" },
              { label: "oneoff", value: -20, cls: "fill-a" },
            ],
          },
        ]}
      />,
    )
    const segs = container.querySelectorAll<SVGRectElement>("rect[data-seg]")
    expect(segs.length).toBe(2)
    segs.forEach((r) => {
      const h = Number(r.getAttribute("height"))
      expect(Number.isFinite(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
    })
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<StackedBarAbsolute series={series} />)
    assertTokenized(container.innerHTML)
  })
})

describe("ComboBarLine", () => {
  const bars = [
    { year: 2023, value: 37 },
    { year: 2024, value: 42 },
    { year: 2025, value: 50 },
  ]
  const lines = [
    { label: "Biên gộp", points: [38, 40, 41], cls: "g" },
    { label: "Biên LNST", points: [12, 13, 14], cls: "a" },
  ]

  it("renders an <svg> image", () => {
    const { getAllByRole } = render(<ComboBarLine bars={bars} lines={lines} />)
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
  })

  it("renders one bar per year and one polyline per line series", () => {
    const { container } = render(<ComboBarLine bars={bars} lines={lines} />)
    expect(container.querySelectorAll("rect[data-bar]").length).toBe(bars.length)
    expect(container.querySelectorAll("polyline[data-line]").length).toBe(lines.length)
  })

  it("renders a dot per line point", () => {
    const { container } = render(<ComboBarLine bars={bars} lines={lines} />)
    expect(container.querySelectorAll("circle[data-dot]").length).toBe(6)
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<ComboBarLine bars={bars} lines={lines} />)
    assertTokenized(container.innerHTML)
  })
})

describe("LineChart", () => {
  const series = [
    {
      label: "LNST",
      cls: "accent",
      points: [
        { x: 2021, y: 5 },
        { x: 2022, y: 6 },
        { x: 2023, y: 7 },
      ],
    },
    {
      label: "Tiền KD",
      cls: "g",
      points: [
        { x: 2021, y: 6 },
        { x: 2022, y: 7 },
        { x: 2023, y: 8 },
      ],
    },
  ]

  it("renders an <svg> image with one polyline per series", () => {
    const { getAllByRole, container } = render(<LineChart series={series} />)
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
    expect(container.querySelectorAll("polyline[data-line]").length).toBe(2)
  })

  it("renders a threshold line only when threshold is provided", () => {
    const { container: without } = render(<LineChart series={series} />)
    expect(without.querySelectorAll("line[data-threshold]").length).toBe(0)
    const { container: withT } = render(<LineChart series={series} threshold={0} />)
    expect(withT.querySelectorAll("line[data-threshold]").length).toBe(1)
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<LineChart series={series} threshold={6} />)
    assertTokenized(container.innerHTML)
  })
})

describe("PeerBar", () => {
  const rows = [
    { label: "FPT", value: 96, marker: "company" as const },
    { label: "Trung vị ngành", value: 85, marker: "median" as const },
    { label: "Ngưỡng", value: 50, marker: "threshold" as const },
  ]

  it("renders an <svg> image with one fill bar per row", () => {
    const { getAllByRole, container } = render(<PeerBar rows={rows} />)
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
    expect(container.querySelectorAll("rect[data-row-fill]").length).toBe(rows.length)
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<PeerBar rows={rows} />)
    assertTokenized(container.innerHTML)
  })
})

describe("Waterfall", () => {
  const steps = [
    { label: "LNST", value: 8990, kind: "total" as const },
    { label: "+ Khấu hao", value: 2180, kind: "add" as const },
    { label: "± Vốn lưu động", value: -580, kind: "subtract" as const },
    { label: "= Tiền từ KD", value: 10590, kind: "total" as const },
  ]

  it("renders an <svg> image with one bar per step", () => {
    const { getAllByRole, container } = render(<Waterfall steps={steps} />)
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
    expect(container.querySelectorAll("rect[data-step]").length).toBe(steps.length)
  })

  it("produces finite non-negative bar heights", () => {
    const { container } = render(<Waterfall steps={steps} />)
    container.querySelectorAll<SVGRectElement>("rect[data-step]").forEach((r) => {
      const h = Number(r.getAttribute("height"))
      expect(Number.isFinite(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
    })
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<Waterfall steps={steps} />)
    assertTokenized(container.innerHTML)
  })
})

describe("FootballField", () => {
  const methods = [
    { name: "DCF", bear: 108, base: 133, bull: 158 },
    { name: "RIM", bear: 114, base: 137, bull: 159 },
    { name: "P/E band", bear: 124, base: 141, bull: 158 },
  ]

  it("renders an <svg> image with one band per method + a current-price marker", () => {
    const { getAllByRole, container } = render(
      <FootballField methods={methods} currentPrice={135} />,
    )
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
    expect(container.querySelectorAll("rect[data-band]").length).toBe(methods.length)
    expect(container.querySelectorAll("line[data-current]").length).toBe(1)
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<FootballField methods={methods} currentPrice={135} />)
    assertTokenized(container.innerHTML)
  })
})

describe("RadarScorecard", () => {
  const dims = [
    { key: "kd", label: "Kinh doanh", score: 85, band: "good", value_label: "Tốt" },
    { key: "sl", label: "Sinh lời", score: 92, band: "good", value_label: "Xuất sắc" },
    { key: "dt", label: "Dòng tiền", score: 88, band: "good", value_label: "Tốt" },
    { key: "at", label: "An toàn tài chính", score: 95, band: "good", value_label: "Rất vững" },
    { key: "dg", label: "Định giá", score: 60, band: "warn", value_label: "Hợp lý" },
  ]

  it("renders an <svg> radar image", () => {
    const { getAllByRole } = render(<RadarScorecard dims={dims} score={4.4} />)
    expect(getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0)
  })

  it("renders one axis per dimension and a data polygon with one vertex per dimension", () => {
    const { container } = render(<RadarScorecard dims={dims} score={4.4} />)
    expect(container.querySelectorAll("line[data-axis]").length).toBe(dims.length)
    const radar = container.querySelector("polygon[data-radar]")
    expect(radar).not.toBeNull()
    const pts = (radar!.getAttribute("points") ?? "").trim().split(/\s+/)
    expect(pts.length).toBe(dims.length)
  })

  it("renders one bar row per dimension", () => {
    const { container } = render(<RadarScorecard dims={dims} score={4.4} />)
    expect(container.querySelectorAll("[data-dim]").length).toBe(dims.length)
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<RadarScorecard dims={dims} score={4.4} />)
    assertTokenized(container.innerHTML)
  })
})
