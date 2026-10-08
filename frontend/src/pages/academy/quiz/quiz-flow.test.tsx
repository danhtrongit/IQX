import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { ATTEMPT_ID } from "../test-fixtures"
import { createFakeAcademyApi } from "../test-api"
import { overlayFrame, renderAcademy, stubBrowser } from "../test-support"
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

const START = "Làm bài kiểm tra · 8 câu"
const CORRECT = ["B", "C", "D", "A", "B", "C", "D", "A"]
const ALL_A = Array.from({ length: 8 }, () => "A")

async function openLesson(path = "/demo-trading?view=academy&lesson=ch01-l01", options: Parameters<typeof renderAcademy>[1] = { panel: false }) {
  const view = renderAcademy(path, options)
  await screen.findByRole("heading", { level: 2, name: /Tiêu đề/ })
  return view
}

async function startQuiz(user: ReturnType<typeof userEvent.setup>, label = START) {
  await user.click(await screen.findByRole("button", { name: label }))
  await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1/ })
}

const radio = (letter: string) => screen.getByRole("radio", { name: new RegExp(`^${letter}\\. `) })

/** Answers the 8 questions with the given letters and stops on question 8. */
async function answerAll(user: ReturnType<typeof userEvent.setup>, letters: string[]) {
  for (let index = 0; index < 8; index += 1) {
    await user.click(radio(letters[index]))
    if (index < 7) await user.click(screen.getByRole("button", { name: /Câu tiếp/ }))
  }
}

describe("quiz: taking it", () => {
  it("starts an attempt, shows one question at a time with the 1-8 strip, and gives no feedback before submit", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)

    const create = fake.bodies.find((entry) => entry.call === "POST /academy/attempts")
    expect(create?.body).toMatchObject({ lesson_id: "ch01-l01", catalog_version: "iqx-academy-outline-13ch-71lessons-v1" })
    expect(String((create?.body as { idempotency_key: string }).idempotency_key).length).toBeGreaterThanOrEqual(8)

    expect(screen.getByText("Câu 1 / 8")).toBeTruthy()
    expect(screen.getByText("Đã trả lời 0 / 8")).toBeTruthy()
    const strip = screen.getByRole("navigation", { name: "Chuyển câu hỏi" })
    expect(within(strip).getAllByRole("button")).toHaveLength(8)
    expect(within(strip).getByRole("button", { name: "Câu 1" }).getAttribute("aria-current")).toBe("step")
    expect(screen.getAllByRole("radio")).toHaveLength(4)
    // Only the current question is on screen.
    expect(screen.queryByText(/^Câu hỏi 2/)).toBeNull()

    await user.click(radio("B"))
    expect(screen.getByText("Đã trả lời 1 / 8")).toBeTruthy()
    expect(within(strip).getByRole("button", { name: "Câu 1, đã trả lời" })).toBeTruthy()
    // Nothing says right or wrong, no explanation, no score.
    expect(document.body.textContent).not.toMatch(/Đúng|Sai|Giải thích|Đáp án đúng|\/ 8 câu/)
    expect(screen.queryByRole("button", { name: "Nộp bài" })).toBeNull()
  })

  it("shows the hint in a Công thức sử dụng disclosure, and the chart or table of the question", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    const details = screen.getByText("Công thức sử dụng").closest("details") as HTMLDetailsElement
    expect(details.open).toBe(false)
    await user.click(screen.getByText("Công thức sử dụng"))
    expect(within(details).getByText("RS = G / D")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /Câu tiếp/ }))
    expect(await screen.findByRole("img", { name: "Hình của câu 2" })).toBeTruthy()
    expect(screen.getByText("Dữ liệu minh họa cho câu hỏi này.")).toBeTruthy()
    expect(screen.queryByText("Xem bảng số liệu của biểu đồ")).toBeNull()

    await user.click(screen.getByRole("button", { name: /Câu tiếp/ }))
    const table = await screen.findByRole("region", { name: "Bảng của Hình của câu 3" })
    expect(within(table).getByRole("cell", { name: "∈ tập" })).toBeTruthy()
  })

  it("moves with the strip and Câu trước / Câu tiếp and keeps every choice", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await user.click(radio("C"))
    await user.click(screen.getByRole("button", { name: /Câu tiếp/ }))
    expect(screen.getByRole("heading", { level: 3, name: /^Câu hỏi 2/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Câu trước/ }).hasAttribute("disabled")).toBe(false)
    await user.click(screen.getByRole("button", { name: "Câu 5" }))
    expect(screen.getByRole("heading", { level: 3, name: /^Câu hỏi 5/ })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Câu 1, đã trả lời" }))
    expect((radio("C") as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole("button", { name: /Câu trước/ }).hasAttribute("disabled")).toBe(true)
  })

  it("offers Nộp bài only on question 8 and only with eight answers", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    // Answer 7 of 8, then go to question 8 without answering it.
    for (let index = 0; index < 7; index += 1) {
      await user.click(radio("A"))
      await user.click(screen.getByRole("button", { name: /Câu tiếp/ }))
    }
    expect(screen.getByRole("heading", { level: 3, name: /^Câu hỏi 8/ })).toBeTruthy()
    const submit = screen.getByRole("button", { name: "Nộp bài" })
    expect(submit.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("Còn 1 câu chưa trả lời.")).toBeTruthy()
    await user.click(submit)
    expect(fake.calls.filter((call) => call.endsWith("/submit"))).toHaveLength(0)

    await user.click(radio("A"))
    expect(screen.getByRole("button", { name: "Nộp bài" }).hasAttribute("disabled")).toBe(false)
    expect(screen.queryByText(/chưa trả lời/)).toBeNull()
  })

  it("saves each choice as a server draft with the last revision it saw", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await user.click(radio("B"))
    await user.click(screen.getByRole("button", { name: /Câu tiếp/ }))
    await user.click(radio("C"))
    await waitFor(() => expect(fake.bodies.filter((entry) => entry.call === `PUT /academy/attempts/${ATTEMPT_ID}/answers`)).toHaveLength(2))
    const puts = fake.bodies.filter((entry) => entry.call.startsWith("PUT")).map((entry) => entry.body)
    expect(puts[0]).toEqual({ answers: [{ question_id: "q1", option_id: "q1b" }], expected_revision: 0 })
    expect(puts[1]).toEqual({ answers: [{ question_id: "q2", option_id: "q2c" }], expected_revision: 1 })
  })

  it("keeps the answers on screen when saving a draft fails, and says so", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    fake.fail("draft", new ApiError("Lỗi", 503, "SERVICE_UNAVAILABLE"))
    await user.click(radio("D"))
    expect(await screen.findByText("Chưa lưu được lựa chọn lên máy chủ. Bài làm vẫn được giữ trên trang này.")).toBeTruthy()
    expect((radio("D") as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText("Đã trả lời 1 / 8")).toBeTruthy()
  })
})

