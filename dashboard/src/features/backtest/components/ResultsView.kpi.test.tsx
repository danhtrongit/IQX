import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { KpiGrid, sharpeBand } from "./ResultsView"
import type { Kpis } from "../types"

const fixtureKpis: Kpis = {
  cagr: 0.15,
  sharpe: 0.43,
  sharpe_ci: [0.1, 0.75],
  max_drawdown: -0.22,
  dd_recovery_sessions: 30,
  win_rate: 0.55,
  n_trades: 40,
  n_wins: 22,
  avg_hold: 12,
  net_return: 0.82,
  buy_hold_return: 0.45,
  n_sessions: 756,
}

const fixtureMeta = {
  symbol: "VNM",
  start: "2021-01-04",
  end: "2024-01-04",
  n_sessions: 756,
  capital: 100_000_000,
}

describe("KpiGrid — 6 relabelled cards", () => {
  it("renders all 6 Vietnamese labels", () => {
    render(<KpiGrid kpis={fixtureKpis} meta={fixtureMeta} />)
    expect(screen.getByText(/Lãi trung bình mỗi năm/i)).toBeInTheDocument()
    expect(screen.getByText(/Tổng lãi sau phí \+ thuế/i)).toBeInTheDocument()
    expect(screen.getByText(/Lãi nếu chỉ mua và giữ/i)).toBeInTheDocument()
    expect(screen.getByText(/Sharpe ratio/i)).toBeInTheDocument()
    expect(screen.getByText(/Tỷ lệ lệnh bán có lãi/i)).toBeInTheDocument()
    expect(screen.getByText(/Số phiên giữ trung bình/i)).toBeInTheDocument()
  })

  it("does NOT render Max Drawdown", () => {
    render(<KpiGrid kpis={fixtureKpis} meta={fixtureMeta} />)
    expect(screen.queryByText(/Max Drawdown/i)).toBeNull()
  })

  it("renders 'Trong X năm' sub-text for net return card", () => {
    render(<KpiGrid kpis={fixtureKpis} meta={fixtureMeta} />)
    // n_sessions=756, 756/252 = 3.0 → "Trong 3.0 năm"
    expect(screen.getByText(/Trong 3\.0 năm/i)).toBeInTheDocument()
  })

  it("renders 'Mua …, giữ đến nay' sub for buy-hold card", () => {
    render(<KpiGrid kpis={fixtureKpis} meta={fixtureMeta} />)
    expect(screen.getByText(/Mua 04\/01\/2021, giữ đến nay/i)).toBeInTheDocument()
  })

  it("renders win-rate sub with trade counts", () => {
    render(<KpiGrid kpis={fixtureKpis} meta={fixtureMeta} />)
    expect(screen.getByText(/22 lệnh lãi \/ 40 lệnh đã đóng/i)).toBeInTheDocument()
  })

  it("does NOT render CAGR 'vs Buy-Hold' sub-text", () => {
    render(<KpiGrid kpis={fixtureKpis} meta={fixtureMeta} />)
    expect(screen.queryByText(/vs Buy-Hold/i)).toBeNull()
  })
})

describe("sharpeBand helper", () => {
  it("returns '—' for null", () => {
    expect(sharpeBand(null)).toBe("—")
  })
  it("returns 'Kém' for 0.43", () => {
    expect(sharpeBand(0.43)).toBe("Kém")
  })
  it("returns 'Tốt' for 1.5", () => {
    expect(sharpeBand(1.5)).toBe("Tốt")
  })
  it("returns 'Tệ' for negative", () => {
    expect(sharpeBand(-0.5)).toBe("Tệ")
  })
  it("returns 'Rất tốt' for > 2", () => {
    expect(sharpeBand(2.5)).toBe("Rất tốt")
  })
  it("returns 'Tốt' for exactly 2", () => {
    expect(sharpeBand(2)).toBe("Tốt")
  })
  it("returns 'Kém' for exactly 0", () => {
    expect(sharpeBand(0)).toBe("Kém")
  })
})
