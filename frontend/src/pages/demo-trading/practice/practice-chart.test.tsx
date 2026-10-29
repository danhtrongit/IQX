import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PracticeChartView } from "./practice-chart"
import type { PracticeConfig } from "./practice-api"
import { defaultConfig, legacyRsiConfig, makeChart, makeRun, rowsConfig, volumeConfig } from "./practice.fixtures"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})

const renderChart = (indicatorId: string, side: "buy" | "sell" = "buy", config?: PracticeConfig) => {
  const chart = makeChart({ indicatorId, test: 0, config: config ?? defaultConfig(indicatorId) })
  return render(<PracticeChartView chart={chart} side={side} revealed={0} windowBars={130} panEnd={null} events={[]} paneTitle={indicatorId.toUpperCase()} />)
}

const seriesOf = (root: Element) => [...root.querySelectorAll("path[data-series]")].map((node) => node.getAttribute("data-series"))

describe("PracticeChartView panels per indicator", () => {
  it("RSI: price pane + a 0-100 indicator pane with its row line, threshold and reference level", () => {
    renderChart("rsi")
    const chart = screen.getByTestId("practice-chart")
    expect(within(chart).getByTestId("chart-pane-price")).toBeTruthy()
    const pane = within(chart).getByTestId("chart-pane-indicator")
    const line = pane.querySelector('path[data-series="rsi.level.value"]')
    expect(line?.getAttribute("d")).toMatch(/^M/)
    expect(line?.getAttribute("data-row")).toBe("rsi.level")
    expect(pane.querySelector('[data-level="threshold"]')).not.toBeNull()
    expect(pane.querySelector('[data-level="reference"]')).not.toBeNull()
    expect(pane.textContent).toContain("Ngưỡng 30")
    expect(pane.textContent).toContain("Mốc 50")
    expect(pane.textContent).toContain("RSI")
  })

  it("MACD: MACD and signal lines of the signal row, and the bars only when the histogram row is on", () => {
    const { unmount } = renderChart("macd")
    let pane = screen.getByTestId("chart-pane-indicator")
    expect(pane.querySelector('path[data-series="macd.signal.value"]')?.getAttribute("data-row")).toBe("macd.signal")
    expect(pane.querySelector('path[data-series="macd.signal.signal"]')?.getAttribute("data-row")).toBe("macd.signal")
    expect(pane.querySelectorAll('rect[data-bar="histogram"]')).toHaveLength(0)
    unmount()
    renderChart(
      "macd",
      "buy",
      rowsConfig("macd", (config) => {
        config.buy.rules[2] = { ...config.buy.rules[2]!, enabled: true }
      }),
    )
    pane = screen.getByTestId("chart-pane-indicator")
    expect(pane.querySelectorAll('rect[data-bar="histogram"]').length).toBeGreaterThan(10)
    expect(seriesOf(pane)).toEqual(["macd.signal.value", "macd.signal.signal"])
  })

  it("Bollinger: three overlay lines of its row on the price pane and no extra indicator pane", () => {
    renderChart("bollinger")
    const price = screen.getByTestId("chart-pane-price")
    for (const key of ["upper", "middle", "lower"]) {
      const line = price.querySelector(`path[data-series="bollinger.price_action.${key}"]`)
      expect(line, key).not.toBeNull()
      expect(line?.getAttribute("data-row")).toBe("bollinger.price_action")
    }
    expect(screen.queryByTestId("chart-pane-indicator")).toBeNull()
  })

  it("MA Cross: two overlay lines on the price pane, one per moving average", () => {
    renderChart("ma_cross")
    expect(seriesOf(screen.getByTestId("chart-pane-price"))).toEqual(["ma_cross.cross.fast", "ma_cross.cross.slow"])
    expect(screen.queryByTestId("chart-pane-indicator")).toBeNull()
  })

  it("Volume keeps its plain keys: volume bars and the threshold line, belonging to no condition row", () => {
    renderChart("volume", "buy", volumeConfig())
    const pane = screen.getByTestId("chart-pane-indicator")
    expect(pane.querySelectorAll('rect[data-bar="volume"]').length).toBeGreaterThan(10)
    const line = pane.querySelector('path[data-series="threshold"]')
    expect(line).not.toBeNull()
    expect(line?.hasAttribute("data-row")).toBe(false)
  })

  it("a run locked before SPEC V3 is drawn with its plain keys", () => {
    renderChart("rsi", "buy", legacyRsiConfig())
    const pane = screen.getByTestId("chart-pane-indicator")
    const line = pane.querySelector('path[data-series="value"]')
    expect(line?.getAttribute("d")).toMatch(/^M/)
    expect(line?.hasAttribute("data-row")).toBe(false)
    expect(pane.textContent).toContain("Ngưỡng 30")
  })

  it("shows the rows of the side shown: Bán draws its own series and labels", () => {
    const config = rowsConfig("rsi", (value) => {
      value.buy.rules[0] = { ...value.buy.rules[0]!, period: 10 }
      value.sell.rules[0] = { ...value.sell.rules[0]!, period: 21 }
    })
    const chart = makeChart({ indicatorId: "rsi", test: 0, config })
    const { rerender } = render(<PracticeChartView chart={chart} side="buy" revealed={0} windowBars={130} panEnd={null} events={[]} paneTitle="RSI" />)
    const buyPath = screen.getByTestId("chart-pane-indicator").querySelector('path[data-series="rsi.level.value"]')?.getAttribute("d")
    expect(screen.getByTestId("chart-pane-indicator").textContent).toContain("Ngưỡng 30")
    rerender(<PracticeChartView chart={chart} side="sell" revealed={0} windowBars={130} panEnd={null} events={[]} paneTitle="RSI" />)
    const sellPath = screen.getByTestId("chart-pane-indicator").querySelector('path[data-series="rsi.level.value"]')?.getAttribute("d")
    expect(sellPath).not.toBe(buyPath)
    expect(screen.getByTestId("chart-pane-indicator").textContent).toContain("Ngưỡng 70")
  })
})

