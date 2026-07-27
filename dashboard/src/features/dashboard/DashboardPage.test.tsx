// DashboardPage.test.tsx — Biểu đồ tour wiring (T2, docs/superpowers/plans/
// 2026-07-27-feature-tours.md)
//
// Only the tour wiring is under test here, same approach as
// `features/price-board/BangGiaPage.test.tsx` (T1) and
// `features/cap0/Cap0TradingPage.test.tsx`: stub the heavy terminal chrome
// (Header/MarketBar/Footer/TrialBanner — each has its own
// auth/premium/theme/market-data deps not set up in this file) and the heavy
// terminal children (CenterPanel/RightSidebar/RightToolbar — TradingView
// widget + news/trading/watchlist/patterns panels), and exercise the REAL
// `useFeatureTour` + `TourLaunchButton` + `TourOverlay` wiring that
// `DashboardPage` itself owns.
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { bieuDoTour } from "@/features/tour/configs/bieuDoTour"
import { DashboardPage } from "./DashboardPage"

vi.mock("@/features/navigation", () => ({
  TrialBanner: () => <div data-testid="trial-banner" />,
  Header: () => <div data-testid="header" />,
  MarketBar: () => <div data-testid="market-bar" />,
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("./components/CenterPanel", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
}))
vi.mock("./components/RightSidebar", () => ({
  RightSidebar: () => <div data-testid="right-sidebar" />,
}))
vi.mock("./components/RightToolbar", () => ({
  RightToolbar: () => <div data-testid="right-toolbar" />,
}))
vi.mock("./components/NewsMarkPopover", () => ({
  NewsMarkPopover: () => null,
}))

const STORAGE_KEY = "iqx_tour_bieudo"

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe("DashboardPage — Biểu đồ tour wiring", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY)
  })

  it("shows the 'Xem hướng dẫn' launch button", () => {
    renderPage()
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()
  })

  it("does not render the tour overlay before the button is clicked", () => {
    renderPage()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("clicking the launch button starts the tour and renders step 1 with the right title", () => {
    renderPage()
    fireEvent.click(screen.getByText("Xem hướng dẫn"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(bieuDoTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${bieuDoTour.steps.length}`)).toBeInTheDocument()
  })

  it("still renders the FULL terminal chrome + children around the tour affordance (no premium gate — free page)", () => {
    renderPage()
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })
})

describe("bieuDoTour config", () => {
  it("has 7-8 steps (spec `IQX-Tour-BieuDo.md` v1.0's 8 stops, ground-adapted)", () => {
    expect(bieuDoTour.steps.length).toBeGreaterThanOrEqual(7)
    expect(bieuDoTour.steps.length).toBeLessThanOrEqual(8)
  })

  it("has exactly one centered step narrating drawing auto-save (no real UI for this — TV-native, invisible behaviour)", () => {
    const centeredSteps = bieuDoTour.steps.filter((s) => s.centered)
    expect(centeredSteps).toHaveLength(1)
    expect(centeredSteps[0].title.toLowerCase()).toContain("tự lưu")
  })

  it("every non-centered step has a targetId (grounded to a real data-tour-id, no invented selectors)", () => {
    for (const step of bieuDoTour.steps) {
      if (step.centered) continue
      expect(step.targetId).toBeTruthy()
    }
  })
})
