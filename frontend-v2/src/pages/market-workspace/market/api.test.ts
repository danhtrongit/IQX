import { describe, expect, it } from "vitest"

import { adaptMarketReport } from "./api"

describe("adaptMarketReport", () => {
  it("rejects malformed required narrative blocks instead of pretending they are usable data", () => {
    expect(() =>
      adaptMarketReport({
        id: "r",
        sessionDate: "2026-09-23",
        generatedAt: "2026-09-23T09:00:00Z",
        sessionType: "eod",
        reportType: "daily",
        headline: "X",
        tagline: null,
        paragraphs: [],
        scenarios: [],
      })
    ).toThrow("không hợp lệ")
  })
  it("maps the v2 envelope without dropping generated blocks", () => {
    const paragraphs = {
      structure: "cấu trúc",
      smart_money: "dòng tiền",
      market_health: "sức khỏe",
    }
    const scenarios = [
      { direction: "up", condition_html: "x", outcome_html: "y" },
    ]
    const charts = {
      breadth: {
        ceiling: 0,
        up: 10,
        flat: 1,
        down: 2,
        floor: 0,
        ratio_up_down: "5:1",
        classification: "positive",
      },
      contribution: { top_negative: [], top_positive: [] },
      foreign_detail: {
        total_buy_vnd_billion: 2,
        total_sell_vnd_billion: 1,
        streak: { count: 1, direction: "buy" },
        last_12_sessions: [],
        top_sell: [],
        top_buy: [],
      },
      prop_detail: {
        total_buy_vnd_billion: 2,
        total_sell_vnd_billion: 1,
        net_vnd_billion: 1,
        last_12_sessions: [],
        top_buy: [],
        top_sell: [],
      },
      market_health_detail: { pct_above_ma20_change: 1, trend_20d: [] },
      sector_rotation: { sectors_today: [] },
    }
    const pulse = {
      vn_index: { value: 1234, change: 2, change_pct: 0.2, sparkline: [1, 2] },
      breadth: { up: 10, down: 2 },
      foreign_net_billion: 1,
      liquidity: { am_value_billion: 123 },
    }
    const result = adaptMarketReport({
      id: "r1",
      sessionDate: "2026-09-23",
      sessionType: "eod",
      reportType: "daily",
      generatedAt: "2026-09-23T09:00:00.000Z",
      headline: "Hôm nay",
      tagline: { direction: "up", marker: "▲", text: "Tăng" },
      paragraphs,
      scenarios,
      watchlist: null,
      unexplained: null,
      meta: { charts, pulse, provider_extra: { keep: true } },
      published: true,
      generationStatus: "published",
      generationError: null,
    })

    expect(result).toMatchObject({
      session_date: "2026-09-23",
      generated_at: "2026-09-23T09:00:00.000Z",
      report_type: "daily",
      paragraphs,
      scenarios,
      charts,
      pulse,
      meta: { provider_extra: { keep: true } },
    })
  })

  it("degrades absent optional blocks to empty UI-safe values", () => {
    expect(
      adaptMarketReport({
        id: "r2",
        sessionDate: "2026-09-23",
        sessionType: "pre",
        reportType: "premarket",
        generatedAt: "2026-09-23T07:00:00Z",
        headline: "",
        tagline: {},
        paragraphs: {},
        scenarios: [],
        watchlist: null,
        unexplained: null,
        meta: null,
      })
    ).toMatchObject({
      session_date: "2026-09-23",
      paragraphs: {},
      scenarios: [],
      watchlist: [],
      meta: null,
    })
  })

  it("keeps independently valid chart blocks when a sibling is unavailable", () => {
    const result = adaptMarketReport({
      id: "r-partial",
      sessionDate: "2026-09-23",
      sessionType: "eod",
      reportType: "daily",
      generatedAt: "2026-09-23T09:00:00Z",
      headline: "Một phần",
      tagline: { direction: "flat", marker: "", text: "Ổn định" },
      paragraphs: { structure: "x", smart_money: "x", market_health: "x" },
      scenarios: [],
      watchlist: null,
      unexplained: null,
      meta: {
        charts: {
          breadth: {
            ceiling: 0,
            up: 4,
            flat: 1,
            down: 2,
            floor: 0,
            ratio_up_down: "2:1",
            classification: "balanced",
          },
          market_health_detail: {
            pct_above_ma20: null,
            pct_above_ma20_change: 0,
            trend_20d: [],
          },
        },
      },
    })
    expect("charts" in result ? result.charts : undefined).toMatchObject({
      breadth: { up: 4 },
      market_health_detail: { pct_above_ma20: null },
    })
    expect(
      "charts" in result ? result.charts?.contribution : undefined
    ).toBeUndefined()
  })

  it("keeps dated EMA health measurements when the change and MA fields are unavailable", () => {
    const result = adaptMarketReport({
      id: "r-ema", sessionDate: "2026-09-23", sessionType: "eod", reportType: "daily",
      generatedAt: "2026-09-23T09:00:00Z", headline: "Một phần",
      tagline: { direction: "flat", marker: "", text: "Ổn định" },
      paragraphs: { structure: "x", smart_money: "x", market_health: "x" },
      scenarios: [], watchlist: null, unexplained: null,
      meta: { charts: {
        breadth: null,
        market_health_detail: {
          indicator_basis: "EMA", pct_above_ma20: null, pct_above_ma20_change: null,
          pct_above_ma50: null, pct_above_ma200: null, trend_20d: [],
          pct_above_ema20: 42.5, pct_above_ema20_change: null,
          pct_above_ema50: 38.2, trend_ema20_20d: [42.5], callout: null,
        },
      } },
    })
    expect("charts" in result ? result.charts?.market_health_detail : undefined).toMatchObject({
      indicator_basis: "EMA", pct_above_ema20: 42.5, pct_above_ema20_change: null,
    })
    expect("charts" in result ? result.charts?.breadth : undefined).toBeUndefined()
  })

  it("normalizes midday unexplained text and rejects missing required nested paragraphs", () => {
    const midday = {
      id: "r3",
      sessionDate: "2026-09-23",
      sessionType: "midday",
      reportType: "midday",
      generatedAt: "2026-09-23T04:30:00Z",
      headline: "Sáng nay",
      tagline: { text: "Ổn định", color: "neutral" },
      paragraphs: {
        session_structure: { status: "published", content: "Cấu trúc" },
        money_flow: { status: "published", content: "Dòng tiền" },
        market_health: {
          status: "pending",
          pending_message: "Chờ cuối phiên",
          pending_until: "2026-09-23T09:30:00Z",
        },
      },
      scenarios: [],
      watchlist: null,
      unexplained: "Cần xác nhận",
      meta: null,
    }
    expect(adaptMarketReport(midday)).toMatchObject({
      unexplained: { title: "Điểm cần xác nhận", content: "Cần xác nhận" },
    })
    expect(() =>
      adaptMarketReport({ ...midday, paragraphs: { session_structure: {} } })
    ).toThrow("không hợp lệ")
    expect(
      adaptMarketReport({
        ...midday,
        meta: {
          charts: { breadth: { up: 3 } },
          pulse: { vn_index: { value: 1234 } },
        },
      })
    ).toMatchObject({ charts: undefined, pulse: undefined })
  })
})
