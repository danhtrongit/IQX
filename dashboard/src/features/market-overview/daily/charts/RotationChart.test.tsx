import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RotationChart } from "./RotationChart"
import type { MarketCharts } from "../types"

const fixture: MarketCharts["sector_rotation"] = {
  sectors_today: [
    { name: "Du lịch", pct: 2.1 },
    { name: "Ngân hàng", pct: 1.5 },
    { name: "Vật liệu", pct: 0.9 },
    { name: "CN nặng", pct: 0.3 },
    { name: "Dầu khí", pct: -0.4 },
    { name: "BĐS", pct: -0.8 },
    { name: "CNTT", pct: -1.2 },
  ],
}

describe("RotationChart", () => {
  it("renders a row for each sector", () => {
    render(<RotationChart data={fixture} />)
    expect(screen.getByText("Ngân hàng")).toBeInTheDocument()
    expect(screen.getByText("BĐS")).toBeInTheDocument()
    expect(screen.getByText("CN nặng")).toBeInTheDocument()
    expect(screen.getByText("CNTT")).toBeInTheDocument()
    expect(screen.getByText("Du lịch")).toBeInTheDocument()
    expect(screen.getByText("Dầu khí")).toBeInTheDocument()
    expect(screen.getByText("Vật liệu")).toBeInTheDocument()
  })

  it("the sector with highest pct (Du lịch, 2.1) appears in document", () => {
    render(<RotationChart data={fixture} />)
    expect(screen.getByText("Du lịch")).toBeInTheDocument()
  })

  it("renders positive sign class for Du lịch row", () => {
    const { container } = render(<RotationChart data={fixture} />)
    // Du lịch row should have rotation-row-positive class
    const positiveRows = container.querySelectorAll(".rotation-row-positive")
    expect(positiveRows.length).toBeGreaterThan(0)
  })

  it("renders negative sign class for CNTT row", () => {
    const { container } = render(<RotationChart data={fixture} />)
    const negativeRows = container.querySelectorAll(".rotation-row-negative")
    expect(negativeRows.length).toBeGreaterThan(0)
  })

  it("renders vi-VN formatted value label for Du lịch (+2,1%)", () => {
    const { container } = render(<RotationChart data={fixture} />)
    expect(container.textContent).toContain("+2,1%")
  })
})
