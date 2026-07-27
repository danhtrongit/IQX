// AIPatternPanel.test.tsx — AI Mẫu nến tour wiring (T5, docs/superpowers/
// plans/2026-07-27-feature-tours.md), spec `IQX-Tour-MauNen.md` v1.0.
//
// PREMIUM tour: `AIPatternPanel` is already wrapped in a `<PremiumGate>` by
// `RightSidebar.tsx` (case "patterns") — but per the SAME rationale as
// `backtest/BacktestLab.test.tsx` / `alerts/AlertsPage.test.tsx` /
// `portfolio-manager/PortfolioAnalysisButton.test.tsx`, `PremiumGate` still
// renders its children (blurred, `pointer-events-none`) behind the locked
// overlay for free users, so the panel gates its own "Xem hướng dẫn" launch
// button behind an explicit `usePremiumStatus()` check. Because `isPremium`
// varies across tests in this file, each test does a fresh
// `vi.resetModules()` + `vi.doMock` + dynamic `import()` (established
// pattern).
//
// `usePatterns` (`./hooks`) is mocked directly (network-free, deterministic)
// — the panel is rendered inside a real `SymbolProvider` (not mocked) since
// `useSymbol()` is a plain context read, not a network hook.
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { SymbolProvider } from "@/shared/contexts/symbol-context"
import { mauNenTour } from "@/features/tour/configs/mauNenTour"
import type { PatternItem } from "./api"

const STORAGE_KEY = "iqx_tour_maunen"

const patternFixture: PatternItem[] = [
  {
    symbol: "VCB",
    name: "Hammer",
    signal: "bullish",
    signalLabel: null,
    state: "Cao",
    meaning: "Phe mua đã giành lại quyền kiểm soát sau một phiên bán mạnh.",
    action: "Theo dõi xác nhận ở phiên kế tiếp trước khi giải ngân.",
    illustration: null,
  },
  {
    symbol: "VCB",
    name: "Doji",
    signal: "neutral",
    signalLabel: null,
    state: null,
    meaning: "Lưỡng lự giữa bên mua và bên bán.",
    action: "Chờ tín hiệu rõ ràng hơn.",
    illustration: null,
  },
]

function mockPatterns(opts: { items?: PatternItem[]; isLoading?: boolean; isError?: boolean }) {
  vi.doMock("./hooks", () => ({
    usePatterns: () => ({
      items: opts.items ?? [],
      isLoading: opts.isLoading ?? false,
      isError: opts.isError ?? false,
    }),
  }))
}

async function renderPanel(opts: {
  isPremium: boolean
  items?: PatternItem[]
  isLoading?: boolean
  isError?: boolean
}) {
  vi.resetModules()
  window.localStorage.removeItem(STORAGE_KEY)
  vi.doMock("@/features/premium", () => ({
    usePremiumStatus: () => ({ isPremium: opts.isPremium, isLoading: false }),
  }))
  mockPatterns(opts)
  const { AIPatternPanel } = await import("./AIPatternPanel")
  return render(
    <SymbolProvider symbol="VCB">
      <AIPatternPanel />
    </SymbolProvider>,
  )
}

describe("AIPatternPanel — AI Mẫu nến tour wiring", () => {
  it("hides the tour launch button for non-premium users", async () => {
    await renderPanel({ isPremium: false, items: patternFixture })
    expect(screen.queryByText("Xem hướng dẫn")).not.toBeInTheDocument()
  })

  it("shows the tour launch button for premium users and starts the tour on click", async () => {
    await renderPanel({ isPremium: true, items: patternFixture })
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Xem hướng dẫn"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(mauNenTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${mauNenTour.steps.length}`)).toBeInTheDocument()
  })

  it("grounds the header + kind-switch targets regardless of pattern data (always-mounted chrome)", async () => {
    const { container } = await renderPanel({ isPremium: true, items: [] })
    expect(container.querySelector('[data-tour-id="tour-maunen-header"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-kind-switch"]')).not.toBeNull()
  })

  it("grounds the scanning-overlay target while patterns are loading", async () => {
    const { container } = await renderPanel({ isPremium: true, isLoading: true })
    expect(container.querySelector('[data-tour-id="tour-maunen-scanning"]')).not.toBeNull()
  })

  it("grounds hero/illustration/meaning-action/list once a pattern is loaded", async () => {
    const { container } = await renderPanel({ isPremium: true, items: patternFixture })
    expect(container.querySelector('[data-tour-id="tour-maunen-hero"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-illustration"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-meaning-action"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-list"]')).not.toBeNull()
  })

  it("does NOT render the pattern-dependent targets when no pattern is loaded (target-not-found→centered fallback handles this, per plan)", async () => {
    const { container } = await renderPanel({ isPremium: true, items: [] })
    expect(screen.getByText(/Chưa có pattern cho/)).toBeInTheDocument()
    expect(container.querySelector('[data-tour-id="tour-maunen-hero"]')).toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-illustration"]')).toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-meaning-action"]')).toBeNull()
    expect(container.querySelector('[data-tour-id="tour-maunen-list"]')).toBeNull()
  })
})
