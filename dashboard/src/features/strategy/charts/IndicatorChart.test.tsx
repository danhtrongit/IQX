import React from "react"
import { render } from "@testing-library/react"
import { IndicatorChart } from "./IndicatorChart"

it.each(["price-ma", "distance", "oscillator", "macd"] as const)(
  "renders an svg for %s",
  (a) => {
    const { container } = render(<IndicatorChart indicatorId="x" archetype={a} />)
    expect(container.querySelector("svg")).toBeTruthy()
    expect(
      container.querySelectorAll("polyline, line, rect, path, polygon, circle").length,
    ).toBeGreaterThan(0)
  },
)
