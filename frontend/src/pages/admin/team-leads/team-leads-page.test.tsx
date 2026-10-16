import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { teamLeadsApi } from "./api"
import { TeamLeadsPage } from "./team-leads-page"
import { installResizeObserver, leadDetail, lookupResult, renderRoute } from "./test-support"

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin-1", role: "admin" } }) }))
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return {
    ...actual,
    teamLeadsApi: { ...actual.teamLeadsApi, list: vi.fn(), lookup: vi.fn(), appoint: vi.fn() },
  }
})

installResizeObserver()

beforeEach(() => {
  vi.mocked(teamLeadsApi.list).mockReset().mockResolvedValue({
    items: [
      {
        user: { id: "lead-1", username: "lan.nguyen", email: "lan@iqx.test", fullName: "Nguyễn Lan", role: "team_lead", status: "active" },
        code: "lan.nguyen",
        status: "active",
        appointedAt: "2026-10-01T00:00:00Z",
        revokedAt: null,
        memberCount: 12,
        commissionPct: 30,
        offerType: "days",
        offerDays: 90,
        revenue30dVnd: 1500000,
        commission30dVnd: 450000,
      },
      {
        user: { id: "lead-2", username: "bao.pham", email: "bao@iqx.test", fullName: null, role: "user", status: "active" },
        code: "bao.pham",
        status: "revoked",
        appointedAt: "2026-03-01T00:00:00Z",
        revokedAt: "2026-09-30T00:00:00Z",
        memberCount: 3,
        commissionPct: 10,
        offerType: "none",
        offerDays: null,
        revenue30dVnd: 0,
        commission30dVnd: 0,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  })
  vi.mocked(teamLeadsApi.lookup).mockReset()
  vi.mocked(teamLeadsApi.appoint).mockReset().mockResolvedValue(leadDetail())
})

function renderPage() {
  return renderRoute("/admin/team-leads", "/admin/team-leads", <TeamLeadsPage />)
}

describe("team leads list", () => {
  it("shows code, members, commission, offer, 30 day money and status", async () => {
    renderPage()
    const row = (await screen.findByText("Nguyễn Lan")).closest("tr")
    expect(row).toBeTruthy()
    const cells = within(row as HTMLElement)
    expect(cells.getByText("lan.nguyen")).toBeTruthy()
    expect(cells.getByText("12")).toBeTruthy()
    expect(cells.getByText("30%")).toBeTruthy()
    expect(cells.getByText("Premium miễn phí 90 ngày")).toBeTruthy()
    expect(cells.getByText("Hoạt động")).toBeTruthy()
    const revoked = screen.getByText("bao.pham", { selector: "a" }).closest("tr") as HTMLElement
    expect(within(revoked).getByText("Đã thôi")).toBeTruthy()
    expect(within(revoked).getByText("Không có ưu đãi")).toBeTruthy()
  })
})

describe("appoint dialog", () => {
  it("looks the user up, warns about lifetime with commission and requires a reason", async () => {
    vi.mocked(teamLeadsApi.lookup).mockResolvedValue(lookupResult())
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole("button", { name: "Bổ nhiệm trưởng nhóm" }))
    const dialog = await screen.findByRole("dialog")
    const submit = within(dialog).getByRole("button", { name: "Bổ nhiệm" })

    await user.type(within(dialog).getByLabelText("Người dùng"), "Minh.Tran")
    expect(await within(dialog).findByText("minh.tran")).toBeTruthy()
    expect(within(dialog).getByText(/Mã giới thiệu:/)).toBeTruthy()
    expect(vi.mocked(teamLeadsApi.lookup).mock.calls.at(-1)?.[0]).toBe("minh.tran")

    await user.type(within(dialog).getByLabelText("Hoa hồng trực tiếp (%)"), "40")
    await user.click(within(dialog).getByRole("radio", { name: "Premium miễn phí trọn đời" }))
    expect(within(dialog).getByText(/không phát sinh thanh toán và hoa hồng/)).toBeTruthy()
    expect((submit as HTMLButtonElement).disabled).toBe(true)

    await user.type(within(dialog).getByLabelText("Lý do"), "Đối tác cộng đồng")
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await user.click(submit)
    expect(teamLeadsApi.appoint).toHaveBeenCalledWith({
      userId: "u-9",
      commissionPct: 40,
      offerType: "lifetime",
      offerDays: null,
      reason: "Đối tác cộng đồng",
    })
  })

  it("keeps the button locked for an existing team lead or an unknown user", async () => {
    vi.mocked(teamLeadsApi.lookup).mockImplementation(async (q) =>
      q === "lan.nguyen" ? lookupResult({ appoint: { eligible: false, reason: "TEAM_LEAD_EXISTS" } }) : null,
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole("button", { name: "Bổ nhiệm trưởng nhóm" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Hoa hồng trực tiếp (%)"), "10")
    await user.type(within(dialog).getByLabelText("Lý do"), "Thử")
    await user.type(within(dialog).getByLabelText("Người dùng"), "lan.nguyen")
    expect(await within(dialog).findByText("Người dùng này đã là trưởng nhóm.")).toBeTruthy()
    expect((within(dialog).getByRole("button", { name: "Bổ nhiệm" }) as HTMLButtonElement).disabled).toBe(true)

    await user.clear(within(dialog).getByLabelText("Người dùng"))
    await user.type(within(dialog).getByLabelText("Người dùng"), "ghost")
    expect(await within(dialog).findByText("Không tìm thấy người dùng.")).toBeTruthy()
    expect((within(dialog).getByRole("button", { name: "Bổ nhiệm" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
