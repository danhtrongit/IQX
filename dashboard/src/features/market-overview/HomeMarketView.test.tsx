// HomeMarketView.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect, vi } from "vitest"

// Mutable mode so each test picks the display mode without touching the wall
// clock. Only DIRECT children are mocked (never transitive grandchildren).
const mocks = vi.hoisted(() => ({ mode: "midday" }))
vi.mock("./midday/getDisplayMode", () => ({ getDisplayMode: () => mocks.mode }))
vi.mock("./midday/MidDayView", () => ({ MidDayView: () => <div>MIDDAY_VIEW</div> }))
vi.mock("./daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>EOD_PAGE</div> }))
vi.mock("./premarket/PreMarketView", () => ({ PreMarketView: () => <div>PREMARKET_VIEW</div> }))
import { HomeMarketView } from "./HomeMarketView"

describe("HomeMarketView", () => {
  it("renders MidDayView in midday mode", () => {
    mocks.mode = "midday"
    render(<HomeMarketView />)
    expect(screen.getByText("MIDDAY_VIEW")).toBeInTheDocument()
    expect(screen.queryByText("EOD_PAGE")).not.toBeInTheDocument()
    expect(screen.queryByText("PREMARKET_VIEW")).not.toBeInTheDocument()
  })

  it("renders MidDayView in midday_loading mode", () => {
    mocks.mode = "midday_loading"
    render(<HomeMarketView />)
    expect(screen.getByText("MIDDAY_VIEW")).toBeInTheDocument()
    expect(screen.queryByText("PREMARKET_VIEW")).not.toBeInTheDocument()
  })

  it("renders PreMarketView in premarket mode", () => {
    mocks.mode = "premarket"
    render(<HomeMarketView />)
    expect(screen.getByText("PREMARKET_VIEW")).toBeInTheDocument()
    expect(screen.queryByText("MIDDAY_VIEW")).not.toBeInTheDocument()
    expect(screen.queryByText("EOD_PAGE")).not.toBeInTheDocument()
  })

  it("renders MarketDailyPage in eod modes", () => {
    mocks.mode = "eod_today"
    render(<HomeMarketView />)
    expect(screen.getByText("EOD_PAGE")).toBeInTheDocument()
    expect(screen.queryByText("MIDDAY_VIEW")).not.toBeInTheDocument()
    expect(screen.queryByText("PREMARKET_VIEW")).not.toBeInTheDocument()
  })
})
