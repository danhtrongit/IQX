import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { RiskConfig } from "./RiskConfig"
import { DEFAULT_RISK } from "../types"

it("renders 5 fields + info line, no ATR text", () => {
  render(<RiskConfig risk={DEFAULT_RISK} onChange={() => {}} />)
  expect(screen.getByText(/Cắt lỗ khi giá giảm/)).toBeInTheDocument()
  expect(screen.getByText(/Số vốn mỗi lệnh/)).toBeInTheDocument()
  expect(screen.getByText(/quy định T\+2\.5/)).toBeInTheDocument()
  expect(screen.queryByText(/ATR/)).toBeNull()
})

it("renders all 5 dropdown labels", () => {
  render(<RiskConfig risk={DEFAULT_RISK} onChange={() => {}} />)
  expect(screen.getByText(/Cắt lỗ khi giá giảm/)).toBeInTheDocument()
  expect(screen.getByText(/Chốt lời khi giá tăng/)).toBeInTheDocument()
  expect(screen.getByText(/Thời gian giữ tối đa/)).toBeInTheDocument()
  expect(screen.getByText(/Số vốn mỗi lệnh/)).toBeInTheDocument()
  expect(screen.getByText(/Phí giao dịch/)).toBeInTheDocument()
})

it("calls onChange with fixed stop_loss + pct when stop option changes", () => {
  const onChange = vi.fn()
  render(<RiskConfig risk={DEFAULT_RISK} onChange={onChange} />)
  // The stop-loss select currently shows "5% (cân bằng)" (default 0.05)
  // Find all Select trigger elements (role=combobox or by test id)
  const selects = screen.getAllByRole("combobox")
  // First select is Cắt lỗ
  fireEvent.click(selects[0])
  // Look for the "8% (rộng)" option
  const option = screen.getByText("8% (rộng)")
  fireEvent.click(option)
  expect(onChange).toHaveBeenCalledWith({ stop_loss: "fixed", stop_fixed_pct: 0.08 })
})

// Regression: String(0.10) === "0.1" but option value is "0.10" — the select must
// show the correct label when the numeric value happens to be 0.10.
it("stop-loss 10% and take-profit 10% presets render as selected (not blank)", () => {
  const risk = {
    ...DEFAULT_RISK,
    stop_fixed_pct: 0.10,
    take_profit_pct: 0.10,
  }
  render(<RiskConfig risk={risk} onChange={() => {}} />)
  // Arco Design Select renders the selected option label inside the trigger button.
  // If value doesn't match any option the trigger is blank; here both should show "10%…".
  expect(screen.getByText("10% (rất rộng)")).toBeInTheDocument()
  // TP dropdown: label is "10%"
  expect(screen.getAllByText("10%").length).toBeGreaterThanOrEqual(1)
})
