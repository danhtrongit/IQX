// MidDayPulseBar.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect } from "vitest"
import { MidDayPulseBar } from "./MidDayPulseBar"

const data = {
  charts: {
    breadth: {
      up: 100,
      down: 80,
      flat: 5,
      ceiling: 1,
      floor: 0,
      ratio_up_down: "1 : 0.8",
      classification: "Đi ngang",
      pct_above_ma20: null,
      data_state: "am_session",
    },
    foreign_detail: {
      total_buy_vnd_billion: 100,
      total_sell_vnd_billion: 120,
      streak: { count: 2, direction: "sell", last_5d_cumulative: null },
      last_12_sessions: [],
      top_sell: [],
      top_buy: [],
      data_state: "am_session",
    },
    market_health_detail: { pct_above_ma20: 40, data_state: "eod_previous" },
  },
} as any

it("shows the lunch banner + frozen health cell", () => {
  render(<MidDayPulseBar data={data} isLunch />)
  expect(screen.getByText(/Tạm chốt cuối phiên sáng/)).toBeInTheDocument()
  expect(screen.getByText(/chờ 16:30|Số cuối ngày/)).toBeInTheDocument()
})

describe("MidDayPulseBar", () => {
  it("does NOT show the lunch banner when isLunch is false", () => {
    render(<MidDayPulseBar data={data} isLunch={false} />)
    expect(screen.queryByText(/Tạm chốt cuối phiên sáng/)).not.toBeInTheDocument()
  })

  it("still renders the frozen health cell without isLunch", () => {
    render(<MidDayPulseBar data={data} isLunch={false} />)
    expect(screen.getByText(/chờ 16:30|Số cuối ngày/)).toBeInTheDocument()
  })
})
