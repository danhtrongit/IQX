import { afterEach, describe, expect, it, vi } from "vitest"
import { requestOperation } from "@/lib/contract-client"
import { fetchForecastRanking, fetchSymbolForecast } from "./forecast-api"
import { forecastPercent, forecastPrice } from "./forecast-format"

vi.mock("@/lib/contract-client", () => ({ requestOperation: vi.fn() }))
afterEach(() => vi.resetAllMocks())

describe("forecast API adapter", () => {
  it("passes selected horizon and cancellation to the canonical ranking operation", async () => {
    const signal = new AbortController().signal
    vi.mocked(requestOperation).mockResolvedValueOnce({ horizon: "T+3", horizonDays: 3, count: 0, items: [] })
    await fetchForecastRanking("3", signal)
    expect(requestOperation).toHaveBeenCalledWith("GET /api/v2/ai/forecast/ranking", { query: { horizon: "3", limit: 20 } }, { signal })
  })

  it("passes the symbol and cancellation to the canonical detail operation", async () => {
    const signal = new AbortController().signal
    vi.mocked(requestOperation).mockResolvedValueOnce({ symbol: "VCB", forecasts: [] })
    await fetchSymbolForecast("VCB", signal)
    expect(requestOperation).toHaveBeenCalledWith("GET /api/v2/ai/forecast/symbols/{symbol}", { path: { symbol: "VCB" } }, { signal })
  })

  it("keeps nullable values unavailable and labels percent and VND units", () => {
    expect(forecastPercent(0.05)).toBe("5%")
    expect(forecastPercent(null)).toBe("—")
    expect(forecastPrice(null)).toBe("—")
    expect(forecastPrice(120000)).toContain("₫")
  })
})
