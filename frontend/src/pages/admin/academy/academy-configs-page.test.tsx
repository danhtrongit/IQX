import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { AcademyConfigsPage } from "./academy-configs-page"
import {
  academyApiHandler,
  createAcademyServer,
  leaderInheritingItem,
  leaderOwnItem,
  listResponse,
  defaultItem,
  type AcademyServer,
} from "./academy-config-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: mocks.api,
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

installResizeObserver()

let server: AcademyServer

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  server = createAcademyServer()
  mocks.api.mockImplementation(academyApiHandler(server))
})

type Call = [string, RequestInit | undefined]

const listCalls = () =>
  (mocks.api.mock.calls as Call[]).filter(([path, init]) => path === "/admin/academy-configs" && (init?.method ?? "GET") === "GET")

function renderPage() {
  return renderRoute("/admin/academy", "/admin/academy", <AcademyConfigsPage />)
}

async function rowOf(name: string) {
  const cell = await screen.findByText(name, { selector: "span" })
  return within(cell.closest("tr") as HTMLElement)
}

describe("academy configs list (spec §1.4)", () => {
  it("shows the default first, then one row per team lead", async () => {
    renderPage()
    await rowOf("Mặc định")
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "Mặc địnhNgười dùng không thuộc nhóm nào và nhóm chưa có cấu hình riêng",
      "Nguyễn Lanlan.nguyen",
      "Phạm Bảobao.phamTheo mặc định",
      "Lê HùngĐã thôi bổ nhiệmhung.le",
    ])
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Tên",
      "Cách học",
      "Số chương",
      "Số người dùng áp dụng",
      "Cập nhật lần cuối",
      "Thao tác",
    ])
  })

  it("shows mode, chapter count with the total, lessons, users and the last update", async () => {
    renderPage()
    const defaults = await rowOf("Mặc định")
    expect(defaults.getByText("Tự do")).toBeTruthy()
    expect(defaults.getByText("12/12 chương")).toBeTruthy()
    expect(defaults.getByText("116 bài học")).toBeTruthy()
    expect(defaults.getByText("12")).toBeTruthy()
    expect(defaults.getByText(formatDateTime("2026-11-01T03:00:00Z"))).toBeTruthy()
    expect(defaults.getByText("Quản Trị Viên")).toBeTruthy()
    expect(defaults.getByRole("button", { name: "Sửa" })).toBeTruthy()
    expect(defaults.queryByRole("button", { name: "Tạo cấu hình riêng" })).toBeNull()

    const lan = await rowOf("Nguyễn Lan")
    expect(lan.getByText("Lần lượt")).toBeTruthy()
    expect(lan.getByText("11/12 chương")).toBeTruthy()
    expect(lan.getByText("106 bài học")).toBeTruthy()
    expect(lan.getByText("5")).toBeTruthy()
    expect(lan.getByText("lan.nguyen")).toBeTruthy()
    expect(lan.getByRole("button", { name: "Sửa" })).toBeTruthy()
    expect(lan.queryByText("Theo mặc định")).toBeNull()
  })

  it("marks a lead without an own config as following the default, with the default's values and a create button", async () => {
    renderPage()
    const bao = await rowOf("Phạm Bảo")
    expect(bao.getByText("Theo mặc định")).toBeTruthy()
    expect(bao.getByText("Tự do")).toBeTruthy()
    expect(bao.getByText("12/12 chương")).toBeTruthy()
    expect(bao.getByText("3")).toBeTruthy()
    expect(bao.getByText("Chưa có")).toBeTruthy()
    expect(bao.getByRole("button", { name: "Tạo cấu hình riêng" })).toBeTruthy()
    expect(bao.queryByRole("button", { name: "Sửa" })).toBeNull()
  })

  it("flags a team lead whose appointment was revoked", async () => {
    renderPage()
    const hung = await rowOf("Lê Hùng")
    expect(hung.getByText("Đã thôi bổ nhiệm")).toBeTruthy()
    expect(hung.getByText("4/12 chương")).toBeTruthy()
    const lan = await rowOf("Nguyễn Lan")
    expect(lan.queryByText("Đã thôi bổ nhiệm")).toBeNull()
  })

  it("shows skeleton rows while loading", async () => {
    mocks.api.mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(await screen.findByRole("columnheader", { name: "Tên" })).toBeTruthy()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Sửa" })).toBeNull()
  })

  it("explains a failed load and retries", async () => {
    server.listError = new ApiError("Máy chủ đang bận", 503)
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText("Máy chủ đang bận")).toBeTruthy()
    server.listError = null
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByText("Nguyễn Lan", { selector: "span" })).toBeTruthy()
    expect(screen.queryByText("Máy chủ đang bận")).toBeNull()
  })

  it("handles an empty list", async () => {
    server.list = listResponse([])
    renderPage()
    expect(await screen.findByText("Chưa có cấu hình nào.")).toBeTruthy()
  })
})

describe("academy configs page: editing from the list", () => {
  it("opens the editor of a row, saves, closes and reloads the list", async () => {
    const user = userEvent.setup()
    renderPage()
    const lan = await rowOf("Nguyễn Lan")
    await user.click(lan.getByRole("button", { name: "Sửa" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Sửa cấu hình: Nguyễn Lan" }))
    expect(listCalls()).toHaveLength(1)

    await user.click(dialog.getByRole("radio", { name: "Học tự do" }))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu cấu hình Học viện?" })).getByRole("button", { name: "Xác nhận" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(listCalls()).toHaveLength(2)
    expect((mocks.api.mock.calls as Call[]).some(([path, init]) => path === "/admin/academy-configs/cfg-lan" && init?.method === "PUT")).toBe(true)
  })

  it("opens the create editor for a lead without an own config and closes with Hủy", async () => {
    const user = userEvent.setup()
    renderPage()
    const bao = await rowOf("Phạm Bảo")
    await user.click(bao.getByRole("button", { name: "Tạo cấu hình riêng" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Tạo cấu hình riêng: Phạm Bảo" }))
    await user.click(dialog.getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("refreshes the list when the server says the lead already has an own config", async () => {
    server.writeError = new ApiError("Conflict", 409, "ACADEMY_CONFIG_EXISTS")
    const user = userEvent.setup()
    renderPage()
    const bao = await rowOf("Phạm Bảo")
    await user.click(bao.getByRole("button", { name: "Tạo cấu hình riêng" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Tạo cấu hình riêng: Phạm Bảo" }))
    // Meanwhile somebody else created it: the next list read has the own config.
    server.list = listResponse([
      defaultItem(),
      leaderOwnItem(),
      leaderInheritingItem({ id: "cfg-bao", inherits_default: false, user_count: 3 }),
    ])
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu cấu hình Học viện?" })).getByRole("button", { name: "Xác nhận" }))

    expect(await dialog.findByText("Trưởng nhóm này đã có cấu hình riêng. Hãy tải lại danh sách rồi bấm Sửa.")).toBeTruthy()
    await waitFor(() => expect(listCalls().length).toBeGreaterThanOrEqual(2))
    const row = (await screen.findAllByText("Phạm Bảo", { selector: "span" }))[0].closest("tr") as HTMLElement
    await waitFor(() => expect(within(row).getByText("Sửa")).toBeTruthy())
  })
})
