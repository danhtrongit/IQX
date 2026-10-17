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
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({
  MascotStage: ({ mascotId }: { mascotId: string }) => <div data-testid="mascot-stage" data-mascot={mascotId} />,
}))

let fake: ReturnType<typeof createFakeAcademyApi>

function install(options: Parameters<typeof createFakeAcademyApi>[0] = {}) {
  fake = createFakeAcademyApi(options)
  mocks.api.mockImplementation(fake.handler)
}

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  install()
})
afterEach(() => vi.unstubAllGlobals())

const panel = () => screen.getByRole("complementary", { name: "Học viện" })
const chapter = (no: number) => panel().querySelector<HTMLElement>(`[data-chapter="${no}"]`) as HTMLElement
const chapterButton = (no: number) => within(chapter(no)).getAllByRole("button")[0]
const row = (id: string) => panel().querySelector<HTMLElement>(`[data-academy-row="${id}"]`) as HTMLElement

async function ready() {
  await within(panel()).findByText("Chương 1 · Nền tảng")
  await waitFor(() => expect(row("ch01-l01").getAttribute("data-state")).not.toBe("unknown"))
}

describe("AcademyPanel structure", () => {
  it("shows Học viện, 43 bài học, the progress x / 43 and the five published chapters", async () => {
    install({ completed: ["concept:ch01_l01", "concept:ch01_l02"] })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()

    expect(within(panel()).getByRole("heading", { name: "Học viện" })).toBeTruthy()
    expect(within(panel()).getByText("43 bài học")).toBeTruthy()
    expect(within(panel()).getByText("2 / 43")).toBeTruthy()
    const bar = within(panel()).getByRole("progressbar", { name: "Tiến độ học tập" })
    expect(bar.getAttribute("aria-valuenow")).toBe("2")
    expect(bar.getAttribute("aria-valuemax")).toBe("43")

    const groups = [...panel().querySelectorAll<HTMLElement>("[data-chapter]")]
    expect(groups.map((group) => within(group).getAllByRole("button")[0].textContent)).toEqual([
      expect.stringContaining("Chương 1 · Nền tảng"),
      expect.stringContaining("Chương 2 · Kỹ năng Sale SACO"),
      expect.stringContaining("Chương 3 · Thương hiệu cá nhân"),
      expect.stringContaining("Chương 4 · Phương pháp kỹ thuật"),
      expect.stringContaining("Chương 5 · Phương pháp cơ bản"),
    ])
    // Every item of every chapter is listed: lessons + exam (+ the practice room in chapter 3).
    const sizes = groups.map((group) => group.querySelectorAll("[data-academy-row]").length)
    expect(sizes).toEqual([11, 11, 11, 11, 5])
    expect(within(chapter(1)).getByText("2/10")).toBeTruthy()
    expect(within(chapter(5)).getByText("0/4")).toBeTruthy()
  })

  it("renders the server states: Xem lại for passed, Học bài for the open lesson, a lock for the rest", async () => {
    install({ completed: ["concept:ch01_l01"] })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()

    expect(within(row("ch01-l01")).getByRole("button").textContent).toBe("Xem lại")
    expect(within(row("ch01-l02")).getByRole("button").textContent).toBe("Học bài")
    for (const id of ["ch01-l03", "ch01-l10", "ch01-exam"]) {
      expect(within(row(id)).queryByRole("button")).toBeNull()
      expect(within(row(id)).getByText("Chưa mở").closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true")
    }
    // Exactly one control per row, never a switch or a config control.
    for (const element of panel().querySelectorAll<HTMLElement>("[data-academy-row]")) {
      expect(within(element).queryAllByRole("button", { hidden: true }).length).toBeLessThanOrEqual(1)
    }
    expect(panel().querySelector('[role="switch"], input[type="checkbox"]')).toBeNull()
    expect(panel().textContent).not.toMatch(/Cấu hình|Luyện tập|\bON\b|\bOFF\b/)
  })

  it("shows Làm bài on an open exam, and the practice room with Tự chọn after the chapter 3 exam", async () => {
    install({ completed: keysBefore("ch04-l01") })
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    await user.click(chapterButton(3))
    const practice = row("ch03-practice")
    expect(within(practice).getByText("Phòng tập thực chiến")).toBeTruthy()
    expect(within(practice).getByText("Tự chọn")).toBeTruthy()
    expect(within(practice).getByRole("button").textContent).toBe("Học bài")
    // The practice room comes right after "Bài thi Chương 3".
    const ids = [...chapter(3).querySelectorAll("[data-academy-row]")].map((element) => element.getAttribute("data-academy-row"))
    expect(ids.slice(-2)).toEqual(["ch03-exam", "ch03-practice"])
    // Chapter 4 lesson 1 opened at the same time.
    expect(within(row("ch04-l01")).getByRole("button").textContent).toBe("Học bài")
  })

  it("labels an open chapter exam Làm bài", async () => {
    install({ completed: keysBefore("ch01-exam") })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    expect(within(row("ch01-exam")).getByText("Bài thi Chương 1")).toBeTruthy()
    expect(within(row("ch01-exam")).getByRole("button").textContent).toBe("Làm bài")
    expect(within(row("ch02-l01")).queryByRole("button")).toBeNull()
  })

  it("keeps a migrated indicator lesson reviewable while the chain before it is locked", async () => {
    install({ completed: [keyOf("ch04-l06")] })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    expect(within(row("ch01-l01")).getByRole("button").textContent).toBe("Học bài")
    expect(row("ch04-l06").getAttribute("data-state")).toBe("passed")
    expect(within(row("ch04-l05")).queryByRole("button")).toBeNull()
  })

  it("never shows a fake 0 / 43 while progress is loading or failed, and keeps the confirmed value when a refresh fails", async () => {
    install({ completed: ["concept:ch01_l01", "concept:ch01_l02"] })
    fake.fail("progress", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    await within(panel()).findByText("Chương 1 · Nền tảng")
    expect(within(panel()).queryByText("0 / 43")).toBeNull()
    expect(await within(panel()).findByText("Chưa tải được tiến độ.")).toBeTruthy()
    // Without progress no row offers a control (states are never guessed on the client).
    expect(within(row("ch01-l01")).queryByRole("button")).toBeNull()

    await user.click(within(panel()).getByRole("button", { name: "Thử lại" }))
    expect(await within(panel()).findByText("2 / 43")).toBeTruthy()

    fake.fail("progress", new ApiError("Lỗi", 503, "SERVICE_UNAVAILABLE"))
    await user.click(within(panel()).getByRole("button", { name: "Làm mới Học viện" }))
    expect(await within(panel()).findByText("Chưa làm mới được tiến độ.")).toBeTruthy()
    expect(within(panel()).getByText("2 / 43")).toBeTruthy()
    expect(within(row("ch01-l01")).getByRole("button").textContent).toBe("Xem lại")
  })

  it("shows an error with Thử lại when the catalog cannot be read", async () => {
    fake.fail("catalog", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    expect(await within(panel()).findByText("Chưa tải được danh sách bài học")).toBeTruthy()
    expect(panel().querySelectorAll("[data-chapter]")).toHaveLength(0)
    await user.click(within(panel()).getAllByRole("button", { name: "Thử lại" }).at(-1) as HTMLElement)
    await ready()
    expect(panel().querySelectorAll("[data-chapter]")).toHaveLength(5)
  })
})

describe("AcademyPanel chapter open state", () => {
  it("opens the chapter of the current item on the first visit", async () => {
    install({ completed: keysBefore("ch02-l03") })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    await waitFor(() => expect(chapterButton(2).getAttribute("aria-expanded")).toBe("true"))
    for (const no of [1, 3, 4, 5]) expect(chapterButton(no).getAttribute("aria-expanded")).toBe("false")
    // Rows of a closed chapter are out of the accessibility tree.
    expect(within(chapter(1)).queryAllByRole("button", { name: /Xem lại/ })).toHaveLength(0)
  })

  it("lets several chapters be open at once and all be closed, and a refresh never re-opens one", async () => {
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    expect(chapterButton(1).getAttribute("aria-expanded")).toBe("true")
    await user.click(chapterButton(3))
    await user.click(chapterButton(5))
    expect(chapterButton(3).getAttribute("aria-expanded")).toBe("true")
    expect(chapterButton(5).getAttribute("aria-expanded")).toBe("true")
    for (const no of [1, 3, 5]) await user.click(chapterButton(no))
    for (let no = 1; no <= 5; no += 1) expect(chapterButton(no).getAttribute("aria-expanded")).toBe("false")

    const catalogCalls = fake.count("GET /academy/catalog")
    await user.click(within(panel()).getByRole("button", { name: "Làm mới Học viện" }))
    await waitFor(() => expect(fake.count("GET /academy/catalog")).toBeGreaterThan(catalogCalls))
    for (let no = 1; no <= 5; no += 1) expect(chapterButton(no).getAttribute("aria-expanded")).toBe("false")
  })

  it("remembers the open chapters for the session when the panel is remounted", async () => {
    const user = userEvent.setup()
    const first = renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    await user.click(chapterButton(4))
    await user.click(chapterButton(1))
    first.unmount()

    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    expect(chapterButton(4).getAttribute("aria-expanded")).toBe("true")
    expect(chapterButton(1).getAttribute("aria-expanded")).toBe("false")
  })
})

describe("AcademyPanel opening items", () => {
  it("opens the item and its chapter from a deep link, marking the row as current", async () => {
    install({ completed: keysBefore("ch02-l02") })
    renderAcademy("/demo-trading?view=academy&lesson=ch02-l01")
    await ready()
    expect(chapterButton(2).getAttribute("aria-expanded")).toBe("true")
    expect(within(row("ch02-l01")).getByRole("button", { name: "Xem lại Bài học 2.1" }).getAttribute("aria-current")).toBe("true")
    expect(row("ch02-l01").className).toContain("bg-primary/10")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 2.1" })).toBeTruthy()
    expect(screen.queryByTestId("mascot-stage")).toBeNull()
    expect(fake.calls).toContain("GET /academy/lessons/ch02-l01")
  })

  it("Học bài opens the item on the left and keeps the other URL parameters", async () => {
    const user = userEvent.setup()
    const { router } = renderAcademy("/demo-trading?view=academy&symbol=FPT&content=chart")
    await ready()
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
    await user.click(within(row("ch01-l01")).getByRole("button", { name: "Học bài Bài học 1.1" }))
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT&lesson=ch01-l01")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Về linh thú" }))
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT")
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
  })

  it("does not complete or reward anything by opening, switching or leaving an item", async () => {
    install({ completed: ["concept:ch01_l01"] })
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy")
    await ready()
    await user.click(within(row("ch01-l01")).getByRole("button"))
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
    await user.click(within(row("ch01-l02")).getByRole("button"))
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.2" })
    await user.click(screen.getByRole("button", { name: "Về linh thú" }))
    expect(fake.calls.filter((call) => /^(POST|PUT)/.test(call))).toEqual([])
  })

  it("on a phone choosing an item closes the list layer; on a wide screen it does not", async () => {
    const user = userEvent.setup()
    const frame = overlayFrame()
    const first = renderAcademy("/demo-trading?view=academy", { main: false, frame })
    await ready()
    await user.click(within(row("ch01-l01")).getByRole("button"))
    expect(frame.setOpen).toHaveBeenCalledWith(false)
    first.unmount()

    const wide = overlayFrame({ overlay: false })
    renderAcademy("/demo-trading?view=academy", { main: false, frame: wide })
    await ready()
    await user.click(within(row("ch01-l01")).getByRole("button"))
    expect(wide.setOpen).not.toHaveBeenCalled()
  })
})
