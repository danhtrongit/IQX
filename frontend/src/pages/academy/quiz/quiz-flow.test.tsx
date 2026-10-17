import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createFakeAcademyApi } from "../test-api"
import { ATTEMPT_ID, CATALOG_VERSION, keysBefore } from "../test-fixtures"
import { renderAcademy, stubBrowser } from "../test-support"
import { resetAcademyViewState } from "../view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let fake: ReturnType<typeof createFakeAcademyApi>
const scrollIntoView = vi.fn()

function install(options: Parameters<typeof createFakeAcademyApi>[0] = {}) {
  fake = createFakeAcademyApi(options)
  mocks.api.mockImplementation(fake.handler)
}

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  scrollIntoView.mockReset()
  mocks.toast.mockReset()
  mocks.toast.success.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
  install()
})
afterEach(() => vi.unstubAllGlobals())

type User = ReturnType<typeof userEvent.setup>

async function openItem(id: string, heading: string) {
  const view = renderAcademy(`/demo-trading?view=academy&lesson=${id}`, { panel: false })
  await screen.findByRole("heading", { level: 2, name: heading })
  return view
}

async function start(user: User, label = "Làm bài kiểm tra") {
  await user.click(await screen.findByRole("button", { name: label }))
  await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1 / })
}

const option = (letter: "A" | "B" | "C") => screen.getByRole("radio", { name: `Phương án ${letter}` })
const next = () => screen.getByRole("button", { name: "Câu tiếp theo" })

/** Answers every question (A is always right in the fixtures) and submits on the last one. */
async function answerAll(user: User, total: number, wrongAt: number[] = []) {
  for (let index = 0; index < total; index += 1) {
    await user.click(option(wrongAt.includes(index) ? "B" : "A"))
    if (index < total - 1) await user.click(next())
  }
  await user.click(screen.getByRole("button", { name: "Nộp bài" }))
}

describe("quiz: one question per screen", () => {
  it("starts an attempt and hides the content: label, Câu i/N, dots, no previous control", async () => {
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await start(user)

    const create = fake.bodies.find((entry) => entry.call === "POST /academy/attempts")
    expect(create?.body).toMatchObject({ lesson_id: "ch01-l01", catalog_version: CATALOG_VERSION })
    expect(String((create?.body as { idempotency_key: string }).idempotency_key).length).toBeGreaterThanOrEqual(8)

    expect(screen.getByText("Bài kiểm tra")).toBeTruthy()
    expect(screen.getByText("Câu 1/3")).toBeTruthy()
    expect(screen.getByText("Câu 1 trên 3")).toBeTruthy()
    const dots = document.querySelector("[data-quiz-dots]") as HTMLElement
    expect(dots.getAttribute("aria-hidden")).toBe("true")
    expect(dots.querySelectorAll("li")).toHaveLength(3)
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    // The content is hidden while the quiz is on screen.
    expect(screen.queryByRole("heading", { level: 3, name: "Nội dung chính" })).toBeNull()
    expect(screen.queryByRole("heading", { level: 3, name: "Tóm tắt" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Câu trước|Quay lại/ })).toBeNull()

    expect(next().hasAttribute("disabled")).toBe(true)
    await user.click(option("B"))
    expect(next().hasAttribute("disabled")).toBe(false)
    expect(document.body.textContent).not.toMatch(/Đúng|Sai|Giải thích|Đáp án/)
    await user.click(next())
    expect(screen.getByRole("heading", { level: 3, name: /^Câu hỏi 2 / })).toBeTruthy()
    expect(next().hasAttribute("disabled")).toBe(true)
    await user.click(option("A"))
    await user.click(next())
    expect(screen.getByText("Câu 3/3")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Câu tiếp theo" })).toBeNull()
    const submit = screen.getByRole("button", { name: "Nộp bài" })
    expect(submit.hasAttribute("disabled")).toBe(true)
    await user.click(option("A"))
    expect(submit.hasAttribute("disabled")).toBe(false)
  })

  it("saves every choice as a server draft with the last revision it saw", async () => {
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await start(user)
    await user.click(option("B"))
    await user.click(next())
    await user.click(option("C"))
    await waitFor(() => expect(fake.bodies.filter((entry) => entry.call === `PUT /academy/attempts/${ATTEMPT_ID}/answers`)).toHaveLength(2))
    const puts = fake.bodies.filter((entry) => entry.call.startsWith("PUT")).map((entry) => entry.body)
    expect(puts[0]).toEqual({ answers: [{ question_id: "ch01-l01-q01", option_id: "ch01-l01-q01-b" }], expected_revision: 0 })
    expect(puts[1]).toEqual({ answers: [{ question_id: "ch01-l01-q02", option_id: "ch01-l01-q02-c" }], expected_revision: 1 })
  })

  it("adopts the draft another device saved first, then applies the new choice on top", async () => {
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await start(user)
    fake.saveDraftElsewhere(ATTEMPT_ID, "ch01-l01-q03", "ch01-l01-q03-c")
    await user.click(option("A"))
    expect(await screen.findByText("Lựa chọn đã được cập nhật từ một thiết bị khác.")).toBeTruthy()
    await waitFor(() => expect(fake.drafts.get(ATTEMPT_ID)?.selections).toEqual({ "ch01-l01-q01": "ch01-l01-q01-a", "ch01-l01-q03": "ch01-l01-q03-c" }))
  })

  it("Thoát returns to the content and the next start resumes the same attempt at the first unanswered question", async () => {
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await start(user)
    await user.click(option("A"))
    await user.click(next())
    await waitFor(() => expect(fake.count(`PUT /academy/attempts/${ATTEMPT_ID}/answers`)).toBe(1))
    await user.click(screen.getByRole("button", { name: "Thoát" }))
    expect(await screen.findByRole("heading", { level: 3, name: "Nội dung chính" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Làm bài kiểm tra" }))
    expect(await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 2 / })).toBeTruthy()
    expect(fake.count("POST /academy/attempts")).toBe(1)
    expect(screen.getByText("Đã khôi phục lượt làm bài đang dở.")).toBeTruthy()
  })

  it("resumes an attempt the server holds (another device) without creating a new one", async () => {
    install({ openAttempt: { draft: { "ch01-l01-q01": "ch01-l01-q01-b", "ch01-l01-q02": "ch01-l01-q02-a" }, revision: 2 } })
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await user.click(screen.getByRole("button", { name: "Làm bài kiểm tra" }))
    expect(await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 3 / })).toBeTruthy()
    expect(fake.calls).not.toContain("POST /academy/attempts")
    await user.click(option("A"))
    await waitFor(() => expect(fake.bodies.find((entry) => entry.call.startsWith("PUT"))?.body).toMatchObject({ expected_revision: 2 }))
  })
})

