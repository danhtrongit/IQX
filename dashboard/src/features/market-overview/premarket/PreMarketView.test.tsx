// PreMarketView.test.tsx
import { render, screen, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { formatSessionDate } from "../home-analysis/formatSessionDate"

// ─── Test fixture ─────────────────────────────────────────────────────────────
// 2 world cells (one null/stale), 2 news, 1 event, 3 watchlist items
// session_date "2026-07-03" is used together with fake timers set to that date
// so the stale-brief gate (session_date === localTodayIso) evaluates correctly.
const FIXTURE_DATE = "2026-07-03" // Thursday — a real weekday
const fixture = {
  id: "pm-test-1",
  session_date: FIXTURE_DATE,
  report_type: "premarket" as const,
  headline: "Thị trường toàn cầu ổn định — VN-Index có thể mở cửa tích cực",
  tagline: { text: "Thận trọng, chờ xác nhận" },
  paragraphs: {
    world_paragraph: "Dow Jones <span class='up-text'>+0,5%</span> qua đêm.",
  },
  watchlist: [
    { level: "normal", content: "VCB — theo dõi thanh khoản" },
    { level: "alert",  content: "HPG — áp lực bán gia tăng" },
    { level: "warn",   content: "MSN — cảnh báo đột biến" },
  ],
  meta: {
    world_overview: {
      cells: [
        {
          id: "dji",
          label: "Dow Jones",
          value: 42500,
          change_pct: 0.5,
          sentiment: "up" as const,
          stale: false,
        },
        {
          id: "nikkei",
          label: "Nikkei 225",
          value: null,
          change_pct: null,
          sentiment: "flat" as const,
          stale: true,
        },
      ],
    },
    hot_news: [
      {
        id: "n1",
        title: "Fed giữ nguyên lãi suất trong tháng 7",
        summary: "Quyết định tháng 7",
        source: "Bloomberg",
        published_at: "2026-07-03T02:00:00Z",
        tickers: ["VCB", "TCB"],
        // REAL backend value: vietcap sentiment passes through VERBATIM
        // ("Positive"/"Negative"/"Neutral") — never lowercase "pos"/"neg".
        sentiment: "Positive",
        url: "#",
        insight: "Tín hiệu tích cực cho <strong>ngân hàng</strong>.",
        rank_order: 1,
      },
      {
        id: "n2",
        title: "Giá dầu WTI tăng 2% do nguồn cung thắt chặt",
        summary: "Dầu tăng",
        source: "Reuters",
        published_at: "2026-07-03T01:30:00Z",
        tickers: ["GAS", "PLX"],
        sentiment: "Negative",
        url: "#",
        insight: "Áp lực lên chi phí sản xuất.",
        rank_order: 2,
      },
    ],
    events_filtered: [
      {
        id: "e1",
        type: "ex_dividend",
        time: "2026-07-03T00:00:00Z",
        time_label: "Ngày GD không hưởng quyền",
        title: "VCB trả cổ tức 10%",
        tickers: ["VCB"],
        note: "",
        impact: "high",
      },
    ],
  },
}

// ─── Hoisted mock control ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({ payload: null as unknown }))

vi.mock("@/shared/http/client", () => ({
  api: { get: () => ({ json: async () => h.payload }) },
}))

import { PreMarketView } from "./PreMarketView"

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PreMarketView />
    </QueryClientProvider>,
  )
}

