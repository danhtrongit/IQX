import { describe, expect, it, vi } from "vitest"
import { dispatchFilledSellCloseouts } from "./filledSellCloseout"

describe("dispatchFilledSellCloseouts", () => {
  it("delivers one filled sell to every inherited closeout exactly once", () => {
    const first = vi.fn()
    const second = vi.fn()
    const third = vi.fn()
    const order = { symbol: "HPG", side: "sell" as const, quantity: 100, price: 31_000, orderId: "sell-1" }

    dispatchFilledSellCloseouts(order, { onOrderFilled: first }, { onOrderFilled: second }, { onOrderFilled: third })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(third).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith(order)
  })
})
