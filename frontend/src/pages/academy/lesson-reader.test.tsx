import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createFakeAcademyApi } from "./test-api"
import { overlayFrame, renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))

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
  Element.prototype.scrollIntoView = scrollIntoView
  install()
})
afterEach(() => vi.unstubAllGlobals())

const reader = () => screen.getByRole("article")
const heading = (name: string) => screen.findByRole("heading", { level: 2, name })

describe("LessonReader header and sections", () => {
  it("shows Về linh thú, Bài x / n, Chương n · title, the lesson title, the lead and ✓ Đã học", async () => {
    install({ completed: ["ch01-l02"] })
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l02", { panel: false })
    await heading("Tiêu đề MACD")
    expect(screen.getByRole("button", { name: "Về linh thú" })).toBeTruthy()
    await waitFor(() => expect(within(reader()).getByText("Bài 2 / 6")).toBeTruthy())
    expect(within(reader()).getByText("Chương 1 · Chỉ báo kỹ thuật nền tảng")).toBeTruthy()
    expect(within(reader()).getByText("Đoạn dẫn của bài MACD.")).toBeTruthy()
    expect(within(reader()).getByText("Đã học")).toBeTruthy()
  })

  it("shows no Đã học and no coin line for a lesson that is not completed", async () => {
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l02", { panel: false })
    await heading("Tiêu đề MACD")
    expect(within(reader()).queryByText("Đã học")).toBeNull()
    expect(within(reader()).queryByText(/Đã nhận/)).toBeNull()
  })

  it("lists the four parts from nav_labels and scrolls only to the chosen section", async () => {
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l01", { panel: false })
    await heading("Tiêu đề RSI")
    const nav = screen.getByRole("navigation", { name: "Các phần của bài" })
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["01 · Khái niệm", "02 · Công thức", "03 · Tham số", "04 · Vận dụng"])
    await user.click(within(nav).getByRole("button", { name: "03 · Tham số" }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).id).toBe("academy-section-3")
    expect(document.getElementById("academy-section-title-3")?.textContent).toContain("Chu kỳ và hai ngưỡng")
  })

  it("falls back to the section titles when a lesson has no nav labels (legacy chapters)", async () => {
    install({ lessons: { "ch05-l01": { nav_labels: null, lead: null } } })
    renderAcademy("/demo-trading?view=academy&lesson=ch05-l01", { panel: false })
    await heading("Tiêu đề Bài 5.1")
    const nav = screen.getByRole("navigation", { name: "Các phần của bài" })
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "01 · Khái niệm và cách đọc",
      "02 · Công thức và ví dụ tính",
      "03 · Chu kỳ và hai ngưỡng",
      "04 · Tín hiệu và cách vận dụng",
    ])
  })

  it("renders every section with its blocks, in order", async () => {
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l01", { panel: false })
    await heading("Tiêu đề RSI")
    const sections = reader().querySelectorAll("section[id^=academy-section-]")
    expect(sections).toHaveLength(4)
    expect(within(sections[0] as HTMLElement).getByRole("img", { name: /Giá đóng cửa và RSI 14/ })).toBeTruthy()
    expect(within(sections[1] as HTMLElement).getByRole("table")).toBeTruthy()
    expect(within(sections[2] as HTMLElement).getByText("Chọn cổ phiếu")).toBeTruthy()
    expect(within(sections[3] as HTMLElement).getByTestId("signal-pair")).toBeTruthy()
    expect(reader().textContent).toContain("RS =")
  })
})

