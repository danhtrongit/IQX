import { describe, expect, it } from "vitest"

import { iqlineMarketEnabled } from "./iqline-flag"

describe("iqlineMarketEnabled", () => {
  it("mặc định tắt: vẫn là TradingView", () => {
    expect(iqlineMarketEnabled(new URLSearchParams(""))).toBe(false)
    expect(iqlineMarketEnabled(new URLSearchParams("symbol=FPT&interval=D"))).toBe(false)
  })

  it("chỉ bật khi iqline=1", () => {
    expect(iqlineMarketEnabled(new URLSearchParams("iqline=1"))).toBe(true)
    expect(iqlineMarketEnabled(new URLSearchParams("symbol=FPT&iqline=1"))).toBe(true)
    for (const value of ["0", "true", "", "2"]) expect(iqlineMarketEnabled(new URLSearchParams(`iqline=${value}`))).toBe(false)
  })
})
