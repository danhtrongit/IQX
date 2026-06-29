import React from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { AllocationBars } from "./AllocationBars"
import type { AllocationRow } from "../types"

const voice = "Manager voice text"

describe("AllocationBars", () => {
  it("row with benchmark: null renders NO .bench element", () => {
    const allocation: AllocationRow[] = [
      { sector: "Ngân hàng", weight: 0.344, benchmark: null, active: null },
      { sector: "Thép", weight: 0.160, benchmark: null, active: null },
    ]
    const { container } = render(
      <AllocationBars allocation={allocation} managerVoice={voice} />,
    )
    const benchEls = container.querySelectorAll(".bench")
    expect(benchEls).toHaveLength(0)
  })

  it("row with a non-null benchmark renders exactly one .bench", () => {
    const allocation: AllocationRow[] = [
      { sector: "Ngân hàng", weight: 0.344, benchmark: 0.38, active: -0.036 },
    ]
    const { container } = render(
      <AllocationBars allocation={allocation} managerVoice={voice} />,
    )
    const benchEls = container.querySelectorAll(".bench")
    expect(benchEls).toHaveLength(1)
  })

  it("mixed rows: only rows with non-null benchmark render .bench", () => {
    const allocation: AllocationRow[] = [
      { sector: "Ngân hàng", weight: 0.344, benchmark: 0.38,  active: -0.036 },
      { sector: "Thép",      weight: 0.160, benchmark: null,  active: null },
      { sector: "Công nghệ", weight: 0.142, benchmark: 0.06,  active: 0.082 },
    ]
    const { container } = render(
      <AllocationBars allocation={allocation} managerVoice={voice} />,
    )
    const benchEls = container.querySelectorAll(".bench")
    expect(benchEls).toHaveLength(2)
  })

  it("renders manager voice as plain text in .mgr", () => {
    const allocation: AllocationRow[] = [
      { sector: "Ngân hàng", weight: 0.344, benchmark: 0.38, active: -0.036 },
    ]
    const { container } = render(
      <AllocationBars allocation={allocation} managerVoice={voice} />,
    )
    const mgr = container.querySelector(".mgr")
    expect(mgr).toBeInTheDocument()
    expect(mgr?.textContent).toBe(voice)
    expect(mgr?.innerHTML).not.toContain("<")
  })

  it("renders .wbar for each allocation row", () => {
    const allocation: AllocationRow[] = [
      { sector: "Ngân hàng",   weight: 0.344, benchmark: 0.38,  active: -0.036 },
      { sector: "Thép",        weight: 0.160, benchmark: 0.04,  active:  0.120 },
      { sector: "Chứng khoán", weight: 0.154, benchmark: null,  active: null },
    ]
    const { container } = render(
      <AllocationBars allocation={allocation} managerVoice={voice} />,
    )
    const bars = container.querySelectorAll(".wbar")
    expect(bars).toHaveLength(3)
  })

  it("renders .legend", () => {
    const allocation: AllocationRow[] = [
      { sector: "Ngân hàng", weight: 0.344, benchmark: 0.38, active: -0.036 },
    ]
    const { container } = render(
      <AllocationBars allocation={allocation} managerVoice={voice} />,
    )
    expect(container.querySelector(".legend")).toBeInTheDocument()
  })
})
