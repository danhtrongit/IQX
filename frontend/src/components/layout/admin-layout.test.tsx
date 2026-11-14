import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, within } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { adminHomePath, adminScopeForRole, getAdminAccess, isSacoAdminPath, isTeamAdminPath } from "./admin-access"
import { AdminLayout } from "./admin-layout"

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub

type TestUser = { id: string; role: string; full_name: string; username: string }

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  fetchTeamReferralCode: vi.fn(),
  saco: { isPending: false, data: { saco: null } } as { isPending: boolean; data: { saco: { id: string; active: boolean } | null } | undefined },
  sacoEnabled: [] as boolean[],
}))

function authAs(user: TestUser) {
  return { isLoading: false, sessionError: null, user: { ...user, email: `${user.username}@iqx.test` }, openAuth: vi.fn() }
}

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }))
vi.mock("./admin-saco", () => ({
  useSacoSelf: (enabled: boolean) => {
    mocks.sacoEnabled.push(enabled)
    return mocks.saco
  },
}))
vi.mock("@/pages/referral/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/referral/api")>()),
  fetchTeamReferralCode: mocks.fetchTeamReferralCode,
}))

const ready = (role: string) => ({ isLoading: false, sessionError: null, user: { role } })

describe("admin access gate", () => {
  it("authorizes admins with the full scope and team leads with the team scope", () => {
    expect(getAdminAccess(ready("admin"))).toEqual({ state: "authorized", scope: "admin" })
    expect(getAdminAccess(ready("team_lead"))).toEqual({ state: "authorized", scope: "team" })
  })

  it.each(["user", "premium", "lead_sale", "ctv", ""])("blocks role %s", (role) => {
    expect(getAdminAccess(ready(role))).toEqual({ state: "forbidden", scope: null })
    expect(adminScopeForRole(role)).toBeNull()
  })

  it("gives an active SACO the saco scope and waits while the SACO check is pending", () => {
    expect(getAdminAccess(ready("user"), { pending: false, active: true })).toEqual({ state: "authorized", scope: "saco" })
    expect(getAdminAccess(ready("premium"), { pending: false, active: true })).toEqual({ state: "authorized", scope: "saco" })
    expect(getAdminAccess(ready("user"), { pending: true, active: false })).toEqual({ state: "loading", scope: null })
    expect(getAdminAccess(ready("user"), { pending: false, active: false })).toEqual({ state: "forbidden", scope: null })
    expect(getAdminAccess(ready("user"))).toEqual({ state: "forbidden", scope: null })
    // Vai trò quản trị luôn thắng cờ SACO.
    expect(getAdminAccess(ready("admin"), { pending: true, active: false })).toEqual({ state: "authorized", scope: "admin" })
    expect(getAdminAccess(ready("team_lead"), { pending: false, active: true })).toEqual({ state: "authorized", scope: "team" })
    expect(adminHomePath("saco")).toBe("/admin/saco/posts")
    expect(adminHomePath("team")).toBe("/admin")
  })

  it("keeps loading and session failures explicit", () => {
    expect(getAdminAccess({ isLoading: true, sessionError: null, user: null }).state).toBe("loading")
    expect(getAdminAccess({ isLoading: false, sessionError: new Error("expired"), user: null }).state).toBe(
      "session-error",
    )
    expect(getAdminAccess({ isLoading: false, sessionError: null, user: null }).state).toBe("unauthenticated")
  })
})

describe("team lead route guard", () => {
  it.each(["/admin", "/admin/", "/admin/users", "/admin/users/", "/admin/users/7f1c", "/admin/saco", "/admin/saco/"])("allows %s", (path) => {
    expect(isTeamAdminPath(path)).toBe(true)
  })

  it.each([
    "/admin/team-leads",
    "/admin/team-leads/7f1c",
    "/admin/plans",
    "/admin/subscriptions",
    "/admin/payments/1",
    "/admin/ipn",
    "/admin/vt/accounts",
    "/admin/vt/config",
    "/admin/audit",
    "/admin/system",
    "/admin/alerts",
    "/admin/lessons",
    "/admin/academy",
    "/admin/users/7f1c/extra",
    "/admin/saco/posts",
    "/admin/saco/posts/new",
  ])("sends a team lead away from %s", (path) => {
    expect(isTeamAdminPath(path)).toBe(false)
  })
})

