import { describe, expect, it } from "vitest"

import { isResetConfirmation } from "./reset-confirmation"

describe("privileged account reset confirmation", () => {
  it("requires the explicit destructive phrase", () => {
    expect(isResetConfirmation("ĐẶT LẠI")).toBe(true)
    expect(isResetConfirmation(" đặt lại ")).toBe(true)
    expect(isResetConfirmation("ĐẶT LẠI TẤT CẢ")).toBe(false)
    expect(isResetConfirmation("")).toBe(false)
  })
})
