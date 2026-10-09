import { describe, expect, it } from "vitest"

import { computeLayout, indexAtX, legendItems, windowIndices } from "./chart-geometry"
import type { PracticeChart, PracticePlot } from "./practice-api"
import { makeChart, makeRun } from "./practice.fixtures"

describe("windowIndices", () => {
  it("never reaches past the revealed session", () => {
    const chart = makeChart({ test: 504 })
    const win = windowIndices({ firstSession: chart.first_session, revealed: 40, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    expect(chart.first_session + win.end).toBe(40)
    expect(win.start).toBe(Math.max(0, win.end - 129))
    const panned = windowIndices({ firstSession: chart.first_session, revealed: 40, windowBars: 130, panEnd: 500, barCount: chart.bars.close.length })
    expect(chart.first_session + panned.end).toBe(40)
  })

  it("before start only the observation window exists and the slider has nowhere to go", () => {
    const chart = makeChart({ observation: 125, test: 0 })
    const win = windowIndices({ firstSession: chart.first_session, revealed: 0, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    expect(chart.first_session + win.end).toBe(0)
    expect(win.minEnd).toBe(win.maxEnd)
  })

  it("panning back is bounded by one full window", () => {
    const chart = makeChart({ test: 504 })
    const win = windowIndices({ firstSession: chart.first_session, revealed: 300, windowBars: 130, panEnd: -500, barCount: chart.bars.close.length })
    expect(win.end).toBe(win.minEnd)
    expect(win.start).toBe(0)
  })
})

describe("computeLayout", () => {
  const layoutFor = (indicatorId: string, test = 0, side: "buy" | "sell" = "buy") => {
    const chart = makeChart({ indicatorId, test })
    const win = windowIndices({ firstSession: chart.first_session, revealed: test, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    return { chart, layout: computeLayout({ chart, side, start: win.start, end: win.end, width: 760, events: [] }) }
  }

  it("RSI: separate 0-100 pane with the threshold and the midline reference drawn differently", () => {
    const { layout } = layoutFor("rsi")
    expect(layout.hasIndicatorPane).toBe(true)
    expect(layout.indTicks.map((tick) => tick.label)).toEqual(["0", "50", "100"])
    expect(layout.levels.filter((level) => level.kind === "threshold").map((level) => level.label)).toEqual(["Ngưỡng 30"])
    expect(layout.levels.filter((level) => level.kind === "reference").map((level) => level.label)).toEqual(["Mốc 50"])
    expect(layout.indLines.map((line) => line.key)).toEqual(["value"])
  })

  it("Stochastic: the fixed 20/80 guides are references, the executed threshold is its own line", () => {
    const { layout, chart } = layoutFor("stochastic")
    expect(chart.plot.buy.threshold_levels).toEqual([25])
    expect(layout.levels.filter((level) => level.kind === "threshold").map((level) => level.label)).toEqual(["Ngưỡng 25"])
    expect(layout.levels.filter((level) => level.kind === "reference").map((level) => level.label)).toEqual(["Mốc 20", "Mốc 80"])
  })

  it("MACD: histogram bars, MACD and signal lines and a zero line", () => {
    const { layout } = layoutFor("macd")
    expect(layout.indBarKind).toBe("histogram")
    expect(layout.indBars.length).toBeGreaterThan(10)
    expect(layout.indLines.map((line) => line.key)).toEqual(["value", "signal"])
    expect(layout.levels.some((level) => level.kind === "zero")).toBe(true)
  })

  it("Bollinger and SMA are overlays on the price pane; there is no indicator pane", () => {
    const bollinger = layoutFor("bollinger").layout
    expect(bollinger.hasIndicatorPane).toBe(false)
    expect(bollinger.priceLines.map((line) => line.key)).toEqual(["upper", "middle", "lower"])
    expect(bollinger.priceLines.find((line) => line.key === "middle")?.dash).not.toBeNull()
    expect(layoutFor("ma").layout.priceLines.map((line) => line.key)).toEqual(["value"])
  })

  it("Volume: volume bars from zero and the threshold line", () => {
    const { layout } = layoutFor("volume")
    expect(layout.indBarKind).toBe("volume")
    expect(layout.indLines.map((line) => line.key)).toEqual(["threshold"])
    expect(layout.indTicks[0]?.label).toBeDefined()
  })

  it("x labels are sessions only, never dates", () => {
    const { layout } = layoutFor("rsi")
    expect(layout.xTicks.length).toBe(5)
    for (const tick of layout.xTicks) expect(tick.label).toMatch(/^Phiên -?\d+$/)
    expect(layout.xTicks.at(-1)?.label).toBe("Phiên 0")
  })

  it("the price scale comes from the window only, so a future spike cannot leak through autoscale", () => {
    const chart = makeChart({ test: 504 })
    chart.bars.high[chart.bars.high.length - 1] = 9_999_999
    const win = windowIndices({ firstSession: chart.first_session, revealed: 100, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    const layout = computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: [] })
    expect(layout.priceTicks.every((tick) => !tick.label.includes("tỷ") && !tick.label.includes("tr"))).toBe(true)
  })

  it("places M/B markers with their trade numbers only inside the window", () => {
    const run = makeRun()
    const chart = run.chart!
    const events = run.result!.events
    const win = windowIndices({ firstSession: chart.first_session, revealed: 60, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    const layout = computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: events.filter((event) => event.session <= 60) })
    expect(layout.markers.map((marker) => `${marker.side}-${marker.ordinal}`)).toEqual(["buy-1", "sell-1"])
  })

  it("maps an x coordinate back to a bar of the window", () => {
    const { layout } = layoutFor("rsi")
    expect(indexAtX(layout, layout.x0 - 50)).toBe(layout.start)
    expect(indexAtX(layout, layout.x1 + 50)).toBe(layout.end)
  })
})

describe("computeLayout for the remaining plot specs (backend plot spec drives the panel)", () => {
  const base = makeChart({ indicatorId: "rsi", test: 0 })
  const count = base.bars.close.length
  const wave = (amplitude: number, shift = 0) => Array.from({ length: count }, (_, i) => Math.round(Math.sin(i / 9 + shift) * amplitude * 100) / 100)
  const plot = (overrides: Partial<PracticePlot>): PracticePlot => ({
    overlay: false,
    lines: [],
    histogram_key: null,
    volume_key: null,
    zero_line: false,
    nonnegative: false,
    bounds: null,
    threshold_levels: [],
    reference_levels: [],
    ...overrides,
  })
  const layoutOf = (spec: PracticePlot, series: Record<string, Array<number | null>>) => {
    const chart: PracticeChart = { ...base, plot: { buy: spec, sell: spec }, series: { buy: series, sell: series } }
    const win = windowIndices({ firstSession: chart.first_session, revealed: 0, windowBars: 130, panEnd: null, barCount: count })
    return computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: [] })
  }

  it("Williams %R is drawn on −100..0 with its threshold inside", () => {
    const layout = layoutOf(plot({ lines: [{ key: "value", label: "Williams %R" }], bounds: [-100, 0], threshold_levels: [-80] }), { value: wave(-40).map((v) => v - 50) })
    expect(layout.indTicks.map((tick) => tick.label)).toEqual(["-100", "-50", "0"])
    expect(layout.levels.map((level) => level.label)).toEqual(["Ngưỡng -80"])
  })

  it("CCI/ROC/CMF: zero line and the threshold in use stay in view even if the series is smaller", () => {
    const layout = layoutOf(plot({ lines: [{ key: "value", label: "CCI" }], zero_line: true, threshold_levels: [100] }), { value: wave(60) })
    expect(layout.levels.filter((level) => level.kind === "zero")).toHaveLength(1)
    expect(layout.levels.find((level) => level.kind === "threshold")?.label).toBe("Ngưỡng 100")
    const threshold = layout.levels.find((level) => level.kind === "threshold")!
    expect(threshold.y).toBeGreaterThanOrEqual(layout.indTop)
    expect(threshold.y).toBeLessThanOrEqual(layout.indBottom)
  })

  it("DMI: +DI green and −DI red on a non-negative scale", () => {
    const layout = layoutOf(plot({ lines: [{ key: "plus", label: "+DI" }, { key: "minus", label: "−DI" }], nonnegative: true }), { plus: wave(10).map((v) => v + 20), minus: wave(8, 2).map((v) => v + 18) })
    expect(layout.indLines.map((line) => [line.key, line.color])).toEqual([
      ["plus", "var(--price-up)"],
      ["minus", "var(--price-down)"],
    ])
    expect(layout.indTicks.some((tick) => tick.label === "0")).toBe(true)
  })

  it("OBV: the line and its SMA baseline share an unbounded scale", () => {
    const layout = layoutOf(plot({ lines: [{ key: "value", label: "OBV" }, { key: "baseline", label: "SMA 20" }] }), { value: wave(5_000_000), baseline: wave(3_000_000, 0.4) })
    expect(layout.indLines.map((line) => line.key)).toEqual(["value", "baseline"])
    expect(layout.indTicks.length).toBeGreaterThan(1)
  })

  it("MA Cross and Donchian: two overlay lines on the price scale", () => {
    const prices = base.bars.close
    const layout = layoutOf(plot({ overlay: true, lines: [{ key: "fast", label: "SMA 10" }, { key: "slow", label: "SMA 30" }] }), { fast: prices.map((value) => value + 300), slow: prices.map((value) => value - 300) })
    expect(layout.hasIndicatorPane).toBe(false)
    expect(layout.priceLines.map((line) => line.key)).toEqual(["fast", "slow"])
  })
})

describe("legend", () => {
  it("names the plotted lines of the side with their own params", () => {
    const chart = makeChart({ indicatorId: "rsi", params: { buy: { period: 10, level: 30 }, sell: { period: 21, level: 70 } } })
    expect(legendItems(chart.plot.buy).map((item) => item.label)).toEqual(["RSI 10"])
    expect(legendItems(chart.plot.sell).map((item) => item.label)).toEqual(["RSI 21"])
  })
})
