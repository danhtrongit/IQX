import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { metricsApi, type MetricsOverview } from "@/pages/admin/core/api"
import { fetchTeamReferralCode } from "@/pages/referral/api"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { teamApi } from "./api"
import { TeamDashboardPage } from "./team-dashboard-page"

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "lead-1", role: "team_lead" } }) }))
vi.mock("@/pages/referral/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/referral/api")>()),
  fetchTeamReferralCode: vi.fn(),
}))
vi.mock("@/pages/admin/core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/admin/core/api")>()
  return { ...actual, metricsApi: { overview: vi.fn(), revenue: vi.fn() } }
})
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return {
    ...actual,
    teamApi: { ...actual.teamApi, overview: vi.fn(), revenue: vi.fn(), segmentCount: vi.fn() },
  }
})

installResizeObserver()

const overview: MetricsOverview = {
  totalUsers: 12,
  activeUsers: 11,
  newUsersToday: 1,
  newUsersLast7d: 4,
  newUsersLast30d: 9,
  activeSubscribers: 6,
  activeTrialCount: 2,
  activePaidCount: 3,
  planDistribution: [{ planCode: "PREMIUM_30D", planName: "Premium 30 ngày", priceVnd: 199000, activeSubscriptions: 3 }],
  mrrVnd: 597000,
  revenueTodayVnd: 199000,
  revenueLast7dVnd: 398000,
  revenueLast30dVnd: 597000,
  vtActiveAccounts: 7,
  vtOrdersToday: 15,
  activeReferralOfferCount: 1,
  generatedAt: "2026-10-16T03:00:00Z",
}

const COUNTS = { new_7d: 4, email_unverified: 2, trialing: 1, inactive_14d: 3 } as const

beforeEach(() => {
  vi.mocked(fetchTeamReferralCode).mockReset().mockResolvedValue({
    code: "lan.nguyen",
    commissionPct: 20,
    offerType: "days",
    offerDays: 30,
    memberCount: 12,
    appointedAt: "2026-10-01T00:00:00Z",
  })
  vi.mocked(teamApi.overview).mockReset().mockResolvedValue(overview)
  vi.mocked(teamApi.revenue).mockReset().mockResolvedValue([{ date: "2026-10-15", paidOrders: 1, revenueVnd: 199000 }])
  vi.mocked(teamApi.segmentCount).mockReset().mockImplementation(async (segment) => COUNTS[segment])
  vi.mocked(metricsApi.overview).mockReset()
  vi.mocked(metricsApi.revenue).mockReset()
})

function renderPage() {
  return renderRoute("/admin", "/admin", <TeamDashboardPage />)
}

describe("team dashboard (§5.1.2)", () => {
  it("labels the scope with the member count and the referral code", async () => {
    renderPage()
    expect(await screen.findByText("Nhóm của bạn · 12 người dùng · mã lan.nguyen")).toBeTruthy()
  })

  it("keeps the 8 KPI tiles fed by team metrics and never calls admin metrics", async () => {
    renderPage()
    expect(await screen.findByText("Premium đang hoạt động")).toBeTruthy()
    for (const label of [
      "Tổng người dùng",
      "Người dùng mới hôm nay",
      "Doanh thu định kỳ (MRR)",
      "Doanh thu hôm nay",
      "Thuê bao đang hoạt động",
      "Tài khoản giao dịch ảo",
      "Lệnh ảo hôm nay",
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(await screen.findByText("Lệnh mô phỏng hôm nay của thành viên")).toBeTruthy()
    expect(screen.getByText("Phân bổ gói Premium")).toBeTruthy()
    expect(screen.getByText("Premium 30 ngày")).toBeTruthy()
    expect(teamApi.overview).toHaveBeenCalled()
    expect(teamApi.revenue).toHaveBeenCalledWith(30)
    expect(metricsApi.overview).not.toHaveBeenCalled()
    expect(metricsApi.revenue).not.toHaveBeenCalled()
  })

  it("links the 4 shortcuts with their counts to the filtered users list", async () => {
    renderPage()
    const nav = await screen.findByRole("navigation", { name: "Lối tắt người dùng trong nhóm" })
    const expected = [
      ["Người dùng mới 7 ngày", "new_7d", "4"],
      ["Chưa xác thực email", "email_unverified", "2"],
      ["Đang dùng thử", "trialing", "1"],
      ["Không đăng nhập 14 ngày", "inactive_14d", "3"],
    ] as const
    for (const [label, segment, count] of expected) {
      const link = within(nav).getByRole("link", { name: new RegExp(label) })
      expect(link.getAttribute("href")).toBe(`/admin/users?segment=${segment}`)
      expect(await within(link).findByText(count)).toBeTruthy()
    }
  })
})
