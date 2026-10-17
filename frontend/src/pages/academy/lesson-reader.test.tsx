import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createFakeAcademyApi } from "./test-api"
import { keysBefore, keyOf } from "./test-fixtures"
import { overlayFrame, renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))

let fake: ReturnType<typeof createFakeAcademyApi>

function install(options: Parameters<typeof createFakeAcademyApi>[0] = {}) {
  fake = createFakeAcademyApi(options)
  mocks.api.mockImplementation(fake.handler)
}

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  Element.prototype.scrollIntoView = vi.fn()
  install()
})
afterEach(() => vi.unstubAllGlobals())

const reader = () => screen.getByRole("article")
const locator = () => reader().querySelector("[data-academy-locator]")?.textContent
const open = (id: string, options: Parameters<typeof renderAcademy>[1] = { panel: false }) =>
  renderAcademy(`/demo-trading?view=academy&lesson=${id}`, options)

describe("LessonReader header and locator", () => {
  it("shows Về linh thú, the locator Chương c · Bài n / m, the title, the lead, the summary and Đã hoàn thành", async () => {
    install({ completed: ["concept:ch01_l01", "concept:ch01_l02"] })
    open("ch01-l02")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 1.2" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Về linh thú" })).toBeTruthy()
    await waitFor(() => expect(locator()).toBe("Chương 1 · Bài 2 / 10"))
    expect(within(reader()).getByText("Bài học 1.2", { selector: "b" })).toBeTruthy()
    expect(within(reader()).getByRole("heading", { level: 3, name: "Tóm tắt" })).toBeTruthy()
    expect(within(reader()).getByText("Ý chính của bài học.")).toBeTruthy()
    expect(within(reader()).getByRole("heading", { level: 3, name: "Nội dung chính" })).toBeTruthy()
    const header = within(reader()).getByRole("banner")
    expect(within(header).getByText("Đã hoàn thành")).toBeTruthy()
    expect(within(header).getByText("Đã nhận 100 xu")).toBeTruthy()
  })

  it("names an exam Bài thi Chương c and the practice room Chương 3 · Phòng tập thực chiến", async () => {
    install({ completed: keysBefore("ch04-l01") })
    const first = open("ch03-exam")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài thi Chương 3" })).toBeTruthy()
    await waitFor(() => expect(locator()).toBe("Bài thi Chương 3"))
    first.unmount()

    open("ch03-practice")
    expect(await screen.findByRole("heading", { level: 2, name: "Phòng tập thực chiến" })).toBeTruthy()
    await waitFor(() => expect(locator()).toBe("Chương 3 · Phòng tập thực chiến"))
  })

  it("shows no Đã hoàn thành and no coin tag for an item that is not passed", async () => {
    open("ch01-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
    expect(within(reader()).queryByText("Đã hoàn thành")).toBeNull()
    expect(within(reader()).queryByText(/Đã nhận/)).toBeNull()
  })

  it("offers Danh sách bài on a phone to bring the list back", async () => {
    const user = userEvent.setup()
    const frame = overlayFrame({ open: false })
    open("ch01-l01", { panel: false, frame })
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
    await user.click(screen.getByRole("button", { name: "Danh sách bài" }))
    expect(frame.setOpen).toHaveBeenCalledWith(true)
  })
})

describe("LessonReader locked and missing items", () => {
  it("shows LockedState for a 403 and leads to the item being learned", async () => {
    install({ completed: ["concept:ch01_l01"] })
    const user = userEvent.setup()
    const { router } = open("ch01-l05")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài này chưa mở" })).toBeTruthy()
    await user.click(await screen.findByRole("button", { name: "Đến bài đang học" }))
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-l02")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 1.2" })).toBeTruthy()
  })

  it("explains an item that does not exist, and offers Thử lại for other failures", async () => {
    const user = userEvent.setup()
    const first = open("ch09-l01")
    expect(await screen.findByText("Không tìm thấy bài học")).toBeTruthy()
    first.unmount()

    fake.fail("lesson", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    open("ch01-l01")
    expect(await screen.findByText("Chưa tải được nội dung bài học")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })).toBeTruthy()
  })
})

