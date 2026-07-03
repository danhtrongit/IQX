// PreMarketView.test.tsx
import { render, screen, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ─── Test fixture ─────────────────────────────────────────────────────────────
// 2 world cells (one null/stale), 2 news, 1 event, 3 watchlist items
const fixture = {
  id: "pm-test-1",
  session_date: "2026-07-03",
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

// Mock MarketDailyPage (used in no-data fallback)
vi.mock("../daily/MarketDailyPage", () => ({
  MarketDailyPage: () => <div data-testid="market-daily-page">MarketDailyPage</div>,
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
describe("PreMarketView — with data", () => {
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

// ─── Test 2: no data → EOD fallback ──────────────────────────────────────────
describe("PreMarketView — no data (EOD fallback)", () => {
  it("renders MarketDailyPage + processing notice when data is absent", async () => {
    h.payload = null
    renderView()

    await waitFor(() =>
      expect(screen.getByTestId("market-daily-page")).toBeInTheDocument(),
    )

    // Processing notice text per brief
    expect(
      screen.getByText(/Bản trước phiên đang xử lý — hiển thị bản cuối ngày hôm trước\./),
    ).toBeInTheDocument()
  })
})
