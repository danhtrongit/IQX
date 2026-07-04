import React from "react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HomeMarketView } from "./HomeMarketView"

vi.mock("./daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div data-testid="eod-view" /> }))
vi.mock("./midday/MidDayView", () => ({ MidDayView: () => <div data-testid="midday-view" /> }))
vi.mock("./premarket/PreMarketView", () => ({ PreMarketView: () => <div data-testid="premarket-view" /> }))

const daily = vi.hoisted(() => ({ data: undefined as unknown }))
const midday = vi.hoisted(() => ({ data: undefined as unknown }))
const premarket = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock("./daily/useDailyMarketAnalysis", () => ({ useDailyMarketAnalysis: () => daily }))
vi.mock("./midday/useMidDayAnalysis", () => ({ useMidDayAnalysis: () => midday }))
vi.mock("./premarket/usePreMarketAnalysis", () => ({ usePreMarketAnalysis: () => premarket }))

beforeEach(() => {
  daily.data = undefined
  midday.data = undefined
  premarket.data = undefined
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => vi.useRealTimers())

describe("HomeMarketView (session tabs)", () => {
  it("20:00 T2 → tab Cuối phiên active, render EOD view", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 20, 0))
    render(<HomeMarketView />)
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("eod-view")).toBeInTheDocument()
  })
  it("08:30 T2 → tab Trước phiên active, render premarket view", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 8, 30))
    render(<HomeMarketView />)
    expect(screen.getByTestId("premarket-view")).toBeInTheDocument()
  })
  it("10:00 T7 → Cuối phiên active (cuối tuần)", () => {
    vi.setSystemTime(new Date(2026, 6, 4, 10, 0))
    render(<HomeMarketView />)
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toHaveAttribute("aria-selected", "true")
  })
  it("click tab khác đổi view, không auto-revert", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 20, 0))
    render(<HomeMarketView />)
    fireEvent.click(screen.getByRole("tab", { name: /Giữa phiên/ }))
    expect(screen.getByTestId("midday-view")).toBeInTheDocument()
    expect(screen.queryByTestId("eod-view")).not.toBeInTheDocument()
  })
  it("meta hiển thị ngày của brief đang xem", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 20, 0))
    daily.data = { session_date: "2026-07-06", generated_at: "2026-07-06T16:30:00" }
    render(<HomeMarketView />)
    expect(screen.getByText("Thứ Hai, 06/07/2026")).toBeInTheDocument()
  })
  it("pill MỚI trên tab có generated_at mới nhất hôm nay", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0))
    premarket.data = { session_date: "2026-07-06", generated_at: "2026-07-06T07:15:00" }
    midday.data = { session_date: "2026-07-06", generated_at: "2026-07-06T11:30:00" }
    render(<HomeMarketView />)
    expect(screen.getByRole("tab", { name: /Giữa phiên/ })).toHaveTextContent("MỚI")
    expect(screen.getByRole("tab", { name: /Trước phiên/ })).not.toHaveTextContent("MỚI")
  })
  it("brief cũ (không phải hôm nay) → không MỚI", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0))
    midday.data = { session_date: "2026-07-03", generated_at: "2026-07-03T11:30:00" }
    render(<HomeMarketView />)
    expect(screen.queryByText("MỚI")).not.toBeInTheDocument()
  })
})
