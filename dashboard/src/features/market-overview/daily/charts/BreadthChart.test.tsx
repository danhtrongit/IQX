import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BreadthChart } from "./BreadthChart"
import type { MarketCharts } from "../types"

const fixture: MarketCharts["breadth"] = {
  ceiling: 18,
  up: 81,
  flat: 62,
  down: 203,
  floor: 23,
  ratio_up_down: "1 : 2,5",
  classification: "Phân hóa tiêu cực",
  pct_above_ma20: 36.5,
}

describe("BreadthChart", () => {
  it("renders all 5 row labels", () => {
    render(<BreadthChart data={fixture} />)
    expect(screen.getByText("Tăng trần")).toBeInTheDocument()
    expect(screen.getByText("Tăng")).toBeInTheDocument()
    expect(screen.getByText("Đứng giá")).toBeInTheDocument()
    expect(screen.getByText("Giảm")).toBeInTheDocument()
    expect(screen.getByText("Giảm sàn")).toBeInTheDocument()
  })

  it("renders all 5 counts", () => {
    const { container } = render(<BreadthChart data={fixture} />)
    expect(container.textContent).toContain("18")
    expect(container.textContent).toContain("81")
    expect(container.textContent).toContain("62")
    expect(container.textContent).toContain("203")
    expect(container.textContent).toContain("23")
  })

  it("renders the 3 summary stat labels", () => {
    render(<BreadthChart data={fixture} />)
    expect(screen.getByText(/Tỷ lệ T\/G/i)).toBeInTheDocument()
    expect(screen.getByText(/Phân loại/i)).toBeInTheDocument()
    expect(screen.getByText(/%\s*>\s*MA20/i)).toBeInTheDocument()
  })

  it("renders ratio_up_down value", () => {
    const { container } = render(<BreadthChart data={fixture} />)
    expect(container.textContent).toContain("1 : 2,5")
  })

  it("renders classification value", () => {
    const { container } = render(<BreadthChart data={fixture} />)
    expect(container.textContent).toContain("Phân hóa tiêu cực")
  })

  it("renders pct_above_ma20 formatted with en-US locale", () => {
    const { container } = render(<BreadthChart data={fixture} />)
    // en-US locale formats 36.5 as "36.5"
    expect(container.textContent).toContain("36.5%")
  })

  it("does not crash and renders '—' when pct_above_ma20 is null", () => {
    const nullFixture: MarketCharts["breadth"] = {
      ...fixture,
      pct_above_ma20: null,
    }
    const { container } = render(<BreadthChart data={nullFixture} />)
    // Should render the em-dash placeholder, not a percentage
    expect(container.textContent).toContain("—")
    expect(container.textContent).not.toMatch(/\d+,\d+%/)
  })
})
