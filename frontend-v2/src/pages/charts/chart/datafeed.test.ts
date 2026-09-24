import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { fetchBars } from "./datafeed"

vi.mock("@/lib/api", () => ({api:vi.fn()}))
beforeEach(() => vi.mocked(api).mockReset())

describe("market OHLCV transport", () => {
  it("keeps VCI numeric-string epochs rather than dropping every candle", async () => {
    const quote = {open:1800, high:1810, low:1790, close:1805, volume:1000}
    vi.mocked(api).mockResolvedValue({data:[
      {...quote, time:"1790208000"},
      {...quote, time:1790121600000},
      {...quote, time:"1789948800000"},
      {...quote, time:"2026-09-22"},
      {...quote, time:"invalid"},
    ]})
    const bars = await fetchBars("VNINDEX","1D")
    expect(bars).toHaveLength(4)
    expect(bars.map(b=>b.time)).toEqual([1789948800000,1790035200000,1790121600000,1790208000000])
    expect(bars.at(-1)?.close).toBe(1805)
  })

  it("requests Vietnam calendar boundaries regardless of browser timezone", async () => {
    vi.mocked(api).mockResolvedValue({data:[]})
    await fetchBars("VNM","1m",Date.parse("2026-09-23T18:00:00Z")/1000,Date.parse("2026-09-24T08:00:00Z")/1000)
    expect(api).toHaveBeenCalledWith(expect.stringContaining("start=2026-09-24&end=2026-09-24"),expect.anything())
  })
})
