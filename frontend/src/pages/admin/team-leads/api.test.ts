import { beforeEach, describe, expect, it, vi } from "vitest"

import { api, ApiError } from "@/lib/api"

import { samePolicy, teamLeadsApi } from "./api"
import { describeHistoryChange } from "./labels"
import { parseCommission, policyFromDraft } from "./policy-draft"

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
  apiResponse: vi.fn(),
}))

const user = {
  id: "lead-1",
  username: "lan.nguyen",
  email: "lan@iqx.test",
  full_name: "Nguyễn Lan",
  role: "team_lead",
  status: "active",
}

const detail = {
  user,
  code: "lan.nguyen",
  status: "active",
  accepting_new_users: true,
  appointed_at: "2026-10-01T00:00:00Z",
  appointed_by: "admin-1",
  revoked_at: null,
  revoked_by: null,
  policy: {
    id: "p-2",
    commission_pct: 20,
    offer_type: "lifetime",
    offer_days: null,
    offer_version_id: "v-2",
    effective_from: "2026-10-02T00:00:00Z",
    reason: "Đổi chương trình",
    created_by: "admin-1",
  },
  metrics: { member_count: 3, revenue_30d_vnd: 990000, commission_30d_vnd: 198000, active_free_premium_count: 1 },
  history: [
    {
      id: "h-1",
      created_at: "2026-10-02T00:00:00Z",
      action: "team_lead.policy_update",
      actor_role: "admin",
      actor: { id: "admin-1", username: "admin", full_name: null },
      before: { commission_pct: 20, offer_type: "days", offer_days: 30 },
      after: { commission_pct: 20, offer_type: "lifetime", offer_days: null },
      reason: "Đổi chương trình",
    },
  ],
}

beforeEach(() => vi.mocked(api).mockReset())

describe("team lead adapters", () => {
  it("lists leads with nullable policy fields and the v2 query", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      items: [
        {
          user,
          code: "lan.nguyen",
          status: "revoked",
          appointed_at: "2026-10-01T00:00:00Z",
          revoked_at: "2026-10-05T00:00:00Z",
          member_count: 4,
          commission_pct: 40,
          offer_type: "none",
          offer_days: null,
          revenue_30d_vnd: 0,
          commission_30d_vnd: 0,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    const page = await teamLeadsApi.list({ page: 1, pageSize: 20, status: "revoked", search: "lan" })
    expect(vi.mocked(api).mock.calls[0]?.[0]).toBe("/admin/team-leads?page=1&page_size=20&status=revoked&search=lan")
    expect(page.items[0]).toMatchObject({ code: "lan.nguyen", status: "revoked", offerType: "none", offerDays: null, commissionPct: 40 })
  })

  it("adapts the detail with history payloads", async () => {
    vi.mocked(api).mockResolvedValueOnce(detail)
    const lead = await teamLeadsApi.detail("lead-1")
    expect(lead.policy).toMatchObject({ commissionPct: 20, offerType: "lifetime", offerDays: null })
    expect(lead.metrics.activeFreePremiumCount).toBe(1)
    expect(lead.history[0]?.before).toEqual({ commission_pct: 20, offer_type: "days", offer_days: 30 })
  })

  it("returns null when the lookup finds nobody", async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND"))
    expect(await teamLeadsApi.lookup("ghost", "lead-1")).toBeNull()
    expect(vi.mocked(api).mock.calls[0]?.[0]).toBe("/admin/team-leads/lookup?q=ghost&lead_id=lead-1")
  })

  it("keeps other lookup failures visible", async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError("Quá nhiều yêu cầu", 429))
    await expect(teamLeadsApi.lookup("lan.nguyen")).rejects.toThrow("Quá nhiều yêu cầu")
  })

  it("sends offer_days only for a days offer", async () => {
    vi.mocked(api).mockResolvedValue(detail)
    await teamLeadsApi.appoint({ userId: "u-1", commissionPct: 0, offerType: "lifetime", offerDays: 30, reason: " Đối tác " })
    await teamLeadsApi.updatePolicy("lead-1", { commissionPct: 10, offerType: "days", offerDays: 90, reason: "Sửa" })
    const [appointCall, policyCall] = vi.mocked(api).mock.calls
    expect(appointCall?.[0]).toBe("/admin/team-leads")
    expect(JSON.parse(String(appointCall?.[1]?.body))).toEqual({
      user_id: "u-1",
      commission_pct: 0,
      offer_type: "lifetime",
      offer_days: null,
      reason: " Đối tác ",
    })
    expect(policyCall?.[0]).toBe("/admin/team-leads/lead-1/policy")
    expect(policyCall?.[1]?.method).toBe("PUT")
    expect(JSON.parse(String(policyCall?.[1]?.body))).toMatchObject({ offer_type: "days", offer_days: 90 })
  })
})

describe("policy draft", () => {
  it("accepts only whole percentages from 0 to 100", () => {
    expect(parseCommission("0")).toBe(0)
    expect(parseCommission("100")).toBe(100)
    expect(parseCommission("101")).toBeNull()
    expect(parseCommission("")).toBeNull()
    expect(parseCommission("4.5")).toBeNull()
    expect(policyFromDraft({ commission: "40", offerType: "none", offerDays: 30 })).toEqual({
      commissionPct: 40,
      offerType: "none",
      offerDays: null,
    })
  })

  it("treats a days change as a change and ignores days on other offers", () => {
    const base = { commissionPct: 10, offerType: "days" as const, offerDays: 30 as const }
    expect(samePolicy(base, { ...base })).toBe(true)
    expect(samePolicy(base, { ...base, offerDays: 90 })).toBe(false)
    expect(samePolicy({ commissionPct: 10, offerType: "none", offerDays: null }, { commissionPct: 10, offerType: "none", offerDays: 30 })).toBe(true)
  })
})

describe("change history", () => {
  it("describes appoint, policy, revoke and member rows", () => {
    expect(
      describeHistoryChange({ action: "team_lead.appoint", before: null, after: { commission_pct: 30, offer_type: "none", offer_days: null } }).text,
    ).toBe("Hoa hồng 30% · Ưu đãi: Không có ưu đãi")
    expect(
      describeHistoryChange({
        action: "team_lead.policy_update",
        before: { commission_pct: 20, offer_type: "days", offer_days: 30 },
        after: { commission_pct: 0, offer_type: "lifetime", offer_days: null },
      }).text,
    ).toBe("Hoa hồng 20% → 0% · Ưu đãi: Premium miễn phí 30 ngày → Premium miễn phí trọn đời")
    expect(describeHistoryChange({ action: "team_lead.revoke", before: null, after: null }).text).toBe("Mã ngừng nhận người dùng mới")
    expect(
      describeHistoryChange({ action: "group.member_move", before: { member_user_id: "m-1" }, after: { member_user_id: "m-1" } }),
    ).toEqual({ text: "Người dùng chuyển từ nhóm khác sang", memberUserId: "m-1" })
  })
})
