import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { teamLeadsApi } from "./api"
import { TeamLeadDetailPage } from "./team-lead-detail-page"
import { installResizeObserver, leadDetail, lookupResult, renderRoute } from "./test-support"

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin-1", role: "admin" } }) }))
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return {
    ...actual,
    teamLeadsApi: {
      ...actual.teamLeadsApi,
      detail: vi.fn(),
      members: vi.fn(),
      lookup: vi.fn(),
      updatePolicy: vi.fn(),
      revoke: vi.fn(),
      addMember: vi.fn(),
      removeMember: vi.fn(),
    },
  }
})

installResizeObserver()

beforeEach(() => {
  vi.mocked(teamLeadsApi.detail).mockReset().mockResolvedValue(
    leadDetail({
      history: [
        {
          id: "h-1",
          createdAt: "2026-10-01T00:00:00Z",
          action: "team_lead.appoint",
          actorRole: "admin",
          actor: { id: "admin-1", username: "admin", fullName: null },
          before: null,
          after: { commission_pct: 20, offer_type: "days", offer_days: 30 },
          reason: "Nhóm học viên",
        },
      ],
    }),
  )
  vi.mocked(teamLeadsApi.members).mockReset().mockResolvedValue({
    items: [
      {
        id: "m-1",
        username: "minh.tran",
        email: "minh@iqx.test",
        fullName: "Trần Minh",
        role: "user",
        status: "active",
        groupJoinVia: "code",
        groupJoinedAt: "2026-10-03T00:00:00Z",
        createdAt: "2026-10-03T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  })
  vi.mocked(teamLeadsApi.updatePolicy).mockReset().mockResolvedValue(leadDetail())
  vi.mocked(teamLeadsApi.revoke).mockReset().mockResolvedValue(leadDetail({ status: "revoked" }))
  vi.mocked(teamLeadsApi.lookup).mockReset()
  vi.mocked(teamLeadsApi.removeMember).mockReset().mockResolvedValue(undefined)
})

function renderPage() {
  return renderRoute("/admin/team-leads/lead-1", "/admin/team-leads/:leadId", <TeamLeadDetailPage />)
}

describe("team lead detail", () => {
  it("shows the four metrics, policy, code, members and the change history", async () => {
    renderPage()
    expect(await screen.findByText("Người dùng trong nhóm", { selector: "p" })).toBeTruthy()
    expect(screen.getByText("Premium miễn phí đang hiệu lực")).toBeTruthy()
    expect(screen.getByText("20% doanh thu")).toBeTruthy()
    expect(screen.getByText("Người dùng mới: từ lúc lưu. Người đã trong nhóm: từ lần thanh toán tiếp theo")).toBeTruthy()
    expect(screen.getByText("Mã giới thiệu", { selector: "div" })).toBeTruthy()
    const member = (await screen.findByText("minh.tran")).closest("tr") as HTMLElement
    expect(within(member).getByText("Mã giới thiệu")).toBeTruthy()
    const history = screen.getByText("Nhóm học viên").closest("tr") as HTMLElement
    expect(within(history).getByText("Bổ nhiệm")).toBeTruthy()
    expect(within(history).getByText("Hoa hồng 20% · Ưu đãi: Premium miễn phí 30 ngày")).toBeTruthy()
  })

  it("locks Save in the policy dialog until something changed and a reason is given", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("button", { name: "Sửa chính sách" }))
    const dialog = await screen.findByRole("dialog")
    const save = within(dialog).getByRole("button", { name: "Lưu thay đổi" }) as HTMLButtonElement
    await user.type(within(dialog).getByLabelText("Lý do"), "Tăng hoa hồng")
    expect(save.disabled).toBe(true)
    expect(within(dialog).getByText("Chưa có thay đổi so với chính sách hiện hành.")).toBeTruthy()

    const commission = within(dialog).getByLabelText("Hoa hồng trực tiếp (%)")
    await user.clear(commission)
    await user.type(commission, "25")
    expect(within(dialog).getByText("20%").tagName).toBe("S")
    expect(within(dialog).getByText("25%")).toBeTruthy()
    expect(save.disabled).toBe(false)
    await user.click(save)
    expect(teamLeadsApi.updatePolicy).toHaveBeenCalledWith("lead-1", {
      commissionPct: 25,
      offerType: "days",
      offerDays: 30,
      reason: "Tăng hoa hồng",
    })
  })

  it("states the consequences of revoking and requires a reason", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("button", { name: "Thôi bổ nhiệm" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/ngừng nhận người dùng mới/)).toBeTruthy()
    expect(within(dialog).getByText("Người dùng đã thuộc nhóm giữ nguyên nhóm và các ưu đãi đã cấp.")).toBeTruthy()
    const confirm = within(dialog).getByRole("button", { name: "Thôi bổ nhiệm" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    await user.type(within(dialog).getByLabelText("Lý do"), "Hết hợp tác")
    await user.click(confirm)
    expect(teamLeadsApi.revoke).toHaveBeenCalledWith("lead-1", "Hết hợp tác")
  })

  it("warns that a user in another group will be moved", async () => {
    vi.mocked(teamLeadsApi.lookup).mockResolvedValue(
      lookupResult({
        group: {
          leadUserId: "lead-2",
          leadUsername: "bao.pham",
          leadFullName: "Phạm Bảo",
          leadStatus: "active",
          joinVia: "code",
          joinedAt: "2026-09-01T00:00:00Z",
        },
        addMember: { eligible: true, reason: null, action: "move" },
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("button", { name: "Thêm người dùng vào nhóm" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Người dùng"), "minh.tran")
    expect(await within(dialog).findByText(/Đang thuộc nhóm của Phạm Bảo \(bao.pham\)/)).toBeTruthy()
    expect(vi.mocked(teamLeadsApi.lookup).mock.calls.at(-1)?.[1]).toBe("lead-1")
    expect(within(dialog).getByRole("button", { name: "Chuyển vào nhóm" })).toBeTruthy()
  })

  it("removes a member only with a reason", async () => {
    const user = userEvent.setup()
    renderPage()
    const member = (await screen.findByText("minh.tran")).closest("tr") as HTMLElement
    await user.click(within(member).getByRole("button", { name: "Loại khỏi nhóm" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Premium miễn phí đã cấp giữ đến hết thời hạn hiện tại.")).toBeTruthy()
    await user.type(within(dialog).getByLabelText("Lý do"), "Không còn sinh hoạt")
    await user.click(within(dialog).getByRole("button", { name: "Loại khỏi nhóm" }))
    expect(teamLeadsApi.removeMember).toHaveBeenCalledWith("lead-1", "m-1", "Không còn sinh hoạt")
  })

  it("hides policy, revoke and add actions once the lead is revoked", async () => {
    vi.mocked(teamLeadsApi.detail).mockResolvedValue(leadDetail({ status: "revoked", acceptingNewUsers: false, revokedAt: "2026-10-05T00:00:00Z" }))
    renderPage()
    expect(await screen.findByText(/Đã thôi bổ nhiệm lúc/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Sửa chính sách" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Thôi bổ nhiệm" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Thêm người dùng vào nhóm" })).toBeNull()
    expect(screen.getAllByText("Đã thôi").length).toBeGreaterThan(0)
  })
})