// ─── Test 1: with data ────────────────────────────────────────────────────────
// Pin system time to the fixture date (2026-07-03) so session_date === localTodayIso()
// and the ATO countdown is visible (before 09:00).
describe("PreMarketView — with data", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Thursday July 3 07:30 — fixture date matches today, countdown is before 09:00
    vi.setSystemTime(new Date(2026, 6, 3, 7, 30, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders SÁNG NAY badge, a null/stale cell as '—', news insight, impact chip, and countdown", async () => {
    h.payload = fixture
    renderView()

    // Badge
    await waitFor(() =>
      expect(screen.getByText(/SÁNG NAY/)).toBeInTheDocument(),
    )

    // Null / stale cell → "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1)

    // News insight (sanitizeInline strips <strong> tags but keeps text)
    expect(screen.getByText(/ngân hàng/)).toBeInTheDocument()

    // Impact chip "Cao" for the high-impact event
    expect(screen.getByText("Cao")).toBeInTheDocument()

    // ATO countdown element present
    const countdown = screen.getByTestId("ato-countdown")
    expect(countdown).toBeInTheDocument()
    // Should render HH:MM:SS format
    expect(countdown.textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it("maps real backend sentiment values (Positive/Negative) to pos/neg chips", async () => {
    h.payload = fixture
    renderView()

    await waitFor(() =>
      expect(screen.getByText(/SÁNG NAY/)).toBeInTheDocument(),
    )

    // "Positive" → green chip "Tích cực"
    const pos = screen.getByText("Tích cực")
    expect(pos).toHaveClass("pm-news-chip--pos")

    // "Negative" → red chip "Tiêu cực"
    const neg = screen.getByText("Tiêu cực")
    expect(neg).toHaveClass("pm-news-chip--neg")

    // Neither chip may fall through to the neutral default
    expect(screen.queryByText("Trung lập")).not.toBeInTheDocument()
  })
})

// ─── Test 1b: countdown tick ──────────────────────────────────────────────────
describe("PreMarketView — ATO countdown tick", () => {
  beforeEach(() => {
    // Fix time to 07:30 → 09:00 is in the future → countdown shows
    // Use shouldAdvanceTime so Promises (React Query) still resolve
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 3, 7, 30, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("ticks every 1 s and updates the countdown display", async () => {
    h.payload = fixture
    renderView()

    await waitFor(() => expect(screen.getByTestId("ato-countdown")).toBeInTheDocument())

    const before = screen.getByTestId("ato-countdown").textContent

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    const after = screen.getByTestId("ato-countdown").textContent
    // After 1 s the countdown should have changed
    expect(after).not.toBe(before)
  })
})

// ─── Test 2: no data → "đang xử lý" notice, no brief ever ────────────────────
describe("PreMarketView — no data", () => {
  it('renders the "đang xử lý" notice and nothing else when data is absent', async () => {
    h.payload = null
    renderView()

    await waitFor(() =>
      expect(screen.getByText(/Bản trước phiên đang xử lý\./)).toBeInTheDocument(),
    )

    // No brief content, and no EOD fallback of any kind
    expect(screen.queryByText(/SÁNG NAY/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("market-daily-page")).not.toBeInTheDocument()
  })
})

// ─── Test 3 (Finding 1): stale-brief date-gate for PreMarketView ──────────────
// Weekday anchor: Monday July 6, 2026 (getDay()=1).
// Weekend anchor: Sunday July 5, 2026 (getDay()=0).
// yesterdayFixture.session_date = "2026-07-05" (Sunday) — stale when system=Monday.
// todayFixture.session_date     = "2026-07-06" (Monday) — matches system=Monday.
const MON_JUL6_0730 = new Date(2026, 6, 6, 7, 30, 0) // Monday Jul 6
const SUN_JUL5_0800 = new Date(2026, 6, 5, 8, 0, 0)  // Sunday Jul 5

const yesterdayFixture = {
  ...fixture,
  id: "pm-yesterday",
  session_date: "2026-07-05", // Sunday — stale on Monday
}

// Today's fixture — session_date matches Monday 2026-07-06
const todayFixture = {
  ...fixture,
  id: "pm-today",
  session_date: "2026-07-06",
}

describe("PreMarketView — stale-brief date-gate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("weekday + yesterday's session_date → renders the brief's OWN headline + stale banner, no EOD fallback, no countdown", async () => {
    vi.setSystemTime(MON_JUL6_0730) // Monday Jul 6
    h.payload = yesterdayFixture    // session_date "2026-07-05" ≠ "2026-07-06"
    renderView()

    // The premarket brief's own headline renders (NOT the EOD fallback)
    await waitFor(() => expect(screen.getByText(/SÁNG NAY/)).toBeInTheDocument())
    expect(screen.getByText(yesterdayFixture.headline)).toBeInTheDocument()

    // Stale banner present, referencing the brief's own (old) session date
    expect(
      screen.getByText(
        new RegExp(`Bản gần nhất ${formatSessionDate(yesterdayFixture.session_date)} · chưa cập nhật hôm nay`),
      ),
    ).toBeInTheDocument()

    // Never falls back to MarketDailyPage / EOD, and no live countdown
    expect(screen.queryByTestId("market-daily-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("ato-countdown")).not.toBeInTheDocument()
  })

  it("weekend + stale session_date → article IS rendered with stale banner, ATO countdown NOT rendered", async () => {
    vi.setSystemTime(SUN_JUL5_0800) // Sunday Jul 5
    // Brief is from Saturday July 4 — stale vs Sunday but weekend → show
    h.payload = { ...fixture, id: "pm-sat", session_date: "2026-07-04" }
    renderView()

    await waitFor(() => expect(screen.getByText(/SÁNG NAY/)).toBeInTheDocument())
    // Stale banner present
    expect(
      screen.getByText(new RegExp(`Bản gần nhất ${formatSessionDate("2026-07-04")} · chưa cập nhật hôm nay`)),
    ).toBeInTheDocument()
    // ATO countdown must NOT appear (session_date "2026-07-04" ≠ today "2026-07-05")
    expect(screen.queryByTestId("ato-countdown")).not.toBeInTheDocument()
  })

  it("weekday + today's session_date → article + ATO countdown rendered, no stale banner (regression guard)", async () => {
    vi.setSystemTime(MON_JUL6_0730) // Monday Jul 6 07:30 — before 09:00, countdown shows
    h.payload = todayFixture         // session_date "2026-07-06" = today
    renderView()

    await waitFor(() => expect(screen.getByText(/SÁNG NAY/)).toBeInTheDocument())
    expect(screen.getByTestId("ato-countdown")).toBeInTheDocument()
    expect(screen.queryByTestId("market-daily-page")).not.toBeInTheDocument()
    expect(screen.queryByText(/chưa cập nhật hôm nay/)).not.toBeInTheDocument()
  })
})
