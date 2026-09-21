import { fireEvent, render, screen } from "@testing-library/react"
import React, { useEffect } from "react"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

const mocks = vi.hoisted(() => ({
  cap0: vi.fn(() => ({ isCap0Active: false })),
  cap0Progress: vi.fn(() => ({ data: null })),
  cap1: vi.fn(() => ({ isCap1Active: false })),
  cap2: vi.fn(() => ({ isCap2Active: false })),
  cap3: vi.fn(() => ({ isCap3Active: false })),
  cap4: vi.fn(() => ({ isCap4Active: false })),
  cap5: vi.fn(() => ({ isCap5Active: false })),
  cap6: vi.fn(() => ({ isCap6Active: false })),
  cap6Progress: vi.fn(
    (): { data: { graduated_at: string | null } | null } => ({ data: null }),
  ),
  cap7: vi.fn(() => ({ isCap7Active: false })),
  cap8: vi.fn(() => false),
}))

vi.mock("@/features/cap0/Cap0Context", () => ({ useCap0Events: () => mocks.cap0() }))
vi.mock("@/features/cap0/hooks", () => ({ useCap0Progress: () => mocks.cap0Progress() }))
vi.mock("@/features/cap1/Cap1Context", () => ({ useCap1Events: () => mocks.cap1() }))
vi.mock("@/features/cap2/Cap2Context", () => ({ useCap2Events: () => mocks.cap2() }))
vi.mock("@/features/cap3/Cap3Context", () => ({ useCap3Events: () => mocks.cap3() }))
vi.mock("@/features/cap4/Cap4Context", () => ({ useCap4Events: () => mocks.cap4() }))
vi.mock("@/features/cap5/Cap5Context", () => ({ useCap5Events: () => mocks.cap5() }))
vi.mock("@/features/cap6/Cap6Context", () => ({ useCap6Events: () => mocks.cap6() }))
vi.mock("@/features/cap6/hooks", () => ({ useCap6Progress: () => mocks.cap6Progress() }))
vi.mock("@/features/cap7/Cap7Context", () => ({ useCap7Events: () => mocks.cap7() }))
vi.mock("@/features/cap8/Cap8Context", () => ({ useCap8Active: () => mocks.cap8() }))

