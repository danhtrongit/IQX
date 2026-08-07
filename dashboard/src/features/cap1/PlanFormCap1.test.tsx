import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { PlanFormCap1 } from "./PlanFormCap1"

describe("PlanFormCap1 (spec §4 Form Kế hoạch 2 trường)", () => {
  it('shows the "KẾ HOẠCH" tag and both numbered field labels (mockup iqx-cap1-datlenh)', () => {
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
    expect(screen.getByText("1. Lý do mua — chọn 1 trong 5 lớp")).toBeInTheDocument()
    expect(screen.getByText("2. Vùng mua (giá cụ thể)")).toBeInTheDocument()
  })

  it('says "5 lớp", never "6 lớp" — there are exactly 5 lý do (mockup label is wrong)', () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/6 lớp/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(5)
  })

  it("renders each lý do as icon + name + description on one row, in spec §4 table order", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    const rows = screen.getAllByRole("button")
    const expected: [string, string, string][] = [
      ["🎯", "Kỹ thuật", "xu hướng giá"],
      ["💰", "Dòng tiền", "khối ngoại + tự doanh"],
      ["👤", "Nội bộ", "lãnh đạo mua"],
      ["📰", "Tin tức", "tin doanh nghiệp"],
      ["💎", "Định giá", "từ BCTC"],
    ]
    expect(rows).toHaveLength(expected.length)
    expected.forEach(([icon, name, desc], i) => {
      const row = within(rows[i])
      expect(row.getByText(icon)).toBeInTheDocument()
      expect(row.getByText(name)).toBeInTheDocument()
      expect(row.getByText(desc)).toBeInTheDocument()
    })
  })

  it("clicking a lý do row calls onLyDoChange with that option's value", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Dòng tiền/ }))
    expect(onLyDoChange).toHaveBeenCalledWith("dong_tien")
  })

  it("highlights the currently-selected lý do row", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo="noi_bo"
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: /Nội bộ/ }).className).toContain(
      "border-[rgb(var(--primary-6))]",
    )
    expect(screen.getByRole("button", { name: /Kỹ thuật/ }).className).not.toContain(
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
    expect(screen.getByText("2. Vùng mua (giá cụ thể)")).toBeInTheDocument()
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

describe("PlanFormCap1 — hideLyDo (Cấp 4 thay trường Lý do mua bằng khối Đọc 5 lớp)", () => {
  it("hides Trường 1 (the 5 lý do rows + its label) but KEEPS Vùng mua", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
        hideLyDo
      />,
    )
    expect(screen.queryByText("1. Lý do mua — chọn 1 trong 5 lớp")).not.toBeInTheDocument()
    expect(screen.queryByText("Kỹ thuật")).not.toBeInTheDocument()
    expect(screen.queryAllByRole("button").length).toBe(0)
    // Vùng mua (spec §5: "Vùng mua ... GIỮ NGUYÊN") is untouched.
    expect(screen.getByText("2. Vùng mua (giá cụ thể)")).toBeInTheDocument()
    expect(screen.getByDisplayValue("62400")).toBeInTheDocument()
  })

  it("still shows the 5 lý do rows by default (Cấp 1/2/3 unchanged)", () => {
    render(
      <PlanFormCap1
        symbol="VNM"
        lyDo={null}
        onLyDoChange={vi.fn()}
        vungMua={62_400}
        onVungMuaChange={vi.fn()}
      />,
    )
    expect(screen.getByText("1. Lý do mua — chọn 1 trong 5 lớp")).toBeInTheDocument()
    expect(screen.getByText("Kỹ thuật")).toBeInTheDocument()
  })
})
