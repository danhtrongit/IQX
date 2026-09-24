import { afterEach, describe, expect, it, vi } from "vitest"
import { createDataFeed } from "./datafeed"
import { buildWidgetOptions } from "./tradingview"

afterEach(() => vi.restoreAllMocks())

describe("TradingView embedded bootstrap", () => {
  it("uses the supported same-origin document instead of a blank blob iframe", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const options = buildWidgetOptions({
      symbol: "VNINDEX", interval: "D", theme: "light", containerId: "chart",
      host: document.createElement("div"), datafeed: createDataFeed({positive:"green", negative:"red", neutral:"gray"}),
    })
    expect(options.enabled_features).toContain("iframe_loading_same_origin")
    expect(options.library_path).toBe("/charting_library/")
    expect(options.symbol).toBe("VNINDEX")
  })
})
