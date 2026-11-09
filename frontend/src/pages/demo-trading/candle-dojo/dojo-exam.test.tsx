import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DojoExam } from "./dojo-exam"
import { apiError, createDojoBackend, examAnswer, renderDojo, starsForDojos, type DojoBackend, type StateOptions } from "./dojo-test-support"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))

type User = ReturnType<typeof userEvent.setup>

let backend: DojoBackend
const onExit = vi.fn()

function setup(options: StateOptions = { belt: 0, stars: starsForDojos(1) }, dojo = 1) {
  backend = createDojoBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderDojo(<DojoExam dojo={dojo} onExit={onExit} />)
}

const options = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-option]"))
const optionOf = (id: string) => document.querySelector<HTMLButtonElement>(`[data-option="${id}"]`) as HTMLButtonElement
const posts = (suffix: string) => backend.calls.filter((call) => call.method === "POST" && call.path.endsWith(suffix))

async function exam() {
  return screen.findByTestId("dojo-exam")
}

/** Answers question `index` rightly or wrongly and moves on (the last question goes to the result). */
async function answer(user: User, index: number, right: boolean) {
  await waitFor(() => expect(screen.getByTestId("dojo-exam").getAttribute("data-question")).toBe(String(index)))
  const correct = examAnswer(index)
  const wrong = options().find((button) => button.dataset.option !== correct) as HTMLButtonElement
  await user.click(right ? optionOf(correct) : wrong)
  await screen.findByRole("status")
  await user.click(screen.getByRole("button", { name: index === 7 ? "Xem kết quả" : "Câu tiếp" }))
}

async function playAll(user: User, wrongCount: number) {
  for (let index = 0; index < 8; index += 1) await answer(user, index, index >= wrongCount)
}

beforeEach(() => {
  mocks.api.mockReset()
  onExit.mockReset()
})

