import { describe, expect, it } from "vitest"

import { HUNT_FILTERS } from "./copy"
import { DEFAULT_HUNT_FILTER, parseHuntFilter, withHuntFilter } from "./hunt-url"

describe("hunt URL state", () => {
  it("has exactly the five approved groups in order", () => {
    expect(HUNT_FILTERS.map((filter) => filter.ten)).toEqual([
      "Khối ngoại gom",
      "Tự doanh gom",
      "Khối lượng đột biến",
      "Vượt đỉnh 20 phiên",
      "Tăng mạnh kèm khối lượng",
    ])
  })

  it("falls back to the first group for a missing or unknown value", () => {
    expect(DEFAULT_HUNT_FILTER).toBe("ngoai")
    expect(parseHuntFilter(null)).toBe("ngoai")
    expect(parseHuntFilter("nope")).toBe("ngoai")
    expect(parseHuntFilter("dinh")).toBe("dinh")
  })

  it("changes only the hunt param", () => {
    const next = withHuntFilter(new URLSearchParams("view=hunt&symbol=FPT"), "tang")
    expect(Object.fromEntries(next)).toEqual({ view: "hunt", symbol: "FPT", hunt: "tang" })
  })
})