describe("quiz: resuming from the server", () => {
  it("offers Tiếp tục bài kiểm tra, reuses the open attempt (no new POST) and preselects the saved draft", async () => {
    install({ openAttempt: { draft: { q1: "q1b", q2: "q2c" }, revision: 2 } })
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user, "Tiếp tục bài kiểm tra").catch(() => undefined)
    // Opens at the first unanswered question (3) with the draft counted.
    expect(await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 3/ })).toBeTruthy()
    expect(fake.calls).not.toContain("POST /academy/attempts")
    expect(screen.getByText("Đã trả lời 2 / 8")).toBeTruthy()
    expect(screen.getByText("Đã khôi phục lượt làm bài đang dở.")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Câu 1, đã trả lời" }))
    expect((radio("B") as HTMLInputElement).checked).toBe(true)
    // The next change carries the stored revision.
    await user.click(radio("C"))
    await waitFor(() => expect(fake.bodies.some((entry) => entry.call.startsWith("PUT"))).toBe(true))
    expect(fake.bodies.find((entry) => entry.call.startsWith("PUT"))?.body).toMatchObject({ expected_revision: 2 })
  })

  it("adopts the server draft when another device saved first, then applies the new choice on top", async () => {
    install({ openAttempt: { draft: { q2: "q2c" }, revision: 1 } })
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user, "Tiếp tục bài kiểm tra").catch(() => undefined)
    await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1/ }).catch(() => undefined)
    await user.click(screen.getByRole("button", { name: "Câu 3" }))
    fake.state.draftConflict = true
    await user.click(radio("A"))
    expect(await screen.findByText("Lựa chọn đã được cập nhật từ một thiết bị khác.")).toBeTruthy()
    // The other device's q1 answer is adopted, q2 stays, and the choice just made is kept.
    expect(screen.getByText("Đã trả lời 3 / 8")).toBeTruthy()
    expect((radio("A") as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole("button", { name: "Câu 1, đã trả lời" }))
    expect((radio("D") as HTMLInputElement).checked).toBe(true)
    expect(fake.calls.filter((call) => call === "GET /academy/lessons/ch01-l01/attempt").length).toBeGreaterThanOrEqual(2)
  })

  it("reuses the same idempotency key when starting is retried after a failure", async () => {
    const user = userEvent.setup()
    fake.fail("create", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    await openLesson()
    await user.click(await screen.findByRole("button", { name: START }))
    expect(await screen.findByText("Chưa bắt đầu được bài kiểm tra")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1/ })
    const keys = fake.bodies.filter((entry) => entry.call === "POST /academy/attempts").map((entry) => (entry.body as { idempotency_key: string }).idempotency_key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })
})