describe("Candle Dojo belt exam", () => {
  it("starts an attempt for the Dojo and shows the first question with the pattern band and the card names", async () => {
    setup()
    await exam()
    expect(posts("/candle-dojo/exams")).toHaveLength(1)
    expect(posts("/candle-dojo/exams")[0].body).toEqual({ dojo: 1 })
    expect(screen.getByText("Thi đai vàng · câu 1/8")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Vùng tô vàng là mẫu nào?" })).toBeTruthy()
    expect(options().map((button) => button.textContent)).toEqual(["Bullish Marubozu", "Bearish Marubozu", "Doji", "Hammer"])
    // The pattern is the highlighted band on the chart (gold), not a name.
    expect(document.querySelectorAll("svg rect[stroke='#D99A00']")).toHaveLength(1)
    expect(screen.getAllByRole("progressbar")).toHaveLength(1)
  })

  it("tells right from wrong per answer with the server's right answer, then moves on", async () => {
    const user = userEvent.setup()
    setup()
    await exam()
    await user.click(options().find((button) => button.dataset.option !== "marubozu_tang") as HTMLButtonElement)
    const bar = await screen.findByRole("status")
    expect(bar.textContent).toContain("Chưa đúng.")
    expect(bar.textContent).toContain("Đáp án: Bullish Marubozu")
    expect(optionOf("marubozu_tang").dataset.state).toBe("right")
    expect(options().filter((button) => button.dataset.state === "wrong")).toHaveLength(1)
    expect(options().every((button) => button.disabled)).toBe(true)
    expect(posts("/answers")[0].body).toMatchObject({ index: 0 })

    await user.click(screen.getByRole("button", { name: "Câu tiếp" }))
    await waitFor(() => expect(screen.getByText("Thi đai vàng · câu 2/8")).toBeTruthy())
    await user.click(optionOf(examAnswer(1)))
    expect((await screen.findByRole("status")).textContent).toContain("Đúng!")
    expect(optionOf(examAnswer(1)).dataset.state).toBe("right")
  })

  it("passing with 7 of 8 shows Lên đai! with the belt and the reward from the server", async () => {
    const user = userEvent.setup()
    setup()
    await exam()
    await playAll(user, 1)
    const result = await screen.findByTestId("dojo-exam-result")
    expect(result.getAttribute("data-belt-up")).toBe("true")
    expect(within(result).getByRole("heading", { name: "Lên đai!" })).toBeTruthy()
    expect(result.textContent).toContain("Đúng 7/8 · cần 6")
    expect(result.textContent).toContain("Đai vàng · +300 xu · mở Dojo 2")
    expect(within(result).getByRole("img", { name: "Đai vàng" })).toBeTruthy()
    expect(posts("/answers")).toHaveLength(8)
    await user.click(within(result).getByRole("button", { name: "Về Dojo" }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it("failing shows Chưa qua and Thi lại opens a new attempt", async () => {
    const user = userEvent.setup()
    setup()
    await exam()
    await playAll(user, 5)
    const result = await screen.findByTestId("dojo-exam-result")
    expect(result.getAttribute("data-passed")).toBe("false")
    expect(within(result).getByRole("heading", { name: "Chưa qua" })).toBeTruthy()
    expect(result.textContent).toContain("Đúng 3/8 · cần 6")
    expect(result.textContent).toContain("Ôn lại các bài rồi thi lại.")
    expect(result.textContent).not.toContain("+300")

    await user.click(within(result).getByRole("button", { name: "Thi lại" }))
    await exam()
    expect(posts("/candle-dojo/exams")).toHaveLength(2)
    expect(screen.getByText("Thi đai vàng · câu 1/8")).toBeTruthy()
  })

  it("passing again after the belt was won earns no second reward line", async () => {
    const user = userEvent.setup()
    setup({ belt: 1, stars: starsForDojos(1) })
    await exam()
    await playAll(user, 0)
    const result = await screen.findByTestId("dojo-exam-result")
    expect(result.getAttribute("data-belt-up")).toBe("false")
    expect(within(result).getByRole("heading", { name: "Đã qua bài thi" })).toBeTruthy()
    expect(result.textContent).not.toContain("+300")
    expect(result.textContent).toContain("không nhận thêm xu")
  })

  it("the ✕ button leaves at once, mid-exam, without calling anything else", async () => {
    const user = userEvent.setup()
    setup()
    await exam()
    const before = backend.calls.length
    await user.click(screen.getByRole("button", { name: "Thoát bài thi" }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(backend.calls).toHaveLength(before)
  })
})

describe("Candle Dojo belt exam errors", () => {
  it("EXAM_LOCKED explains what is missing and offers only the way back", async () => {
    const user = userEvent.setup()
    setup({ belt: 0, stars: { marubozu: 1 } })
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Học xong mọi bài của Dojo này để mở bài thi đai.")
    expect(within(alert).queryByRole("button")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Về Dojo" }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it("a lost connection while starting offers a retry that opens the exam", async () => {
    const user = userEvent.setup()
    backend = createDojoBackend({ belt: 0, stars: starsForDojos(1) })
    backend.intercept((call) => call.path === "/candle-dojo/exams", () => {
      throw new TypeError("Failed to fetch")
    })
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
    renderDojo(<DojoExam dojo={1} onExit={onExit} />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Không kết nối được máy chủ")
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    await exam()
    expect(screen.getByText("Thi đai vàng · câu 1/8")).toBeTruthy()
  })

  it("a lost connection while answering keeps the question open and Thử lại sends the same choice", async () => {
    const user = userEvent.setup()
    setup()
    await exam()
    backend.intercept((call) => call.path.endsWith("/answers"), () => {
      throw new TypeError("Failed to fetch")
    })
    await user.click(optionOf("marubozu_tang"))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Không kết nối được máy chủ")
    expect(screen.queryByRole("status")).toBeNull()
    expect(options().every((button) => !button.disabled)).toBe(true)
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    expect((await screen.findByRole("status")).textContent).toContain("Đúng!")
    const sent = posts("/answers")
    expect(sent).toHaveLength(2)
    expect(sent[1].body).toEqual(sent[0].body)
  })

  it("EXAM_CLOSED asks for a new attempt, and Thi lại opens one", async () => {
    const user = userEvent.setup()
    setup()
    await exam()
    backend.intercept((call) => call.path.endsWith("/answers"), () => {
      throw apiError(409, "EXAM_CLOSED", "Lượt thi này đã kết thúc. Hãy mở lượt thi mới.")
    })
    await user.click(optionOf("marubozu_tang"))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Lượt thi này đã kết thúc")
    await user.click(within(alert).getByRole("button", { name: "Thi lại" }))
    await waitFor(() => expect(posts("/candle-dojo/exams")).toHaveLength(2))
    await exam()
  })
})
