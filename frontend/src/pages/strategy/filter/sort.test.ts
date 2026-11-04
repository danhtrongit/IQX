import { describe, expect, it } from "vitest"

import { nextSort } from "./sort"

describe("nextSort", () => {
  it("starts a text column A to Z and a number column from the largest", () => {
    for (const key of ["symbol", "name", "exchange", "group"]) expect(nextSort({ key: "price", order: "desc" }, key)).toEqual({ key, order: "asc" })
    for (const key of ["price", "change_pct", "market_cap", "avg_value", "metric:roe", "tech:rsi.level"]) expect(nextSort({ key: "symbol", order: "asc" }, key)).toEqual({ key, order: "desc" })
  })

  it("reverses the column that is already sorted", () => {
    expect(nextSort({ key: "symbol", order: "asc" }, "symbol")).toEqual({ key: "symbol", order: "desc" })
    expect(nextSort({ key: "symbol", order: "desc" }, "symbol")).toEqual({ key: "symbol", order: "asc" })
    expect(nextSort({ key: "price", order: "desc" }, "price")).toEqual({ key: "price", order: "asc" })
  })
})
