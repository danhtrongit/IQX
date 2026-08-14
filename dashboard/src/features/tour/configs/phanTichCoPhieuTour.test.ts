// phanTichCoPhieuTour.test.ts — AI Phân tích cổ phiếu tour config shape
// (increment 2b, docs/superpowers/plans/2026-07-27-feature-tours.md), spec
// `IQX-Tour-PhanTichCoPhieu.md` v1.0's 14 stops.
import { describe, expect, it } from "vitest"
import { phanTichCoPhieuTour } from "./phanTichCoPhieuTour"

describe("phanTichCoPhieuTour config", () => {
  it("has exactly 13 steps (spec's 14 stops minus the auto-fill 'ô tìm mã' point — dropped, see file header)", () => {
    expect(phanTichCoPhieuTour.steps).toHaveLength(13)
  })

  it("every step is grounded to a real AiInsightBriefing element — no centered steps", () => {
    for (const step of phanTichCoPhieuTour.steps) {
      expect(step.centered).toBeFalsy()
      expect(step.targetId).toBeTruthy()
    }
  })

  it("targetIds are unique", () => {
    const ids = phanTichCoPhieuTour.steps.map((s) => s.targetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("step order matches the spec's tầng 2-4 (header, briefing L6 x6, divider, L1-L5)", () => {
    expect(phanTichCoPhieuTour.steps.map((s) => s.targetId)).toEqual([
      "tour-aiinsight-header",
      "tour-aiinsight-trend-row",
      "tour-aiinsight-narrative",
      "tour-aiinsight-diff",
      "tour-aiinsight-observations",
      "tour-aiinsight-watch-levels",
      "tour-aiinsight-verdict",
      "tour-aiinsight-divider",
      "tour-aiinsight-layer-l1",
      "tour-aiinsight-layer-l2",
      "tour-aiinsight-layer-l3",
      "tour-aiinsight-layer-l4",
      "tour-aiinsight-layer-l5",
    ])
  })

  it("config name is 'phantichcophieu' (used for the localStorage/analytics prefix)", () => {
    expect(phanTichCoPhieuTour.name).toBe("phantichcophieu")
  })

  it("every step has non-empty title and body copy", () => {
    for (const step of phanTichCoPhieuTour.steps) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
  })
})
