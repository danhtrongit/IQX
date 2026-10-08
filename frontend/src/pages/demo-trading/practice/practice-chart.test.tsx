import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PracticeChartView } from "./practice-chart"
import { makeChart, makeRun } from "./practice.fixtures"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})

const renderChart = (indicatorId: string, side: "buy" | "sell" = "buy") => {
  const chart = makeChart({ indicatorId, test: 0 })
  return render(<PracticeChartView chart={chart} side={side} revealed={0} windowBars={130} panEnd={null} events={[]} paneTitle={indicatorId.toUpperCase()} />)
}

describe("PracticeChartView panels per indicator", () => {
  it("RSI: price pane + a 0-100 indicator pane with its line, threshold and reference level", () => {
    renderChart("rsi")
    const chart = screen.getByTestId("practice-chart")
    expect(within(chart).getByTestId("chart-pane-price")).toBeTruthy()
    const pane = within(chart).getByTestId("chart-pane-indicator")
    expect(pane.querySelector('path[data-series="value"]')?.getAttribute("d")).toMatch(/^M/)
    expect(pane.querySelector('[data-level="threshold"]')).not.toBeNull()
    expect(pane.querySelector('[data-level="reference"]')).not.toBeNull()
    expect(pane.textContent).toContain("Ngưỡng 30")
    expect(pane.textContent).toContain("Mốc 50")
    expect(pane.textContent).toContain("RSI")
  })

  it("MACD: MACD and signal lines with histogram bars", () => {
    renderChart("macd")
    const pane = screen.getByTestId("chart-pane-indicator")
    expect(pane.querySelector('path[data-series="value"]')).not.toBeNull()
    expect(pane.querySelector('path[data-series="signal"]')).not.toBeNull()
    expect(pane.querySelectorAll('rect[data-bar="histogram"]').length).toBeGreaterThan(10)
  })

  it("Bollinger: three overlay lines on the price pane and no extra indicator pane", () => {
    renderChart("bollinger")
    const price = screen.getByTestId("chart-pane-price")
    for (const key of ["upper", "middle", "lower"]) expect(price.querySelector(`path[data-series="${key}"]`)).not.toBeNull()
    expect(screen.queryByTestId("chart-pane-indicator")).toBeNull()
  })

  it("Volume: volume bars and the threshold line in an indicator pane", () => {
    renderChart("volume")
    const pane = screen.getByTestId("chart-pane-indicator")
    expect(pane.querySelectorAll('rect[data-bar="volume"]').length).toBeGreaterThan(10)
    expect(pane.querySelector('path[data-series="threshold"]')).not.toBeNull()
  })

  it("uses the params of the side shown: Bán draws its own series and labels", () => {
    const chart = makeChart({ indicatorId: "rsi", test: 0, params: { buy: { period: 10, level: 30 }, sell: { period: 21, level: 70 } } })
    const { rerender } = render(<PracticeChartView chart={chart} side="buy" revealed={0} windowBars={130} panEnd={null} events={[]} paneTitle="RSI" />)
    const buyPath = screen.getByTestId("chart-pane-indicator").querySelector('path[data-series="value"]')?.getAttribute("d")
    expect(screen.getByTestId("chart-pane-indicator").textContent).toContain("Ngưỡng 30")
    rerender(<PracticeChartView chart={chart} side="sell" revealed={0} windowBars={130} panEnd={null} events={[]} paneTitle="RSI" />)
    const sellPath = screen.getByTestId("chart-pane-indicator").querySelector('path[data-series="value"]')?.getAttribute("d")
    expect(sellPath).not.toBe(buyPath)
    expect(screen.getByTestId("chart-pane-indicator").textContent).toContain("Ngưỡng 70")
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