vi.mock("@/features/bot", () => ({ BotPanel: () => <div data-testid="bot-panel-real-slot">BOT_PANEL</div> }))
vi.mock("@/features/journey-identity/IdentityPanel", () => ({
  IdentityPanel: () => <div data-testid="identity-panel-real-slot">IDENTITY_PANEL</div>,
}))
vi.mock("@/features/cap0/JourneyPanel", () => ({ JourneyPanel: () => <div data-testid="journey-cap0" /> }))
vi.mock("@/features/cap1/JourneyPanelCap1", () => ({ JourneyPanelCap1: () => <div /> }))
vi.mock("@/features/cap1/Cap1PortfolioAnalysisPanel", () => ({ Cap1PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap2/JourneyPanelCap2", () => ({ JourneyPanelCap2: () => <div /> }))
vi.mock("@/features/cap2/Cap2PortfolioAnalysisPanel", () => ({ Cap2PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap3/JourneyPanelCap3", () => ({ JourneyPanelCap3: () => <div /> }))
vi.mock("@/features/cap3/Cap3PortfolioAnalysisPanel", () => ({ Cap3PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap4/JourneyPanelCap4", () => ({ JourneyPanelCap4: () => <div /> }))
vi.mock("@/features/cap4/Cap4PortfolioAnalysisPanel", () => ({ Cap4PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap5/JourneyPanelCap5", () => ({ JourneyPanelCap5: () => <div /> }))
vi.mock("@/features/cap5/Cap5PortfolioAnalysisPanel", () => ({ Cap5PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap5/SanMaPanel", () => ({ SanMaPanel: () => <div /> }))
vi.mock("@/features/cap5/Cap5WatchlistPanel", () => ({ Cap5WatchlistPanel: () => <div /> }))
vi.mock("@/features/cap6/JourneyPanelCap6", () => ({ JourneyPanelCap6: () => <div data-testid="journey-cap6" /> }))
vi.mock("@/features/cap6/Cap6PortfolioAnalysisPanel", () => ({ Cap6PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap7/JourneyPanelCap7", () => ({ JourneyPanelCap7: () => <div /> }))
vi.mock("@/features/cap7/Cap7PortfolioAnalysisPanel", () => ({ Cap7PortfolioAnalysisPanel: () => <div /> }))
vi.mock("@/features/cap8/JourneyPanelCap8", () => ({ JourneyPanelCap8: () => <div /> }))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div /> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div /> }))
vi.mock("@/features/watchlist", () => ({ WatchlistPanel: () => <div /> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div /> }))
vi.mock("@/features/premium", () => ({ PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import { RightSidebar } from "./RightSidebar"
import { RightToolbar } from "./RightToolbar"

function RouteProbe() {
  const location = useLocation()
  return <output data-testid="route-probe">{location.pathname}</output>
}

function MainVisual({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount])
  return <div data-testid="main-visual">MAIN_VISUAL</div>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cap0.mockReturnValue({ isCap0Active: false })
  mocks.cap0Progress.mockReturnValue({ data: null })
  mocks.cap1.mockReturnValue({ isCap1Active: false })
  mocks.cap2.mockReturnValue({ isCap2Active: false })
  mocks.cap3.mockReturnValue({ isCap3Active: false })
  mocks.cap4.mockReturnValue({ isCap4Active: false })
  mocks.cap5.mockReturnValue({ isCap5Active: false })
  mocks.cap6.mockReturnValue({ isCap6Active: false })
  mocks.cap6Progress.mockReturnValue({ data: null })
  mocks.cap7.mockReturnValue({ isCap7Active: false })
  mocks.cap8.mockReturnValue(false)
})

function renderTerminal(defaultPanel: "journey" | "bot" = "journey", onMainMount = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/dau-truong"]}>
      <SidebarProvider defaultPanel={defaultPanel}>
        <MainVisual onMount={onMainMount} />
        <RightSidebar />
        <RightToolbar />
        <RouteProbe />
      </SidebarProvider>
    </MemoryRouter>,
  )
}

describe("Bot FunctionalPanel integration", () => {
  it("đổi sang hồ sơ Linh thú không đổi route hoặc remount main visual", () => {
    const mounted = vi.fn()
    mocks.cap1.mockReturnValue({ isCap1Active: true })
    renderTerminal("journey", mounted)
    const mainVisual = screen.getByTestId("main-visual")

    fireEvent.click(screen.getByRole("button", { name: "Linh thú" }))

    expect(screen.getByTestId("identity-panel-real-slot")).toBeInTheDocument()
    expect(screen.getByTestId("main-visual")).toBe(mainVisual)
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("route-probe")).toHaveTextContent("/dau-truong")
  })

  it("ẩn nút Bot ngoài Cấp 6 dù progress mock có graduated_at", () => {
    mocks.cap6Progress.mockReturnValue({ data: { graduated_at: "2026-09-15T00:00:00Z" } })
    renderTerminal()
    expect(screen.queryByRole("button", { name: "Bot của tôi" })).not.toBeInTheDocument()
  })

  it("ẩn nút Bot trong Cấp 6 cho đến khi backend trả graduated_at thật", () => {
    mocks.cap6.mockReturnValue({ isCap6Active: true })
    mocks.cap6Progress.mockReturnValue({ data: { graduated_at: null } })
    renderTerminal()
    expect(screen.queryByRole("button", { name: "Bot của tôi" })).not.toBeInTheDocument()
  })

  it("hiện Bot sau tốt nghiệp; đổi tab không đổi route hoặc remount main visual", () => {
    const mounted = vi.fn()
    mocks.cap6.mockReturnValue({ isCap6Active: true })
    mocks.cap6Progress.mockReturnValue({ data: { graduated_at: "2026-09-15T00:00:00Z" } })
    renderTerminal("journey", mounted)
    const mainVisual = screen.getByTestId("main-visual")
    expect(screen.getByTestId("journey-cap6")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Bot của tôi" }))

    expect(screen.getByTestId("bot-panel-real-slot")).toBeInTheDocument()
    expect(screen.getByTestId("main-visual")).toBe(mainVisual)
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("route-probe")).toHaveTextContent("/dau-truong")
  })

  it("không render Bot qua activePanel sót lại khi chưa tốt nghiệp", () => {
    mocks.cap6.mockReturnValue({ isCap6Active: true })
    mocks.cap6Progress.mockReturnValue({ data: { graduated_at: null } })
    renderTerminal("bot")
    expect(screen.queryByTestId("bot-panel-real-slot")).not.toBeInTheDocument()
    expect(screen.getByTestId("journey-cap6")).toBeInTheDocument()
  })
})
