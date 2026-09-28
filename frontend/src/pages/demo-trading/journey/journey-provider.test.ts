import { describe, expect, it } from "vitest"

import { unwrapJourneyData } from "./journey-state"

describe("journey v2 envelopes", () => {
  it("reads direct cap0 responses and wrapped cap7/8-style responses", () => {
    expect(unwrapJourneyData({ level: 0 })).toEqual({ level: 0 })
    expect(unwrapJourneyData({ data: { level: 7 }, meta: {} })).toEqual({ level: 7 })
    expect(unwrapJourneyData(null)).toBeNull()
  })
})
