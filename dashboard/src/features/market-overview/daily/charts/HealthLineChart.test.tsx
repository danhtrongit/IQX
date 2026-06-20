import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { HealthLineChart } from "./HealthLineChart"
import type { MarketCharts } from "../types"

const fixture: MarketCharts["market_health_detail"] = {
  pct_above_ma20: 43.4,
  pct_above_ma20_change: -1.2,
  pct_above_ma50: 38.0,
  pct_above_ma200: null,
  trend_20d: [
    38, 40, 42, 44, 46, 48, 47, 45, 43, 41,
    39, 41, 43, 45, 47, 48.6, 47, 45, 44, 43.4,
  ],
  callout: { type: "warning", text: "Tín hiệu nội tại suy yếu" },
}

const classification = "Phân hóa tiêu cực"

describe("HealthLineChart", () => {
  it("renders the today value in vi-VN locale", () => {
    const { container } = render(<HealthLineChart data={fixture} classification={classification} />)
    // vi-VN locale formats 43.4 as "43,4"
    expect(container.textContent).toContain("43,4%")
  })

  it("renders a <polyline> element", () => {
    const { container } = render(<HealthLineChart data={fixture} classification={classification} />)
    const polyline = container.querySelector("polyline")
    expect(polyline).not.toBeNull()
  })

  it("renders the classification text", () => {
    render(<HealthLineChart data={fixture} classification={classification} />)
    expect(screen.getByText("Phân hóa tiêu cực")).toBeInTheDocument()
  })

  it("renders the callout text", () => {
    render(<HealthLineChart data={fixture} classification={classification} />)
    expect(screen.getByText("Tín hiệu nội tại suy yếu")).toBeInTheDocument()
  })

  it("renders — when pct_above_ma20 is null", () => {
    const nullFixture = { ...fixture, pct_above_ma20: null }
    const { container } = render(<HealthLineChart data={nullFixture} classification={classification} />)
    expect(container.textContent).toContain("—")
  })
})
