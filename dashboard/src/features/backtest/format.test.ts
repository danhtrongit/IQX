import { describe, it, expect } from "vitest"
import { fmtDateVN } from "./format"

describe("fmtDateVN", () => {
  it("formats ISO to DD/MM/YYYY", () => {
    expect(fmtDateVN("2026-01-27")).toBe("27/01/2026")
  })
  it("passes through empty", () => {
    expect(fmtDateVN("")).toBe("")
  })
})
