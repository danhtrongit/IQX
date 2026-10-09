import { describe, expect, it } from "vitest"

import { BOARD_LOT, QUICK_PERCENTS, checkOrderInput, quantityForPercent, roundToLot } from "./order-math"

describe("order ticket helpers", () => {
  it("offers the 25/50/75/100% helpers", () => {
    expect([...QUICK_PERCENTS]).toEqual([25, 50, 75, 100])
  })

  it("rounds to the nearest board lot and never goes negative", () => {
    expect(roundToLot(149)).toBe(100)
    expect(roundToLot(150)).toBe(200)
    expect(roundToLot(0)).toBe(0)
    expect(roundToLot(Number.NaN)).toBe(0)
  })

  it("sizes a buy from available cash including the fee", () => {
    // 100,000,000 / (50,000 × 1.0015) ≈ 1,996 shares → 1,900 whole lots
    const base = { side: "buy" as const, price: 50_000, cashAvailable: 100_000_000, sellable: 0 }
    expect(quantityForPercent({ ...base, percent: 100 })).toBe(1900)
    expect(quantityForPercent({ ...base, percent: 50 })).toBe(1000)
    expect(quantityForPercent({ ...base, percent: 25 })).toBe(500)
    expect(quantityForPercent({ ...base, percent: 75 })).toBe(1400)
  })

  it("sizes a sell from the sellable position and never below one lot", () => {
    const base = { side: "sell" as const, price: 50_000, cashAvailable: 0, sellable: 1000 }
    expect(quantityForPercent({ ...base, percent: 100 })).toBe(1000)
    expect(quantityForPercent({ ...base, percent: 25 })).toBe(300)
    expect(quantityForPercent({ ...base, percent: 25, sellable: 100 })).toBe(BOARD_LOT)
  })

  it("leaves the field alone when there is nothing to size from", () => {
    expect(quantityForPercent({ side: "buy", percent: 50, price: 0, cashAvailable: 1e8, sellable: 0 })).toBeNull()
    expect(quantityForPercent({ side: "buy", percent: 50, price: 50_000, cashAvailable: null, sellable: 0 })).toBeNull()
    expect(quantityForPercent({ side: "sell", percent: 50, price: 50_000, cashAvailable: 1e8, sellable: 0 })).toBeNull()
  })

  it("keeps the client-side order guards", () => {
    const valid = { hasQuote: true, quantity: 100, method: "market" as const, limitPrice: null }
    expect(checkOrderInput(valid)).toEqual({ ok: true })
    expect(checkOrderInput({ ...valid, hasQuote: false })).toEqual({ ok: false, message: "Không có dữ liệu mã CK" })
    expect(checkOrderInput({ ...valid, quantity: 50 })).toEqual({ ok: false, message: "Khối lượng tối thiểu là 100 CP" })
    expect(checkOrderInput({ ...valid, quantity: 150 })).toEqual({ ok: false, message: "Khối lượng phải là bội số của 100" })
    expect(checkOrderInput({ ...valid, method: "limit" })).toEqual({ ok: false, message: "Vui lòng nhập giá hợp lệ cho lệnh giới hạn" })
    expect(checkOrderInput({ ...valid, method: "limit", limitPrice: 61_000 })).toEqual({ ok: true })
  })
})
