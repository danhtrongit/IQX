// Import-guard cho shim re-export: nếu file gốc đổi tên/đổi export, mọi test
// khác đều mock module này nên sẽ vẫn xanh — chỉ test này bắt được đứt gãy thật.
import { describe, expect, it } from "vitest"
import { useMidDayAnalysis } from "./useMidDayAnalysis"
import { useMidDayMarketAnalysis } from "./useMidDayMarketAnalysis"

describe("useMidDayAnalysis shim", () => {
  it("re-exports the real hook", () => {
    expect(useMidDayAnalysis).toBe(useMidDayMarketAnalysis)
  })
})
