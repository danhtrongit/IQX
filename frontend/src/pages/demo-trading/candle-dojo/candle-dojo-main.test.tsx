import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CD_LESSONS } from "@/lib/candle-dojo/lessons"
import { formatXu } from "../shop/shop-model"
import { CandleDojoMain } from "./candle-dojo-main"
import {
  apiError,
  createDojoBackend,
  renderDojo,
  starsForDojos,
  type DojoBackend,
  type StateOptions,
} from "./dojo-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: { id: "user-1", username: "an", full_name: "An Nguyen" } as { id: string; username: string; full_name: string } | null,
  openAuth: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: mocks.user !== null, openAuth: mocks.openAuth }),
}))
vi.mock("./lesson/lesson-player", () => ({
  LessonPlayer: (props: { lessonId: string; preview: boolean; onExit: () => void; onFinished?: () => void }) => (
    <div data-testid="lesson-player" data-lesson={props.lessonId} data-preview={String(props.preview)}>
      <button type="button" onClick={props.onExit}>Thoát bài học</button>
      <button type="button" onClick={props.onFinished}>Xong bài học</button>
    </div>
  ),
}))
vi.mock("./lesson/drill-player", () => ({
  DrillPlayer: (props: { lessonId: string; preview: boolean; onExit: () => void }) => (
    <div data-testid="drill-player" data-lesson={props.lessonId} data-preview={String(props.preview)}>
      <button type="button" onClick={props.onExit}>Thoát luyện công</button>
    </div>
  ),
}))

let backend: DojoBackend
const onOpenShop = vi.fn()

function setup(options: StateOptions = {}) {
  backend = createDojoBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderDojo(<CandleDojoMain onOpenShop={onOpenShop} />)
}

const lessonRow = (id: string) => document.querySelector<HTMLButtonElement>(`[data-lesson="${id}"]`)
const examRow = (dojo: number) => document.querySelector<HTMLButtonElement>(`[data-exam="${dojo}"]`)
const lockedDojos = () => Array.from(document.querySelectorAll("[data-dojo-locked]")).map((node) => node.getAttribute("data-dojo-locked"))
const drill = () => screen.getByTestId("dojo-drill")
const stateReads = () => backend.callsTo("GET", "/candle-dojo/state").length

async function ready() {
  return screen.findByTestId("dojo-home")
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.openAuth.mockReset()
  onOpenShop.mockReset()
  mocks.user = { id: "user-1", username: "an", full_name: "An Nguyen" }
})

