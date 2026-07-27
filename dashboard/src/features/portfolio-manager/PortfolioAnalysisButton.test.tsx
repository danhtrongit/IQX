// PortfolioAnalysisButton.test.tsx — Người quản lý danh mục tour wiring
// (T4, docs/superpowers/plans/2026-07-27-feature-tours.md)
//
// PREMIUM tour, same rationale as `backtest/BacktestLab.test.tsx` /
// `alerts/AlertsPage.test.tsx`: the "Xem hướng dẫn" launch button gates on its
// own explicit `usePremiumStatus()` check, separate from the modal's own
// `PremiumGate` (which still renders — blurred — for free users who open the
// REAL "Phân tích danh mục" button). Because `isPremium` needs to vary per
// test, each test resets modules + `vi.doMock`s `@/features/premium` + does a
// dynamic `import()` (established pattern, see `BacktestLab.test.tsx`).
//
// The real network layer (`useAnalyzePortfolio`, a TanStack Query mutation)
// is mocked via `./hooks` exactly like `PortfolioReport.test.tsx` does — the
// tour path never calls it (injected sample fixture only); this lets the
// REAL `PortfolioReport` (unmocked) render for real inside the modal so the
// tour's `data-tour-id` targets can be asserted against actual DOM.
//
// Arco `Modal` portals to `document.body` (not the RTL `render()` container)
// and also sets `role="dialog"` on its own wrapper — so lookups below use
// `document.querySelector`/`screen` (which search the whole document) rather
// than the local `container`, and avoid `getByRole("dialog")` (ambiguous once
// both the Arco Modal and the tour's own `role="dialog"` tooltip are mounted
// at the same time in tour mode).
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { quanLyDanhMucTour } from "@/features/tour/configs/quanLyDanhMucTour"

// Every test below does a fresh `vi.resetModules()` + dynamic `import()` (see
// rationale above) — the FIRST one to run pays a cold module-graph-transform
// cost (this file's chain pulls in Arco `Modal`, all 14 report blocks, the
// tour engine, and the sample fixture) that can exceed the default 5000ms
// under concurrent test-file load, even though it's under 2s in isolation.
// Not a logic bug — bump this file's timeout accordingly.
vi.setConfig({ testTimeout: 15_000 })

const STORAGE_KEY = "iqx_tour_quanlydanhmuc"

function mockHooks() {
  vi.doMock("./hooks", () => ({
    useAnalyzePortfolio: () => ({
      report: null,
      analyze: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    }),
  }))
}

async function renderButton(opts: { isPremium: boolean }) {
  vi.resetModules()
  window.localStorage.removeItem(STORAGE_KEY)
  vi.doMock("@/features/premium", () => ({
    usePremiumStatus: () => ({ isPremium: opts.isPremium, isLoading: false }),
    PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }))
  mockHooks()
  const { PortfolioAnalysisButton } = await import("./PortfolioAnalysisButton")
  return render(<PortfolioAnalysisButton />)
}

describe("PortfolioAnalysisButton", () => {
  it("renders the launch button (modal closed → no providers needed)", async () => {
    await renderButton({ isPremium: true })
    expect(screen.getByRole("button", { name: /Phân tích danh mục/i })).toBeInTheDocument()
  })
})

describe("PortfolioAnalysisButton — Người quản lý danh mục tour wiring", () => {
  it("hides the tour launch button for non-premium users", async () => {
    await renderButton({ isPremium: false })
    expect(screen.queryByText("Xem hướng dẫn")).not.toBeInTheDocument()
  })

  it("shows the tour launch button for premium users, and clicking it opens the modal with the injected sample report + starts the tour", async () => {
    await renderButton({ isPremium: true })
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Xem hướng dẫn"))

    // Injected sample report rendered (real hero score 3.5 from the fixture) —
    // proves the tour path used `injected`, not the (mocked-null) real fetch.
    expect(screen.getByText("3.5")).toBeInTheDocument()

    // Tour overlay active at step 1.
    expect(screen.getByText(quanLyDanhMucTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${quanLyDanhMucTour.steps.length}`)).toBeInTheDocument()
  })

  it("grounds every non-centered tour step to a real report-block wrapper once the tour is open", async () => {
    await renderButton({ isPremium: true })
    fireEvent.click(screen.getByText("Xem hướng dẫn"))

    const groundedIds = quanLyDanhMucTour.steps.filter((s) => !s.centered).map((s) => s.targetId)
    for (const id of groundedIds) {
      expect(document.querySelector(`[data-tour-id="${id}"]`)).not.toBeNull()
    }
  })

  it("the real 'Phân tích danh mục' button still opens the real (non-tour, PremiumGate-wrapped) report — unaffected by the tour wiring", async () => {
    await renderButton({ isPremium: true })
    fireEvent.click(screen.getByRole("button", { name: /Phân tích danh mục/i }))

    // Real path: mocked hook reports `report: null` → PortfolioReport shows its
    // loading fallback, NOT the injected sample's hero score.
    expect(screen.queryByText("3.5")).not.toBeInTheDocument()
    expect(screen.getByText(/AI đang phân tích danh mục/)).toBeInTheDocument()
  })

  it("does not start the tour when the free (non-premium) real button is used", async () => {
    await renderButton({ isPremium: false })
    fireEvent.click(screen.getByRole("button", { name: /Phân tích danh mục/i }))
    expect(screen.queryByText(quanLyDanhMucTour.steps[0].title)).not.toBeInTheDocument()
  })
})

describe("quanLyDanhMucTour config", () => {
  it("has ~12 steps (spec `IQX-Tour-QuanLyDanhMuc.md` v1.0's 12 stops)", () => {
    expect(quanLyDanhMucTour.steps.length).toBeGreaterThanOrEqual(11)
    expect(quanLyDanhMucTour.steps.length).toBeLessThanOrEqual(13)
  })

  it("first step is a centered intro card (report only exists once the tour itself has opened the modal — no real pre-modal target)", () => {
    expect(quanLyDanhMucTour.steps[0].centered).toBe(true)
  })

  it("every step after the intro has a targetId grounded to a real report-block wrapper", () => {
    for (const step of quanLyDanhMucTour.steps.slice(1)) {
      expect(step.centered).toBeFalsy()
      expect(step.targetId).toBeTruthy()
    }
  })

  it("FAITHFULNESS: no step claims the correlation heatmap has its own manager-voice quote (narrative.layers.risk isn't rendered by any component)", () => {
    const correlationStep = quanLyDanhMucTour.steps.find((s) => s.targetId === "tour-pm-correlation")
    expect(correlationStep).toBeDefined()
    expect(correlationStep!.body).not.toMatch(/người quản lý/i)
  })

  it("targetIds are unique", () => {
    const ids = quanLyDanhMucTour.steps.map((s) => s.targetId).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
