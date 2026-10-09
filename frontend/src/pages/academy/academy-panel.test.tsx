import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createFakeAcademyApi } from "./test-api"
import { overlayFrame, renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: ({ mascotId }: { mascotId: string }) => <div data-testid="mascot-stage" data-mascot={mascotId} /> }))

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

async function ready() {
  await within(panel()).findByText("CHƯƠNG 1")
}

describe("AcademyPanel structure", () => {
  it("shows the header, the progress block and 13 chapter groups with their own counts", async () => {
    install({ completed: ["ch01-l01", "ch02-l03", "ch03-l06"] })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()

    expect(within(panel()).getByRole("heading", { name: "Học viện" })).toBeTruthy()
    expect(within(panel()).getByText("13 chương · 71 bài học")).toBeTruthy()
    expect(within(panel()).getByRole("button", { name: "Làm mới Học viện" })).toBeTruthy()

    expect(within(panel()).getByText("Tiến độ học tập", { selector: "span" })).toBeTruthy()
    await waitFor(() => expect(within(panel()).getByText("3 / 71")).toBeTruthy())
    const bar = within(panel()).getByRole("progressbar", { name: "Tiến độ học tập" })
    expect(bar.getAttribute("aria-valuenow")).toBe("3")
    expect(bar.getAttribute("aria-valuemax")).toBe("71")

    const groups = panel().querySelectorAll("[data-chapter]")
    expect(groups).toHaveLength(13)
    const sizes = [...groups].map((group) => within(group as HTMLElement).getAllByRole("listitem", { hidden: true }).length)
    expect(sizes).toEqual([6, 6, 6, 6, 5, 6, 3, 6, 6, 3, 6, 6, 6])
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(71)
    expect(within(chapter(1)).getByText("CHƯƠNG 1")).toBeTruthy()
    expect(within(chapter(1)).getByText("Chỉ báo kỹ thuật nền tảng")).toBeTruthy()
    // x / n per chapter uses the chapter's own size (5 and 3, never 6).
    expect(within(chapter(1)).getByText("1/6")).toBeTruthy()
    expect(within(chapter(5)).getByText("0/5")).toBeTruthy()
    expect(within(chapter(7)).getByText("0/3")).toBeTruthy()
    expect(within(chapter(10)).getByText("0/3")).toBeTruthy()
  })

  it("has exactly a name, an optional ✓ Đã học and one Xem bài button per lesson row, and no config controls", async () => {
    install({ completed: ["ch01-l01"] })
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    await waitFor(() => expect(within(panel()).getByText("Đã học")).toBeTruthy())

    const rows = [...panel().querySelectorAll<HTMLElement>("[data-academy-row]")]
    expect(rows).toHaveLength(71)
    for (const row of rows) {
      expect(within(row).getAllByRole("button", { hidden: true })).toHaveLength(1)
      expect(within(row).getByRole("button", { hidden: true }).textContent).toBe("Xem bài")
    }
    expect(within(panel()).getAllByText("Đã học")).toHaveLength(1)
    const rsi = panel().querySelector('[data-academy-row="ch01-l01"]') as HTMLElement
    expect(within(rsi).getByText("Đã học")).toBeTruthy()

    expect(panel().querySelector('[role="switch"], input[type="checkbox"], [data-config], [data-master], [data-practice]')).toBeNull()
    expect(panel().textContent).not.toMatch(/Cấu hình|Luyện tập|Bật|Tắt|\bON\b|\bOFF\b/)
  })

  it("never shows a fake 0 / 71 while progress is loading or failed, and keeps the confirmed value when a refresh fails", async () => {
    install({ completed: ["ch01-l01", "ch01-l02"] })
    fake.fail("progress", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    expect(within(panel()).queryByText("0 / 71")).toBeNull()
    expect(await within(panel()).findByText("Chưa tải được tiến độ.")).toBeTruthy()
    expect(within(chapter(1)).getByText("—/6")).toBeTruthy()

    await user.click(within(panel()).getByRole("button", { name: "Thử lại" }))
    expect(await within(panel()).findByText("2 / 71")).toBeTruthy()

    fake.fail("progress", new ApiError("Lỗi", 503, "SERVICE_UNAVAILABLE"))
    await user.click(within(panel()).getByRole("button", { name: "Làm mới Học viện" }))
    expect(await within(panel()).findByText("Chưa làm mới được tiến độ.")).toBeTruthy()
    // The confirmed value and every "Đã học" mark stay.
    expect(within(panel()).getByText("2 / 71")).toBeTruthy()
    expect(within(chapter(1)).getByText("2/6")).toBeTruthy()
  })

  it("shows an error with Thử lại when the catalog cannot be read", async () => {
    fake.fail("catalog", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    expect(await within(panel()).findByText("Chưa tải được danh sách bài học")).toBeTruthy()
    expect(panel().querySelectorAll("[data-chapter]")).toHaveLength(0)
    await user.click(within(panel()).getAllByRole("button", { name: "Thử lại" }).at(-1) as HTMLElement)
    await ready()
    expect(panel().querySelectorAll("[data-chapter]")).toHaveLength(13)
  })
})

describe("AcademyPanel chapter open state", () => {
  it("opens only Chương 1 on the first visit", async () => {
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    expect(chapterButton(1).getAttribute("aria-expanded")).toBe("true")
    for (let no = 2; no <= 13; no += 1) expect(chapterButton(no).getAttribute("aria-expanded")).toBe("false")
    // Lessons of a closed chapter are hidden from the accessibility tree and the tab order.
    expect(within(chapter(2)).queryAllByRole("button", { name: /Xem bài/ })).toHaveLength(0)
    expect(within(chapter(1)).getAllByRole("button", { name: /Xem bài/ })).toHaveLength(6)
  })

  it("lets several chapters be open at once and all of them be closed, and a refresh never re-opens Chương 1", async () => {
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy", { main: false })
    await ready()
    await user.click(chapterButton(3))
    await user.click(chapterButton(5))
    expect(chapterButton(3).getAttribute("aria-expanded")).toBe("true")
    expect(chapterButton(5).getAttribute("aria-expanded")).toBe("true")
    await user.click(chapterButton(1))
    await user.click(chapterButton(3))
    await user.click(chapterButton(5))
    for (let no = 1; no <= 13; no += 1) expect(chapterButton(no).getAttribute("aria-expanded")).toBe("false")

    const catalogCalls = fake.count("GET /academy/catalog")
    await user.click(within(panel()).getByRole("button", { name: "Làm mới Học viện" }))
    await waitFor(() => expect(fake.count("GET /academy/catalog")).toBeGreaterThan(catalogCalls))
    for (let no = 1; no <= 13; no += 1) expect(chapterButton(no).getAttribute("aria-expanded")).toBe("false")
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

describe("AcademyPanel opening lessons", () => {
  it("opens the lesson and its chapter from a deep link (view=academy&lesson=…), marking the row as current", async () => {
    renderAcademy("/demo-trading?view=academy&lesson=ch07-l01")
    await ready()
    expect(chapterButton(7).getAttribute("aria-expanded")).toBe("true")
    const row = panel().querySelector('[data-academy-row="ch07-l01"]') as HTMLElement
    expect(within(row).getByRole("button", { name: "Xem bài Bài 7.1" }).getAttribute("aria-current")).toBe("true")
    expect(await screen.findByRole("heading", { level: 2, name: "Tiêu đề Bài 7.1" })).toBeTruthy()
    expect(screen.queryByTestId("mascot-stage")).toBeNull()
    expect(fake.calls).toContain("GET /academy/lessons/ch07-l01")
  })

  it("Xem bài opens that lesson on the left and keeps the panel and the other chapters as they were", async () => {
    const user = userEvent.setup()
    const { router } = renderAcademy("/demo-trading?view=academy&symbol=FPT&content=chart")
    await ready()
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
    await user.click(within(chapter(1)).getByRole("button", { name: "Xem bài MACD" }))
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT&lesson=ch01-l02")
    expect(await screen.findByRole("heading", { level: 2, name: "Tiêu đề MACD" })).toBeTruthy()
    expect(chapterButton(1).getAttribute("aria-expanded")).toBe("true")

    await user.click(screen.getByRole("button", { name: "Về linh thú" }))
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT")
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
    expect(chapterButton(1).getAttribute("aria-expanded")).toBe("true")
  })

  it("does not complete or reward anything by opening, switching or leaving a lesson", async () => {
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy")
    await ready()
    await user.click(within(chapter(1)).getByRole("button", { name: "Xem bài RSI" }))
    await screen.findByRole("heading", { level: 2, name: "Tiêu đề RSI" })
    await user.click(within(chapter(1)).getByRole("button", { name: "Xem bài MACD" }))
    await screen.findByRole("heading", { level: 2, name: "Tiêu đề MACD" })
    await user.click(screen.getByRole("button", { name: "Về linh thú" }))
    expect(fake.calls.filter((call) => /^(POST|PUT)/.test(call))).toEqual([])
  })

  it("on a phone choosing a lesson closes the list layer so it can be read", async () => {
    const user = userEvent.setup()
    const frame = overlayFrame()
    renderAcademy("/demo-trading?view=academy", { main: false, frame })
    await ready()
    await user.click(within(chapter(1)).getByRole("button", { name: "Xem bài RSI" }))
    expect(frame.setOpen).toHaveBeenCalledWith(false)
  })

  it("on a wide screen choosing a lesson does not touch the panel", async () => {
    const user = userEvent.setup()
    const frame = overlayFrame({ overlay: false })
    renderAcademy("/demo-trading?view=academy", { main: false, frame })
    await ready()
    await user.click(within(chapter(1)).getByRole("button", { name: "Xem bài RSI" }))
    expect(frame.setOpen).not.toHaveBeenCalled()
  })
})
