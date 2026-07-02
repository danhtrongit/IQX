// HomeMarketView.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect, vi } from "vitest"
vi.mock("./midday/getDisplayMode", () => ({ getDisplayMode: () => "midday" }))
vi.mock("./midday/MidDayView", () => ({ MidDayView: () => <div>MIDDAY_VIEW</div> }))
vi.mock("./daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>EOD_PAGE</div> }))
import { HomeMarketView } from "./HomeMarketView"

describe("HomeMarketView", () => {
  it("renders MidDayView in midday mode", () => {
    render(<HomeMarketView />)
    expect(screen.getByText("MIDDAY_VIEW")).toBeInTheDocument()
    expect(screen.queryByText("EOD_PAGE")).not.toBeInTheDocument()
  })
})