describe("PracticeChartView overlays keyed by row", () => {
  const twoPeriods = rowsConfig("rsi", (config) => {
    config.buy.rules[1] = { ...config.buy.rules[1]!, period: 9 }
  })

  it("two rows with their own RSI periods draw two lines, each tagged with its row, in different colours", () => {
    renderChart("rsi", "buy", twoPeriods)
    const pane = screen.getByTestId("chart-pane-indicator")
    const level = pane.querySelector('path[data-series="rsi.level.value"]')
    const trend = pane.querySelector('path[data-series="rsi.trend.value"]')
    expect(level?.getAttribute("data-row")).toBe("rsi.level")
    expect(trend?.getAttribute("data-row")).toBe("rsi.trend")
    expect(level?.getAttribute("d")).not.toBe(trend?.getAttribute("d"))
    expect(level?.getAttribute("style")).not.toBe(trend?.getAttribute("style"))
  })

  it("a row switched off draws nothing", () => {
    const config = rowsConfig("rsi", (value) => {
      value.buy.rules[0] = { ...value.buy.rules[0]!, enabled: false }
      value.buy.rules[1] = { ...value.buy.rules[1]!, period: 9 }
    })
    renderChart("rsi", "buy", config)
    expect(seriesOf(screen.getByTestId("chart-pane-indicator"))).toEqual(["rsi.trend.value"])
  })

  it("two rows that need the very same line draw it once", () => {
    renderChart("rsi")
    expect(seriesOf(screen.getByTestId("chart-pane-indicator"))).toEqual(["rsi.level.value"])
  })

  it("the tooltip names each line of the side once, with the value at the hovered session", () => {
    renderChart("rsi", "buy", twoPeriods)
    const group = screen.getByRole("group", { name: /Biểu đồ nến/ })
    group.focus()
    fireEvent.keyDown(group, { key: "ArrowLeft" })
    const tooltip = screen.getByTestId("practice-chart-tooltip")
    expect(within(tooltip).getAllByText("RSI 14")).toHaveLength(1)
    expect(within(tooltip).getAllByText("RSI 9")).toHaveLength(1)
  })
})