describe("LessonReader states", () => {
  it("shows the name and a short note, and no actions, for a lesson that is not published", async () => {
    install({ lessons: { "ch06-l02": { content_status: "not_published", content_version: null, sections: [], charts: {}, nav_labels: null, lead: null, title: "Bài 6.2", completion: { mode: "quiz", question_count: 8, required_correct: 8, assessment_ready: false, assessment_version: null, button_label: null } } } })
    renderAcademy("/demo-trading?view=academy&lesson=ch06-l02", { panel: false })
    await heading("Bài 6.2")
    expect(screen.getByText("Nội dung chưa được xuất bản")).toBeTruthy()
    expect(within(reader()).queryByRole("button", { name: /Làm bài kiểm tra|Hoàn thành bài học|Tiếp tục/ })).toBeNull()
    expect(within(reader()).queryByRole("navigation", { name: "Các phần của bài" })).toBeNull()
    expect(within(reader()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Về linh thú"])
  })

  it("explains a lesson that is unknown to the catalog and offers the way back", async () => {
    renderAcademy("/demo-trading?view=academy&lesson=ch99-l99", { panel: false })
    expect(await screen.findByText("Không tìm thấy bài học")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Về linh thú" })).toBeTruthy()
  })

  it("keeps a failed lesson read separate from progress: error + Thử lại, and the learned mark stays in the panel (C10)", async () => {
    install({ completed: ["ch01-l01"] })
    fake.fail("lesson", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l01")
    expect(await screen.findByText("Chưa tải được nội dung bài học")).toBeTruthy()
    const panel = screen.getByRole("complementary", { name: "Học viện" })
    await waitFor(() => expect(within(panel).getByText("Đã học")).toBeTruthy())
    await waitFor(() => expect(within(panel).getByText("1 / 71")).toBeTruthy())
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    await heading("Tiêu đề RSI")
    expect(within(panel).getByText("1 / 71")).toBeTruthy()
  })

  it("never paints a slow response of lesson A over lesson B (R08)", async () => {
    const release = fake.hold("/academy/lessons/ch01-l01")
    const { router } = renderAcademy("/demo-trading?view=academy&lesson=ch01-l01", { panel: false })
    await waitFor(() => expect(fake.calls).toContain("GET /academy/lessons/ch01-l01"))
    await act(async () => {
      await router.navigate("/demo-trading?view=academy&lesson=ch01-l02")
    })
    await heading("Tiêu đề MACD")
    await act(async () => release())
    await waitFor(() => expect(fake.count("GET /academy/lessons/ch01-l01")).toBe(1))
    expect(screen.getByRole("heading", { level: 2, name: "Tiêu đề MACD" })).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 2, name: "Tiêu đề RSI" })).toBeNull()
  })
})

describe("LessonReader navigation", () => {
  it("links to the previous and next lesson of the chapter and opens them", async () => {
    const user = userEvent.setup()
    const { router } = renderAcademy("/demo-trading?view=academy&lesson=ch01-l02", { panel: false })
    await heading("Tiêu đề MACD")
    const nav = await screen.findByRole("navigation", { name: "Bài trước và bài sau" })
    expect(within(nav).getByRole("button", { name: "RSI" })).toBeTruthy()
    await user.click(within(nav).getByRole("button", { name: "MA / SMA" }))
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-l03")
    await heading("Tiêu đề MA / SMA")
  })

  it("ends a chapter with Hết nội dung Chương n, or Đã hoàn thành Chương n once every lesson is done", async () => {
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l06", { panel: false })
    await heading("Tiêu đề Hợp lưu")
    expect(await screen.findByText("Hết nội dung Chương 1")).toBeTruthy()
  })

  it("shows Đã hoàn thành Chương n when the whole chapter is completed", async () => {
    install({ completed: ["ch01-l01", "ch01-l02", "ch01-l03", "ch01-l04", "ch01-l05", "ch01-l06"] })
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l06", { panel: false })
    await heading("Tiêu đề Hợp lưu")
    expect(await screen.findByText("Đã hoàn thành Chương 1")).toBeTruthy()
    expect(screen.queryByText("Hết nội dung Chương 1")).toBeNull()
  })

  it("on a phone offers Danh sách bài to bring the list back; on a wide screen it does not", async () => {
    const user = userEvent.setup()
    const frame = overlayFrame({ open: false })
    const first = renderAcademy("/demo-trading?view=academy&lesson=ch01-l01", { panel: false, frame })
    await heading("Tiêu đề RSI")
    await user.click(screen.getByRole("button", { name: "Danh sách bài" }))
    expect(frame.setOpen).toHaveBeenCalledWith(true)
    first.unmount()

    renderAcademy("/demo-trading?view=academy&lesson=ch01-l01", { panel: false, frame: overlayFrame({ overlay: false }) })
    await heading("Tiêu đề RSI")
    expect(screen.queryByRole("button", { name: "Danh sách bài" })).toBeNull()
  })

  it("Về linh thú shows the mascot stage again", async () => {
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l01", { panel: false })
    await heading("Tiêu đề RSI")
    await user.click(screen.getByRole("button", { name: "Về linh thú" }))
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
    expect(screen.queryByRole("article")).toBeNull()
  })
})
