import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { PlanBlock } from "./PlanBlock"

describe("PlanBlock", () => {
  it('shows the "KẾ HOẠCH" label and the "Vì sao bạn chọn {symbol}?" question', () => {
    render(<PlanBlock symbol="VNM" reason={null} onReason={vi.fn()} />)
    expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument()
    expect(screen.getByText("Vì sao bạn chọn VNM?")).toBeInTheDocument()
  })

  it("renders all 5 reason chips verbatim, in spec order", () => {
    render(<PlanBlock symbol="VNM" reason={null} onReason={vi.fn()} />)
    const expected = [
      "Công ty tôi biết",
      "Người quen giới thiệu",
      "Thấy trên mạng",
      "Giá đang tăng",
      "Thử cho biết",
    ]
    const chips = screen.getAllByRole("button")
    expect(chips.map((c) => c.textContent)).toEqual(expected)
  })

  it("clicking a chip calls onReason with that chip's text", () => {
    const onReason = vi.fn()
    render(<PlanBlock symbol="VNM" reason={null} onReason={onReason} />)
    fireEvent.click(screen.getByText("Người quen giới thiệu"))
    expect(onReason).toHaveBeenCalledWith("Người quen giới thiệu")
  })

  it("highlights the currently-selected reason chip", () => {
    render(<PlanBlock symbol="VNM" reason="Giá đang tăng" onReason={vi.fn()} />)
    expect(screen.getByText("Giá đang tăng").className).toContain("cap0-chip--on")
    expect(screen.getByText("Thử cho biết").className).not.toContain("cap0-chip--on")
  })

  // ★ Spec v3.0 §4: "Khối Kế hoạch chỉ có chip lý do đời thường — KHÔNG cắt
  // lỗ/chốt lời", repeated in the preamble, §0, §8 and §13. Both the old
  // `presetMode="filled"` preset display AND the `presetMode="manual"` typed
  // inputs are gone; the block is chips-and-question only.
  it("★ renders NO cắt lỗ / chốt lời in either the labels or the controls", () => {
    const { container } = render(<PlanBlock symbol="VNM" reason={null} onReason={vi.fn()} />)
    expect(screen.queryByText(/Cắt lỗ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Chốt lời/)).not.toBeInTheDocument()
    expect(screen.queryByText(/đề xuất/)).not.toBeInTheDocument()
    expect(screen.queryByText(/· −5%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/· \+10%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Lệnh đầu hệ thống đề xuất sẵn/)).not.toBeInTheDocument()
    // No numeric inputs at all — the 5 chips are the only controls.
    expect(container.querySelectorAll("input")).toHaveLength(0)
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0)
  })

  it("★ the ONLY buttons in the block are the 5 chips", () => {
    render(<PlanBlock symbol="VNM" reason={null} onReason={vi.fn()} />)
    expect(screen.getAllByRole("button")).toHaveLength(5)
  })
})
