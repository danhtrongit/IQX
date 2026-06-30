import React from "react"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, it, expect, vi } from "vitest"

vi.mock("./useInitialSymbol", () => ({ useInitialSymbol: () => "HPG", persistLastViewedSymbol: vi.fn() }))
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => true }))
vi.mock("@/features/market-overview/daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>MARKET_DAILY</div> }))
vi.mock("./HomeSidePanel", () => ({ HomeSidePanel: ({ active }: { active: string }) => <div>SIDE_{active}</div> }))
vi.mock("./HomeIconRail", () => ({ HomeIconRail: ({ active }: { active: string }) => <div>RAIL_{active}</div> }))
import { HomeWorkspace } from "./HomeWorkspace"

describe("HomeWorkspace", () => {
  it("renders the market content, side panel, and rail with the default tab", () => {
    render(<MemoryRouter><HomeWorkspace /></MemoryRouter>)
    expect(screen.getByText("MARKET_DAILY")).toBeInTheDocument()
    expect(screen.getByText("SIDE_order")).toBeInTheDocument()
    expect(screen.getByText("RAIL_order")).toBeInTheDocument()
  })
})
