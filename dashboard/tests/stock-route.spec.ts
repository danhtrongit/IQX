import { describe, expect, it, vi } from "vitest"
import { isSupportedStockRouteSymbol } from "../src/lib/stock-route"

describe("isSupportedStockRouteSymbol", () => {
  it("returns false when backend confirms the stock symbol does not exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    })

    await expect(
      isSupportedStockRouteSymbol("KSNCSOWN", fetchMock as typeof fetch),
    ).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/stocks/KSNCSOWN")
  })

  it("returns true for supported index symbols without hitting the stock lookup API", async () => {
    const fetchMock = vi.fn()

    await expect(
      isSupportedStockRouteSymbol("VNINDEX", fetchMock as typeof fetch),
    ).resolves.toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
