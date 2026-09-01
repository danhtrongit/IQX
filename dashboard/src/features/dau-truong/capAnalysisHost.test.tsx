import { render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/cap6/Cap6TradingPage", () => ({
  Cap6TradingPage: () => <div data-testid="cap6-cumulative-shell" />,
}))
vi.mock("@/features/cap7/Cap7Context", () => ({
  Cap7Provider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cap7-provider">{children}</div>
  ),
}))
vi.mock("@/features/cap7/GraduationModalCap7", () => ({
  GraduationModalCap7: () => <div data-testid="cap7-graduation" />,
}))
vi.mock("@/features/cap8/Cap8Context", () => ({
  Cap8Provider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cap8-provider">{children}</div>
  ),
}))
vi.mock("@/features/cap8/GraduationModalCap8", () => ({
  GraduationModalCap8: () => <div data-testid="cap8-graduation" />,
}))

import { Cap7TradingPage } from "@/features/cap7/Cap7TradingPage"
import { Cap8TradingPage } from "@/features/cap8/Cap8TradingPage"

describe("upper-level shell inheritance", () => {
  it("Cấp 7 gates the inherited terminal and adds only its graduation surface", () => {
    render(<Cap7TradingPage />)

    const provider = screen.getByTestId("cap7-provider")
    expect(within(provider).getByTestId("cap6-cumulative-shell")).toBeInTheDocument()
    expect(within(provider).getByTestId("cap7-graduation")).toBeInTheDocument()
  })

  it("Cấp 8 retains Cấp 7's provider-gated terminal before adding terminal graduation", () => {
    render(<Cap8TradingPage />)

    const provider = screen.getByTestId("cap8-provider")
    expect(within(provider).getByTestId("cap7-provider")).toBeInTheDocument()
    expect(within(provider).getByTestId("cap6-cumulative-shell")).toBeInTheDocument()
    expect(within(provider).getByTestId("cap7-graduation")).toBeInTheDocument()
    expect(within(provider).getByTestId("cap8-graduation")).toBeInTheDocument()
  })
})
