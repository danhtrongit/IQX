import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { usersApi } from "@/pages/admin/core/api"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { teamApi } from "./api"
import { TeamUserDetailPage } from "./team-user-detail-page"
import { teamUser360 } from "./test-support"

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "lead-1", role: "team_lead", username: "lan.nguyen", full_name: "Nguyễn Lan" } }),
}))
vi.mock("@/pages/admin/core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/admin/core/api")>()
  return { ...actual, usersApi: { ...actual.usersApi, get360: vi.fn(), get: vi.fn(), loginHistory: vi.fn() } }
})
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return {
    ...actual,
    teamApi: { ...actual.teamApi, user360: vi.fn(), loginHistory: vi.fn(), removeMember: vi.fn() },
  }
})

installResizeObserver()

beforeEach(() => {
  vi.mocked(teamApi.user360).mockReset().mockResolvedValue(teamUser360())
  vi.mocked(teamApi.loginHistory).mockReset().mockResolvedValue({
    items: [
      {
        id: "lg-1",
        userId: "m-1",
        email: "minh@iqx.test",
        success: true,
        failureReason: null,
        ip: "10.0.0.1",
        userAgent: "Safari",
        loginAt: "2026-10-12T02:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  })
  vi.mocked(teamApi.removeMember).mockReset().mockResolvedValue({ userId: "m-1", removedAt: "2026-10-16T03:00:00Z" })
})

function renderPage() {
  return renderRoute("/admin/users/m-1", "/admin/users/:userId", <TeamUserDetailPage />)
}

describe("team user detail (§5.1.3)", () => {
  it("is read-only: Loại khỏi nhóm is the only action and nothing links to admin pages", async () => {
    renderPage()
    expect(await screen.findByText("Tài khoản")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Loại khỏi nhóm" })).toBeTruthy()
    for (const name of [/Sửa hồ sơ/, /Quyền & trạng thái/, /Đặt lại mật khẩu/, /Xóa mềm/, /Chuyển nhóm/, /Thêm vào nhóm/]) {
      expect(screen.queryByRole("button", { name })).toBeNull()
    }
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    expect(hrefs).toEqual(["/admin/users"])
    expect(teamApi.user360).toHaveBeenCalledWith("m-1")
    expect(usersApi.get360).not.toHaveBeenCalled()
    expect(usersApi.get).not.toHaveBeenCalled()
  })

  it("shows the Giới thiệu card, username and the five tabs", async () => {
    renderPage()
    expect(await screen.findByText("Giới thiệu")).toBeTruthy()
    expect(screen.getAllByText("minh.tran").length).toBeGreaterThan(0)
    expect(screen.getByText("Nguyễn Lan (lan.nguyen)")).toBeTruthy()
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent)
    expect(tabs).toEqual([
      "Thuê bao (0)",
      "Thanh toán (1)",
      "Demo Trading và Bot",
      "Lịch sử đăng nhập (1)",
      "Học viện",
    ])
  })

  it("shows payment amounts without an admin link", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("tab", { name: "Thanh toán (1)" }))
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByText("IQX-0001").closest("a")).toBeNull()
    expect(within(panel).getByText(/199\.000/)).toBeTruthy()
  })

  it("shows Demo Trading và Bot as percent only with Chưa kích hoạt (§7.6)", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("tab", { name: "Demo Trading và Bot" }))
    const panel = screen.getByRole("tabpanel")
    const pct = within(panel).getByText(/4,2\s?%/)
    expect(pct.className).toContain("text-price-up")
    const botRow = within(panel).getByText("Bot").closest("tr") as HTMLElement
    expect(within(botRow).getAllByText("Chưa kích hoạt")).toHaveLength(3)
    expect(panel.textContent).not.toMatch(/₫|VND|Tiền ban đầu|Khả dụng|Mở trang quản trị/)
  })

  it("removes the member with a reason, then returns to the list", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("button", { name: "Loại khỏi nhóm" }))
    const dialog = await screen.findByRole("dialog")
    const confirm = within(dialog).getByRole("button", { name: "Loại khỏi nhóm" })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.type(within(dialog).getByLabelText("Lý do"), "Đã chuyển sang nhóm khác")
    await user.click(confirm)
    expect(teamApi.removeMember).toHaveBeenCalledWith("m-1", "Đã chuyển sang nhóm khác")
    expect(await screen.findByText("Trang khác")).toBeTruthy()
  })

  it("explains a 404 for a user outside the group", async () => {
    vi.mocked(teamApi.user360).mockRejectedValue(new ApiError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND"))
    renderPage()
    expect(await screen.findByText("Không tìm thấy người dùng trong nhóm")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Loại khỏi nhóm" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
