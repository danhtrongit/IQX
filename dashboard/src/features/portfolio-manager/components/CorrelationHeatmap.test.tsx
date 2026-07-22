import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { CorrelationHeatmap } from "./CorrelationHeatmap"
import { sampleAnalysis } from "../__fixtures__/sample"

describe("CorrelationHeatmap", () => {
  it("renders the 0.82 badge for the TCB–MBB max pair", () => {
    render(
      <CorrelationHeatmap
        correlation={sampleAnalysis.risk.correlation}
        positions={sampleAnalysis.overview.positions}
      />,
    )
    // The badge inside .sig-call should show the max correlation value
    const badge = document.querySelector(".badge")
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe("0.82")
  })

  it("renders diagonal cells with 1.0", () => {
    render(
      <CorrelationHeatmap
        correlation={sampleAnalysis.risk.correlation}
        positions={sampleAnalysis.overview.positions}
      />,
    )
    const selfCells = document.querySelectorAll(".cell.self")
    // Top 4 positions → 4 diagonal self cells
    expect(selfCells.length).toBe(4)
    selfCells.forEach((cell) => {
      expect(cell.textContent).toBe("1.0")
    })
  })

  it("renders TCB and MBB in the heatmap (they are top-4 by weight)", () => {
    render(
      <CorrelationHeatmap
        correlation={sampleAnalysis.risk.correlation}
        positions={sampleAnalysis.overview.positions}
      />,
    )
    // TCB and MBB each appear as header labels (row + column)
    expect(screen.getAllByText("TCB").length).toBeGreaterThan(0)
    expect(screen.getAllByText("MBB").length).toBeGreaterThan(0)
  })
})