describe("Candle Dojo home", () => {
  it("shows a new learner with no belt, the server's xu, no cards and only Nhập môn open", async () => {
    setup({ belt: -1, balance: 1500, streak: 0 })
    await ready()
    expect(screen.getByRole("heading", { name: /Candle Dojo/ })).toBeTruthy()
    expect(screen.getByTestId("dojo-belt-card").textContent).toContain("Chưa có đai")
    expect(screen.getByTestId("dojo-balance").textContent).toBe(`${formatXu(1500)} xu`)
    expect(screen.getByTestId("dojo-cards-count").textContent).toBe("0 / 47")
    const intro = document.querySelector<HTMLButtonElement>("[data-intro='anatomy']")
    expect(intro?.hasAttribute("data-current")).toBe(true)
    expect(intro?.disabled).toBe(false)
    expect(lockedDojos()).toEqual(["1", "2", "3", "4", "5"])
    expect(drill().getAttribute("data-state")).toBe("locked")
    expect(drill().textContent).toContain("Mở khi bạn có đai vàng.")
  })

  it("draws stars, the next lesson to learn and locks the lessons and Dojos that are not open yet", async () => {
    setup({ belt: 0, stars: { marubozu: 2 }, owned: ["marubozu_tang", "marubozu_giam", "doji"] })
    await ready()
    expect(screen.getByTestId("dojo-belt-card").textContent).toContain("Đai trắng")
    expect(screen.getByTestId("dojo-cards-count").textContent).toBe("3 / 47")
    expect(lessonRow("marubozu")?.querySelector("[data-stars='2']")).toBeTruthy()
    expect(lessonRow("marubozu")?.disabled).toBe(false)
    expect(lessonRow("doji")?.hasAttribute("data-current")).toBe(true)
    expect(lessonRow("doji")?.disabled).toBe(false)
    expect(lessonRow("hammer")?.disabled).toBe(true)
    expect(lessonRow("hammer")?.hasAttribute("data-locked")).toBe(true)
    expect(lockedDojos()).toEqual(["2", "3", "4", "5"])
    expect(within(document.querySelector("[data-dojo='1']") as HTMLElement).getByText("1/6")).toBeTruthy()
    // The exam of Dojo 1 stays closed until every lesson has a star.
    expect(examRow(1)?.disabled).toBe(true)
    expect(examRow(1)?.textContent).toContain("Học xong mọi bài của Dojo này để mở bài thi đai.")
  })

  it("opens the exam when every lesson of the Dojo has a star and marks passed belts", async () => {
    setup({ belt: 0, stars: starsForDojos(1) })
    await ready()
    expect(examRow(1)?.disabled).toBe(false)
    expect(examRow(1)?.textContent).toContain("8 câu · đúng 6 để nhận đai")
    expect(examRow(1)?.textContent).toContain("Thi")
    expect(lockedDojos()).toEqual(["2", "3", "4", "5"])
  })

  it("after the yellow belt opens Dojo 2, shows the Dojo 1 exam as done and unlocks the drill", async () => {
    setup({ belt: 1, stars: starsForDojos(1), streak: 4 })
    await ready()
    expect(screen.getByTestId("dojo-belt-card").textContent).toContain("Đai vàng")
    expect(lockedDojos()).toEqual(["3", "4", "5"])
    expect(examRow(1)?.querySelector("[role='img'][aria-label='Đã qua bài thi']")).toBeTruthy()
    expect(lessonRow("engulfing")?.disabled).toBe(false)
    expect(lessonRow("harami")?.disabled).toBe(true)
    expect(drill().getAttribute("data-state")).toBe("ready")
    expect(drill().textContent).toContain("giữ chuỗi 4 ngày")
    expect(drill().textContent).toContain("+20 xu mỗi ngày")
    expect(screen.getByTestId("dojo-streak").getAttribute("aria-label")).toBe("Chuỗi luyện công 4 ngày")
  })

  it("starts the drill on a lesson the learner has studied, and shows the done state when already done today", async () => {
    const user = userEvent.setup()
    vi.spyOn(Math, "random").mockReturnValue(0.99)
    setup({ belt: 1, stars: starsForDojos(1), streak: 4, drillDoneToday: true })
    await ready()
    expect(drill().getAttribute("data-state")).toBe("done")
    expect(drill().textContent).toContain("Hôm nay đã luyện xong · chuỗi 4 ngày")
    await user.click(within(drill()).getByRole("button", { name: "Luyện thêm" }))
    const player = await screen.findByTestId("drill-player")
    const dojo1 = CD_LESSONS.filter((lesson) => lesson.dojo === 1)
    expect(player.getAttribute("data-lesson")).toBe(dojo1[dojo1.length - 1].id)
    expect(player.getAttribute("data-preview")).toBe("false")
  })

  it("opens a lesson, and coming back reads the server state again", async () => {
    const user = userEvent.setup()
    setup({ belt: 0, stars: { marubozu: 1 } })
    await ready()
    const reads = stateReads()
    await user.click(lessonRow("doji") as HTMLElement)
    const player = await screen.findByTestId("lesson-player")
    expect(player.getAttribute("data-lesson")).toBe("doji")
    expect(player.getAttribute("data-preview")).toBe("false")
    expect(screen.queryByTestId("dojo-home")).toBeNull()
    backend.setState({ belt: 0, stars: { marubozu: 1, doji: 3 }, balance: 1600 })
    await user.click(screen.getByRole("button", { name: "Xong bài học" }))
    await ready()
    await waitFor(() => expect(stateReads()).toBeGreaterThan(reads))
    await waitFor(() => expect(lessonRow("doji")?.querySelector("[data-stars='3']")).toBeTruthy())
    expect(screen.getByTestId("dojo-balance").textContent).toBe(`${formatXu(1600)} xu`)
  })

  it("the Thẻ nến block links to the Shop", async () => {
    const user = userEvent.setup()
    setup({ belt: 0 })
    await ready()
    await user.click(within(screen.getByTestId("dojo-cards-block")).getByRole("button", { name: "Mở Shop › Thẻ nến" }))
    expect(onOpenShop).toHaveBeenCalledTimes(1)
  })
})

