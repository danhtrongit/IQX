import React from "react"
import { render } from "@testing-library/react"
import { IndicatorChart } from "./IndicatorChart"

it.each([
  "price-ma",
  "distance",
  "oscillator",
  "macd",
  "volatility",
  "volume",
  "level-breakout",
  "candlestick",
] as const)(
  "renders an svg for %s",
  (a) => {
    const { container } = render(<IndicatorChart indicatorId="x" archetype={a} />)
    expect(container.querySelector("svg")).toBeTruthy()
    expect(
      container.querySelectorAll("polyline, line, rect, path, polygon, circle").length,
    ).toBeGreaterThan(0)
  },
)

it("candlestick (hammer) renders ≥4 rect elements", () => {
  const { container } = render(
    <IndicatorChart indicatorId="hammer" archetype="candlestick" />,
  )
  expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(4)
})
