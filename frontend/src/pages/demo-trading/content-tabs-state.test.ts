import { describe, expect, it } from "vitest"
import { parseDemoContent, withDemoContent } from "./content-tabs-state"

describe("demo trading content URL state", () => {
  it("keeps the selected trading sidebar and symbol when content changes", () => {
    const original = new URLSearchParams("view=trading&symbol=VNM&tour=bantin&content=board")
    const chart = withDemoContent(original, "chart")
    expect(chart.get("view")).toBe("trading")
    expect(chart.get("symbol")).toBe("VNM")
    expect(chart.get("tour")).toBe("bantin")
    // The chart is the default tab: it has no param.
    expect(chart.has("content")).toBe(false)
    expect(original.get("content")).toBe("board")
  })

  it.each(["board", "market", "insight"] as const)("writes content=%s and leaves the other params alone", (content) => {
    const next = withDemoContent(new URLSearchParams("view=portfolio&symbol=FPT&period=1Y"), content)
    expect(next.get("content")).toBe(content)
    expect(next.get("view")).toBe("portfolio")
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

  it("accepts the four current content values", () => {
    for (const content of ["chart", "board", "market", "insight"] as const) expect(parseDemoContent(content)).toBe(content)
  })
})
