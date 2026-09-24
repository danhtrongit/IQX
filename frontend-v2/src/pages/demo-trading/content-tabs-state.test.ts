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
    expect(withDemoContent(chart, "journey").get("view")).toBe("trading")
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

  it("falls back to the journey for unknown content values", () => {
    expect(parseDemoContent("unknown")).toBe("journey")
    expect(parseDemoContent(null)).toBe("journey")
  })
})
