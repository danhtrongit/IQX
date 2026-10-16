import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { adminScopeForRole, getAdminAccess, isTeamAdminPath } from "./admin-access"
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
}))

function authAs(user: TestUser) {
  return { isLoading: false, sessionError: null, user: { ...user, email: `${user.username}@iqx.test` }, openAuth: vi.fn() }
}

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }))
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

  it("keeps loading and session failures explicit", () => {
    expect(getAdminAccess({ isLoading: true, sessionError: null, user: null }).state).toBe("loading")
    expect(getAdminAccess({ isLoading: false, sessionError: new Error("expired"), user: null }).state).toBe(
      "session-error",
    )
    expect(getAdminAccess({ isLoading: false, sessionError: null, user: null }).state).toBe("unauthenticated")
  })
})

describe("team lead route guard", () => {
  it.each(["/admin", "/admin/", "/admin/users", "/admin/users/", "/admin/users/7f1c"])("allows %s", (path) => {
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
    "/admin/users/7f1c/extra",
  ])("sends a team lead away from %s", (path) => {
    expect(isTeamAdminPath(path)).toBe(false)
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
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tổng quan", "Người dùng"])
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
    expect(screen.queryByText("Mã giới thiệu của bạn (tên đăng nhập)")).toBeNull()
    expect(mocks.fetchTeamReferralCode).not.toHaveBeenCalled()
  })

  it("blocks a premium user", () => {
    mocks.auth = authAs({ id: "u-1", role: "premium", full_name: "Khách", username: "khach" })
    renderAt("/admin")
    expect(screen.getByText("Quyền quản trị là bắt buộc")).toBeTruthy()
    expect(screen.queryByText("Trang tổng quan")).toBeNull()
  })
})