describe("SACO route guard", () => {
  it.each(["/admin/saco/posts", "/admin/saco/posts/", "/admin/saco/posts/new", "/admin/saco/posts/7f1c"])("allows %s", (path) => {
    expect(isSacoAdminPath(path)).toBe(true)
  })

  it.each(["/admin", "/admin/saco", "/admin/users", "/admin/plans", "/admin/saco/posts/7f1c/extra"])("sends a SACO away from %s", (path) => {
    expect(isSacoAdminPath(path)).toBe(false)
  })
})

describe("AdminLayout by role", () => {
  function renderAt(path: string) {
    const router = createMemoryRouter(
      [
        {
          path: "/admin",
          Component: AdminLayout,
          children: [
            { index: true, element: <p>Trang tổng quan</p> },
            { path: "users", element: <p>Trang người dùng</p> },
            { path: "plans", element: <p>Trang gói</p> },
            { path: "team-leads", element: <p>Trang trưởng nhóm</p> },
            { path: "academy", element: <p>Trang Học viện</p> },
            { path: "saco", element: <p>Trang quản lý SACO</p> },
            { path: "saco/posts", element: <p>Trang bài của tôi</p> },
            { path: "saco/posts/new", element: <p>Trang viết bài</p> },
          ],
        },
      ],
      { initialEntries: [path] },
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  beforeEach(() => {
    mocks.saco = { isPending: false, data: { saco: null } }
    mocks.sacoEnabled = []
    mocks.fetchTeamReferralCode.mockReset().mockResolvedValue({
      code: "lan.nguyen",
      commissionPct: 25,
      offerType: "days",
      offerDays: 90,
      memberCount: 4,
      appointedAt: "2026-10-01T00:00:00.000Z",
    })
  })

  it("lets a team lead in with the reduced menu, the name badge and the code card", async () => {
    mocks.auth = authAs({ id: "lead-1", role: "team_lead", full_name: "Nguyễn Lan", username: "lan.nguyen" })
    renderAt("/admin")
    expect(screen.getByText("Trang tổng quan")).toBeTruthy()
    const nav = screen.getAllByRole("navigation", { name: "Điều hướng quản trị" })[0]
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tổng quan", "Người dùng", "SACO"])
    expect(within(screen.getByTestId("admin-identity")).getByText("Trưởng nhóm")).toBeTruthy()
    expect(screen.getByText("Nguyễn Lan")).toBeTruthy()
    expect(await screen.findByText("lan.nguyen")).toBeTruthy()
    expect(screen.getByText("25%")).toBeTruthy()
    expect(screen.getByText("Premium miễn phí 90 ngày")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sao chép mã" })).toBeTruthy()
  })

  it("sends a team lead from any other admin page back to the dashboard", async () => {
    mocks.auth = authAs({ id: "lead-1", role: "team_lead", full_name: "Nguyễn Lan", username: "lan.nguyen" })
    const router = renderAt("/admin/plans")
    expect(await screen.findByText("Trang tổng quan")).toBeTruthy()
    expect(router.state.location.pathname).toBe("/admin")
    expect(screen.queryByText("Trang gói")).toBeNull()
  })

  it("gives an admin the full menu including Trưởng nhóm and no code card", () => {
    mocks.auth = authAs({ id: "admin-1", role: "admin", full_name: "Admin", username: "admin" })
    renderAt("/admin/team-leads")
    expect(screen.getByText("Trang trưởng nhóm")).toBeTruthy()
    const nav = screen.getAllByRole("navigation", { name: "Điều hướng quản trị" })[0]
    expect(within(nav).getByRole("link", { name: "Trưởng nhóm" }).getAttribute("href")).toBe("/admin/team-leads")
    expect(within(nav).getByRole("link", { name: "Gói Premium" })).toBeTruthy()
    expect(within(nav).getByRole("link", { name: "Học viện" }).getAttribute("href")).toBe("/admin/academy")
    expect(screen.queryByText("Mã giới thiệu của bạn (tên đăng nhập)")).toBeNull()
    expect(mocks.fetchTeamReferralCode).not.toHaveBeenCalled()
  })

  it("opens the Học viện configs for an admin but sends a team lead back to the dashboard", async () => {
    mocks.auth = authAs({ id: "admin-1", role: "admin", full_name: "Admin", username: "admin" })
    const admin = renderAt("/admin/academy")
    expect(screen.getByText("Trang Học viện")).toBeTruthy()
    expect(admin.state.location.pathname).toBe("/admin/academy")
    cleanup()

    mocks.auth = authAs({ id: "lead-1", role: "team_lead", full_name: "Nguyễn Lan", username: "lan.nguyen" })
    const lead = renderAt("/admin/academy")
    expect(await screen.findByText("Trang tổng quan")).toBeTruthy()
    expect(lead.state.location.pathname).toBe("/admin")
    expect(screen.queryByText("Trang Học viện")).toBeNull()
    const nav = screen.getAllByRole("navigation", { name: "Điều hướng quản trị" })[0]
    expect(within(nav).queryByRole("link", { name: "Học viện" })).toBeNull()
  })

  it("lets an active SACO into the SACO pages only", async () => {
    mocks.auth = authAs({ id: "u-9", role: "premium", full_name: "Trần Minh", username: "minh" })
    mocks.saco = { isPending: false, data: { saco: { id: "s-1", active: true } } }
    const router = renderAt("/admin")
    expect(await screen.findByText("Trang bài của tôi")).toBeTruthy()
    expect(router.state.location.pathname).toBe("/admin/saco/posts")
    const nav = screen.getAllByRole("navigation", { name: "Điều hướng quản trị" })[0]
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin/saco/posts", "/admin/saco/posts/new"])
    expect(within(screen.getByTestId("admin-identity")).getByText("SACO")).toBeTruthy()
    expect(mocks.sacoEnabled).toContain(true)
    cleanup()

    const other = renderAt("/admin/saco")
    expect(await screen.findByText("Trang bài của tôi")).toBeTruthy()
    expect(other.state.location.pathname).toBe("/admin/saco/posts")
    cleanup()

    renderAt("/admin/saco/posts/new")
    expect(screen.getByText("Trang viết bài")).toBeTruthy()
  })

  it("shows the access skeleton while the SACO check is pending", () => {
    mocks.auth = authAs({ id: "u-9", role: "user", full_name: "Trần Minh", username: "minh" })
    mocks.saco = { isPending: true, data: undefined }
    renderAt("/admin")
    expect(screen.getByRole("status", { name: "Đang xác minh quyền truy cập" })).toBeTruthy()
  })

  it("gives admins and team leads the SACO management entry, never asking the SACO check", async () => {
    mocks.auth = authAs({ id: "admin-1", role: "admin", full_name: "Admin", username: "admin" })
    renderAt("/admin/saco")
    expect(screen.getByText("Trang quản lý SACO")).toBeTruthy()
    let nav = screen.getAllByRole("navigation", { name: "Điều hướng quản trị" })[0]
    expect(within(nav).getByRole("link", { name: "SACO" }).getAttribute("href")).toBe("/admin/saco")
    cleanup()

    mocks.auth = authAs({ id: "lead-1", role: "team_lead", full_name: "Nguyễn Lan", username: "lan.nguyen" })
    const lead = renderAt("/admin/saco")
    expect(screen.getByText("Trang quản lý SACO")).toBeTruthy()
    expect(lead.state.location.pathname).toBe("/admin/saco")
    nav = screen.getAllByRole("navigation", { name: "Điều hướng quản trị" })[0]
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tổng quan", "Người dùng", "SACO"])
    expect(mocks.sacoEnabled.every((enabled) => !enabled)).toBe(true)
    await screen.findByText("lan.nguyen")
  })

  it("blocks a premium user", () => {
    mocks.auth = authAs({ id: "u-1", role: "premium", full_name: "Khách", username: "khach" })
    renderAt("/admin")
    expect(screen.getByText("Quyền quản trị là bắt buộc")).toBeTruthy()
    expect(screen.queryByText("Trang tổng quan")).toBeNull()
  })
})
