/** Strategy content of tab Chỉ báo (spec v2.0 §4.3, §10.2): Giữ tối đa, compose checks, canonical equality, baskets. */
import { describe, expect, it } from "vitest"

import { buildRegistry } from "../../demo-trading/bot/test-support"
import { composeErrors, contentFromDefinition, contentOf, emptyDraft, maxHoldingError, removeSide, sameContent, stampLabel, strategySummary, universeLabel } from "./draft"
import { symbolsOf, symbolsUniverse } from "./universe"

const registry = buildRegistry()

function withSides(ids: string[], sides: ("buy" | "sell")[]) {
  const draft = emptyDraft(registry)
  for (const id of ids) {
    const config = draft.indicators[id]!
    config.master_enabled = true
    for (const side of sides) config[side].enabled = true
  }
  return draft
}

describe("Giữ tối đa", () => {
  it("accepts integers 3–250 only and never clamps", () => {
    for (const ok of ["3", "30", "250", " 45 "]) expect(maxHoldingError(ok)).toBeNull()
    for (const bad of ["", "2", "251", "3.5", "abc", "-5"]) expect(maxHoldingError(bad)).toBe("Giữ tối đa phải từ 3 đến 250 phiên, số nguyên.")
  })
})

describe("new strategy", () => {
  it("starts on rổ VN30, giữ tối đa 30 and no side in use", () => {
    const draft = emptyDraft(registry)
    expect(draft.universe).toEqual({ type: "vn30" })
    expect(draft.holdingText).toBe("30")
    expect(contentOf(draft).indicators).toEqual({})
  })
})

describe("content", () => {
  it("keeps only the indicators with a side in use; equality ignores key order and unused indicators", () => {
    const content = contentOf(withSides(["macd", "rsi"], ["buy", "sell"]))
    expect(Object.keys(content.indicators).sort()).toEqual(["macd", "rsi"])
    const reordered = { ...content, indicators: { rsi: content.indicators.rsi!, macd: content.indicators.macd! } }
    expect(sameContent(content, reordered)).toBe(true)
    expect(sameContent(content, { ...content, max_holding: 31 })).toBe(false)
    expect(sameContent(content, null)).toBe(false)
  })

  it("✕ turns a side off (rows kept) and the indicator off when no side is left", () => {
    const draft = withSides(["macd"], ["buy"])
    const removed = removeSide(draft.indicators.macd!, "buy")
    expect(removed.master_enabled).toBe(false)
    expect(removed.buy.rules).toEqual(draft.indicators.macd!.buy.rules)
  })

  it("an old Chiến lược IQX definition without universe stands for VN30, giữ tối đa 30", () => {
    expect(contentFromDefinition({ indicators: {} })).toEqual({ universe: { type: "vn30" }, indicators: {}, max_holding: 30 })
  })

  it("summary and labels", () => {
    const content = contentOf(withSides(["macd"], ["buy", "sell"]))
    const summary = strategySummary(content, registry)
    expect(summary.buy).toMatch(/^Mua: /)
    expect(summary.sell).toMatch(/giữ tối đa 30 phiên$/)
    expect(summary.universe).toBe("Rổ VN30")
    expect(universeLabel({ type: "saved_list", list_id: "l1", list_name: "Tăng trưởng", symbols: [] })).toBe("Tăng trưởng")
    expect(stampLabel("2026-11-08T06:47:00.000Z")).toBe("08/11 13:47")
  })
})

describe("compose checks (Mẫu IQX §7.2)", () => {
  it("needs VN30/VN100, a valid Giữ tối đa and at least one Mua and one Bán row", () => {
    expect(composeErrors(emptyDraft(registry))).toEqual(["Chưa bật chỉ báo Mua nào.", "Chưa bật chỉ báo Bán nào."])
    const ok = withSides(["macd"], ["buy", "sell"])
    expect(composeErrors(ok)).toEqual([])
    expect(composeErrors({ ...ok, holdingText: "2" })).toEqual(["Giữ tối đa phải từ 3 đến 250 phiên, số nguyên."])
    expect(composeErrors({ ...ok, universe: { type: "saved_list", list_id: "l1", list_name: "x", symbols: ["FPT"] } })).toEqual(["Rổ chiến lược IQX chỉ là VN30 hoặc VN100."])
  })
})

describe("baskets", () => {
  it("a Bộ lọc result keeps only VN100 symbols and reports the others", () => {
    const { universe, excluded } = symbolsUniverse("Kết quả bộ lọc chưa lưu · 07/10", ["fpt", "HPG", "XYZ", "FPT"], ["FPT", "HPG"])
    expect(universe).toEqual({ type: "saved_list", list_id: "bo-loc", list_name: "Kết quả bộ lọc chưa lưu · 07/10", symbols: ["FPT", "HPG"] })
    expect(excluded).toEqual(["XYZ"])
    expect(symbolsOf(universe, { vn30: { symbols: [] }, vn100: { symbols: ["FPT"] }, saved_lists: [] })).toEqual(["FPT"])
  })
})
