import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FlowCard } from "./FlowCard"
import type { FlowTopItem } from "./FlowCard"

const topSell: FlowTopItem[] = [
  { ticker: "VIC", value: -320 },
  { ticker: "VHM", value: -198 },
]

const topBuy: FlowTopItem[] = [
  { ticker: "VCB", value: 186 },
  { ticker: "BID", value: 92 },
]

const streakBars = [-200, 50, -80, 120, -300, 90, -150, 200, -60, 30, -100, -239]

describe("FlowCard", () => {
  it("renders the card title", () => {
    render(
      <FlowCard
        title="Khối ngoại"
        buyValue={186}
        sellValue={1868}
        streakBars={streakBars}
        streakLabel="streak"
        topSell={topSell}
        topBuy={topBuy}
      />
    )
    expect(screen.getByText("Khối ngoại")).toBeInTheDocument()
  })

  it("renders buy and sell summary values", () => {
    const { container } = render(
      <FlowCard
        title="Test"
        buyValue={598}
        sellValue={837}
        streakBars={[10, -20]}
        streakLabel="label"
        topSell={[]}
        topBuy={[]}
      />
    )
    expect(container.textContent).toContain("598")
    expect(container.textContent).toContain("837")
  })

  it("renders top sell and top buy tickers", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[1, -2]}
        streakLabel="x"
        topSell={topSell}
        topBuy={topBuy}
      />
    )
    expect(screen.getByText("VIC")).toBeInTheDocument()
    expect(screen.getByText("VHM")).toBeInTheDocument()
    expect(screen.getByText("VCB")).toBeInTheDocument()
    expect(screen.getByText("BID")).toBeInTheDocument()
  })

  it("renders custom column headings", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[]}
        streakLabel="x"
        topSell={[]}
        topBuy={[]}
        topSellHeading="▼ BÁN"
        topBuyHeading="▲ MUA"
      />
    )
    expect(screen.getByText("▼ BÁN")).toBeInTheDocument()
    expect(screen.getByText("▲ MUA")).toBeInTheDocument()
  })

  it("does NOT render BẤT THƯỜNG badge when anomaly is false", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[1]}
        streakLabel="x"
        topSell={[]}
        topBuy={[{ ticker: "SSI", value: 45 }]}
      />
    )
    expect(screen.queryByText("BẤT THƯỜNG")).not.toBeInTheDocument()
  })

  it("renders BẤT THƯỜNG badge for anomaly top_buy item", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[1]}
        streakLabel="x"
        topSell={[]}
        topBuy={[{ ticker: "SSI", value: 45, anomaly: true }]}
      />
    )
    expect(screen.getByText("BẤT THƯỜNG")).toBeInTheDocument()
  })

  it("renders correct number of streak bars", () => {
    const bars = [10, -5, 8, -3, 12, -7, 4, -9, 6, -2, 11, -1]
    const { container } = render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={bars}
        streakLabel="x"
        topSell={[]}
        topBuy={[]}
      />
    )
    // StreakBars container uses alignItems: "flex-end"
    const streakContainer = container.querySelector('[style*="flex-end"]')
    expect(streakContainer?.children.length).toBe(12)
  })

  it("renders default column headings when not specified", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[]}
        streakLabel="x"
        topSell={[]}
        topBuy={[]}
      />
    )
    expect(screen.getByText("▼ TOP BÁN")).toBeInTheDocument()
    expect(screen.getByText("▲ TOP MUA")).toBeInTheDocument()
  })
})