describe("Candle Dojo preview mode", () => {
  it("unlocks every Dojo, lesson and the drill for looking around, labelled as a preview, without any write call", async () => {
    const user = userEvent.setup()
    vi.spyOn(Math, "random").mockReturnValue(0.99)
    setup({ belt: -1, balance: 1500 })
    await ready()
    expect(lockedDojos()).toHaveLength(5)
    expect(screen.queryByTestId("dojo-preview-banner")).toBeNull()

    await user.click(screen.getByRole("switch", { name: "Chế độ xem trước" }))
    expect(screen.getByTestId("dojo-preview-banner").textContent).toContain("không thay đổi")
    expect(lockedDojos()).toEqual([])
    expect(CD_LESSONS.every((lesson) => lessonRow(lesson.id)?.disabled === false)).toBe(true)
    expect(drill().getAttribute("data-state")).toBe("ready")
    expect(screen.getByTestId("dojo-balance").textContent).toBe(`${formatXu(1500)} xu`)
    expect(screen.getByTestId("dojo-belt-card").textContent).toContain("Chưa có đai")

    // A lesson that is locked for real opens, and the player is told it is a preview.
    await user.click(lessonRow("hammer") as HTMLElement)
    expect((await screen.findByTestId("lesson-player")).getAttribute("data-preview")).toBe("true")
    await user.click(screen.getByRole("button", { name: "Thoát bài học" }))
    await ready()
    // The preview survives the round trip, and the drill picks from every lesson.
    expect(screen.getByTestId("dojo-preview-banner")).toBeTruthy()
    await user.click(within(drill()).getByRole("button", { name: "Bắt đầu" }))
    const player = await screen.findByTestId("drill-player")
    expect(player.getAttribute("data-lesson")).toBe(CD_LESSONS[CD_LESSONS.length - 1].id)
    expect(player.getAttribute("data-preview")).toBe("true")
    expect(backend.writes()).toEqual([])
  })

  it("keeps the belt exams closed in preview, because exam questions and answers live on the server", async () => {
    const user = userEvent.setup()
    setup({ belt: 0, stars: starsForDojos(1) })
    await ready()
    expect(examRow(1)?.disabled).toBe(false)
    await user.click(screen.getByRole("switch", { name: "Chế độ xem trước" }))
    for (const dojo of [1, 2, 3, 4, 5]) {
      expect(examRow(dojo)?.disabled).toBe(true)
      expect(examRow(dojo)?.textContent).toContain("tắt chế độ xem trước để thi")
    }
    await user.click(examRow(1) as HTMLElement)
    expect(screen.queryByTestId("dojo-exam-loading")).toBeNull()
    expect(backend.writes()).toEqual([])
  })

  it("turning the preview off locks the screen again", async () => {
    const user = userEvent.setup()
    setup({ belt: 0 })
    await ready()
    await user.click(screen.getByRole("switch", { name: "Chế độ xem trước" }))
    expect(lockedDojos()).toEqual([])
    await user.click(screen.getByRole("switch", { name: "Chế độ xem trước" }))
    expect(lockedDojos()).toEqual(["2", "3", "4", "5"])
    expect(screen.queryByTestId("dojo-preview-banner")).toBeNull()
    expect(lessonRow("hammer")?.disabled).toBe(true)
  })
})

describe("Candle Dojo states", () => {
  it("asks a signed-out visitor to sign in and calls nothing", async () => {
    const user = userEvent.setup()
    mocks.user = null
    setup()
    expect(await screen.findByText("Đăng nhập để vào Candle Dojo")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))
    expect(mocks.openAuth).toHaveBeenCalledWith("login")
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("shows a content-shaped skeleton while the progress loads", () => {
    mocks.api.mockImplementation(() => new Promise(() => undefined))
    renderDojo(<CandleDojoMain onOpenShop={onOpenShop} />)
    expect(screen.getByRole("status", { name: "Đang tải Candle Dojo" })).toBeTruthy()
  })

  it("explains a failed load and retries", async () => {
    const user = userEvent.setup()
    backend = createDojoBackend({ belt: 0 })
    backend.intercept((call) => call.path === "/candle-dojo/state", () => {
      throw apiError(500, "INTERNAL", "boom")
    })
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
    renderDojo(<CandleDojoMain onOpenShop={onOpenShop} />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chưa tải được tiến độ Candle Dojo")
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    await ready()
    expect(screen.getByTestId("dojo-belt-card").textContent).toContain("Đai trắng")
  })
})