describe("PracticeChartView content", () => {
  it("labels the x axis with sessions only and never with a date", () => {
    renderChart("rsi")
    const labels = [...screen.getByTestId("practice-chart").querySelectorAll('[data-axis="session"]')].map((node) => node.textContent ?? "")
    expect(labels.length).toBeGreaterThanOrEqual(3)
    for (const label of labels) expect(label).toMatch(/^Phiên -?\d+$/)
    expect(screen.getByTestId("practice-chart").textContent).not.toMatch(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\b20\d{2}\b/)
  })

  it("draws only up to the revealed session even when the payload holds the whole run", () => {
    const run = makeRun()
    const chart = run.chart!
    const at = (revealed: number) => {
      const view = render(<PracticeChartView chart={chart} side="buy" revealed={revealed} windowBars={130} panEnd={null} events={run.result!.events} paneTitle="RSI" />)
      const labels = [...view.container.querySelectorAll('[data-axis="session"]')].map((node) => node.textContent)
      view.unmount()
      return labels
    }
    expect(at(0).at(-1)).toBe("Phiên 0")
    expect(at(30).at(-1)).toBe("Phiên 30")
  })

  it("never lets a later bar reach the line or the tooltip of an earlier session", () => {
    const run = makeRun()
    const chart = structuredClone(run.chart!)
    // A spike on the last bar of the run, long after the session being viewed.
    const last = chart.bars.close.length - 1
    chart.bars.close[last] = 9_999_999
    chart.series.buy["rsi.level.value"]![last] = 99.99
    render(<PracticeChartView chart={chart} side="buy" revealed={10} windowBars={130} panEnd={null} events={[]} paneTitle="RSI" />)
    const line = screen.getByTestId("chart-pane-indicator").querySelector('path[data-series="rsi.level.value"]')
    expect(line?.getAttribute("d")).not.toContain("NaN")
    const group = screen.getByRole("group", { name: /Biểu đồ nến/ })
    group.focus()
    fireEvent.keyDown(group, { key: "ArrowRight" })
    fireEvent.keyDown(group, { key: "ArrowRight" })
    const tooltip = screen.getByTestId("practice-chart-tooltip")
    expect(tooltip.textContent).toMatch(/Phiên 10/)
    expect(tooltip.textContent).not.toContain("9.999.999")
    expect(tooltip.textContent).not.toContain("99,99")
  })

  it("shows M/B arrows with trade numbers for the revealed trades and reports the click", async () => {
    const run = makeRun()
    const onMarker = vi.fn()
    render(<PracticeChartView chart={run.chart!} side="buy" revealed={60} windowBars={130} panEnd={null} events={run.result!.events} paneTitle="RSI" onMarkerSelect={onMarker} />)
    const buy = screen.getByRole("button", { name: /Giao dịch 1: Mua tại Phiên 20/ })
    expect(buy.textContent).toBe("M1")
    expect(screen.getByRole("button", { name: /Giao dịch 1: Bán tại Phiên 45/ }).textContent).toBe("B1")
    expect(screen.queryByRole("button", { name: /Giao dịch 2/ })).toBeNull()
    await userEvent.setup().click(buy)
    expect(onMarker).toHaveBeenCalledWith(1, 20)
  })

  it("keyboard arrows move a crosshair and announce the session OHLC", () => {
    renderChart("rsi")
    const group = screen.getByRole("group", { name: /Biểu đồ nến/ })
    group.focus()
    fireEvent.keyDown(group, { key: "ArrowLeft" })
    const tooltip = screen.getByTestId("practice-chart-tooltip")
    expect(tooltip.textContent).toMatch(/Phiên -1/)
    expect(tooltip.textContent).toContain("Đóng cửa")
    expect(tooltip.textContent).toContain("RSI 14")
  })
})
