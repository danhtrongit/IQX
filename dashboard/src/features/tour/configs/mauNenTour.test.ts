// mauNenTour.test.ts — AI Mẫu nến tour config shape (T5, docs/superpowers/
// plans/2026-07-27-feature-tours.md), spec `IQX-Tour-MauNen.md` v1.0's 7 stops.
import { describe, expect, it } from "vitest"
import { mauNenTour } from "./mauNenTour"

describe("mauNenTour config", () => {
  it("has exactly 7 steps (spec's exact count)", () => {
    expect(mauNenTour.steps).toHaveLength(7)
  })

  it("every step is grounded to a real AIPatternPanel element — no invented centered steps (the launch button already lives inside the always-mounted panel)", () => {
    for (const step of mauNenTour.steps) {
      expect(step.centered).toBeFalsy()
      expect(step.targetId).toBeTruthy()
    }
  })

  it("targetIds are unique", () => {
    const ids = mauNenTour.steps.map((s) => s.targetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("step order matches the spec's 7 stops: header intro, kind switch, scanning, hero, illustration, meaning+action, all-patterns list", () => {
    expect(mauNenTour.steps.map((s) => s.targetId)).toEqual([
      "tour-maunen-header",
      "tour-maunen-kind-switch",
      "tour-maunen-scanning",
      "tour-maunen-hero",
      "tour-maunen-illustration",
      "tour-maunen-meaning-action",
      "tour-maunen-list",
    ])
  })

  it("config name is 'maunen' (used for the localStorage/analytics prefix)", () => {
    expect(mauNenTour.name).toBe("maunen")
  })
})
