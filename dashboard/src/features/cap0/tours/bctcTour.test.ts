import { describe, expect, it } from "vitest"
import { bctcTour } from "./bctcTour"

describe("bctcTour", () => {
  it("keeps all 11 stops and returns to the real symbol input", () => {
    expect(bctcTour.steps).toHaveLength(11)
    expect(bctcTour.steps[0]?.body).toContain("VIC (VinGroup)")
    expect(bctcTour.steps[10]).toMatchObject({ targetId: "tour-bctc-input", title: "Tour hoàn thành ✓" })
  })
})
