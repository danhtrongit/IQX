// MidDayView.test.tsx
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { describe, it, expect, vi } from "vitest"

// ─── Cold-start midday payload (no prior EOD) ────────────────────────────────
// AM tiers are real (am_session); frozen tiers come back "unavailable" with the
// trend_20d / sectors_today keys ABSENT — exactly the shape that crashed
// HealthLineChart / RotationChart before the data_state gate was added.
const coldStart = {
  id: "m-cold",
  session_date: "2026-07-02",
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
