import { describe, expect, it } from "vitest"
import { banTinTour } from "./banTinTour"

describe("banTinTour (T4, config shape)", () => {
  it("has between 4 and 6 concept-card steps", () => {
    expect(banTinTour.steps.length).toBeGreaterThanOrEqual(4)
    expect(banTinTour.steps.length).toBeLessThanOrEqual(6)
  })

  it("every step is a centered concept card (no DOM target — does not spotlight a remote surface)", () => {
    for (const step of banTinTour.steps) {
      expect(step.centered).toBe(true)
      expect(step.targetId).toBeUndefined()
      expect(step.targetSelector).toBeUndefined()
    }
  })

  it("introduces the 3 session briefs Trước phiên / Giữa phiên / Cuối phiên, in that order", () => {
    const titles = banTinTour.steps.map((s) => s.title)
    const preIdx = titles.findIndex((t) => /trước phiên/i.test(t))
    const midIdx = titles.findIndex((t) => /giữa phiên/i.test(t))
    const endIdx = titles.findIndex((t) => /cuối phiên/i.test(t))
    expect(preIdx).toBeGreaterThanOrEqual(0)
    expect(midIdx).toBeGreaterThan(preIdx)
    expect(endIdx).toBeGreaterThan(midIdx)
  })

  it("ends by pointing the user to where to read the briefs (trang chủ)", () => {
    const lastStep = banTinTour.steps[banTinTour.steps.length - 1]
    expect(lastStep.body).toMatch(/trang chủ/i)
  })
})
