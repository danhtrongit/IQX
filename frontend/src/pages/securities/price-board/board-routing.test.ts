import { describe, expect, it } from "vitest"

import { boardChartHref } from "./board-routing"

describe("price board chart routing", () => {
  it("uses the embedded v2 chart and preserves board search state", () => {
    const href = boardChartHref(new URLSearchParams("view=trading&interval=W&tour=board"), " vcb ")
    expect(href).toBe("/demo-trading?view=trading&interval=W&tour=board&content=chart&symbol=VCB")
  })

  it("replaces an existing content and symbol without dropping other state", () => {
    const href = boardChartHref(new URLSearchParams("content=board&symbol=AAA&view=trading"), "fpt")
    const params = new URLSearchParams(href.split("?", 2)[1])
    expect(params.get("content")).toBe("chart")
    expect(params.get("symbol")).toBe("FPT")
    expect(params.get("view")).toBe("trading")
  })
})
