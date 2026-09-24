import { describe, expect, it } from "vitest"
import { canUseHeroDepth, sceneryCover, textureClassForTheme } from "./hero-depth-engine"

describe("hero water helpers", () => {
  it("matches the cover crop and 62 percent scenery position", () => {
    const renderedHeight = 941 * 1440 / 1672
    const crop = sceneryCover({ width: 1672, height: 941 }, { width: 1440, height: 486 })
    expect(crop.visibleWidth).toBe(1)
    expect(crop.visibleHeight).toBeCloseTo(486 / renderedHeight)
    expect(crop.left).toBe(0)
    expect(crop.top).toBeCloseTo((renderedHeight - 486) / renderedHeight * 0.62)
  })
  it("opts out when motion, pointer, or data saving constraints apply", () => {
    expect(textureClassForTheme("dark")).toBe("intro-night")
    const ok = { matchMedia: (query: string) => ({ matches: query.includes("min-width") }), navigator: {} }
    expect(canUseHeroDepth(ok)).toBe(true)
    expect(canUseHeroDepth({ ...ok, navigator: { connection: { saveData: true } } })).toBe(false)
    expect(canUseHeroDepth({ ...ok, matchMedia: () => ({ matches: true }) })).toBe(false)
    expect(canUseHeroDepth({ ...ok, matchMedia: () => ({ matches: false }) })).toBe(false)
  })
})
