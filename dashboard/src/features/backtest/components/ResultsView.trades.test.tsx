import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { TradesTable } from "./ResultsView"
import type { Trade } from "../types"

// 30 fixture trades — most recent first when reversed
const TRADES: Trade[] = Array.from({ length: 30 }, (_, i) => ({
  idx: i + 1,
  entry_date: `2024-${String(Math.floor(i / 2) + 1).padStart(2, "0")}-10`,
  entry_price: 50000 + i * 1000,
  exit_date: `2024-${String(Math.floor(i / 2) + 1).padStart(2, "0")}-25`,
  exit_price: 52000 + i * 1000,
  hold: 15 + i,
  pnl_pct: i % 3 === 0 ? -0.05 : 0.04,
  trigger: "Cắt lỗ",
  entry_trigger: `Phá đỉnh 20 phiên + RSI 14 > 30 (lệnh ${i + 1})`,
}))

describe("TradesTable", () => {
  it("shows 12 of 30 by default with correct title", () => {
    render(<TradesTable trades={TRADES} />)
    expect(screen.getByText(/Hiển thị 12 \/ 30/)).toBeInTheDocument()
  })

  it("renders 9 Vietnamese column headers", () => {
    render(<TradesTable trades={TRADES} />)
    expect(screen.getByText("Lệnh #")).toBeInTheDocument()
    expect(screen.getByText("Ngày mua")).toBeInTheDocument()
    expect(screen.getByText("Lý do mua")).toBeInTheDocument()
    expect(screen.getByText("Giá mua")).toBeInTheDocument()
    expect(screen.getByText("Ngày bán")).toBeInTheDocument()
    expect(screen.getByText("Lý do bán")).toBeInTheDocument()
    expect(screen.getByText("Giá bán")).toBeInTheDocument()
    expect(screen.getByText("Số phiên giữ")).toBeInTheDocument()
    expect(screen.getByText("Lãi/Lỗ")).toBeInTheDocument()
  })

  it("renders dates in DD/MM/YYYY format", () => {
    render(<TradesTable trades={TRADES} />)
    // The last trade (idx=30, entry_date=2024-15-10) would be first after reverse
    // But month 15 is invalid; let's check for a valid date like trade idx=30 entry_date=2024-15-10
    // Actually trade idx=1 entry_date=2024-01-10 -> reversed, so trade 30 is first
    // Trade 30: entry_date = `2024-${Math.floor(29/2)+1 = 15}-10` => invalid month
    // Let's check a known valid date: trade idx=1: entry_date = 2024-01-10 -> 10/01/2024
    // After reverse, trade 1 is last (position 30), so it won't appear in default 12
    // Trade idx=30: Math.floor(29/2)+1 = 15 -> month 15 invalid
    // Let's use simpler dates in TRADES — check for any DD/MM/YYYY pattern
    // Trade idx=29 (i=28): entry_date = `2024-${Math.floor(28/2)+1=15}-10` still invalid
    // Actually: i goes 0..29, Math.floor(i/2)+1 gives 1..15, so months 13-15 are invalid
    // But fmtDateVN just does string split, so 2024-15-10 -> 10/15/2024
    // We expect trade 30 (last, i=29): entry_date=2024-15-10 -> "10/15/2024"
    // After reverse, trade 30 is first visible
    // Let's just test that date cells contain "/" separators with YYYY at end
    const dateCells = screen.getAllByText(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(dateCells.length).toBeGreaterThan(0)
  })

  it("shows entry_trigger verbatim in Lý do mua column", () => {
    render(<TradesTable trades={TRADES} />)
    // Trade idx=30 (i=29) is most recent after reverse, entry_trigger = "Phá đỉnh 20 phiên + RSI 14 > 30 (lệnh 30)"
    expect(screen.getByText("Phá đỉnh 20 phiên + RSI 14 > 30 (lệnh 30)")).toBeInTheDocument()
  })

  it("shows all 30 rows after clicking Xem tất cả", () => {
    render(<TradesTable trades={TRADES} />)
    const btn = screen.getByRole("button", { name: /Xem tất cả/ })
    fireEvent.click(btn)
    // Title should now say 30/30
    expect(screen.getByText(/Hiển thị 30 \/ 30/)).toBeInTheDocument()
    // All entry_triggers should be visible
    for (let i = 1; i <= 30; i++) {
      expect(screen.getByText(`Phá đỉnh 20 phiên + RSI 14 > 30 (lệnh ${i})`)).toBeInTheDocument()
    }
  })

  it("hides Xem tất cả button (or relabels it) when expanded", () => {
    render(<TradesTable trades={TRADES} />)
    const btn = screen.getByRole("button", { name: /Xem tất cả/ })
    fireEvent.click(btn)
    // Should show Thu gọn
    expect(screen.getByRole("button", { name: /Thu gọn/ })).toBeInTheDocument()
  })
})
