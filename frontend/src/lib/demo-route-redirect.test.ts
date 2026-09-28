import { describe, expect, it } from "vitest"
import { demoRouteRedirect } from "./demo-route-redirect"

describe("legacy demo content redirects", () => {
  it("moves market view to analysis without colliding with sidebar state", () => {
    const result = demoRouteRedirect("ai-analysis", "?view=stock&symbol=VNM&tour=phantich", "#section")
    expect(result.pathname).toBe("/demo-trading")
    expect(result.hash).toBe("#section")
    const params = new URLSearchParams(result.search)
    expect(params.get("content")).toBe("ai-analysis")
    expect(params.get("analysis")).toBe("stock")
    expect(params.has("view")).toBe(false)
    expect(params.get("symbol")).toBe("VNM")
    expect(params.get("tour")).toBe("phantich")
  })
  it.each(["chart", "board"] as const)("preserves filters and sidebar for %s", content => {
    const result = demoRouteRedirect(content, "?view=trading&symbol=VCB&interval=W&tool=news")
    const params = new URLSearchParams(result.search)
    expect(Object.fromEntries(params)).toEqual({ view: "trading", symbol: "VCB", interval: "W", tool: "news", content })
  })
})
