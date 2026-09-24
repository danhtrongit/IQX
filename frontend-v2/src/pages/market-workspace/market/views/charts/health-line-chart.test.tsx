import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { HealthLineChart } from "./health-line-chart"

describe("market health indicator labels", () => {
  it("labels EMA observations explicitly, including the comparison, without presenting MA values", () => {
    const html = renderToStaticMarkup(<HealthLineChart data={{
      indicator_basis: "EMA", pct_above_ma20: null, pct_above_ma20_change: null,
      pct_above_ma50: null, pct_above_ma200: null, trend_20d: [],
      pct_above_ema20: 42.5, pct_above_ema20_change: null,
      pct_above_ema50: 38.2, trend_ema20_20d: [40, 42.5], callout: null,
    }} classification="" />)
    expect(html).toContain("Tỷ lệ mã trên EMA20")
    expect(html).toContain("Trên EMA50: 38.2%")
    expect(html).toContain("42.5%")
    expect(html).not.toContain("trên MA20")
    expect(html).not.toContain("HÔM NAY")
  })
})
