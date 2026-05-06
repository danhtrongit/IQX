import { describe, expect, it } from "vitest"
import { buildTradingViewWidgetOptions } from "../src/components/chart/tv-chart"

describe("buildTradingViewWidgetOptions", () => {
  it("sets the chart timezone to Vietnam for intraday display", () => {
    const options = buildTradingViewWidgetOptions({
      symbol: "VNINDEX",
      interval: "1",
      theme: "dark",
      autosize: true,
      containerId: "tv_chart_test",
    })

    expect(options.timezone).toBe("Asia/Ho_Chi_Minh")
    expect(options.overrides.timezone).toBe("Asia/Ho_Chi_Minh")
  })
})
