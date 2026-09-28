import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { absoluteReferralUrl, enrollReferral, fetchAdminReferral, fetchMyReferral } from "./api"

vi.mock("@/lib/api", () => ({ api: vi.fn() }))

const wire = {
  referral_code: "CTV-42",
  referral_partner_kind: "ctv" as const,
  referral_lead_user_id: "lead-1",
  referred_by_user_id: null,
  referral_url: "/?ref=CTV-42",
}

describe("referral API adapters", () => {
  beforeEach(() => vi.clearAllMocks())

  it("loads and maps the current user's referral record", async () => {
    vi.mocked(api).mockResolvedValue(wire)

    await expect(fetchMyReferral()).resolves.toEqual({
      referralCode: "CTV-42",
      referralPartnerKind: "ctv",
      referralLeadUserId: "lead-1",
      referredByUserId: null,
      referralUrl: "/?ref=CTV-42",
    })
    expect(api).toHaveBeenCalledWith("/referrals/me", { signal: undefined })
  })

  it("keeps admin enrollment immutable at the API boundary", async () => {
    vi.mocked(api).mockResolvedValue(wire)

    await fetchAdminReferral("user-1")
    await enrollReferral("user-1", { kind: "ctv", leadUserId: "lead-1" })

    expect(api).toHaveBeenNthCalledWith(1, "/admin/referrals/user-1", { signal: undefined })
    expect(api).toHaveBeenNthCalledWith(2, "/admin/referrals/user-1/enroll", {
      method: "POST",
      body: JSON.stringify({ kind: "ctv", lead_user_id: "lead-1" }),
    })
  })

  it("resolves a backend relative URL against the current origin", () => {
    expect(absoluteReferralUrl("/?ref=CTV-42")).toBe(`${window.location.origin}/?ref=CTV-42`)
    expect(absoluteReferralUrl(null)).toBeNull()
  })
})
