import { describe, expect, it } from "vitest"

import type { TrackingItem } from "./bulletin-api"
import { DEFAULT_TRACKING_SORT, firstDirection, nextTrackingSort, sortTracking } from "./tracking-sort"

function item(partial: Partial<TrackingItem> & Pick<TrackingItem, "symbol">): TrackingItem {
  return {
    slot: 1,
    first_trade_date: "2026-11-03",
    entry_price: 50,
    price: 52,
    return_pct: 4,
    sessions: 2,
    is_today: false,
    ...partial,
  }
}

const ITEMS: TrackingItem[] = [
  item({ symbol: "FPT", slot: 2, first_trade_date: "2026-11-04", return_pct: 6.5, sessions: 1 }),
  item({ symbol: "HPG", slot: 1, first_trade_date: "2026-11-06", return_pct: -3.2, sessions: 0, is_today: true }),
  item({ symbol: "ACB", slot: 3, first_trade_date: "2026-10-30", return_pct: null, price: null, sessions: 4 }),
  item({ symbol: "MWG", slot: 1, first_trade_date: "2026-11-04", return_pct: 1.1, sessions: 1 }),
]

const symbols = (items: TrackingItem[]) => items.map((row) => row.symbol)

describe("tracking sort", () => {
  it("defaults to the newest proposal date first", () => {
    expect(DEFAULT_TRACKING_SORT).toEqual({ key: "first_trade_date", direction: "desc" })
    expect(symbols(sortTracking(ITEMS, DEFAULT_TRACKING_SORT))).toEqual(["HPG", "FPT", "MWG", "ACB"])
  })

  it("starts text columns ascending and number columns descending", () => {
    expect(firstDirection("symbol")).toBe("asc")
    expect(firstDirection("slot")).toBe("asc")
    for (const key of ["first_trade_date", "entry_price", "price", "return_pct", "sessions"] as const) {
      expect(firstDirection(key)).toBe("desc")
    }
  })

  it("reverses on a second click and resets the direction on a new column", () => {
    const byReturn = nextTrackingSort(DEFAULT_TRACKING_SORT, "return_pct")
    expect(byReturn).toEqual({ key: "return_pct", direction: "desc" })
    expect(nextTrackingSort(byReturn, "return_pct")).toEqual({ key: "return_pct", direction: "asc" })
    expect(nextTrackingSort({ key: "return_pct", direction: "asc" }, "symbol")).toEqual({ key: "symbol", direction: "asc" })
  })

  it("sorts profit and keeps empty values last in both directions", () => {
    expect(symbols(sortTracking(ITEMS, { key: "return_pct", direction: "desc" }))).toEqual(["FPT", "MWG", "HPG", "ACB"])
    expect(symbols(sortTracking(ITEMS, { key: "return_pct", direction: "asc" }))).toEqual(["HPG", "MWG", "FPT", "ACB"])
  })

  it("sorts by symbol and by filter slot with the symbol as tiebreaker", () => {
    expect(symbols(sortTracking(ITEMS, { key: "symbol", direction: "asc" }))).toEqual(["ACB", "FPT", "HPG", "MWG"])
    expect(symbols(sortTracking(ITEMS, { key: "slot", direction: "asc" }))).toEqual(["HPG", "MWG", "FPT", "ACB"])
  })

  it("does not mutate its input", () => {
    const before = symbols(ITEMS)
    sortTracking(ITEMS, { key: "symbol", direction: "desc" })
    expect(symbols(ITEMS)).toEqual(before)
  })
})
