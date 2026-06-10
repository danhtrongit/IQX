import { describe, expect, it } from "vitest"
import { adaptUserRow, userInitials } from "./users"
import { adaptPlan } from "./plans"

describe("admin API adapters", () => {
  it("normalizes backend user rows", () => {
    expect(
      adaptUserRow({
        id: "u1",
        email: "admin@example.com",
        full_name: "Admin User",
        phone_number: null,
        role: "admin",
        status: "active",
        is_email_verified: true,
        last_login_at: null,
        created_at: "2026-06-10T00:00:00Z",
      }),
    ).toEqual({
      id: "u1",
      email: "admin@example.com",
      fullName: "Admin User",
      phoneNumber: null,
      role: "admin",
      status: "active",
      isEmailVerified: true,
      lastLoginAt: null,
      createdAt: "2026-06-10T00:00:00Z",
    })
  })

  it("normalizes premium plans", () => {
    expect(
      adaptPlan({
        id: "p1",
        code: "PRO",
        name: "Pro",
        description: null,
        price_vnd: 199000,
        duration_days: 30,
        is_active: true,
        sort_order: 1,
        created_at: "2026-06-10T00:00:00Z",
        updated_at: "2026-06-10T00:00:00Z",
      }),
    ).toMatchObject({ code: "PRO", priceVnd: 199000, isActive: true })
  })

  it("builds avatar initials from Vietnamese names", () => {
    expect(userInitials("Nguyen Van A", "a@example.com")).toBe("NA")
    expect(userInitials(null, "beta@example.com")).toBe("BE")
  })
})
