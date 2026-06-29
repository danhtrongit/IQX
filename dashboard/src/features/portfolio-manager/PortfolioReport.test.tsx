import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock the hook — the injected path never needs the network layer.
vi.mock("./hooks", () => ({
  useAnalyzePortfolio: () => ({
    report: null,
    analyze: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}))

import { PortfolioReport } from "./PortfolioReport"
import { sampleAnalysis, sampleNarrative } from "./__fixtures__/sample"

describe("PortfolioReport", () => {
  it("renders the report from injected data", () => {
    render(<PortfolioReport injected={{ analysis: sampleAnalysis, narrative: sampleNarrative, meta: { valid: true, cached: false } }} />)
    // title is split across <span> elements by Masthead — match the heading element
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sampleNarrative.title.replace("\n", ""))
    expect(screen.getByText("3,5")).toBeInTheDocument()           // hero score
    expect(screen.getAllByText(/Ngân hàng/).length).toBeGreaterThan(0)  // allocation
  })

  it("renders insufficient-data state", () => {
    render(<PortfolioReport injected={{ analysis: { insufficient_data: true, reason: "Chưa đủ dữ liệu." } as never, narrative: null, meta: { valid: false, cached: false, insufficient: true } }} />)
    expect(screen.getByText("Chưa đủ dữ liệu.")).toBeInTheDocument()
    expect(screen.queryByText("3,5")).not.toBeInTheDocument()
  })
})
