import { describe, expect, it } from "vitest"

import { boardChartHref } from "./board-routing"

describe("price board chart routing", () => {
  it("opens LUYỆN TẬP → Giao dịch on the chart and preserves board search state", () => {
    const href = boardChartHref(new URLSearchParams("tool=giao-dich&tab=danh-muc&content=board&interval=W&tour=board"), " vcb ")
    expect(href).toBe("/luyen-tap?tool=giao-dich&tab=danh-muc&interval=W&tour=board&symbol=VCB")
  })

  it("replaces the symbol and opens Đặt lệnh when no Giao dịch tab is open", () => {
    const href = boardChartHref(new URLSearchParams("content=board&symbol=AAA&view=trading"), "fpt")
    expect(href).toBe("/luyen-tap?symbol=FPT&tool=giao-dich&tab=dat-lenh")
  })
})
