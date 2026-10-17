import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { installResizeObserver } from "@/pages/admin/team-leads/test-support"

import { teamApi } from "./api"
import { TeamUsersPage } from "./team-users-page"
import { teamUserRow } from "./test-support"

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "lead-1", role: "team_lead" } }) }))
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return { ...actual, teamApi: { ...actual.teamApi, users: vi.fn() } }
})

installResizeObserver()

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderPage(path = "/admin/users") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/admin/users"
            element={
              <>
                <TeamUsersPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/admin/users/:userId" element={<p>Chi tiết</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const rows = [
  teamUserRow(),
  teamUserRow({
    id: "m-2",
    username: "hoa.le",
    fullName: null,
    role: "user",
    demoTrading: { activated: false, pnlPct: null },
    bot: { activated: false, pnlPct: null, asOf: null },
    academy: { started: false, allDone: false, completed: 0, total: 24, currentLessonLabel: null },
  }),
  teamUserRow({
    id: "m-3",
    username: "quang.do",
    demoTrading: { activated: true, pnlPct: 0 },
    bot: { activated: true, pnlPct: null, asOf: null },
    academy: { started: true, allDone: true, completed: 24, total: 24, currentLessonLabel: null },
  }),
]

beforeEach(() => {
  vi.mocked(teamApi.users).mockReset().mockResolvedValue({ items: rows, total: 3, page: 1, pageSize: 20, totalPages: 1 })
})

function rowOf(username: string) {
  return screen.getByRole("link", { name: username }).closest("tr") as HTMLElement
}

describe("team users list (§5.1.3, §7.6)", () => {
  it("shows profit as a coloured percentage only, never money", async () => {
    renderPage()
    await screen.findByRole("link", { name: "minh.tran" })
    const first = within(rowOf("minh.tran"))
    const demo = first.getByText(/12,5\s?%/)
    const bot = first.getByText(/-3,25\s?%/)
    expect(demo.className).toContain("text-price-up")
    expect(bot.className).toContain("text-price-down")
    expect(first.getByText("Trần Minh")).toBeTruthy()

    const flat = within(rowOf("quang.do")).getByText(/^0\s?%$/)
    expect(flat.className).not.toMatch(/text-price-(up|down)/)

    const table = screen.getByRole("table")
    expect(table.textContent).not.toMatch(/₫|VND|đ\b/)
  })

  it("says Chưa kích hoạt for accounts that are not activated", async () => {
    renderPage()
    await screen.findByRole("link", { name: "hoa.le" })
    expect(within(rowOf("hoa.le")).getAllByText("Chưa kích hoạt")).toHaveLength(2)
    expect(within(rowOf("minh.tran")).queryByText("Chưa kích hoạt")).toBeNull()
  })

  it("shows the current lesson with x/T progress, Chưa bắt đầu and the all done label", async () => {
    renderPage()
    await screen.findByRole("link", { name: "minh.tran" })
    const first = within(rowOf("minh.tran"))
    expect(first.getByText("Chương 1 · Bài 6: Nến Nhật")).toBeTruthy()
    expect(first.getByText("5/24 bài")).toBeTruthy()
    expect(within(rowOf("hoa.le")).getByText("Chưa bắt đầu")).toBeTruthy()
    expect(within(rowOf("quang.do")).getByText("Đã hoàn thành các chương hiện có")).toBeTruthy()
    expect(within(rowOf("quang.do")).getByText("24/24 bài")).toBeTruthy()
  })

  it("has no bulk selection or CSV export and makes all 5 columns sortable", async () => {
    renderPage()
    await screen.findByRole("link", { name: "minh.tran" })
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /Xuất CSV/ })).toBeNull()
    for (const name of ["Tên đăng nhập", "Vai trò", "Lợi nhuận Demo Trading", "Lợi nhuận Bot", "Học viện"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy()
    }
  })

  it("reads the shortcut filter from the URL and keeps sort and filters in the URL", async () => {
    const user = userEvent.setup()
    renderPage("/admin/users?segment=inactive_14d")
    await screen.findByRole("link", { name: "minh.tran" })
    expect(teamApi.users).toHaveBeenLastCalledWith(
      expect.objectContaining({ segment: "inactive_14d", page: 1, pageSize: 20, sortBy: "created_at", sortOrder: "desc" }),
    )
    expect(screen.getByRole("button", { name: "Bỏ lối tắt Không đăng nhập 14 ngày" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Lợi nhuận Demo Trading" }))
    expect(screen.getByTestId("location").textContent).toBe(
      "/admin/users?segment=inactive_14d&sort_by=demo_pnl_pct&sort_order=asc",
    )
    expect(teamApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: "demo_pnl_pct", sortOrder: "asc" }))

    await user.type(screen.getByLabelText("Tìm theo tên đăng nhập, họ tên hoặc email"), "minh")
    await user.click(screen.getByRole("button", { name: "Lọc" }))
    expect(teamApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ search: "minh", segment: "inactive_14d" }))

    await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }))
    expect(screen.getByTestId("location").textContent).toBe("/admin/users?sort_by=demo_pnl_pct&sort_order=asc")
  })

  it("links each row to the team user detail under /admin/users/:id", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("link", { name: "minh.tran" }))
    expect(screen.getByText("Chi tiết")).toBeTruthy()
  })
})
