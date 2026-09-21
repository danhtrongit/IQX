import { describe, expect, it } from "vitest"
import { phanTichTour } from "./phanTichTour"

describe("phanTichTour", () => {
  it("keeps all 14 ordered spotlight stops", () => {
    expect(phanTichTour.steps).toHaveLength(14)
    expect(phanTichTour.steps[0]).toMatchObject({ targetId: "tour-phantich-input", title: "Nhập mã để xem phân tích" })
    expect(phanTichTour.steps.slice(9).map((step) => step.targetId)).toEqual([
      "tour-phantich-l1", "tour-phantich-l2", "tour-phantich-l3", "tour-phantich-l4", "tour-phantich-l5",
    ])
  })
})
