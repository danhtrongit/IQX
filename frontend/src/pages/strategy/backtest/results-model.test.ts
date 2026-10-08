import { describe, expect, it } from "vitest"

import { registryFor } from "../../demo-trading/bot/test-support"
import { fmtDate, fmtPercent, fmtSignedPercent, fmtSignedVnd, todayInVietnam } from "../shared/format"
import { matchesQuery } from "../shared/library-utils"
import { runResponse } from "../test-support"
import { chartPoints, conditionNames, configCaption, exitReasonLabel, snapshotParams, thinPoints, tradesPageFromRun } from "./results-model"

describe("chart", () => {
  it("starts at the 0% point before the first fee and ends on the last curve point (the KPI)", () => {
    const result = runResponse().result!
    const points = chartPoints(result)
    expect(points[0]).toMatchObject({ date: "2024-01-02", strategy: 0, buyHold: 0 })
    expect(points.at(-1)).toMatchObject({ strategy: result.kpis.total_return_pct, buyHold: result.kpis.buy_hold_return_pct })
  })

  it("keeps a missing benchmark as null, never as 0%", () => {
    const points = chartPoints(runResponse({ marketAvailable: false }).result!)
    expect(points.every((point) => point.market === null)).toBe(true)
  })

  it("thins only for drawing and always keeps the first and the last point", () => {
    const points = Array.from({ length: 2001 }, (_unused, index) => index)
    const thin = thinPoints(points, 600)
    expect(thin.length).toBeLessThanOrEqual(602)
    expect(thin[0]).toBe(0)
    expect(thin.at(-1)).toBe(2000)
    expect(thinPoints([1, 2, 3], 600)).toEqual([1, 2, 3])
  })
})

describe("trades", () => {
  it("takes the first page of the history from the run itself and counts the whole run", () => {
    const page = tradesPageFromRun(runResponse({ trades: 60, open: true }))!
    expect(page.items).toHaveLength(25)
    expect(page.total).toBe(60)
    expect(page.counts).toMatchObject({ closed_trade_count: 60, open_position_count: 1 })
    expect(page.open_position?.qty).toBe(3100)
  })

  it("names the indicators of an entry and exit evidence and the exit reason", () => {
    const registry = registryFor(["macd"]).indicators
    const trade = runResponse().result!.trades[0]!
    expect(conditionNames(trade.entry_conditions, registry)).toBe("MACD")
    expect(conditionNames(null, registry)).toBe("—")
    expect(exitReasonLabel("sell_consensus")).toBe("Điều kiện Bán đạt")
  })

  it("reads the params a run pinned, not the ones on the form", () => {
    const snapshot = runResponse().result!.snapshot
    expect(snapshotParams(snapshot.config, "macd", "buy")).toEqual({ fast: 12, slow: 26, signal: 9 })
    expect(snapshotParams(snapshot.config, "rsi", "buy")).toBeUndefined()
    expect(configCaption(snapshot.config, registryFor(["macd"]).indicators)).toBe("Mua: MACD · Bán: MACD")
  })
})

describe("formatting", () => {
  it("keeps missing as a dash and percent values in percentage points", () => {
    expect(fmtSignedPercent(74.2, 1)).toBe("+74,2%")
    expect(fmtSignedPercent(-10.6, 1)).toBe("−10,6%")
    expect(fmtSignedPercent(null)).toBe("—")
    expect(fmtPercent(null)).toBe("—")
    expect(fmtPercent(53.8)).toBe("53,8%")
    expect(fmtSignedVnd(-1_250_000)).toBe("−1.250.000 đ")
    expect(fmtDate("2026-10-08")).toBe("08/10/2026")
    expect(fmtDate("2026-10-07T18:30:00Z")).toBe("08/10/2026")
    expect(todayInVietnam(new Date("2026-10-07T18:30:00Z"))).toBe("2026-10-08")
  })

  it("matches library searches without regard to accents or case", () => {
    expect(matchesQuery("Tăng trưởng LNST YoY", "tang truong")).toBe(true)
    expect(matchesQuery("Đường tín hiệu", "duong")).toBe(true)
    expect(matchesQuery("ROE", "")).toBe(true)
    expect(matchesQuery("ROE", "rsi")).toBe(false)
  })
})
