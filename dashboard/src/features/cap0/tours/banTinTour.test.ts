import { describe, expect, it } from "vitest"
import { banTinTour } from "./banTinTour"

describe("banTinTour (23 real spotlights)", () => {
  it("has all 23 handoff steps", () => {
    expect(banTinTour.steps).toHaveLength(23)
  })

  it("every step targets a real surface", () => {
    for (const step of banTinTour.steps) {
      expect(step.centered).not.toBe(true)
      expect(step.targetId ?? step.targetSelector).toBeTruthy()
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

  it("ends on Điểm chú ý of the end-of-day brief", () => {
    const lastStep = banTinTour.steps[banTinTour.steps.length - 1]
    expect(lastStep.title).toMatch(/Điểm chú ý/i)
    expect(lastStep.targetId).toBe("tour-bantin-end-unexplained")
  })
})
