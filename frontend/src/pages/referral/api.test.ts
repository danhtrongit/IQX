import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { fetchTeamReferralCode, referralLink, referralOfferLabel } from "./api"

vi.mock("@/lib/api", () => ({ api: vi.fn(), apiResponse: vi.fn() }))

describe("team lead referral code", () => {
  beforeEach(() => vi.clearAllMocks())

  it("loads the code (the username), commission and offer from team/me", async () => {
    vi.mocked(api).mockResolvedValue({
      appointed_at: "2026-10-01T00:00:00.000Z",
      code: "lan.nguyen",
      commission_pct: 40,
      member_count: 12,
      offer_days: 30,
      offer_type: "days",
      status: "active",
      user: { id: "lead-1", username: "lan.nguyen", full_name: "Lan" },
    })

    await expect(fetchTeamReferralCode()).resolves.toEqual({
      code: "lan.nguyen",
      commissionPct: 40,
      offerType: "days",
      offerDays: 30,
      memberCount: 12,
      appointedAt: "2026-10-01T00:00:00.000Z",
    })
    expect(api).toHaveBeenCalledWith("/team/me", expect.objectContaining({ method: "GET" }))
  })

  it("ignores offer_days unless the offer is a days offer", async () => {
    vi.mocked(api).mockResolvedValue({
      appointed_at: "2026-10-01T00:00:00.000Z",
      code: "lan.nguyen",
      commission_pct: 0,
      member_count: 0,
      offer_days: 30,
      offer_type: "lifetime",
      status: "active",
      user: { id: "lead-1", username: "lan.nguyen", full_name: "Lan" },
    })
    await expect(fetchTeamReferralCode()).resolves.toMatchObject({ offerType: "lifetime", offerDays: null })
  })

  it("labels offers and builds a ?ref= link on the current origin", () => {
    expect(referralOfferLabel("none", null)).toBe("Không có ưu đãi")
    expect(referralOfferLabel("days", 90)).toBe("Premium miễn phí 90 ngày")
    expect(referralOfferLabel("lifetime", null)).toBe("Premium miễn phí trọn đời")
    expect(referralLink("lan.nguyen")).toBe(`${window.location.origin}/?ref=lan.nguyen`)
  })
})