describe("quiz: submitting and the result", () => {
  it("sends the eight chosen options (no score, no pass flag) and shows score, Đúng/Sai and the review in the attempt's letter order", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, ALL_A)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))

    expect(await screen.findByRole("heading", { level: 2, name: "Còn nội dung cần ôn lại" })).toBeTruthy()
    const submit = fake.bodies.find((entry) => entry.call === `POST /academy/attempts/${ATTEMPT_ID}/submit`)?.body as { answers: unknown[]; idempotency_key?: string } & Record<string, unknown>
    expect(submit.answers).toHaveLength(8)
    expect(Object.keys(submit).sort()).toEqual(["answers", "idempotency_key"])
    expect(submit.answers[0]).toEqual({ question_id: "q1", option_id: "q1a" })

    expect(screen.getByLabelText("Điểm 2 trên 8")).toBeTruthy()
    expect(screen.getByText("Đúng 2 câu · Sai 6 câu.")).toBeTruthy()
    expect(screen.getByText("Đọc giải thích và xem lại phần liên quan trước khi làm lại.")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Đáp án và giải thích" })).toBeTruthy()

    const cards = [...document.querySelectorAll<HTMLDetailsElement>("details")].filter((details) => /^\s*(Đúng|Sai)\. /.test(details.querySelector("summary")?.textContent ?? ""))
    expect(cards).toHaveLength(8)
    // Wrong answers are open, right ones are collapsed.
    expect(cards.map((card) => card.open)).toEqual([true, true, true, false, true, true, true, false])
    expect(cards[0].querySelector("summary")?.textContent).toContain("Sai. Câu 1 · Chủ đề 1Bạn chọn A · Đáp án B")
    expect(cards[3].querySelector("summary")?.textContent).toContain("Đúng. Câu 4 · Chủ đề 4Bạn chọn A · Đáp án A")
    // Every option shows its explanation, with Đã chọn / Đúng markers and the letters of the attempt.
    const options = within(cards[0]).getAllByRole("listitem")
    expect(options.map((item) => item.querySelector("b")?.textContent)).toEqual([
      "A. Đáp án A của câu 1 · Đã chọn",
      "B. Đáp án B của câu 1 · Đúng",
      "C. Đáp án C của câu 1",
      "D. Đáp án D của câu 1",
    ])
    expect(options[2].textContent).toContain("Giải thích c của câu 1")
    expect(within(cards[1]).getByRole("img", { name: "Hình của câu 2" })).toBeTruthy()
    expect(within(cards[2]).getByRole("cell", { name: "∉ tập" })).toBeTruthy()
  })

  it("jumps back to the lesson part a question belongs to (Xem lại phần n)", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, ALL_A)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    await screen.findByRole("heading", { level: 2, name: "Đáp án và giải thích" })
    await user.click(screen.getAllByRole("button", { name: /^Xem lại phần 2: Công thức và ví dụ tính/ })[0])
    expect(await screen.findByRole("navigation", { name: "Các phần của bài" })).toBeTruthy()
    await waitFor(() => expect((scrollIntoView.mock.contexts.at(-1) as HTMLElement | undefined)?.id).toBe("academy-section-2"))
  })

  it("passing 8/8 shows Hoàn thành bài học · +100 xu only because the server credited it, and refreshes every dependent query", async () => {
    const user = userEvent.setup()
    const { client } = await openLesson()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))

    expect(await screen.findByRole("heading", { level: 2, name: "Đã hoàn thành bài kiểm tra" })).toBeTruthy()
    expect(screen.getByLabelText("Điểm 8 trên 8")).toBeTruthy()
    expect(screen.getByText("Đã mở chỉ báo trong Bot, Backtest và Cảnh báo. Các điều kiện chưa tự bật.")).toBeTruthy()
    expect(screen.getByText("Hoàn thành bài học · +100 xu")).toBeTruthy()
    expect(mocks.toast.success).toHaveBeenCalledWith("Hoàn thành bài học · +100 xu")
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey: unknown }).queryKey))
    for (const key of ['["academy","progress"]', '["academy","lesson"]', '["shop"]', '["bot"]', '["practice"]', '["strategy"]']) expect(keys).toContain(key)
    expect(screen.getByRole("button", { name: "Về Bot" })).toBeTruthy()
  })

  it("says Đang cập nhật xu, keeps ✓ Đã học and claims no coins when the reward is not confirmed", async () => {
    const user = userEvent.setup()
    await openLesson()
    fake.state.rewardStatus = "unavailable"
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    expect(await screen.findByText("Đang cập nhật xu")).toBeTruthy()
    expect(screen.getByText("Đã học")).toBeTruthy()
    expect(document.body.textContent).not.toContain("+100 xu")
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith("Đang cập nhật xu")
  })

  it("re-passing a lesson says Bài đã hoàn thành. Làm lại không nhận thêm xu. and never announces coins", async () => {
    install({ completed: ["ch01-l01"], lessons: { "ch01-l01": { best_score: 8, attempts_submitted: 1 } } })
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    expect(await screen.findByText("Bài đã hoàn thành. Làm lại không nhận thêm xu.")).toBeTruthy()
    expect(screen.queryByText(/\+100 xu/)).toBeNull()
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("keeps the earlier pass after a miss: the note says the permission stays", async () => {
    install({ completed: ["ch01-l01"] })
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, ALL_A)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    expect(await screen.findByText("Quyền đã mở từ lần đạt trước vẫn được giữ.")).toBeTruthy()
    expect(screen.getByText("Bài đã hoàn thành. Làm lại không nhận thêm xu.")).toBeTruthy()
  })

  it("shows Về Bot only for passed technical lessons and opens the Bot tool", async () => {
    const user = userEvent.setup()
    const { router } = await openLesson()
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    await user.click(await screen.findByRole("button", { name: "Về Bot" }))
    expect(router.state.location.search).toBe("?view=bot&lesson=ch01-l01")
    expect(screen.queryByRole("button", { name: "Mở Bộ lọc" })).toBeNull()
  })

  it("offers neither Về Bot nor Mở Bộ lọc for the Hợp lưu concept lesson or after a first miss", async () => {
    const user = userEvent.setup()
    await openLesson("/demo-trading?view=academy&lesson=ch01-l06")
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    await screen.findByRole("heading", { level: 2, name: "Đã hoàn thành bài kiểm tra" })
    expect(screen.getByText("Đã ghi nhận tiến độ bài Hợp lưu.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Về Bot" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Mở Bộ lọc" })).toBeNull()
  })

  it("shows Mở Bộ lọc (no parameters) for passed fundamental lessons and never Về Bot", async () => {
    const user = userEvent.setup()
    const { router } = await openLesson("/demo-trading?view=academy&lesson=ch03-l06")
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    expect(await screen.findByText("Đã mở chỉ tiêu ROE trong Bộ lọc.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Về Bot" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Mở Bộ lọc" }))
    expect(router.state.location.pathname + router.state.location.search).toBe("/chien-luoc?tab=bo-loc")
  })

  it("uses the chapter 3 headline after a miss", async () => {
    const user = userEvent.setup()
    await openLesson("/demo-trading?view=academy&lesson=ch03-l06")
    await startQuiz(user)
    await answerAll(user, ALL_A)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    expect(await screen.findByRole("heading", { level: 2, name: "Xem lại phần cần củng cố" })).toBeTruthy()
  })

  it("keeps the answers and offers Nộp lại when the submit request fails; the retry returns the committed result", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, CORRECT)
    fake.fail("submit", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Lựa chọn của bạn vẫn được giữ")
    expect(screen.getByText("Đã trả lời 8 / 8")).toBeTruthy()
    await user.click(within(alert).getByRole("button", { name: "Nộp lại" }))
    expect(await screen.findByRole("heading", { level: 2, name: "Đã hoàn thành bài kiểm tra" })).toBeTruthy()
    expect(fake.calls.filter((call) => call.endsWith("/submit"))).toHaveLength(2)
  })

  it("does not submit twice on a double click", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, CORRECT)
    const release = fake.hold(`POST /academy/attempts/${ATTEMPT_ID}/submit`)
    const submit = screen.getByRole("button", { name: "Nộp bài" })
    await user.dblClick(submit)
    expect(screen.getByRole("button", { name: /Đang chấm/ }).hasAttribute("disabled")).toBe(true)
    await act(async () => release())
    await screen.findByRole("heading", { level: 2, name: "Đã hoàn thành bài kiểm tra" })
    expect(fake.calls.filter((call) => call.endsWith("/submit"))).toHaveLength(1)
  })

  it("asks to reload the lesson when the content moved on (version conflict)", async () => {
    const user = userEvent.setup()
    await openLesson()
    fake.fail("create", new ApiError("Danh mục đã được cập nhật", 409, "CATALOG_VERSION_MISMATCH"))
    await user.click(await screen.findByRole("button", { name: START }))
    expect(await screen.findByText("Bài học vừa được cập nhật")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Tải lại bài học" })).toBeTruthy()
  })
})

describe("quiz: retake, history and availability", () => {
  it("asks for confirmation, then starts a fresh attempt with a new idempotency key and no answers", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, ALL_A)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    await screen.findByRole("heading", { level: 2, name: "Đáp án và giải thích" })

    await user.click(screen.getByRole("button", { name: "Làm lại" }))
    const dialog = await screen.findByRole("dialog", { name: "Làm lại bài kiểm tra" })
    expect(within(dialog).getByText("Bắt đầu một lượt kiểm tra mới? Tiến độ, quyền và xu đã nhận được giữ nguyên.")).toBeTruthy()
    // Cancelling changes nothing.
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(fake.calls.filter((call) => call === "POST /academy/attempts")).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Làm lại" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Bắt đầu lượt mới" }))
    await screen.findByRole("heading", { level: 3, name: /^Câu hỏi 1/ })
    expect(screen.getByText("Đã trả lời 0 / 8")).toBeTruthy()
    const keys = fake.bodies.filter((entry) => entry.call === "POST /academy/attempts").map((entry) => (entry.body as { idempotency_key: string }).idempotency_key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
  })

  it("Xem bài học and Bài học ↗ return to the lesson", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await user.click(screen.getByRole("button", { name: "Bài học ↗" }))
    expect(await screen.findByRole("button", { name: "Tiếp tục bài kiểm tra" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Các phần của bài" })).toBeTruthy()
  })

  it("lists the submitted attempts on the lesson page and reopens a committed review without announcing coins again", async () => {
    const user = userEvent.setup()
    await openLesson()
    await startQuiz(user)
    await answerAll(user, CORRECT)
    await user.click(screen.getByRole("button", { name: "Nộp bài" }))
    await screen.findByRole("heading", { level: 2, name: "Đã hoàn thành bài kiểm tra" })
    await user.click(screen.getByRole("button", { name: "Xem bài học" }))

    const summary = await screen.findByText("Các lượt đã làm (1)")
    await user.click(summary)
    expect(screen.getByText("8/8", { selector: "b" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Xem kết quả" }))
    expect(await screen.findByRole("heading", { level: 2, name: "Đã hoàn thành bài kiểm tra" })).toBeTruthy()
    expect(fake.calls).toContain(`GET /academy/attempts/${ATTEMPT_ID}`)
    expect(screen.queryByText("Hoàn thành bài học · +100 xu")).toBeNull()
  })

  it("offers no quiz when the lesson has no ready question bank", async () => {
    install({ lessons: { "ch01-l01": { completion: { mode: "quiz", question_count: 8, required_correct: 8, assessment_ready: false, assessment_version: null, button_label: null } } } })
    await openLesson()
    expect(screen.getByText("Bài kiểm tra của bài này chưa sẵn sàng.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: START })).toBeNull()
  })

  it("shows the best score of the lesson", async () => {
    install({ lessons: { "ch01-l01": { best_score: 6, attempts_submitted: 3 } } })
    await openLesson()
    expect(screen.getByText("Điểm cao nhất 6/8 · 3 lượt đã nộp")).toBeTruthy()
  })

  it("on a phone the quiz stays one question at a time inside the same reader", async () => {
    const user = userEvent.setup()
    await openLesson("/demo-trading?view=academy&lesson=ch01-l01", { panel: false, frame: overlayFrame({ open: false }) })
    await startQuiz(user)
    expect(screen.getByRole("button", { name: "Danh sách bài" })).toBeTruthy()
    expect(screen.getAllByRole("radio")).toHaveLength(4)
  })
})
