// phanTichBctcTour.test.ts — AI Phân tích BCTC tour config shape (increment
// 2b, docs/superpowers/plans/2026-07-27-feature-tours.md), spec
// `IQX-Tour-PhanTichBCTC.md` v1.0's 11 stops.
import { describe, expect, it } from "vitest"
import { phanTichBctcTour } from "./phanTichBctcTour"

describe("phanTichBctcTour config", () => {
  it("has exactly 10 steps (spec's 11 stops minus the auto-fill 'ô tìm mã' intro point — dropped, see file header)", () => {
    expect(phanTichBctcTour.steps).toHaveLength(10)
  })

  it("every step is grounded to a real element — no centered steps", () => {
    for (const step of phanTichBctcTour.steps) {
      expect(step.centered).toBeFalsy()
      expect(step.targetId).toBeTruthy()
    }
  })

  it("targetIds are unique", () => {
    const ids = phanTichBctcTour.steps.map((s) => s.targetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("step order matches the spec's tầng 2-4 (hero, scorecard, khối 01-07, kết)", () => {
    expect(phanTichBctcTour.steps.map((s) => s.targetId)).toEqual([
      "tour-bctc-hero-top",
      "tour-bctc-scorecard",
      "tour-bctc-block-01",
      "tour-bctc-block-02",
      "tour-bctc-block-03",
      "tour-bctc-block-04",
      "tour-bctc-block-05",
      "tour-bctc-block-06",
      "tour-bctc-block-07",
      "tour-bctc-search",
    ])
  })

  it("config name is 'phantichbctc' (used for the localStorage/analytics prefix)", () => {
    expect(phanTichBctcTour.name).toBe("phantichbctc")
  })

  it("every step has non-empty title and body copy", () => {
    for (const step of phanTichBctcTour.steps) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
  })

  it("the last step (kết) mentions the bank-template hint (VCB/TCB/BID/MBB) per spec §3 Điểm 11", () => {
    const last = phanTichBctcTour.steps[phanTichBctcTour.steps.length - 1]
    expect(last.body).toMatch(/ngân hàng/i)
  })
})
