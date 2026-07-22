// MidDayView.test.tsx
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { formatSessionDate } from "../home-analysis/formatSessionDate"

// ─── Cold-start midday payload (no prior EOD) ────────────────────────────────
// AM tiers are real (am_session); frozen tiers come back "unavailable" with the
// trend_20d / sectors_today keys ABSENT — exactly the shape that crashed
// HealthLineChart / RotationChart before the data_state gate was added.
// session_date matches local today so the stale-brief gate never fires in these
// tests (they test frozen-tier rendering, not date-gating).
function localTodayForFixture() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

const coldStart = {
  id: "m-cold",
  session_date: localTodayForFixture(),
  session_type: "midday",
  session_type_display: null,
  report_type: "midday",
  headline: "VN-Index +0,1% phiên sáng — thanh khoản thấp, chờ dòng tiền chiều",
  tagline: { text: "Đi ngang", color: "neutral" },
  paragraphs: {
    session_structure: { status: "published", content: "<p>a</p>" },
    money_flow: { status: "published", content: "<p>b</p>" },
    market_health: { status: "pending", pending_message: "Chờ EOD", pending_until: "" },
  },
  scenarios: [],
  watchlist: [],
  unexplained: null,
  charts: {
    breadth: {
      ceiling: 1, up: 100, flat: 5, down: 80, floor: 0,
      ratio_up_down: "1 : 0.8", classification: "Đi ngang", pct_above_ma20: null,
      data_state: "am_session",
    },
    contribution: { top_negative: [], top_positive: [], data_state: "am_session" },
    // Frozen tiers unavailable → keys absent → would crash if rendered
    market_health_detail: { data_state: "unavailable" },
    sector_rotation: { data_state: "unavailable" },
  },
}

const h = vi.hoisted(() => ({ payload: null as unknown }))

vi.mock("@/shared/http/client", () => ({
  api: { get: () => ({ json: async () => h.payload }) },
}))

import { MidDayView } from "./MidDayView"

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MidDayView />
    </QueryClientProvider>,
  )
}

// ─── Stale-brief date-gate fixtures ──────────────────────────────────────────
// All test times use fixed dates where the weekday/weekend status is certain:
//   2026-07-06 (Monday, getDay()=1) — weekday test anchor
//   2026-07-05 (Sunday, getDay()=0) — weekend test anchor
// A brief from 2026-07-05 is "yesterday" relative to Monday 2026-07-06.
const WEEKDAY_MON_0915 = new Date(2026, 6, 6, 9, 15, 0)  // Mon Jul 6 09:15
const WEEKDAY_MON_1145 = new Date(2026, 6, 6, 11, 45, 0) // Mon Jul 6 11:45 (before 14:45)
const SUNDAY_1000      = new Date(2026, 6, 5, 10, 0, 0)   // Sun Jul 5 10:00

// Brief dated Sunday (yesterday relative to Monday; stale on Monday)
const yesterdayBrief = {
  ...coldStart,
  id: "m-yesterday",
  session_date: "2026-07-05", // Sunday — stale on Monday 2026-07-06
}

// Brief dated Monday (today relative to Monday anchor)
const todayBrief = {
  ...coldStart,
  id: "m-today",
  session_date: "2026-07-06", // Monday — matches WEEKDAY_MON_*
}

// ─── Finding 1: stale-brief date-gate tests ───────────────────────────────────

