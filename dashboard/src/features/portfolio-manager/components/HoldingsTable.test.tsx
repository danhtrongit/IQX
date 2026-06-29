import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { HoldingsTable } from "./HoldingsTable"
import { sampleAnalysis, sampleNarrative } from "../__fixtures__/sample"

describe("HoldingsTable", () => {
  it("renders 7 ticker rows + a cash row (8 total data rows)", () => {
    const { container } = render(
      <HoldingsTable
        positions={sampleAnalysis.overview.positions}
        cash_pct={sampleAnalysis.overview.cash_pct}
        managerVoice={sampleNarrative.layers.overview}
      />,
    )
    const rows = container.querySelectorAll("table.hold tbody tr")
    // 7 positions + 1 cash row
    expect(rows).toHaveLength(8)
  })

  it("renders a cash row", () => {
    const { container } = render(
      <HoldingsTable
        positions={sampleAnalysis.overview.positions}
        cash_pct={sampleAnalysis.overview.cash_pct}
        managerVoice={sampleNarrative.layers.overview}
      />,
    )
    const cashRow = container.querySelector("tr.cash")
    expect(cashRow).toBeInTheDocument()
    expect(cashRow).toHaveTextContent("Tiền mặt")
  })

  it("HPG weight shows '16,0%'", () => {
    render(
      <HoldingsTable
        positions={sampleAnalysis.overview.positions}
        cash_pct={sampleAnalysis.overview.cash_pct}
        managerVoice={sampleNarrative.layers.overview}
      />,
    )
    // pct(0.160) → "16,0%"
    expect(screen.getByText("16,0%")).toBeInTheDocument()
  })

  it("renders the low_confidence flag for APG", () => {
    const { container } = render(
      <HoldingsTable
        positions={sampleAnalysis.overview.positions}
        cash_pct={sampleAnalysis.overview.cash_pct}
        managerVoice={sampleNarrative.layers.overview}
      />,
    )
    const flag = container.querySelector(".flag")
    expect(flag).toBeInTheDocument()
    expect(flag).toHaveTextContent("mới · ít dữ liệu")
  })

  it("renders the manager voice as plain text in .mgr", () => {
    const { container } = render(
      <HoldingsTable
        positions={sampleAnalysis.overview.positions}
        cash_pct={sampleAnalysis.overview.cash_pct}
        managerVoice={sampleNarrative.layers.overview}
      />,
    )
    const mgr = container.querySelector(".mgr")
    expect(mgr).toBeInTheDocument()
    expect(mgr).toHaveTextContent("Danh mục vẫn giải ngân gần hết")
    // Must be plain text — no innerHTML injection
    expect(mgr?.innerHTML).not.toContain("<script")
  })

  it("positive pnl gets .pos class, negative gets .neg class", () => {
    const { container } = render(
      <HoldingsTable
        positions={sampleAnalysis.overview.positions}
        cash_pct={sampleAnalysis.overview.cash_pct}
        managerVoice={sampleNarrative.layers.overview}
      />,
    )
    const posCells = container.querySelectorAll("span.pos")
    const negCells = container.querySelectorAll("span.neg")
    // HPG, TCB, MBB, FPT are positive (4); DGC, VND, APG are negative (3)
    expect(posCells).toHaveLength(4)
    expect(negCells).toHaveLength(3)
  })
})
