import { describe, expect, it } from "vitest"
import { parseDemoContent, parseTradingTab, withDemoContent } from "./content-tabs-state"

describe("demo trading content URL state", () => {
  it("keeps the selected trading sidebar and symbol when content changes", () => {
    const original = new URLSearchParams("tool=giao-dich&symbol=VNM&tour=bantin&content=board")
    const chart = withDemoContent(original, "chart")
    expect(chart.get("tool")).toBe("giao-dich")
    expect(chart.get("symbol")).toBe("VNM")
    expect(chart.get("tour")).toBe("bantin")
    // The chart is the default tab: it has no param.
    expect(chart.has("content")).toBe(false)
    expect(original.get("content")).toBe("board")
  })

  it.each(["board", "market", "insight"] as const)("writes content=%s and leaves the other params alone", (content) => {
    const next = withDemoContent(new URLSearchParams("tool=giao-dich&tab=danh-muc&symbol=FPT&period=1Y"), content)
    expect(next.get("content")).toBe(content)
    expect(next.get("tab")).toBe("danh-muc")
    expect(next.get("symbol")).toBe("FPT")
    expect(next.get("period")).toBe("1Y")
  })

  it("falls back to the chart for unknown or retired content values", () => {
    expect(parseDemoContent("unknown")).toBe("chart")
    expect(parseDemoContent("journey")).toBe("chart")
    expect(parseDemoContent("overview")).toBe("chart")
    expect(parseDemoContent("ai-analysis")).toBe("chart")
    expect(parseDemoContent(null)).toBe("chart")
  })

  it("accepts the three main tabs; Insight falls back to the chart while it is hidden", () => {
    for (const content of ["chart", "board", "market"] as const) expect(parseDemoContent(content)).toBe(content)
    expect(parseDemoContent("insight")).toBe("chart")
  })

  it("reads the Giao dịch panel tab, Đặt lệnh by default", () => {
    expect(parseTradingTab("danh-muc")).toBe("danh-muc")
    expect(parseTradingTab("tin-tuc")).toBe("tin-tuc")
    expect(parseTradingTab("dat-lenh")).toBe("dat-lenh")
    expect(parseTradingTab("portfolio")).toBe("dat-lenh")
    expect(parseTradingTab(null)).toBe("dat-lenh")
  })
})