describe("MidDayView — stale-brief date-gate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("weekday + yesterday's session_date → renders the brief's OWN headline + stale banner, no EOD fallback, no countdown", async () => {
    vi.setSystemTime(WEEKDAY_MON_0915)
    h.payload = yesterdayBrief
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MidDayView />
      </QueryClientProvider>,
    )
    // The midday brief's own headline renders (NOT the EOD fallback)
    await waitFor(() => expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument())
    expect(screen.getByText(yesterdayBrief.headline)).toBeInTheDocument()

    // Stale banner present, referencing the brief's own (old) session date
    expect(
      screen.getByText(
        new RegExp(`Bản gần nhất ${formatSessionDate(yesterdayBrief.session_date)} · chưa cập nhật hôm nay`),
      ),
    ).toBeInTheDocument()

    // Never falls back to MarketDailyPage / EOD, and no live countdown
    expect(screen.queryByTestId("market-daily-page")).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/đến 14:45/)).not.toBeInTheDocument()
  })

  it("weekend + stale session_date → article IS rendered with stale banner, countdown NOT rendered", async () => {
    // Sunday July 5; brief is from Saturday July 4 (≠ Sunday → stale but weekend → show)
    vi.setSystemTime(SUNDAY_1000)
    h.payload = {
      ...coldStart,
      id: "m-sat-brief",
      session_date: "2026-07-04", // Saturday — ≠ Sunday 2026-07-05, but weekend → show
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MidDayView />
      </QueryClientProvider>,
    )
    // Article renders (stale display on weekend)
    await waitFor(() => expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument())
    // Stale banner present
    expect(
      screen.getByText(new RegExp(`Bản gần nhất ${formatSessionDate("2026-07-04")} · chưa cập nhật hôm nay`)),
    ).toBeInTheDocument()
    // Countdown must NOT appear (data.session_date ≠ localTodayIso)
    expect(screen.queryByLabelText(/đến 14:45/)).not.toBeInTheDocument()
  })

  it("weekday + today's session_date → article + countdown rendered, no stale banner (regression guard)", async () => {
    // Monday Jul 6 at 11:45 — countdown to 14:45 is still in the future
    vi.setSystemTime(WEEKDAY_MON_1145)
    h.payload = todayBrief // session_date "2026-07-06" = today
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MidDayView />
      </QueryClientProvider>,
    )
    // Article renders
    await waitFor(() => expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument())
    // Countdown pill must be present
    await waitFor(() => expect(screen.getByLabelText(/đến 14:45/)).toBeInTheDocument())
    // No fallback, no stale banner
    expect(screen.queryByTestId("market-daily-page")).not.toBeInTheDocument()
    expect(screen.queryByText(/chưa cập nhật hôm nay/)).not.toBeInTheDocument()
  })
})

describe("MidDayView cold-start", () => {
  it("renders without crashing and skips the frozen health tier when data_state is unavailable", async () => {
    h.payload = coldStart
    renderView()
    // AM article renders (headline present) once the query resolves
    await waitFor(() => expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument())
    // Frozen tier must be skipped — the unavailable blocks lack trend_20d /
    // sectors_today and would otherwise crash HealthLineChart / RotationChart.
    // RotationChart's title "Dòng tiền chuyển nhóm" is unique to the frozen
    // tier, so its absence proves the tier was not mounted (and nothing threw).
    expect(screen.queryByText("Dòng tiền chuyển nhóm")).not.toBeInTheDocument()
    // The article's pending "Sức khỏe thị trường" block still shows exactly once.
    expect(screen.getAllByText("Sức khỏe thị trường")).toHaveLength(1)
  })

  it("does not crash when foreign_detail is unavailable (truthy) but prop_detail has AM data — the 2026-07-02 prod crash", async () => {
    // Exact prod shape: foreign flow degraded ({data_state:"unavailable"}, no
    // streak/totals) while prop flow has real AM data. The old truthiness gate
    // rendered ForeignFlowCard which dereferences data.streak.direction → boom.
    h.payload = {
      ...coldStart,
      id: "m-degraded",
      charts: {
        ...coldStart.charts,
        foreign_detail: { data_state: "unavailable" },
        prop_detail: {
          total_buy_vnd_billion: 120, total_sell_vnd_billion: 80, net_vnd_billion: 40,
          last_12_sessions: [1, -2, 3], top_buy: [{ ticker: "SSI", value: 30 }],
          top_sell: [{ ticker: "VND", value: -20 }], data_state: "am_session",
        },
      },
    }
    renderView()
    await waitFor(() => expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument())
    // The prop card (real AM data) must render…
    expect(screen.getByText("Tự doanh CTCK")).toBeInTheDocument()
    // …while the degraded foreign block must NOT mount ForeignFlowCard
    // (its streak label would have crashed); a processing placeholder is fine.
    expect(screen.getByText(/Đang xử lý/)).toBeInTheDocument()
  })
})
