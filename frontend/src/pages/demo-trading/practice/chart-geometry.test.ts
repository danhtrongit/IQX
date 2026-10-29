import { describe, expect, it } from "vitest"

import { computeLayout, indexAtX, legendItems, lineName, lineRowId, lineStyles, windowIndices } from "./chart-geometry"
import type { PracticeChart, PracticeConfig, PracticePlot } from "./practice-api"
import { defaultConfig, legacyRsiConfig, makeChart, makeRun, rowsConfig, volumeConfig } from "./practice.fixtures"

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

describe("line keys", () => {
  it("a condition row names its lines <row id>.<line>", () => {
    expect(lineName("rsi.level.value")).toBe("value")
    expect(lineRowId("rsi.level.value")).toBe("rsi.level")
    expect(lineName("macd.signal.signal")).toBe("signal")
    expect(lineRowId("macd.signal.signal")).toBe("macd.signal")
    expect(lineRowId("ma_cross.cross.fast")).toBe("ma_cross.cross")
  })

  it("a plain key (Volume, a run locked before SPEC V3) is its own name and belongs to no row", () => {
    expect(lineName("threshold")).toBe("threshold")
    expect(lineRowId("threshold")).toBeNull()
    expect(lineRowId("value")).toBeNull()
  })
})

describe("computeLayout", () => {
  const layoutFor = (indicatorId: string, options: { test?: number; side?: "buy" | "sell"; config?: PracticeConfig } = {}) => {
    const test = options.test ?? 0
    const chart = makeChart({ indicatorId, test, config: options.config })
    const win = windowIndices({ firstSession: chart.first_session, revealed: test, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    return { chart, layout: computeLayout({ chart, side: options.side ?? "buy", start: win.start, end: win.end, width: 760, events: [] }) }
  }

  it("RSI: separate 0-100 pane with the threshold and the midline reference drawn differently", () => {
    const { layout } = layoutFor("rsi")
    expect(layout.hasIndicatorPane).toBe(true)
    expect(layout.indTicks.map((tick) => tick.label)).toEqual(["0", "50", "100"])
    expect(layout.levels.filter((level) => level.kind === "threshold").map((level) => level.label)).toEqual(["Ngưỡng 30"])
    expect(layout.levels.filter((level) => level.kind === "reference").map((level) => level.label)).toEqual(["Mốc 50"])
    expect(layout.indLines.map((line) => [line.key, line.rowId])).toEqual([["rsi.level.value", "rsi.level"]])
  })

  it("Stochastic: the fixed 20/80 guides are references, the executed threshold is its own line", () => {
    const { layout, chart } = layoutFor("stochastic")
    expect(chart.plot.buy.threshold_levels).toEqual([20])
    expect(layout.levels.filter((level) => level.kind === "threshold").map((level) => level.label)).toEqual(["Ngưỡng 20"])
    expect(layout.levels.filter((level) => level.kind === "reference").map((level) => level.label)).toEqual(["Mốc 20", "Mốc 80"])
    expect(layout.indLines.map((line) => line.key)).toEqual(["stochastic.level.value", "stochastic.kd_cross.signal"])
  })

  it("MACD: the signal row draws MACD and Signal and a zero line; the histogram row adds the bars", () => {
    const plain = layoutFor("macd").layout
    expect(plain.indBarKind).toBeNull()
    expect(plain.indLines.map((line) => line.key)).toEqual(["macd.signal.value", "macd.signal.signal"])
    expect(plain.levels.some((level) => level.kind === "zero")).toBe(true)
    const withHistogram = layoutFor("macd", {
      config: rowsConfig("macd", (config) => {
        config.buy.rules[2] = { ...config.buy.rules[2]!, enabled: true }
      }),
    })
    expect(withHistogram.chart.plot.buy.histogram_key).toBe("macd.hist.histogram")
    expect(withHistogram.layout.indBarKind).toBe("histogram")
    expect(withHistogram.layout.indBars.length).toBeGreaterThan(10)
    // The histogram is not a line.
    expect(withHistogram.layout.indLines.map((line) => line.key)).toEqual(["macd.signal.value", "macd.signal.signal"])
  })

  it("Bollinger and SMA are overlays on the price pane; there is no indicator pane", () => {
    const bollinger = layoutFor("bollinger").layout
    expect(bollinger.hasIndicatorPane).toBe(false)
    expect(bollinger.priceLines.map((line) => line.key)).toEqual(["bollinger.price_action.upper", "bollinger.price_action.middle", "bollinger.price_action.lower"])
    expect(bollinger.priceLines.find((line) => lineName(line.key) === "middle")?.dash).not.toBeNull()
    expect(layoutFor("ma").layout.priceLines.map((line) => line.key)).toEqual(["ma.price_cross.value"])
  })

  it("Volume: volume bars from zero and the threshold line, under plain keys", () => {
    const { layout } = layoutFor("volume")
    expect(layout.indBarKind).toBe("volume")
    expect(layout.indLines.map((line) => [line.key, line.rowId])).toEqual([["threshold", null]])
    expect(layout.indTicks[0]?.label).toBeDefined()
  })

  it("a run locked before SPEC V3 keeps drawing its plain keys", () => {
    const { layout } = layoutFor("rsi", { config: legacyRsiConfig() })
    expect(layout.indLines.map((line) => [line.key, line.rowId])).toEqual([["value", null]])
    expect(layout.levels.filter((level) => level.kind === "threshold").map((level) => level.label)).toEqual(["Ngưỡng 30"])
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

  it("an overlay row line cannot leak a future value through the price scale either", () => {
    const chart = makeChart({ indicatorId: "ma", test: 504 })
    const key = chart.plot.buy.lines[0]!.key
    chart.series.buy[key]![chart.bars.close.length - 1] = 9_999_999
    const win = windowIndices({ firstSession: chart.first_session, revealed: 100, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    const layout = computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: [] })
    expect(layout.priceTicks.every((tick) => !tick.label.includes("tỷ") && !tick.label.includes("tr"))).toBe(true)
  })

  it("the indicator pane scale and lines come from the window only: a later spike in a row line or in the histogram changes nothing", () => {
    const macdOn = rowsConfig("macd", (config) => {
      config.buy.rules[2] = { ...config.buy.rules[2]!, enabled: true }
    })
    for (const [indicatorId, config] of [["cci", undefined], ["obv", undefined], ["macd", macdOn]] as const) {
      const chart = makeChart({ indicatorId, test: 504, config })
      const last = chart.bars.close.length - 1
      const win = windowIndices({ firstSession: chart.first_session, revealed: 100, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
      const draw = () => computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: [] })
      const before = draw()
      for (const column of Object.values(chart.series.buy)) column[last] = 9_999_999
      const after = draw()
      expect(after.indTicks, indicatorId).toEqual(before.indTicks)
      expect(after.indLines.map((line) => line.d), indicatorId).toEqual(before.indLines.map((line) => line.d))
      expect(after.indBars, indicatorId).toEqual(before.indBars)
      expect(before.indLines.length, indicatorId).toBeGreaterThan(0)
    }
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

describe("one line per row (SPEC V3)", () => {
  const withRsiTrendPeriod = (period: number) =>
    rowsConfig("rsi", (config) => {
      config.buy.rules[1] = { ...config.buy.rules[1]!, period }
    })
  const layoutOf = (config: PracticeConfig, side: "buy" | "sell" = "buy") => {
    const chart = makeChart({ indicatorId: "rsi", config })
    const win = windowIndices({ firstSession: chart.first_session, revealed: 0, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    return { chart, layout: computeLayout({ chart, side, start: win.start, end: win.end, width: 760, events: [] }) }
  }

  it("two rows with their own periods draw two RSI lines, each keyed by its row, in different colours", () => {
    const { chart, layout } = layoutOf(withRsiTrendPeriod(9))
    expect(chart.plot.buy.lines).toEqual([
      { key: "rsi.level.value", label: "RSI 14" },
      { key: "rsi.trend.value", label: "RSI 9" },
    ])
    expect(layout.indLines.map((line) => [line.key, line.rowId, line.label])).toEqual([
      ["rsi.level.value", "rsi.level", "RSI 14"],
      ["rsi.trend.value", "rsi.trend", "RSI 9"],
    ])
    expect(new Set(layout.indLines.map((line) => line.color)).size).toBe(2)
    expect(layout.indLines.every((line) => line.d.startsWith("M"))).toBe(true)
    expect(layout.indLines[0]!.d).not.toBe(layout.indLines[1]!.d)
  })

  it("two rows that need the same line draw it once (the first row keeps it)", () => {
    const { chart } = layoutOf(withRsiTrendPeriod(14))
    expect(chart.plot.buy.lines.map((line) => line.key)).toEqual(["rsi.level.value"])
  })

  it("only the rows that are ON draw: a row switched off takes its line and its threshold with it", () => {
    const config = rowsConfig("rsi", (value) => {
      value.buy.rules[0] = { ...value.buy.rules[0]!, enabled: false }
      value.buy.rules[1] = { ...value.buy.rules[1]!, period: 9 }
    })
    const { chart } = layoutOf(config)
    expect(chart.plot.buy.lines.map((line) => line.key)).toEqual(["rsi.trend.value"])
    expect(chart.plot.buy.threshold_levels).toEqual([])
    const none = rowsConfig("rsi", (value) => {
      value.buy.rules = value.buy.rules.map((row) => ({ ...row, enabled: false }))
    })
    const empty = layoutOf(none).layout
    expect(empty.indLines).toEqual([])
    expect(empty.hasIndicatorPane).toBe(true)
  })

  it("each side draws its own rows: Bán is not Mua", () => {
    const config = rowsConfig("rsi", (value) => {
      value.sell.rules[0] = { ...value.sell.rules[0]!, period: 21 }
    })
    const buy = layoutOf(config, "buy")
    const sell = layoutOf(config, "sell")
    expect(buy.chart.plot.buy.lines.map((line) => line.label)).toEqual(["RSI 14"])
    // Bán has its own two rows: the first one now reads RSI 21, the second one still RSI 14.
    expect(sell.chart.plot.sell.lines.map((line) => line.label)).toEqual(["RSI 21", "RSI 14"])
    expect(sell.layout.indLines[0]!.d).not.toBe(buy.layout.indLines[0]!.d)
    expect(sell.chart.plot.sell.threshold_levels).toEqual([70])
  })

  it("a side with a MACD row and a histogram row draws both, the bars on the histogram key", () => {
    const config = rowsConfig("macd", (value) => {
      value.buy.rules[0] = { ...value.buy.rules[0]!, enabled: true }
      value.buy.rules[2] = { ...value.buy.rules[2]!, enabled: true, fast: 8, slow: 21, signal: 5 }
    })
    const chart = makeChart({ indicatorId: "macd", config })
    expect(chart.plot.buy.histogram_key).toBe("macd.hist.histogram")
    expect(chart.series.buy["macd.hist.histogram"]).toBeDefined()
    expect(chart.plot.buy.lines.map((line) => line.key)).toEqual(["macd.signal.value", "macd.signal.signal"])
  })

  it("all 15 indicators draw lines keyed by the row that introduced them", () => {
    for (const id of ["rsi", "macd", "ma", "bollinger", "ema", "ma_cross", "dmi", "stochastic", "cci", "obv", "mfi", "cmf", "donchian", "roc", "williams_r"]) {
      const chart = makeChart({ indicatorId: id, config: defaultConfig(id) })
      for (const side of ["buy", "sell"] as const) {
        expect(chart.plot[side].lines.length, `${id} ${side}`).toBeGreaterThan(0)
        for (const line of chart.plot[side].lines) {
          expect(lineRowId(line.key), line.key).not.toBeNull()
          expect(chart.series[side][line.key], line.key).toBeDefined()
        }
      }
    }
  })
})

describe("colours", () => {
  it("lines without a look of their own take the next colour, in the order the side lists them", () => {
    const styles = lineStyles([{ key: "a.value" }, { key: "b.value" }, { key: "c.value" }])
    expect([...styles.values()].map((style) => style.color)).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-6)"])
  })

  it("never uses the price-up / price-down colours (chart-3, chart-4) for an indicator line", () => {
    const keys = Array.from({ length: 12 }, (_, index) => ({ key: `row${index}.value` }))
    const colors = [...lineStyles(keys).values()].map((style) => style.color)
    expect(colors).not.toContain("var(--chart-3)")
    expect(colors).not.toContain("var(--chart-4)")
    expect(new Set(colors.slice(0, 6)).size).toBe(6)
  })

  it("guide lines and the +DI / −DI pair keep their own look wherever they sit", () => {
    const styles = lineStyles([{ key: "x.value" }, { key: "bollinger.price_action.middle" }, { key: "dmi.di.plus" }, { key: "dmi.di.minus" }, { key: "threshold" }])
    expect(styles.get("x.value")?.color).toBe("var(--chart-1)")
    expect(styles.get("bollinger.price_action.middle")).toEqual({ color: "var(--muted-foreground)", dash: "4 3" })
    expect(styles.get("dmi.di.plus")).toEqual({ color: "var(--price-up)", dash: null })
    expect(styles.get("dmi.di.minus")).toEqual({ color: "var(--price-down)", dash: null })
    expect(styles.get("threshold")?.dash).toBe("4 3")
  })

  it("DMI rows: +DI green and −DI red", () => {
    const chart = makeChart({ indicatorId: "dmi", config: defaultConfig("dmi") })
    const win = windowIndices({ firstSession: chart.first_session, revealed: 0, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    const layout = computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: [] })
    expect(layout.indLines.map((line) => [line.key, line.color])).toEqual([
      ["dmi.di.plus", "var(--price-up)"],
      ["dmi.di.minus", "var(--price-down)"],
    ])
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
    const layout = layoutOf(plot({ lines: [{ key: "williams_r.cross.value", label: "Williams %R" }], bounds: [-100, 0], threshold_levels: [-80] }), { "williams_r.cross.value": wave(-40).map((v) => v - 50) })
    expect(layout.indTicks.map((tick) => tick.label)).toEqual(["-100", "-50", "0"])
    expect(layout.levels.map((level) => level.label)).toEqual(["Ngưỡng -80"])
  })

  it("CCI/ROC/CMF: zero line and the threshold in use stay in view even if the series is smaller", () => {
    const layout = layoutOf(plot({ lines: [{ key: "cci.cross.value", label: "CCI" }], zero_line: true, threshold_levels: [100] }), { "cci.cross.value": wave(60) })
    expect(layout.levels.filter((level) => level.kind === "zero")).toHaveLength(1)
    expect(layout.levels.find((level) => level.kind === "threshold")?.label).toBe("Ngưỡng 100")
    const threshold = layout.levels.find((level) => level.kind === "threshold")!
    expect(threshold.y).toBeGreaterThanOrEqual(layout.indTop)
    expect(threshold.y).toBeLessThanOrEqual(layout.indBottom)
  })

  it("OBV: the line and its SMA baseline share an unbounded scale", () => {
    const layout = layoutOf(plot({ lines: [{ key: "obv.sma.value", label: "OBV" }, { key: "obv.sma.baseline", label: "SMA 20" }] }), { "obv.sma.value": wave(5_000_000), "obv.sma.baseline": wave(3_000_000, 0.4) })
    expect(layout.indLines.map((line) => line.key)).toEqual(["obv.sma.value", "obv.sma.baseline"])
    expect(layout.indTicks.length).toBeGreaterThan(1)
  })

  it("MA Cross and Donchian: two overlay lines on the price scale", () => {
    const prices = base.bars.close
    const layout = layoutOf(plot({ overlay: true, lines: [{ key: "ma_cross.cross.fast", label: "SMA 10" }, { key: "ma_cross.cross.slow", label: "SMA 30" }] }), {
      "ma_cross.cross.fast": prices.map((value) => value + 300),
      "ma_cross.cross.slow": prices.map((value) => value - 300),
    })
    expect(layout.hasIndicatorPane).toBe(false)
    expect(layout.priceLines.map((line) => line.key)).toEqual(["ma_cross.cross.fast", "ma_cross.cross.slow"])
  })
})

describe("legend", () => {
  it("names the plotted lines of the side with their own values, row by row", () => {
    const config = rowsConfig("rsi", (value) => {
      value.buy.rules[1] = { ...value.buy.rules[1]!, period: 9 }
      value.sell.rules[0] = { ...value.sell.rules[0]!, period: 21 }
      value.sell.rules[1] = { ...value.sell.rules[1]!, period: 21 }
    })
    const chart = makeChart({ indicatorId: "rsi", config })
    expect(legendItems(chart.plot.buy).map((item) => item.label)).toEqual(["RSI 14", "RSI 9"])
    expect(legendItems(chart.plot.sell).map((item) => item.label)).toEqual(["RSI 21"])
  })

  it("uses the colours the lines are drawn with", () => {
    const config = rowsConfig("rsi", (value) => {
      value.buy.rules[1] = { ...value.buy.rules[1]!, period: 9 }
    })
    const chart = makeChart({ indicatorId: "rsi", config })
    const win = windowIndices({ firstSession: chart.first_session, revealed: 0, windowBars: 130, panEnd: null, barCount: chart.bars.close.length })
    const layout = computeLayout({ chart, side: "buy", start: win.start, end: win.end, width: 760, events: [] })
    expect(legendItems(chart.plot.buy).map((item) => item.color)).toEqual(layout.indLines.map((line) => line.color))
  })

  it("adds the histogram and the volume after the lines", () => {
    const macdConfig = rowsConfig("macd", (value) => {
      value.buy.rules[2] = { ...value.buy.rules[2]!, enabled: true }
    })
    expect(legendItems(makeChart({ indicatorId: "macd", config: macdConfig }).plot.buy).map((item) => item.label)).toEqual(["MACD 12/26", "Signal 9", "Histogram"])
    expect(legendItems(makeChart({ indicatorId: "volume", config: volumeConfig() }).plot.buy).map((item) => item.label)).toEqual(["1 × TB 20", "Khối lượng"])
  })
})
