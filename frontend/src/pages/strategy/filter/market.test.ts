import { describe, expect, it } from "vitest"

import { canonicalMarket, draftFromMarket, emptyMarket, emptyMarketDraft, marketErrors, marketFirstError, marketFromDraft, marketSummary, sectorReviewError, sectorReviewNotice, toggleValue } from "./market"
import type { MarketScope } from "./types"

const draft = (partial: Partial<ReturnType<typeof emptyMarketDraft>> = {}) => ({ ...emptyMarketDraft(), ...partial })

describe("Thị trường draft", () => {
  it("starts empty: nothing is filtered, GTGD averages over 20 sessions", () => {
    expect(marketFromDraft(emptyMarketDraft())).toEqual({
      exchanges: [], baskets: [], statement_groups: [],
      market_cap: { min: null, max: null }, avg_value: { sessions: 20, min: null }, close_price: { min: null, max: null },
    })
    expect(emptyMarket()).toEqual(marketFromDraft(emptyMarketDraft()))
    expect(marketFirstError(emptyMarketDraft())).toBeNull()
  })

  it("toggles a choice in and out of a multi-choice list", () => {
    expect(toggleValue(["HOSE"], "HNX")).toEqual(["HOSE", "HNX"])
    expect(toggleValue(["HOSE", "HNX"], "HOSE")).toEqual(["HNX"])
  })

  it("sends the choices in the order of the list and the bounds as plain numbers, in the unit shown", () => {
    const market = marketFromDraft(draft({ exchanges: ["UPCOM", "HOSE"], baskets: ["VNSMALLCAP", "VN30"], groups: ["bh", "nh"], capMin: "1000", capMax: "5000,5", avgSessions: "30", avgMin: "7,5", priceMin: "10", priceMax: "" }))
    expect(market).toEqual({
      exchanges: ["HOSE", "UPCOM"], baskets: ["VN30", "VNSMALLCAP"], statement_groups: ["nh", "bh"],
      market_cap: { min: 1000, max: 5000.5 }, avg_value: { sessions: 30, min: 7.5 }, close_price: { min: 10, max: null },
    })
  })

  it("never turns a text that is not a number into a blank filter: each field reports its own message, prefixed", () => {
    expect(marketErrors(draft({ capMin: "abc" })).cap).toBe("Vốn hóa: nhập số.")
    expect(marketErrors(draft({ priceMin: "-1" })).price).toBe("Giá không được âm.")
    expect(marketErrors(draft({ capMin: "500", capMax: "100" })).cap).toBe('Vốn hóa: "từ" phải nhỏ hơn hoặc bằng "đến".')
    expect(marketErrors(draft({ priceMin: "10", priceMax: "10" })).price).toBeUndefined()
    expect(marketErrors(draft({ avgSessions: "4" })).avg).toBe("Số phiên phải từ 5 đến 100, số nguyên.")
    expect(marketErrors(draft({ avgSessions: "100,5" })).avg).toBe("Số phiên phải từ 5 đến 100, số nguyên.")
    expect(marketErrors(draft({ avgSessions: "" })).avg).toBe("Số phiên phải từ 5 đến 100, số nguyên.")
    expect(marketErrors(draft({ avgMin: "-3" })).avg).toBe("Giá trị giao dịch phải là số không âm.")
    expect(marketFirstError(draft({ capMin: "x", priceMin: "y" }))).toBe("Cơ bản · Thị trường: Vốn hóa: nhập số.")
    expect(marketFirstError(draft({ avgSessions: "3" }))).toBe("Cơ bản · Thị trường: Số phiên phải từ 5 đến 100, số nguyên.")
  })

  it("keeps a blank end of a range blank and 0 as a real bound", () => {
    expect(marketFromDraft(draft({ capMin: "0" })).market_cap).toEqual({ min: 0, max: null })
    expect(marketErrors(draft({ capMin: "0" })).cap).toBeUndefined()
  })
})

describe("stored Thị trường", () => {
  const stored = (partial: Partial<MarketScope>): MarketScope => ({ ...emptyMarket(), ...partial })

  it("reads HSX as HOSE and baskets in any case, and tolerates missing parts of an older block", () => {
    const back = draftFromMarket(stored({ exchanges: ["HSX", "HNX"], baskets: ["vn30"] as never }))
    expect(back.exchanges).toEqual(["HOSE", "HNX"])
    expect(back.baskets).toEqual(["VN30"])
    expect(draftFromMarket({} as MarketScope)).toMatchObject({ exchanges: [], avgSessions: "20", capMin: "" })
  })

  it("returns the ICB sector of a 3.0 filter as a flag and not as a group", () => {
    const back = draftFromMarket(stored({ needs_review: "sector", legacy_sector: "Ngân hàng" }))
    expect(back.reviewSector).toBe("Ngân hàng")
    expect(back.groups).toEqual([])
    expect(draftFromMarket(stored({})).reviewSector).toBeNull()
  })

  it("round-trips a block through the draft with decimals written with a comma", () => {
    const market = stored({ exchanges: ["HOSE"], market_cap: { min: 1000.5, max: null }, avg_value: { sessions: 40, min: 2.25 } })
    const back = draftFromMarket(market)
    expect(back.capMin).toBe("1000,5")
    expect(back.avgMin).toBe("2,25")
    expect(marketFromDraft(back)).toEqual(market)
  })

  it("compares by canonical form: sorted unique lists, HSX is HOSE, no review flag", () => {
    const one = canonicalMarket(stored({ exchanges: ["HOSE", "HNX"], baskets: ["VN30", "VN100"] }))
    const two = canonicalMarket(stored({ exchanges: ["HNX", "HSX", "HOSE"], baskets: ["VN100", "VN30"], needs_review: "sector", legacy_sector: "x" }))
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(one.exchanges).toEqual(["HNX", "HOSE"])
  })
})

describe("summary and sector review wording", () => {
  it("lists only what restricts something, in the order of the block, with the unit", () => {
    expect(marketSummary(emptyMarket())).toEqual([])
    expect(marketSummary(stored({ exchanges: ["HOSE", "HNX"], baskets: ["VNMIDCAP"], statement_groups: ["nh", "thuong"], market_cap: { min: 1000, max: 5000 }, avg_value: { sessions: 30, min: 10 }, close_price: { min: null, max: 50 } }))).toEqual([
      "HNX, HOSE", "VNMidcap", "Thường, Ngân hàng", "Vốn hóa từ 1.000 đến 5.000 tỷ", "GTGD TB30 ≥ 10 tỷ", "Giá đến 50 nghìn đ",
    ])
    // The number of sessions alone restricts nothing.
    expect(marketSummary(stored({ avg_value: { sessions: 50, min: null } }))).toEqual([])
  })

  it("says the same words as the mockup for a sector that must be chosen again", () => {
    expect(sectorReviewError("Ngân hàng")).toBe("Chọn lại ngành: ngành ICB “Ngân hàng” của bộ lọc cũ không còn được hỗ trợ.")
    expect(sectorReviewNotice("Ngân hàng")).toBe("Bộ lọc cũ dùng ngành ICB “Ngân hàng”, không còn được hỗ trợ. Hệ thống không tự đổi: hãy chọn lại Ngành bên dưới.")
  })
})

function stored(partial: Partial<MarketScope>): MarketScope {
  return { ...emptyMarket(), ...partial }
}
