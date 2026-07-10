import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HomeAnalysisRail } from "./HomeAnalysisRail"

describe("HomeAnalysisRail", () => {
  it("3 tab với aria-selected đúng", () => {
    render(<HomeAnalysisRail active="market" onSelect={() => {}} variant="side" />)
    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(3)
    expect(screen.getByRole("tab", { name: /thị trường/i })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /cổ phiếu/i })).toHaveAttribute("aria-selected", "false")
  })
  it("click tab → onSelect(view)", () => {
    const onSelect = vi.fn()
    render(<HomeAnalysisRail active="market" onSelect={onSelect} variant="side" />)
    fireEvent.click(screen.getByRole("tab", { name: /BCTC/i }))
    expect(onSelect).toHaveBeenCalledWith("financial")
  })
  it("variant side → tablist dọc (flex-col); bottom → ngang fixed", () => {
    const { rerender } = render(<HomeAnalysisRail active="market" onSelect={() => {}} variant="side" />)
    expect(screen.getByRole("tablist").className).toContain("flex-col")
    rerender(<HomeAnalysisRail active="market" onSelect={() => {}} variant="bottom" />)
    expect(screen.getByRole("tablist").className).toContain("fixed")
  })
  it("variant bottom → có safe-area-inset-bottom padding cho home-indicator iOS; side thì không", () => {
    const { rerender } = render(<HomeAnalysisRail active="market" onSelect={() => {}} variant="bottom" />)
    expect(screen.getByRole("tablist").className).toContain("pb-[env(safe-area-inset-bottom)]")
    rerender(<HomeAnalysisRail active="market" onSelect={() => {}} variant="side" />)
    expect(screen.getByRole("tablist").className).not.toContain("safe-area-inset-bottom")
  })
})
