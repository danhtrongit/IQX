import { describe, expect, it } from "vitest"

import { orderBody, orderRejectionMessage, type PlaceOrderInput } from "./use-trading-orders"

const base: PlaceOrderInput = {
  symbol: "fpt",
  side: "buy",
  method: "market",
  quantity: 100,
  price: 120000,
}

describe("virtual trading v2 order contract", () => {
  it("distinguishes accepted fills from the persisted rejected-order response", () => {
    expect(orderRejectionMessage({ status: "filled", rejection_reason: null })).toBeNull()
    expect(orderRejectionMessage({ status: "rejected", rejection_reason: "Giá đã cũ" })).toBe("Giá đã cũ")
    expect(orderRejectionMessage({ status: "rejected", rejection_reason: null })).toBe("Lệnh bị từ chối")
  })

  it("sends a plain order body: no plan, level or learning fields, and no price for a market order", () => {
    expect(JSON.parse(orderBody(base))).toEqual({
      symbol: "FPT",
      side: "buy",
      order_type: "market",
      quantity: 100,
    })
  })

  it("sends a limit price only for a limit order", () => {
    const body = JSON.parse(orderBody({ ...base, side: "sell", method: "limit", price: 119500.4 }))
    expect(body).toEqual({ symbol: "FPT", side: "sell", order_type: "limit", quantity: 100, limit_price_vnd: 119500 })
  })
})
