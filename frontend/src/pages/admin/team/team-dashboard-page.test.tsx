import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { metricsApi, type MetricsOverview } from "@/pages/admin/core/api"
import { fetchTeamReferralCode } from "@/pages/referral/api"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { fetchTeamAcademyConfig, teamApi } from "./api"
import { TeamDashboardPage } from "./team-dashboard-page"
import { teamAcademyConfig } from "./test-support"

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
    fetchTeamAcademyConfig: vi.fn(),
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
  vi.mocked(fetchTeamAcademyConfig).mockReset().mockResolvedValue(teamAcademyConfig())
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

describe("team academy config card (Học viện v4.1 §1.3)", () => {
  const CARD = "Cấu hình Học viện của nhóm"

  async function findCard() {
    return within(await screen.findByRole("region", { name: CARD }))
  }

  it("shows the own config of the group with renumbered chapters and the read-only note", async () => {
    renderPage()
    const card = await findCard()
    expect(await card.findByText("Cấu hình riêng của nhóm")).toBeTruthy()
    expect(card.getByText("Học lần lượt")).toBeTruthy()
    expect(card.getByText("3/12 chương · 40 bài học")).toBeTruthy()
    const chapters = within(card.getByRole("list", { name: "Chương của nhóm" })).getAllByRole("listitem")
    expect(chapters.map((item) => item.textContent)).toEqual([
      "Chương 1 · Nền tảng12 bài",
      "Chương 2 · Thương hiệu cá nhânKèm Phòng tập thực chiến10 bài",
      "Chương 3 · Phương pháp kỹ thuật18 bài",
    ])
    expect(card.getByText("Chỉ quản trị viên mới thay đổi được cấu hình này.")).toBeTruthy()
    expect(fetchTeamAcademyConfig).toHaveBeenCalledTimes(1)
  })

  it("has no control that edits the config", async () => {
    renderPage()
    const card = await findCard()
    await card.findByText("Cấu hình riêng của nhóm")
    for (const role of ["button", "textbox", "checkbox", "radio", "combobox", "switch", "link"] as const) {
      expect(card.queryAllByRole(role)).toHaveLength(0)
    }
  })

  it("says the group follows the default when it has no own config", async () => {
    vi.mocked(fetchTeamAcademyConfig).mockResolvedValue(
      teamAcademyConfig({ has_own_config: false, mode: "free", chapter_count: 12, required_total: 116, updated_at: null }),
    )
    renderPage()
    const card = await findCard()
    expect(await card.findByText("Theo mặc định")).toBeTruthy()
    expect(card.queryByText("Cấu hình riêng của nhóm")).toBeNull()
    expect(card.getByText("Học tự do")).toBeTruthy()
    expect(card.getByText("12/12 chương · 116 bài học")).toBeTruthy()
    expect(card.queryByText(/Cập nhật lần cuối/)).toBeNull()
  })

  it("shows a skeleton while loading", async () => {
    vi.mocked(fetchTeamAcademyConfig).mockReturnValue(new Promise(() => {}))
    renderPage()
    const card = await findCard()
    expect(card.getByRole("status", { name: "Đang tải cấu hình Học viện" })).toBeTruthy()
  })

  it("reports a failure and retries", async () => {
    vi.mocked(fetchTeamAcademyConfig)
      .mockRejectedValueOnce(new ApiError("Máy chủ đang bận", 503))
      .mockResolvedValue(teamAcademyConfig())
    const user = userEvent.setup()
    renderPage()
    const card = await findCard()
    expect(await card.findByText("Máy chủ đang bận")).toBeTruthy()
    await user.click(card.getByRole("button", { name: "Thử lại" }))
    expect(await card.findByText("Cấu hình riêng của nhóm")).toBeTruthy()
    expect(fetchTeamAcademyConfig).toHaveBeenCalledTimes(2)
  })
})
