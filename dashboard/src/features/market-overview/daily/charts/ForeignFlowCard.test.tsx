// ─── ForeignFlowCard tests ───────────────────────────────────────────────────

import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ForeignFlowCard } from "./ForeignFlowCard"
import type { MarketCharts } from "../types"

const baseFixture: MarketCharts["foreign_detail"] = {
  total_buy_vnd_billion: 598,
  total_sell_vnd_billion: -837,
  streak: {
    count: 3,
    direction: "sell",
    last_5d_cumulative: -1234,
  },
  last_12_sessions: [-200, 50, -80, 120, -300, 90, -150, 200, -60, 30, -100, -239],
  top_sell: [{ ticker: "VIC", value: -320 }],
  top_buy: [{ ticker: "VCB", value: 186 }],
}

describe("ForeignFlowCard", () => {
  it("renders normally with full data", () => {
    render(<ForeignFlowCard data={baseFixture} />)
    expect(screen.getByText("Khối ngoại")).toBeInTheDocument()
  })

  it("does not crash when last_5d_cumulative is null and renders '—'", () => {
    const nullStreakFixture: MarketCharts["foreign_detail"] = {
      ...baseFixture,
      streak: {
        ...baseFixture.streak,
        last_5d_cumulative: null,
      },
    }
    const { container } = render(<ForeignFlowCard data={nullStreakFixture} />)
    // Should not crash and should show the em-dash placeholder
    expect(container.textContent).toContain("—")
    // The streak sub-text should contain "5 ngày:" followed immediately by "—"
    // (no cumulative number rendered for the streak)
    expect(container.textContent).toMatch(/5 ngày:\s*—/)
    // The cumulative "-1234 tỷ" value from the null fixture must not appear
    expect(container.textContent).not.toContain("1.234")
  })

  it("renders positive cumulative with + prefix", () => {
    const posFixture: MarketCharts["foreign_detail"] = {
      ...baseFixture,
      streak: {
        ...baseFixture.streak,
        direction: "buy",
        last_5d_cumulative: 2500,
      },
    }
    const { container } = render(<ForeignFlowCard data={posFixture} />)
    expect(container.textContent).toContain("+")
    expect(container.textContent).toContain("2,500")
  })
})
