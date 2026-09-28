import { describe, expect, it } from "vitest"

import { adaptForeignFlow, adaptMarketOverview, toIndexUI } from "./overview"

describe("market overview adapters", () => {
  it("keeps missing index fields unavailable while preserving reported zero", () => {
    expect(
      toIndexUI({
        symbol: "VNINDEX",
        price: null,
        change: 0,
        change_percent: 0,
        total_shares: null,
        total_value_million_vnd: 0,
        total_stock_increase: 0,
      }),
    ).toEqual({
      value: null,
      change: 0,
      changePercent: 0,
      volume: null,
      valueTraded: 0,
      advance: 0,
      decline: null,
      unchanged: null,
      ceiling: null,
      floor: null,
    })
  })

  it("does not fabricate empty index rows", () => {
    const result = adaptMarketOverview([])
    expect(result.vnindex.value).toBeNull()
    expect(result.hnxindex.valueTraded).toBeNull()
    expect(result.marketBreadth.advance).toBeNull()
  })

  it("keeps foreign totals null and skips unknown top rows", () => {
    expect(
      adaptForeignFlow({
        total_net_buy_vnd: null,
        total_net_sell_vnd: 0,
        net_buy: [
          { symbol: "AAA", net_value_vnd: null },
          { symbol: "BBB", net_value_vnd: 0 },
        ],
      }),
    ).toMatchObject({
      buyValue: null,
      sellValue: 0,
      netValue: null,
      topBuy: [{ symbol: "BBB", value: 0 }],
    })
  })
})
