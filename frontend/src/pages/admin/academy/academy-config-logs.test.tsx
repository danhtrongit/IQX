import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { AcademyConfigLogs } from "./academy-config-logs"
import {
  ALL_IDS,
  CATALOG,
  IDS_WITHOUT_CH02,
  academyApiHandler,
  createAcademyServer,
  logEntry,
  logsResponse,
  type AcademyServer,
} from "./academy-config-test-support"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: mocks.api,
}))

installResizeObserver()

let server: AcademyServer

beforeEach(() => {
  mocks.api.mockReset()
  server = createAcademyServer()
  mocks.api.mockImplementation(academyApiHandler(server))
})

function renderLogs() {
  return renderRoute("/x", "/x", <AcademyConfigLogs configId="cfg-lan" catalog={CATALOG} />)
}

const titles = (ids: string[]) => ids.map((id) => CATALOG.find((chapter) => chapter.chapter_id === id)?.title).join(", ")

describe("academy config change log (spec §1.3)", () => {
  it("shows who, when, the action and the config before and after with chapter titles", async () => {
    renderLogs()
    const list = await screen.findByRole("list", { name: "Nhật ký thay đổi" })
    const entry = within(within(list).getAllByRole("listitem")[0])
    expect(entry.getByText("Cập nhật")).toBeTruthy()
    expect(entry.getByText("Quản Trị Viên (admin)")).toBeTruthy()
    expect(entry.getByText(formatDateTime("2026-11-02T04:30:00Z"))).toBeTruthy()
    expect(entry.getByText("Tự do · 12 chương")).toBeTruthy()
    expect(entry.getByText(titles(ALL_IDS))).toBeTruthy()
    expect(entry.getByText("Lần lượt · 11 chương")).toBeTruthy()
    expect(entry.getByText(titles(IDS_WITHOUT_CH02))).toBeTruthy()
    expect(mocks.api).toHaveBeenCalledWith("/admin/academy-configs/cfg-lan/logs?limit=50", expect.objectContaining({ method: "GET" }))
  })

  it("keeps the order the server gives (newest first) and labels create and delete", async () => {
    server.logs = logsResponse([
      logEntry({ id: "log-3", action: "delete", changed_at: "2026-11-04T01:00:00Z" }),
      logEntry({ id: "log-2", action: "update", changed_at: "2026-11-03T01:00:00Z" }),
      logEntry({ id: "log-1", action: "create", changed_at: "2026-11-02T01:00:00Z" }),
    ])
    renderLogs()
    const items = within(await screen.findByRole("list", { name: "Nhật ký thay đổi" })).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText("Về mặc định")).toBeTruthy()
    expect(within(items[1]).getByText("Cập nhật")).toBeTruthy()
    expect(within(items[2]).getByText("Tạo cấu hình riêng")).toBeTruthy()
  })

  it("writes Chưa có for a missing side and Hệ thống for an unknown author", async () => {
    server.logs = logsResponse([logEntry({ before: null, changed_by: null })])
    renderLogs()
    const entry = within((await screen.findAllByRole("listitem"))[0])
    expect(entry.getByText("Chưa có")).toBeTruthy()
    expect(entry.getByText("Hệ thống")).toBeTruthy()
    expect(entry.getByText("Lần lượt · 11 chương")).toBeTruthy()
  })

  it("falls back to the chapter id when the catalog does not know it", async () => {
    server.logs = logsResponse([logEntry({ after: { mode: "free", chapter_ids: ["ch01", "ch99"] } })])
    renderLogs()
    expect(await screen.findByText("Nền tảng, ch99")).toBeTruthy()
  })

  it("explains an empty log", async () => {
    server.logs = logsResponse([])
    renderLogs()
    expect(await screen.findByText("Chưa có thay đổi nào được ghi lại.")).toBeTruthy()
  })

  it("shows a skeleton while loading", () => {
    mocks.api.mockImplementation(() => new Promise(() => {}))
    renderLogs()
    expect(screen.getByRole("status", { name: "Đang tải nhật ký" })).toBeTruthy()
  })

  it("explains a failed load and retries", async () => {
    server.logsError = new ApiError("Máy chủ đang bận", 503)
    const user = userEvent.setup()
    renderLogs()
    expect(await screen.findByText("Máy chủ đang bận")).toBeTruthy()
    server.logsError = null
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("list", { name: "Nhật ký thay đổi" })).toBeTruthy()
  })
})
