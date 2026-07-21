import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { PlanBlock } from "./PlanBlock"

describe("PlanBlock", () => {
  it('shows the "KẾ HOẠCH" label and the "Vì sao bạn chọn {symbol}?" question', () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="filled"
        reason={null}
        onReason={vi.fn()}
        sl={59300}
        tp={68600}
      />,
    )
    expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument()
    expect(screen.getByText("Vì sao bạn chọn VNM?")).toBeInTheDocument()
  })

  it("renders all 5 reason chips verbatim, in spec order", () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="filled"
        reason={null}
        onReason={vi.fn()}
        sl={59300}
        tp={68600}
      />,
    )
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
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="filled"
        reason={null}
        onReason={onReason}
        sl={59300}
        tp={68600}
      />,
    )
    fireEvent.click(screen.getByText("Người quen giới thiệu"))
    expect(onReason).toHaveBeenCalledWith("Người quen giới thiệu")
  })

  it("highlights the currently-selected reason chip", () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="filled"
        reason="Giá đang tăng"
        onReason={vi.fn()}
        sl={59300}
        tp={68600}
      />,
    )
    expect(screen.getByText("Giá đang tăng").className).toContain("border-[rgb(var(--primary-6))]")
    expect(screen.getByText("Thử cho biết").className).not.toContain(
      "border-[rgb(var(--primary-6))]",
    )
  })

  it("filled mode shows the preset SL/TP with −5%/+10% and the ghi chú note", () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="filled"
        reason={null}
        onReason={vi.fn()}
        sl={59300}
        tp={68600}
      />,
    )
    expect(screen.getByText("Cắt lỗ (đề xuất)")).toBeInTheDocument()
    expect(screen.getByText("Chốt lời (đề xuất)")).toBeInTheDocument()
    expect(screen.getByText("59.300 · −5%")).toBeInTheDocument()
    expect(screen.getByText("68.600 · +10%")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Cắt lỗ: nếu giá giảm tới đây, bán để bảo toàn vốn. Lệnh đầu hệ thống đề xuất sẵn — chỉ cần đồng ý.",
      ),
    ).toBeInTheDocument()
  })

  it('filled mode shows "—" placeholders when sl/tp are not yet computable', () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="filled"
        reason={null}
        onReason={vi.fn()}
        sl={null}
        tp={null}
      />,
    )
    expect(screen.getAllByText("—")).toHaveLength(2)
  })

  it("manual mode renders empty, editable SL/TP inputs instead of the preset text (FE5 reuse)", () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="manual"
        reason={null}
        onReason={vi.fn()}
        sl={null}
        tp={null}
      />,
    )
    // No preset display text in manual mode.
    expect(screen.queryByText(/· −5%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/· \+10%/)).not.toBeInTheDocument()
    // The ghi chú note is specific to the system-filled preset — not shown in manual mode.
    expect(
      screen.queryByText(/Lệnh đầu hệ thống đề xuất sẵn/),
    ).not.toBeInTheDocument()
  })

  it('manual mode labels drop "(đề xuất)" — nhiệm vụ ⑤ explicitly stops suggesting values', () => {
    render(
      <PlanBlock
        symbol="VNM"
        presetMode="manual"
        reason={null}
        onReason={vi.fn()}
        sl={null}
        tp={null}
      />,
    )
    expect(screen.getByText("Cắt lỗ", { selector: "label" })).toBeInTheDocument()
    expect(screen.getByText("Chốt lời", { selector: "label" })).toBeInTheDocument()
    expect(screen.queryByText(/\(đề xuất\)/)).not.toBeInTheDocument()
  })
})
