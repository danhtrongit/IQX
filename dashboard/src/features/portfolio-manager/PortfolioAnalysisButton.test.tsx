import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock the premium feature so PremiumGate doesn't pull in auth context
// (auth-context.tsx calls localStorage.getItem at module level, which
// isn't available in the bare jsdom environment this test uses)
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))

// Mock PortfolioReport to avoid TanStack Query dependency at render time
vi.mock("./PortfolioReport", () => ({
  PortfolioReport: () => null,
}))

import { PortfolioAnalysisButton } from "./PortfolioAnalysisButton"

describe("PortfolioAnalysisButton", () => {
  it("renders the launch button (modal closed → no providers needed)", () => {
    render(<PortfolioAnalysisButton />)
    expect(screen.getByRole("button", { name: /Phân tích danh mục/i })).toBeInTheDocument()
  })
})
