import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import { duePositionsOf, duePositionsText, lockedNextSession, sameScheduled, sessionLabel } from "./bot-schedule"
import { DIFF_SAME_TEXT, strategyDiff, universeLabel, type StrategyContent } from "./strategy-diff"

const content = (patch: Partial<StrategyContent> = {}): StrategyContent => ({
  universe: { type: "vn30" },
  max_holding: 30,
  indicators: {
    rsi: { master_enabled: true, buy: { enabled: true, rules: [{ id: "rsi.level", enabled: true }] }, sell: { enabled: false, rules: [] } },
  },
  ...patch,
})

describe("bot schedule helpers", () => {
  it("labels a session with its weekday", () => {
    expect(sessionLabel("2026-11-09")).toBe("Thứ 2 09/11")
    expect(sessionLabel("2026-11-08")).toBe("Chủ nhật 08/11")
    expect(sessionLabel(null)).toBe("—")
  })

  it("compares the scheduled strategy and version", () => {
    const entry = { session_date: "2026-11-06", source: "user" as const, id: "a", name: "A", version: 2, version_label: "bản 05/11 20:02", hidden: false, content: content() }
    expect(sameScheduled(entry, { ...entry, session_date: "2026-11-09" })).toBe(true)
    expect(sameScheduled(entry, { ...entry, version: 3 })).toBe(false)
    expect(sameScheduled({ session_date: "x", source: null }, null)).toBe(true)
  })

  it("reads the error details of a schedule write", () => {
    const locked = new ApiError("locked", 409, { code: "SCHEDULE_SESSION_LOCKED", details: { next_session: "2026-11-10" } })
    expect(lockedNextSession(locked)).toBe("2026-11-10")
    const changed = new ApiError("changed", 409, { code: "DUE_POSITIONS_CHANGED", details: { positions: [{ symbol: "HDB", counted: 12, sell_session: "2026-11-09" }] } })
    expect(duePositionsOf(changed)).toEqual([{ symbol: "HDB", counted: 12, sell_session: "2026-11-09" }])
    expect(duePositionsOf(new ApiError("x", 422, { code: "STRATEGY_INVALID" }))).toBeNull()
    expect(duePositionsText([{ symbol: "HDB", counted: 12, sell_session: "" }, { symbol: "MSN", counted: 31, sell_session: "" }])).toBe("HDB (12 phiên), MSN (31 phiên)")
  })
})

describe("strategy diff", () => {
  it("lists universe, max holding and removed/added rows", () => {
    const from = content()
    const to = content({
      universe: { type: "saved_list", list_id: "l1", list_name: "Ngân hàng", symbols: ["ACB", "TCB"] },
      max_holding: 10,
      indicators: { macd: { master_enabled: true, buy: { enabled: true, rules: [{ id: "macd.cross", enabled: true }] }, sell: { enabled: false, rules: [] } } },
    })
    const lines = strategyDiff(from, to, [])
    expect(lines).toEqual([
      { field: "universe", label: "Rổ mã", from: "VN30", to: "Danh mục Ngân hàng · 2 mã" },
      { field: "max_holding", label: "Giữ tối đa", from: "30 phiên", to: "10 phiên" },
      { field: "buy", label: "Mua", from: "rsi: rsi.level", to: null },
      { field: "buy", label: "Mua", from: null, to: "macd: macd.cross" },
    ])
    expect(strategyDiff(from, content(), [])).toEqual([])
    expect(DIFF_SAME_TEXT).toBe("Hai bản giống nhau về điều kiện.")
    expect(universeLabel({ type: "vn100" })).toBe("VN100")
  })
})
