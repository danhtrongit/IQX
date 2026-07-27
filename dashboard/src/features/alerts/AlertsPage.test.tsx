// AlertsPage.test.tsx — Cảnh báo tour wiring (T3, docs/superpowers/plans/
// 2026-07-27-feature-tours.md)
//
// PREMIUM tour: `/chien-luoc` wraps BOTH tabs in one shared `PremiumGate`
// (`strategy/StrategyPage.tsx`), but `PremiumGate` still renders its children
// (blurred, `pointer-events-none`) behind the locked overlay for free users —
// so `AlertsInner` gates the launch button behind an explicit
// `usePremiumStatus()` check of its own, not just the ambient gate. `isPremium`
// varies across tests in this file, so (matching the established
// `TradingPanel.cap0Gate.test.tsx` pattern) each test does
// `vi.resetModules()` + `vi.doMock` + a dynamic `import()` rather than a
// single static `vi.mock`.
//
// `TelegramConnect`/`SignalsList`/`RulesList`/`EventsList` are kept REAL (not
// stubbed) — the launch button lives in `AlertsInner` itself, and the tour's
// steps target real data-tour-id-bearing elements inside these children — so
// only their DATA hooks (`./hooks`) are mocked, same approach as
// `price-board/BangGiaPage.test.tsx` (T1) keeping `BoardToolbar`/`BoardTable`
// real.
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { canhBaoTour } from "@/features/tour/configs/canhBaoTour"
import type { AlertEvent, AlertSignal, UserAlertRule } from "./types"

const STORAGE_KEY = "iqx_tour_canhbao"

const signalsFixture: AlertSignal[] = [
  {
    key: "buy_breakout",
    side: "buy",
    ta_name: "Vượt đỉnh 52 tuần",
    message_title: "Giá vượt đỉnh 52 tuần",
    combination: { logic: "AND", conditions: [] },
    is_enabled: true,
    sort_order: 1,
  },
  {
    key: "sell_overbought",
    side: "sell",
    ta_name: "RSI quá mua",
    message_title: "RSI vượt 70",
    combination: { logic: "AND", conditions: [] },
    is_enabled: true,
    sort_order: 2,
  },
]

const ruleFixture: UserAlertRule = {
  id: "r1",
  name: "Cảnh báo tùy chỉnh của tôi",
  side: "buy",
  base_signal_key: "buy_breakout",
  combination: { logic: "AND", conditions: [{ indicator: "high_52w", op: ">", value: null }] },
  is_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const eventFixture: AlertEvent = {
  id: "e1",
  symbol: "VNM",
  signal_key: "buy_breakout",
  session_date: "2026-07-27",
  fired_at: "2026-07-27T09:30:00Z",
  price: 62_400,
  delivered: true,
}

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

function mockHooks(opts: { rules: UserAlertRule[]; events: AlertEvent[] }) {
  vi.doMock("./hooks", () => ({
    useSignals: () => ({ data: signalsFixture, isLoading: false }),
    useRules: () => ({ data: opts.rules }),
    useEvents: () => ({ data: opts.events }),
    useTelegramStatus: () => ({
      data: { linked: false, linked_at: null, bot_username: null },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useCreateRule: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteRule: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateRule: () => ({ mutate: vi.fn(), isPending: false }),
    useTelegramLink: () => ({ mutate: vi.fn(), isPending: false }),
    useTelegramUnlink: () => ({ mutate: vi.fn(), isPending: false }),
  }))
}

async function renderAlertsInner(opts: { isPremium: boolean; rules?: UserAlertRule[]; events?: AlertEvent[] }) {
  vi.resetModules()
  window.localStorage.removeItem(STORAGE_KEY)
  vi.doMock("@/features/premium", () => ({
    usePremiumStatus: () => ({ isPremium: opts.isPremium, isLoading: false }),
  }))
  mockHooks({ rules: opts.rules ?? [], events: opts.events ?? [] })
  const { AlertsInner } = await import("./AlertsPage")
  return render(<AlertsInner />)
}

describe("AlertsInner — Cảnh báo tour wiring", () => {
  it("hides the launch button for non-premium users (defense in depth behind PremiumGate's blur)", async () => {
    await renderAlertsInner({ isPremium: false })
    expect(screen.queryByText("Xem hướng dẫn")).not.toBeInTheDocument()
  })

  it("shows the launch button for premium users and starts the tour on click", async () => {
    await renderAlertsInner({ isPremium: true })
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Xem hướng dẫn"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(canhBaoTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${canhBaoTour.steps.length}`)).toBeInTheDocument()
  })

  it("is empty-tolerant: RulesList/EventsList render their Empty state, but the same data-tour-id anchors stay in the DOM", async () => {
    const { container } = await renderAlertsInner({ isPremium: true, rules: [], events: [] })
    expect(screen.getByText(/Chưa có cảnh báo nào/)).toBeInTheDocument()
    expect(screen.getByText(/Chưa có tín hiệu nào được bắn/)).toBeInTheDocument()
    expect(container.querySelector('[data-tour-id="tour-canhbao-rules"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-canhbao-events"]')).not.toBeNull()
  })

  it("renders populated Rules/Events with the same data-tour-id anchors (not empty-only wiring)", async () => {
    const { container } = await renderAlertsInner({
      isPremium: true,
      rules: [ruleFixture],
      events: [eventFixture],
    })
    expect(screen.getByText(ruleFixture.name)).toBeInTheDocument()
    expect(screen.getByText(eventFixture.symbol)).toBeInTheDocument()
    expect(container.querySelector('[data-tour-id="tour-canhbao-rules"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-canhbao-events"]')).not.toBeNull()
  })

  it("grounds header, Telegram card, and signals grid/toggle regardless of rules/events state", async () => {
    const { container } = await renderAlertsInner({ isPremium: true })
    expect(container.querySelector('[data-tour-id="tour-canhbao-header"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-canhbao-telegram"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-canhbao-signals"]')).not.toBeNull()
    expect(container.querySelector('[data-tour-id="tour-canhbao-signal-toggle"]')).not.toBeNull()
  })
})

describe("canhBaoTour config", () => {
  it("has exactly 9 steps (spec `IQX-Tour-CanhBao.md` v1.0's exact count)", () => {
    expect(canhBaoTour.steps).toHaveLength(9)
  })

  it("has exactly 2 centered concept-card steps (Tạo cảnh báo từ Backtest + Quét trong phiên — no real UI for either)", () => {
    const centered = canhBaoTour.steps.filter((s) => s.centered)
    expect(centered).toHaveLength(2)
  })

  it("every non-centered step has a targetId (grounded, no invented selectors)", () => {
    for (const step of canhBaoTour.steps) {
      if (step.centered) continue
      expect(step.targetId).toBeTruthy()
    }
  })

  it("the 'Công tắc bật/tắt' step reuses the RulesList target (empty-tolerant — no fragile per-row selector)", () => {
    const rulesStep = canhBaoTour.steps.find((s) => s.title === "Danh sách cảnh báo")
    const switchStep = canhBaoTour.steps.find((s) => s.title === "Công tắc bật/tắt")
    expect(rulesStep?.targetId).toBe("tour-canhbao-rules")
    expect(switchStep?.targetId).toBe("tour-canhbao-rules")
  })
})
