import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeAcademyApi } from "./test-api"
import { lessonIndicatorEntries } from "./lesson-indicator"
import { renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  Element.prototype.scrollIntoView = vi.fn()
  mocks.api.mockImplementation(createFakeAcademyApi().handler)
})
afterEach(() => vi.unstubAllGlobals())

const open = (id: string) => renderAcademy(`/demo-trading?view=academy&lesson=${id}`, { panel: false })
const header = () => within(screen.getByRole("article")).getByRole("banner")

describe("Thử trên biểu đồ trong bài học", () => {
  it("bài RSI có nút mở /bieu-do?chi-bao=rsi, nằm trong phần đầu bài", async () => {
    open("ch04-l06")
    await screen.findByRole("heading", { level: 2, name: "Bài học 4.6" })
    const link = within(header()).getByRole("link", { name: "Thử trên biểu đồ" })
    expect(link.getAttribute("href")).toBe("/bieu-do?chi-bao=rsi")
    expect(link.getAttribute("data-academy-try-on-chart")).toBe("rsi")
  })

  it("bấm nút thì sang /bieu-do với đúng chỉ báo của bài", async () => {
    const user = userEvent.setup()
    open("ch07-l04")
    await user.click(await screen.findByRole("link", { name: "Thử trên biểu đồ" }))
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/bieu-do?chi-bao=williams_r"))
  })

  it("bài không dạy chỉ báo thì không hiện nút", async () => {
    open("ch01-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 1.1" })
    expect(screen.queryByRole("link", { name: "Thử trên biểu đồ" })).toBeNull()
  })

  it("bài cơ bản về chỉ tiêu tài chính cũng không có nút", async () => {
    open("ch08-l01")
    await screen.findByRole("heading", { level: 2, name: "Bài học 8.1" })
    expect(screen.queryByRole("link", { name: "Thử trên biểu đồ" })).toBeNull()
  })

  it("bài thi và phòng tập không có nút", async () => {
    const first = open("ch04-exam")
    await screen.findByRole("heading", { level: 2, name: "Bài thi Chương 4" })
    expect(screen.queryByRole("link", { name: "Thử trên biểu đồ" })).toBeNull()
    first.unmount()

    open("ch03-practice")
    await screen.findByRole("heading", { level: 2, name: "Phòng tập thực chiến" })
    expect(screen.queryByRole("link", { name: "Thử trên biểu đồ" })).toBeNull()
  })

  it("cả 16 bài chỉ báo đều có nút trỏ đúng chỉ báo", async () => {
    for (const [lessonId, indicator] of lessonIndicatorEntries()) {
      const view = open(lessonId)
      const link = await screen.findByRole("link", { name: "Thử trên biểu đồ" })
      expect(link.getAttribute("href"), lessonId).toBe(`/bieu-do?chi-bao=${indicator}`)
      view.unmount()
    }
  })
})
