import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createFakeAcademyApi } from "./test-api"
import { renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let fake: ReturnType<typeof createFakeAcademyApi>

function install(options: Parameters<typeof createFakeAcademyApi>[0] = {}) {
  fake = createFakeAcademyApi(options)
  mocks.api.mockImplementation(fake.handler)
}

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  mocks.toast.mockReset()
  mocks.toast.success.mockReset()
  install()
})
afterEach(() => vi.unstubAllGlobals())

const LESSON = "/demo-trading?view=academy&lesson=ch02-l01"
const completeButton = () => screen.getByRole("button", { name: "Hoàn thành bài học" })
const completions = () => fake.bodies.filter((entry) => entry.call.endsWith("/complete"))

async function openGuide(path = LESSON, options: Parameters<typeof renderAcademy>[1] = { panel: false }) {
  const view = renderAcademy(path, options)
  await screen.findByRole("heading", { level: 2, name: /Tiêu đề/ })
  return view
}

describe("guide lessons: Hoàn thành bài học", () => {
  it("shows the button with the Lần đầu · +100 xu subline at the end, no quiz, and completes nothing by reading", async () => {
    await openGuide()
    expect(completeButton()).toBeTruthy()
    expect(screen.getByText("Lần đầu · +100 xu")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /kiểm tra/ })).toBeNull()
    expect(screen.queryByText("Đã học")).toBeNull()
    expect(completions()).toHaveLength(0)
    await waitFor(() => expect(screen.getByText("Chương 2 · 0/6 bài")).toBeTruthy())
  })

  it("sends the catalog version, the content version and a request id, shows Đang ghi nhận… and ignores a second press", async () => {
    const user = userEvent.setup()
    await openGuide()
    const release = fake.hold("POST /academy/lessons/ch02-l01/complete")
    await user.click(completeButton())
    const pending = screen.getByRole("button", { name: "Đang ghi nhận…" })
    expect(pending.hasAttribute("disabled")).toBe(true)
    // Not done yet: nothing claims completion before the server answered.
    expect(screen.queryByText("Đã học")).toBeNull()
    await user.click(pending)
    await act(async () => release())
    await screen.findByRole("button", { name: "Đã hoàn thành" })

    expect(completions()).toHaveLength(1)
    const body = completions()[0].body as { catalog_version: string; content_version: string; request_id: string }
    expect(body.catalog_version).toBe("iqx-academy-outline-13ch-71lessons-v1")
    expect(body.content_version).toBe("v-ch02-l01")
    expect(body.request_id.length).toBeGreaterThanOrEqual(8)
    expect(Object.keys(body).sort()).toEqual(["catalog_version", "content_version", "request_id"])
  })

  it("after the server confirms: ✓ Đã hoàn thành, Đã học in the header, the coin line and the +100 xu toast; progress is refreshed", async () => {
    const user = userEvent.setup()
    const { client } = await openGuide(LESSON, { panel: true, main: true })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    await user.click(completeButton())
    const done = await screen.findByRole("button", { name: "Đã hoàn thành" })
    expect(done.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("Đã hoàn thành bài học")).toBeTruthy()
    expect(screen.getByText("Đã nhận 100 xu", { selector: "small" })).toBeTruthy()
    expect(mocks.toast.success).toHaveBeenCalledWith("Hoàn thành bài học · +100 xu")
    const article = screen.getByRole("article")
    expect(within(article).getByText("Đã học")).toBeTruthy()
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey: unknown }).queryKey))
    for (const key of ['["academy","progress"]', '["shop"]', '["bot"]', '["strategy"]']) expect(keys).toContain(key)
    // The panel row and counters follow the committed state.
    const panel = screen.getByRole("complementary", { name: "Học viện" })
    await waitFor(() => expect(within(panel).getByText("1 / 71")).toBeTruthy())
    await waitFor(() => expect(within(article).getByText("Chương 2 · 1/6 bài")).toBeTruthy())
  })

  it("says Đang cập nhật xu (never +100 xu) when the coin ledger has not confirmed, and still shows ✓ Đã học", async () => {
    fake.state.rewardStatus = "unavailable"
    const user = userEvent.setup()
    await openGuide()
    await user.click(completeButton())
    await screen.findByRole("button", { name: "Đã hoàn thành" })
    expect(screen.getByText("Đang cập nhật xu", { selector: "small" })).toBeTruthy()
    expect(within(screen.getByRole("article")).getByText("Đã học")).toBeTruthy()
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith("Đang cập nhật xu")
    expect(screen.queryByText("Đã nhận 100 xu")).toBeNull()
  })

  it("shows an alert and lets the learner retry with the same request id when the server cannot record it", async () => {
    const user = userEvent.setup()
    await openGuide()
    fake.fail("complete", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    await user.click(completeButton())
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chưa ghi nhận được hoàn thành. Vui lòng thử lại.")
    // No completion is shown: the button is back, nothing is marked learned, nothing is rewarded.
    expect(completeButton().hasAttribute("disabled")).toBe(false)
    expect(screen.queryByText("Đã học")).toBeNull()
    expect(mocks.toast.success).not.toHaveBeenCalled()

    await user.click(completeButton())
    await screen.findByRole("button", { name: "Đã hoàn thành" })
    expect(screen.queryByRole("alert")).toBeNull()
    const ids = completions().map((entry) => (entry.body as { request_id: string }).request_id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it("offers to reload the lesson when its content moved on", async () => {
    const user = userEvent.setup()
    await openGuide()
    fake.fail("complete", new ApiError("Nội dung đã được cập nhật", 409, "CONTENT_VERSION_MISMATCH"))
    await user.click(completeButton())
    expect((await screen.findByRole("alert")).textContent).toContain("Chưa ghi nhận được hoàn thành.")
    expect(screen.getByRole("button", { name: "Tải lại bài học" })).toBeTruthy()
  })

  it("an already completed guide stays read-only: ✓ Đã hoàn thành, no second request", async () => {
    install({ completed: ["ch02-l01"] })
    const user = userEvent.setup()
    await openGuide()
    const done = await screen.findByRole("button", { name: "Đã hoàn thành" })
    expect(done.hasAttribute("disabled")).toBe(true)
    await user.click(done)
    expect(completions()).toHaveLength(0)
    expect(within(screen.getByRole("article")).getByText("Đã học")).toBeTruthy()
  })

  it("ends the chapter with Hết nội dung Chương 2, or Đã hoàn thành Chương 2 when all six are done", async () => {
    await openGuide("/demo-trading?view=academy&lesson=ch02-l06")
    expect(await screen.findByText("Hết nội dung Chương 2")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Đọc kết quả và lịch sử giao dịch" })).toBeTruthy()
  })

  it("shows Đã hoàn thành Chương 4 after the last guide of the chapter is done", async () => {
    install({ completed: ["ch04-l01", "ch04-l02", "ch04-l03", "ch04-l04", "ch04-l05", "ch04-l06"] })
    await openGuide("/demo-trading?view=academy&lesson=ch04-l06")
    expect(await screen.findByText("Đã hoàn thành Chương 4")).toBeTruthy()
  })

  it("a guide that is not published offers no completion at all", async () => {
    install({ lessons: { "ch02-l01": { content_status: "not_published", content_version: null, sections: [], charts: {}, completion: { mode: "guide", question_count: null, required_correct: null, assessment_ready: false, assessment_version: null, button_label: null } } } })
    await openGuide()
    expect(screen.getByText("Nội dung chưa được xuất bản")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Hoàn thành bài học" })).toBeNull()
  })
})
