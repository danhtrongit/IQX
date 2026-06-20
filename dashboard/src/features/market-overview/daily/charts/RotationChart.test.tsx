import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RotationChart } from "./RotationChart"
import type { MarketCharts } from "../types"

const fixture: MarketCharts["sector_rotation"] = [
  { sector: "Ngân hàng", net: 1.5 },
  { sector: "BĐS", net: -0.8 },
  { sector: "CN nặng", net: 0.3 },
  { sector: "CNTT", net: -1.2 },
  { sector: "Du lịch", net: 2.1 },
  { sector: "Dầu khí", net: -0.4 },
  { sector: "Vật liệu", net: 0.9 },
]

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

  it("the sector with highest net (Du lịch, 2.1) appears in document", () => {
    render(<RotationChart data={fixture} />)
    expect(screen.getByText("Du lịch")).toBeInTheDocument()
  })

  it("renders the positive value label for Du lịch (+2.10 tỷ)", () => {
    const { container } = render(<RotationChart data={fixture} />)
    expect(container.textContent).toContain("+2.10 tỷ")
  })
})