describe("LessonQuizGate", () => {
  it("shows Làm bài kiểm tra with 3 câu in chapters 1-3 and 5 câu from chapter 4", async () => {
    const first = open("ch01-l01")
    expect(await screen.findByRole("button", { name: "Làm bài kiểm tra" })).toBeTruthy()
    expect(screen.getByText("3 câu")).toBeTruthy()
    first.unmount()

    install({ completed: keysBefore("ch04-l02") })
    open("ch04-l02")
    expect(await screen.findByRole("button", { name: "Làm bài kiểm tra" })).toBeTruthy()
    expect(screen.getByText("5 câu")).toBeTruthy()
  })

  it("turns into a disabled Đã hoàn thành once passed (no retake from the gate)", async () => {
    install({ completed: ["concept:ch01_l01"] })
    open("ch01-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
    const gate = screen.getByRole("region", { name: "Bài kiểm tra" })
    const done = within(gate).getByRole("button", { name: "Đã hoàn thành" })
    expect(done.hasAttribute("disabled")).toBe(true)
    expect(within(gate).queryByRole("button", { name: "Làm bài kiểm tra" })).toBeNull()
  })

  it("keeps the quiz closed in chapters 2-3 until a scenario option is chosen", async () => {
    install({ completed: keysBefore("ch02-l01") })
    open("ch02-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 2.1" })
    const gated = screen.getByRole("button", { name: "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra" })
    expect(gated.hasAttribute("disabled")).toBe(true)
    expect(screen.queryByRole("button", { name: "Làm bài kiểm tra" })).toBeNull()
  })

  it("opens the gate on reload when the account already holds a choice", async () => {
    install({ completed: keysBefore("ch02-l01"), scenarios: { "ch02-l01": 2 } })
    open("ch02-l01")
    expect(await screen.findByRole("button", { name: "Làm bài kiểm tra" })).toBeTruthy()
  })
})

describe("ItemPager", () => {
  it("disables a locked next item; the exam intro leads back to the start of its chapter", async () => {
    const user = userEvent.setup()
    const first = open("ch01-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
    const pager = await screen.findByRole("navigation", { name: "Bài trước và bài sau" })
    await waitFor(() => expect(within(pager).getByRole("button", { name: /Bài sau: Bài học 1.2/ }).hasAttribute("disabled")).toBe(true))
    first.unmount()

    install({ completed: keysBefore("ch02-l02") })
    const { router } = open("ch01-exam")
    await screen.findByRole("heading", { level: 2, name: "Bài thi Chương 1" })
    await user.click(screen.getByRole("button", { name: "Xem lại Chương 1" }))
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
  })

  it("goes from the last lesson of a chapter to its exam and on to the next chapter", async () => {
    install({ completed: keysBefore("ch02-l02") })
    const user = userEvent.setup()
    const { router } = open("ch01-l10")
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.10" })
    const pager = screen.getByRole("navigation", { name: "Bài trước và bài sau" })
    await waitFor(() => expect(within(pager).getByRole("button", { name: /Bài sau: Bài thi Chương 1/ }).hasAttribute("disabled")).toBe(false))
    await user.click(within(pager).getByRole("button", { name: /Bài sau: Bài thi Chương 1/ }))
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-exam")
  })
})

describe("ExamIntro", () => {
  it("shows the intro, the bold all-correct rule and Bắt đầu làm bài", async () => {
    install({ completed: keysBefore("ch01-exam") })
    open("ch01-exam")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài thi Chương 1" })).toBeTruthy()
    expect(screen.getByText("Bài thi gồm 20 câu hỏi về toàn bộ kiến thức Chương 1.", { exact: false })).toBeTruthy()
    expect(screen.getByText("Cần trả lời đúng tất cả câu hỏi để hoàn thành.").tagName).toBe("B")
    expect(screen.getByRole("button", { name: "Bắt đầu làm bài" })).toBeTruthy()
  })

  it("once passed shows Đã hoàn thành and Xem lại Chương c", async () => {
    install({ completed: [...keysBefore("ch01-exam"), keyOf("ch01-exam")] })
    open("ch01-exam")
    await screen.findByRole("heading", { level: 2, name: "Bài thi Chương 1" })
    expect(screen.getByRole("button", { name: "Đã hoàn thành" }).hasAttribute("disabled")).toBe(true)
    expect(screen.queryByRole("button", { name: "Bắt đầu làm bài" })).toBeNull()
    expect(await screen.findByRole("button", { name: "Xem lại Chương 1" })).toBeTruthy()
  })
})
