import { describe, expect, it } from "vitest"
import { demoRouteRedirect } from "./demo-route-redirect"

describe("legacy demo content redirects", () => {
  it("opens Giao dịch → Thị trường for the market view and keeps the other params", () => {
    const result = demoRouteRedirect("ai-analysis", "?view=market&symbol=VNM&tour=bantin", "#section")
    expect(result).toEqual({ pathname: "/luyen-tap", search: "?tool=giao-dich&tab=dat-lenh&symbol=VNM&tour=bantin&content=market", hash: "#section" })
  })

  it("sends the hidden stock view (Insight) to Giao dịch → Đặt lệnh with the symbol", () => {
    const result = demoRouteRedirect("ai-analysis", "?view=stock&symbol=VNM&tour=phantich")
    expect(result.pathname).toBe("/luyen-tap")
    expect(Object.fromEntries(new URLSearchParams(result.search))).toEqual({ tool: "giao-dich", tab: "dat-lenh", symbol: "VNM", tour: "phantich" })
  })

  it.each([
    ["chart", "?interval=W&symbol=VCB", "?tool=giao-dich&tab=dat-lenh&interval=W&symbol=VCB"],
    ["board", "?symbol=VCB", "?tool=giao-dich&tab=dat-lenh&symbol=VCB&content=board"],
    ["board", "?view=portfolio&symbol=VCB", "?tool=giao-dich&tab=danh-muc&symbol=VCB&content=board"],
  ] as const)("opens %s on Giao dịch keeping filters (%s)", (content, search, expected) => {
    expect(demoRouteRedirect(content, search)).toEqual({ pathname: "/luyen-tap", search: expected, hash: "" })
  })
})
