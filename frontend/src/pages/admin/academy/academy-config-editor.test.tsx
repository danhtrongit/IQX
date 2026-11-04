import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import type { AcademyConfigItem } from "./academy-config-api"
import { AcademyConfigEditor } from "./academy-config-editor"
import {
  ALL_IDS,
  CATALOG,
  DASHBOARD_WARNING,
  IDS_WITHOUT_CH02,
  academyApiHandler,
  createAcademyServer,
  defaultItem,
  leaderInheritingItem,
  leaderOwnItem,
  leaderRevokedItem,
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

function writeCalls(method: "POST" | "PUT" | "DELETE", exclude = "/admin/academy-configs/preview"): Call[] {
  return (mocks.api.mock.calls as Call[]).filter(([path, init]) => init?.method === method && path !== exclude)
}

const bodyOf = (call: Call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>

function renderEditor(item: AcademyConfigItem) {
  const onClose = vi.fn()
  renderRoute("/x", "/x", <AcademyConfigEditor item={item} catalog={CATALOG} onClose={onClose} />)
  return onClose
}

async function openEditor(item: AcademyConfigItem) {
  const onClose = renderEditor(item)
  const dialog = await screen.findByRole("dialog")
  return { onClose, dialog: within(dialog), user: userEvent.setup() }
}

const chapterBox = (dialog: ReturnType<typeof within>, no: number) =>
  dialog.getByRole("checkbox", { name: new RegExp(`^Chương ${no} · `) })

const lastPreviewBody = () => server.previewBodies.at(-1)

describe("editor: mode and chapter fields", () => {
  it("lists the 12 original chapters with their original number and lesson count", async () => {
    const { dialog } = await openEditor(defaultItem())
    expect(dialog.getByText("Sửa cấu hình: Mặc định")).toBeTruthy()
    const boxes = dialog.getAllByRole("checkbox")
    expect(boxes).toHaveLength(12)
    expect(boxes.map((box) => box.getAttribute("aria-checked"))).toEqual(Array(12).fill("true"))
    const rows = boxes.map((box) => box.closest("li")?.textContent)
    expect(rows[0]).toBe("Chương 1 · Nền tảng12 bài")
    expect(rows[2]).toBe("Chương 3 · Thương hiệu cá nhânKèm Phòng tập thực chiến10 bài")
    expect(rows[7]).toBe("Chương 8 · Phân tích cơ bản chungCó bài cho nút Học ở Dashboard12 bài")
    expect(dialog.getByText("Đã chọn 12/12 chương")).toBeTruthy()
    expect(dialog.getByRole("radio", { name: "Học tự do" }).getAttribute("aria-checked")).toBe("true")
    expect(dialog.getByRole("radio", { name: "Học lần lượt" }).getAttribute("aria-checked")).toBe("false")
  })

  it("starts from the config's own mode and chapters", async () => {
    const { dialog } = await openEditor(leaderOwnItem())
    expect(dialog.getByRole("radio", { name: "Học lần lượt" }).getAttribute("aria-checked")).toBe("true")
    expect(chapterBox(dialog, 2).getAttribute("aria-checked")).toBe("false")
    expect(chapterBox(dialog, 3).getAttribute("aria-checked")).toBe("true")
    expect(dialog.getByText("Đã chọn 11/12 chương")).toBeTruthy()
  })

  it("keeps Lưu disabled until something changes for an existing config", async () => {
    const { dialog, user } = await openEditor(defaultItem())
    const save = dialog.getByRole("button", { name: "Lưu" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await user.click(chapterBox(dialog, 2))
    expect(save.disabled).toBe(false)
    await user.click(chapterBox(dialog, 2))
    expect(save.disabled).toBe(true)
  })

  it("requires at least one chapter: message, disabled Lưu and no preview call", async () => {
    const { dialog, user } = await openEditor(leaderOwnItem({ chapter_ids: ["ch01"], chapter_count: 1, required_total: 12 }))
    const save = dialog.getByRole("button", { name: "Lưu" }) as HTMLButtonElement
    await user.click(chapterBox(dialog, 1))
    expect(dialog.getByText("Cần chọn ít nhất một chương.")).toBeTruthy()
    expect(save.disabled).toBe(true)
    expect(dialog.getByText("Chọn ít nhất một chương để xem trước.")).toBeTruthy()
    await user.click(chapterBox(dialog, 4))
    expect(dialog.queryByText("Cần chọn ít nhất một chương.")).toBeNull()
    expect(save.disabled).toBe(false)
    await waitFor(() => expect(lastPreviewBody()).toEqual({ mode: "sequential", chapter_ids: ["ch04"] }))
    expect(server.previewBodies.every((body) => body.chapter_ids.length > 0)).toBe(true)
  })

  it("selects all chapters with Chọn tất cả", async () => {
    const { dialog, user } = await openEditor(leaderOwnItem())
    await user.click(dialog.getByRole("button", { name: "Chọn tất cả" }))
    expect(dialog.getByText("Đã chọn 12/12 chương")).toBeTruthy()
    expect((dialog.getByRole("button", { name: "Chọn tất cả" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("editor: preview from the server", () => {
  it("asks the server for the preview of the chosen mode and chapters and renders the renumbered result", async () => {
    const { dialog, user } = await openEditor(defaultItem())
    const preview = within(dialog.getByRole("region", { name: "Xem trước" }))
    expect(await preview.findByText("Chương 12 · Phân tích công ty bảo hiểm")).toBeTruthy()
    expect(server.previewBodies[0]).toEqual({ mode: "free", chapter_ids: ALL_IDS })
    expect(preview.getByText("Học tự do")).toBeTruthy()
    expect(preview.getByText("12/12 chương · 116 bài học")).toBeTruthy()

    await user.click(chapterBox(dialog, 2))
    await user.click(dialog.getByRole("radio", { name: "Học lần lượt" }))
    await waitFor(() => expect(lastPreviewBody()).toEqual({ mode: "sequential", chapter_ids: IDS_WITHOUT_CH02 }))
    // Chapter 3 is now "Chương 2": the number comes from the server result.
    expect(await preview.findByText("Chương 2 · Thương hiệu cá nhân")).toBeTruthy()
    expect(preview.queryByText("Chương 12 · Phân tích công ty bảo hiểm")).toBeNull()
    expect(preview.getByText("Chương 11 · Phân tích công ty bảo hiểm")).toBeTruthy()
    expect(preview.getByText("Học lần lượt")).toBeTruthy()
    expect(preview.getByText("11/12 chương · 106 bài học")).toBeTruthy()
    expect(preview.getByText("Kèm Phòng tập thực chiến")).toBeTruthy()
  })

  it("debounces ticks into one preview request", async () => {
    const { dialog, user } = await openEditor(defaultItem())
    await waitFor(() => expect(server.previewBodies).toHaveLength(1))
    await user.click(chapterBox(dialog, 2))
    await user.click(chapterBox(dialog, 5))
    await user.click(chapterBox(dialog, 6))
    await waitFor(() => expect(server.previewBodies).toHaveLength(2))
    expect(lastPreviewBody()?.chapter_ids).toEqual(ALL_IDS.filter((id) => !["ch02", "ch05", "ch06"].includes(id)))
  })

  it("shows an amber warning from the server for a dropped Dashboard chapter and still allows saving", async () => {
    const { dialog, user } = await openEditor(defaultItem())
    const preview = within(dialog.getByRole("region", { name: "Xem trước" }))
    await user.click(chapterBox(dialog, 8))
    expect(await preview.findByText(DASHBOARD_WARNING)).toBeTruthy()
    expect(preview.getByText("Đã bỏ chương Phân tích cơ bản chung")).toBeTruthy()
    const alert = preview.getByRole("alert")
    expect(alert.className).toContain("status-warning")
    expect((dialog.getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("explains a failed preview and retries", async () => {
    server.previewError = new ApiError("Máy chủ đang bận", 503)
    const { dialog, user } = await openEditor(defaultItem())
    const preview = within(dialog.getByRole("region", { name: "Xem trước" }))
    expect(await preview.findByText("Không tải được bản xem trước: Máy chủ đang bận")).toBeTruthy()
    server.previewError = null
    await user.click(preview.getByRole("button", { name: "Thử lại" }))
    expect(await preview.findByText("Chương 1 · Nền tảng")).toBeTruthy()
    // A failed preview never blocks saving.
    await user.click(chapterBox(dialog, 2))
    expect((dialog.getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("editor: saving", () => {
  it("asks for confirmation naming the affected users, then PUTs the chosen config", async () => {
    const { dialog, user, onClose } = await openEditor(defaultItem())
    await user.click(chapterBox(dialog, 2))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))

    const confirm = within(await screen.findByRole("dialog", { name: "Lưu cấu hình Học viện?" }))
    expect(confirm.getByText("Thay đổi áp dụng ngay cho 12 người dùng.")).toBeTruthy()
    expect(writeCalls("PUT")).toHaveLength(0)

    await user.click(confirm.getByRole("button", { name: "Hủy" }))
    expect(writeCalls("PUT")).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()

    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu cấu hình Học viện?" })).getByRole("button", { name: "Xác nhận" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const puts = writeCalls("PUT")
    expect(puts).toHaveLength(1)
    expect(puts[0][0]).toBe("/admin/academy-configs/cfg-default")
    expect(bodyOf(puts[0])).toEqual({ mode: "free", chapter_ids: IDS_WITHOUT_CH02 })
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã lưu cấu hình Mặc định")
  })

  it("saves at once, without a confirmation, when no user is affected", async () => {
    const { dialog, user, onClose } = await openEditor(leaderRevokedItem())
    await user.click(dialog.getByRole("radio", { name: "Học lần lượt" }))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Thay đổi áp dụng ngay/)).toBeNull()
    expect(bodyOf(writeCalls("PUT")[0])).toEqual({ mode: "sequential", chapter_ids: ALL_IDS.slice(0, 4) })
  })

  it("keeps the editor open and shows the message when the save fails", async () => {
    server.writeError = new ApiError("Request validation failed", 422, "ACADEMY_CONFIG_INVALID")
    const { dialog, user, onClose } = await openEditor(defaultItem({ user_count: 0 }))
    await user.click(chapterBox(dialog, 2))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    const message = "Danh sách chương không hợp lệ. Hãy chọn ít nhất một chương trong danh mục."
    expect(await dialog.findByText(message)).toBeTruthy()
    expect(mocks.toast.error).toHaveBeenCalledWith(message)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe("editor: creating the own config of a team lead", () => {
  it("starts from the default's mode and chapters and POSTs the leader id with the choice", async () => {
    const { dialog, user, onClose } = await openEditor(leaderInheritingItem())
    expect(dialog.getByText("Tạo cấu hình riêng: Phạm Bảo")).toBeTruthy()
    expect(dialog.getByRole("radio", { name: "Học tự do" }).getAttribute("aria-checked")).toBe("true")
    expect(dialog.getByText("Đã chọn 12/12 chương")).toBeTruthy()
    // A lead that has no own config has no log, no revert and can be created as is.
    expect(dialog.queryByRole("tab", { name: "Nhật ký thay đổi" })).toBeNull()
    expect(dialog.queryByRole("button", { name: "Về mặc định" })).toBeNull()
    expect((dialog.getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(false)

    await user.click(dialog.getByRole("radio", { name: "Học lần lượt" }))
    await user.click(chapterBox(dialog, 2))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    const confirm = within(await screen.findByRole("dialog", { name: "Lưu cấu hình Học viện?" }))
    expect(confirm.getByText("Thay đổi áp dụng ngay cho 3 người dùng.")).toBeTruthy()
    await user.click(confirm.getByRole("button", { name: "Xác nhận" }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const posts = writeCalls("POST")
    expect(posts).toHaveLength(1)
    expect(posts[0][0]).toBe("/admin/academy-configs")
    expect(bodyOf(posts[0])).toEqual({ leader_id: "lead-bao", mode: "sequential", chapter_ids: IDS_WITHOUT_CH02 })
    expect(writeCalls("PUT")).toHaveLength(0)
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã tạo cấu hình riêng cho Phạm Bảo")
  })

  it("explains a conflict when the lead already got an own config", async () => {
    server.writeError = new ApiError("Conflict", 409, "ACADEMY_CONFIG_EXISTS")
    const { dialog, user, onClose } = await openEditor(leaderInheritingItem({ user_count: 0 }))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    const message = "Trưởng nhóm này đã có cấu hình riêng. Hãy tải lại danh sách rồi bấm Sửa."
    expect(await dialog.findByText(message)).toBeTruthy()
    expect(mocks.toast.error).toHaveBeenCalledWith(message)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("explains a missing team lead", async () => {
    server.writeError = new ApiError("Not found", 404, "ACADEMY_LEADER_NOT_FOUND")
    const { dialog, user } = await openEditor(leaderInheritingItem({ user_count: 0 }))
    await user.click(dialog.getByRole("button", { name: "Lưu" }))
    expect(await dialog.findByText("Không tìm thấy trưởng nhóm này. Hãy tải lại danh sách.")).toBeTruthy()
  })
})

describe("editor: Về mặc định", () => {
  it("is offered only for the own config of a team lead", async () => {
    const own = await openEditor(leaderOwnItem())
    expect(own.dialog.getByRole("button", { name: "Về mặc định" })).toBeTruthy()
  })

  it("is never offered for the default config", async () => {
    const { dialog } = await openEditor(defaultItem())
    expect(dialog.queryByRole("button", { name: "Về mặc định" })).toBeNull()
  })

  it("deletes the own config only after an explicit confirmation", async () => {
    const { dialog, user, onClose } = await openEditor(leaderOwnItem())
    await user.click(dialog.getByRole("button", { name: "Về mặc định" }))
    const confirm = within(await screen.findByRole("dialog", { name: "Về cấu hình mặc định?" }))
    expect(confirm.getByText("Cấu hình riêng của Nguyễn Lan sẽ bị xóa và nhóm dùng lại cấu hình mặc định.")).toBeTruthy()
    expect(confirm.getByText("Thay đổi áp dụng ngay cho 5 người dùng.")).toBeTruthy()
    expect(writeCalls("DELETE")).toHaveLength(0)

    await user.click(confirm.getByRole("button", { name: "Hủy" }))
    expect(writeCalls("DELETE")).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()

    await user.click(dialog.getByRole("button", { name: "Về mặc định" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Về cấu hình mặc định?" })).getByRole("button", { name: "Xóa cấu hình riêng" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const deletes = writeCalls("DELETE")
    expect(deletes).toHaveLength(1)
    expect(deletes[0][0]).toBe("/admin/academy-configs/cfg-lan")
    expect(mocks.toast.success).toHaveBeenCalledWith("Phạm Bảo đã về cấu hình mặc định")
  })

  it("keeps the editor open and explains a protected default config", async () => {
    server.writeError = new ApiError("Conflict", 409, "ACADEMY_CONFIG_DEFAULT_PROTECTED")
    const { dialog, user, onClose } = await openEditor(leaderOwnItem({ user_count: 0 }))
    await user.click(dialog.getByRole("button", { name: "Về mặc định" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Về cấu hình mặc định?" })).getByRole("button", { name: "Xóa cấu hình riêng" }))
    expect(await dialog.findByText("Không xóa được cấu hình mặc định.")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("explains a config that no longer exists", async () => {
    server.writeError = new ApiError("Not found", 404, "ACADEMY_CONFIG_NOT_FOUND")
    const { dialog, user } = await openEditor(leaderOwnItem({ user_count: 0 }))
    await user.click(dialog.getByRole("button", { name: "Về mặc định" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Về cấu hình mặc định?" })).getByRole("button", { name: "Xóa cấu hình riêng" }))
    expect(await dialog.findByText("Cấu hình này không còn tồn tại. Hãy tải lại danh sách.")).toBeTruthy()
  })
})

describe("editor: change log tab", () => {
  it("loads the log of the config only when its tab is opened", async () => {
    const { dialog, user } = await openEditor(leaderOwnItem())
    const logCalls = () => (mocks.api.mock.calls as Call[]).filter(([path]) => path.includes("/logs"))
    expect(logCalls()).toHaveLength(0)
    await user.click(dialog.getByRole("tab", { name: "Nhật ký thay đổi" }))
    expect(await dialog.findByRole("list", { name: "Nhật ký thay đổi" })).toBeTruthy()
    expect(logCalls().map(([path]) => path)).toEqual(["/admin/academy-configs/cfg-lan/logs?limit=50"])
    // Back to the form: the draft is untouched.
    await user.click(dialog.getByRole("tab", { name: "Cấu hình" }))
    expect(dialog.getByRole("radio", { name: "Học lần lượt" }).getAttribute("aria-checked")).toBe("true")
  })
})
