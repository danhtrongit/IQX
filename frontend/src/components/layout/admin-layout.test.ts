import { describe, expect, it } from "vitest"

import { getAdminAccessState } from "./admin-access"

describe("admin access gate", () => {
  it("distinguishes authorized and non-admin users", () => {
    expect(getAdminAccessState({ isLoading: false, sessionError: null, user: { role: "admin" } })).toBe("authorized")
    expect(getAdminAccessState({ isLoading: false, sessionError: null, user: { role: "user" } })).toBe("forbidden")
  })

  it("keeps loading and session failures explicit", () => {
    expect(getAdminAccessState({ isLoading: true, sessionError: null, user: null })).toBe("loading")
    expect(getAdminAccessState({ isLoading: false, sessionError: new Error("expired"), user: null })).toBe(
      "session-error",
    )
  })
})
