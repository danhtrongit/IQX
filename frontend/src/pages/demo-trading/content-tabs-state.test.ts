import { describe, expect, it } from "vitest"
import { parseDemoContent, withAnalysisView, withDemoContent } from "./content-tabs-state"

describe("demo trading content URL state", () => {
  it("keeps the selected trading sidebar and symbol when content changes", () => {
    const original = new URLSearchParams("view=trading&symbol=VNM&tour=bantin")
    const chart = withDemoContent(original, "chart")
    expect(chart.get("view")).toBe("trading")
    expect(chart.get("symbol")).toBe("VNM")
    expect(chart.get("tour")).toBe("bantin")
    expect(chart.get("content")).toBe("chart")
    expect(original.has("content")).toBe(false)
    expect(withDemoContent(chart, "overview").get("view")).toBe("trading")
    expect(withDemoContent(chart, "overview").has("content")).toBe(false)
  })

  it("keeps the sidebar view when the AI analysis subview changes", () => {
    const original = new URLSearchParams("view=portfolio&content=ai-analysis&symbol=FPT&period=1Y")
    const financial = withAnalysisView(original, "financial")
    expect(financial.get("analysis")).toBe("financial")
    expect(financial.get("view")).toBe("portfolio")
    expect(financial.get("content")).toBe("ai-analysis")
    expect(financial.get("symbol")).toBe("FPT")
    expect(financial.get("period")).toBe("1Y")
  })

  it("falls back to the overview for unknown or retired content values", () => {
    expect(parseDemoContent("unknown")).toBe("overview")
    expect(parseDemoContent("journey")).toBe("overview")
    expect(parseDemoContent(null)).toBe("overview")
    expect(parseDemoContent("board")).toBe("board")
  })
})