describe("quiz: score-only result", () => {
  it("passes 3/3: Đạt, Đã hoàn thành, Xem lại bài, the coin toast and Bài tiếp theo", async () => {
    const user = userEvent.setup()
    const { router } = await openItem("ch01-l01", "Bài học 1.1")
    await start(user)
    await answerAll(user, 3)

    const score = await screen.findByLabelText("Điểm 3 trên 3")
    expect(score.textContent).toBe("3/3")
    expect(screen.getByText("Đạt")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Đã hoàn thành" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Xem lại bài" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Làm lại" })).toBeNull()
    expect(mocks.toast.success).toHaveBeenCalledWith("Hoàn thành bài học · +100 xu")
    // Nothing about the individual questions.
    expect(document.body.textContent).not.toMatch(/Câu hỏi 1|Đáp án|Giải thích|Đúng \d|Sai \d/)
    expect(fake.calls.filter((call) => call.startsWith("GET /academy/attempts/"))).toEqual([])

    await user.click(screen.getByRole("button", { name: /Bài tiếp theo/ }))
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-l02")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 1.2" })).toBeTruthy()
  })

  it("fails 2/3: Chưa đạt, Làm lại starts a new attempt without a dialog, Xem lại bài returns to the content", async () => {
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await start(user)
    await answerAll(user, 3, [1])

    expect((await screen.findByLabelText("Điểm 2 trên 3")).textContent).toBe("2/3")
    expect(screen.getByText("Chưa đạt")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Đã hoàn thành" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Bài tiếp theo/ })).toBeNull()
    expect(mocks.toast.success).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Làm lại" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1 / })
    const keys = fake.bodies.filter((entry) => entry.call === "POST /academy/attempts").map((entry) => (entry.body as { idempotency_key: string }).idempotency_key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])

    await answerAll(user, 3, [0])
    await screen.findByLabelText("Điểm 2 trên 3")
    await user.click(screen.getByRole("button", { name: "Xem lại bài" }))
    expect(await screen.findByRole("heading", { level: 3, name: "Nội dung chính" })).toBeTruthy()
  })

  it("fails 4/5 in chapter 4 and shows Đã mở chỉ báo RSI on the RSI lesson pass", async () => {
    install({ completed: keysBefore("ch04-l06") })
    const user = userEvent.setup()
    await openItem("ch04-l06", "Bài học 4.6")
    await start(user)
    expect(screen.getByText("Câu 1/5")).toBeTruthy()
    await answerAll(user, 5, [4])
    expect((await screen.findByLabelText("Điểm 4 trên 5")).textContent).toBe("4/5")
    expect(screen.getByText("Chưa đạt")).toBeTruthy()
    expect(screen.queryByText(/Đã mở chỉ báo/)).toBeNull()

    await user.click(screen.getByRole("button", { name: "Làm lại" }))
    await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1 / })
    await answerAll(user, 5)
    expect((await screen.findByLabelText("Điểm 5 trên 5")).textContent).toBe("5/5")
    expect(screen.getByText("Đã mở chỉ báo RSI")).toBeTruthy()
  })

  it("an exam: Bài thi Chương c label, 20 questions, Đã hoàn thành Chương c, no coin toast", async () => {
    install({ completed: keysBefore("ch01-exam") })
    const user = userEvent.setup()
    const { router } = await openItem("ch01-exam", "Bài thi Chương 1")
    await start(user, "Bắt đầu làm bài")
    expect(within(screen.getByRole("region", { name: /^Câu hỏi 1 / })).getByText("Bài thi Chương 1")).toBeTruthy()
    expect(screen.getByText("Câu 1/20")).toBeTruthy()
    expect(document.querySelectorAll("[data-quiz-dots] li")).toHaveLength(20)
    await answerAll(user, 20)

    expect((await screen.findByLabelText("Điểm 20 trên 20")).textContent).toBe("20/20")
    expect(screen.getByText("Đạt")).toBeTruthy()
    expect(screen.getByText("Đã hoàn thành Chương 1")).toBeTruthy()
    expect(mocks.toast.success).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Xem lại Chương 1" }))
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-l01")
  }, 20_000)

  it("an exam at 19/20 is Chưa đạt and offers Làm lại and Xem lại Chương c", async () => {
    install({ completed: keysBefore("ch01-exam") })
    const user = userEvent.setup()
    await openItem("ch01-exam", "Bài thi Chương 1")
    await start(user, "Bắt đầu làm bài")
    await answerAll(user, 20, [7])
    expect((await screen.findByLabelText("Điểm 19 trên 20")).textContent).toBe("19/20")
    expect(screen.getByText("Chưa đạt")).toBeTruthy()
    expect(screen.queryByText(/Đã hoàn thành Chương/)).toBeNull()
    expect(screen.getByRole("button", { name: "Làm lại" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Xem lại Chương 1" })).toBeTruthy()
  }, 20_000)
})

describe("quiz: server refusals", () => {
  it("403 ACADEMY_SCENARIO_REQUIRED returns to the content and scrolls to the scenario", async () => {
    // The item says a choice exists (a stale tab) but the server holds none.
    install({
      completed: keysBefore("ch02-l01"),
      lessons: { "ch02-l01": { scenario_choice: { choice: 0, chosen_at: "2026-10-08T00:40:00.000Z" } } },
    })
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    const itemReads = fake.count("GET /academy/lessons/ch02-l01")
    await user.click(screen.getByRole("button", { name: "Làm bài kiểm tra" }))
    expect(await screen.findByRole("heading", { level: 3, name: "Nội dung chính" })).toBeTruthy()
    await waitFor(() => expect(fake.count("GET /academy/lessons/ch02-l01")).toBeGreaterThan(itemReads))
    await waitFor(() =>
      expect(scrollIntoView.mock.contexts.some((context) => (context as HTMLElement).hasAttribute?.("data-academy-scenario"))).toBe(true),
    )
  })

  it("a catalog change while starting asks to reload the item", async () => {
    install()
    fake.fail("create", new ApiError("Danh mục đã thay đổi.", 409, "CATALOG_VERSION_MISMATCH"))
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await user.click(screen.getByRole("button", { name: "Làm bài kiểm tra" }))
    expect(await screen.findByText("Học viện vừa được cập nhật")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Tải lại bài" }))
    expect(await screen.findByRole("heading", { level: 3, name: "Nội dung chính" })).toBeTruthy()
  })

  it("keeps the choices on screen when a submit fails and lets it be sent again", async () => {
    const user = userEvent.setup()
    await openItem("ch01-l01", "Bài học 1.1")
    await start(user)
    fake.fail("submit", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    await answerAll(user, 3)
    const alert = await screen.findByRole("alert")
    expect(within(alert).getByText(/Lựa chọn của bạn vẫn được giữ/)).toBeTruthy()
    expect((option("A") as HTMLInputElement).checked).toBe(true)
    await user.click(within(alert).getByRole("button", { name: "Nộp lại" }))
    expect((await screen.findByLabelText("Điểm 3 trên 3")).textContent).toBe("3/3")
  })
})
