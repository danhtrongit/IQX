import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { PlanFormCap1 } from "./PlanFormCap1"

describe("PlanFormCap1 (spec §4 Form Kế hoạch 2 trường)", () => {
  it('shows the "KẾ HOẠCH" label and the "Vì sao bạn mua {symbol}?" question', () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument()
    expect(screen.getByText("Vì sao bạn mua VNM?")).toBeInTheDocument()
  })

  it("renders all 5 lý do options, in spec §4 table order", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    const expected = ["🎯 Kỹ thuật", "💰 Dòng tiền", "👤 Nội bộ", "📰 Tin tức", "💎 Định giá"]
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(expected)
  })

  it("clicking a lý do option calls onLyDoChange with that option's value", () => {
    const onLyDoChange = vi.fn()
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={onLyDoChange}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText("💰 Dòng tiền"))
    expect(onLyDoChange).toHaveBeenCalledWith("dong_tien")
  })

  it("highlights the currently-selected lý do", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo="noi_bo"
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    expect(screen.getByText("👤 Nội bộ").className).toContain("border-[rgb(var(--primary-6))]")
    expect(screen.getByText("🎯 Kỹ thuật").className).not.toContain(
      "border-[rgb(var(--primary-6))]",
    )
  })

  it("renders the Vùng mua field, defaulted (by the caller) to the current price", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    expect(screen.getByText("Vùng mua")).toBeInTheDocument()
    expect(screen.getByDisplayValue("62400")).toBeInTheDocument()
  })

  it("typing a new Vùng mua calls onVungMuaChange", () => {
    const onVungMuaChange = vi.fn()
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={onVungMuaChange}
      />,
    )
    const input = screen.getByDisplayValue("62400")
    fireEvent.change(input, { target: { value: "60000" } })
    expect(onVungMuaChange).toHaveBeenCalledWith(60_000)
  })
})
