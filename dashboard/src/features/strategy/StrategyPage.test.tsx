import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { StrategyPage } from "./StrategyPage"

// mock heavy children to keep the test about the tab shell
vi.mock("@/features/alerts", () => ({ AlertsInner: () => <div>ALERTS_TAB</div> }))
vi.mock("@/features/backtest", () => ({ BacktestLab: () => <div>BACKTEST_TAB</div> }))
vi.mock("@/features/premium", () => ({ PremiumGate: ({ children }: any) => <>{children}</> }))

it("defaults to Cảnh báo tab and switches to Backtest", () => {
  render(<MemoryRouter initialEntries={["/chien-luoc"]}><StrategyPage /></MemoryRouter>)
  expect(screen.getByText("ALERTS_TAB")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: /Backtest/i }))
  expect(screen.getByText("BACKTEST_TAB")).toBeInTheDocument()
})

it("honors ?tab=backtest", () => {
  render(<MemoryRouter initialEntries={["/chien-luoc?tab=backtest"]}><StrategyPage /></MemoryRouter>)
  expect(screen.getByText("BACKTEST_TAB")).toBeInTheDocument()
})

it("carries a data-tour-id on the tab bar (Backtester tour's step 1 target, T3)", () => {
  const { container } = render(<MemoryRouter initialEntries={["/chien-luoc"]}><StrategyPage /></MemoryRouter>)
  expect(container.querySelector('[data-tour-id="tour-strategy-tabs"]')).not.toBeNull()
})
