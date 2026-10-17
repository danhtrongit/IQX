import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import type { LessonContent } from "../content-types"
import { createFakeAcademyApi } from "../test-api"
import { keysBefore } from "../test-fixtures"
import { renderAcademy, stubBrowser } from "../test-support"
import { loadNotesDraft, resetAcademyViewState, saveNotesDraft } from "../view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "learner-1" }, isAuthenticated: true }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))

type Sections = LessonContent["sections"]

const SCENARIO = {
  type: "scenario",
  title: "Tình huống",
  story: ["Khách mở tài khoản nhưng chưa giao dịch."],
  question: "Bạn sẽ chọn cách nào?",
  options: ["Mở thêm tài khoản mới", "Gọi lại khách chưa giao dịch", "Chuyển công ty"],
  best_option: 1,
  debrief: "<b>Cách tốt nhất:</b> gọi lại khách chưa giao dịch.",
} as const

const SALES_SECTIONS = [
  {
    id: "s1",
    title: "Thực chiến",
    blocks: [
      SCENARIO,
      {
        type: "income_calculator",
        title: "Thu nhập mỗi tháng của bạn",
        fee_rate: 0.0015,
        share_rate: 0.7,
        clients: { label: "Số khách còn giao dịch", default: 20 },
        monthly_value_million: { label: "Giá trị giao dịch mỗi khách mỗi tháng (triệu đồng)", default: 200 },
        result_label: "Thu nhập ước tính mỗi tháng",
      },
      {
        type: "checklist",
        id: "l1",
        mode: "todo",
        title: "Việc làm ngay",
        items: [
          { id: "0", text: "Viết mục tiêu ba tháng" },
          { id: "1", text: "Tính ngược số người cần tiếp cận" },
        ],
      },
      {
        type: "checklist",
        id: "br2a",
        mode: "self_check",
        title: "Tự kiểm tra hồ sơ",
        result_label: "Số mục đã đạt",
        items: [
          { id: "0", text: "Ảnh đại diện rõ mặt" },
          { id: "1", text: "Tên hiển thị là tên thật" },
          { id: "2", text: "Giới thiệu đủ 3 dòng" },
        ],
      },
      {
        type: "workpad",
        id: "l2",
        title: "Bài tự làm: chân dung khách hàng",
        prompts: ["Khách của bạn là ai?", "Họ lo điều gì nhất?"],
        placeholder: "Viết câu trả lời của bạn ở đây…",
      },
    ],
  },
] as unknown as Sections

const PRACTICE_SECTIONS = [
  {
    id: "s1",
    title: "Case 1 · Khách mới, sợ rủi ro",
    blocks: [
      {
        type: "practice_case",
        id: "case1",
        title: "Case 1 · Khách mới, sợ rủi ro",
        pad_title: "Bạn tự phân tích trước",
        profile: { info: ["45 tuổi, có 300 triệu tiết kiệm"], mindset: ["Sợ mua đúng đỉnh"], quote: "Chứng khoán rủi ro lắm em ơi." },
        prompts: ["Khách sợ điều gì?", "Bạn trả lời câu khách hay nói thế nào?", "Gợi ý hướng nào?", "Câu chốt là gì?"],
        hints: [{ term: "Mấu chốt", text: "Khách sợ mua đúng đỉnh." }],
      },
    ],
  },
  {
    id: "s2",
    title: "Đóng vai và chấm điểm",
    blocks: [
      {
        type: "roleplay_score",
        id: "sc6",
        max: 10,
        default: 5,
        criteria: [
          { title: "Tạo thiện cảm", hint: "Mở lời tự nhiên" },
          { title: "Khai thác nhu cầu", hint: "Hỏi đúng, nghe nhiều" },
          { title: "Xử lý từ chối", hint: "Đồng cảm" },
          { title: "Kiến thức", hint: "Giải thích đúng" },
          { title: "EQ và thái độ", hint: "Bình tĩnh" },
          { title: "Chốt hành động", hint: "Có bước tiếp theo" },
        ],
        bands: [
          { min: 48, label: "Sẵn sàng gặp khách thật", tone: "good" },
          { min: 36, label: "Cần luyện thêm", tone: "warn" },
          { min: 0, label: "Cần học lại", tone: "bad" },
        ],
      },
    ],
  },
] as unknown as Sections

let fake: ReturnType<typeof createFakeAcademyApi>

function install(options: Parameters<typeof createFakeAcademyApi>[0] = {}) {
  fake = createFakeAcademyApi({
    completed: keysBefore("ch02-l01"),
    ...options,
    lessons: { "ch02-l01": { sections: SALES_SECTIONS }, "ch03-practice": { sections: PRACTICE_SECTIONS, has_scenario: false }, ...options.lessons },
  })
  mocks.api.mockImplementation(fake.handler)
}

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  Element.prototype.scrollIntoView = vi.fn()
  install()
})
afterEach(() => vi.unstubAllGlobals())

async function openItem(id: string, heading: string) {
  const view = renderAcademy(`/demo-trading?view=academy&lesson=${id}`, { panel: false })
  await screen.findByRole("heading", { level: 2, name: heading })
  return view
}

const scenario = () => document.querySelector<HTMLElement>("[data-academy-scenario]") as HTMLElement
const scenarioOption = (name: string) => within(scenario()).getByRole("button", { name: new RegExp(`^${name}`) })
const notesPuts = () => fake.bodies.filter((entry) => entry.call === "PUT /academy/lessons/ch02-l01/notes").map((entry) => entry.body)

describe("ScenarioBlock", () => {
  it("stores one choice, then marks the best option and the wrong pick, shows the debrief and opens the quiz", async () => {
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    expect(screen.getByRole("button", { name: "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra" }).hasAttribute("disabled")).toBe(true)
    expect(within(scenario()).queryByText(/Cách tốt nhất/)).toBeNull()

    const release = fake.hold("POST /academy/lessons/ch02-l01/scenario")
    await user.click(scenarioOption("Mở thêm tài khoản mới"))
    // Every option waits for the server; nothing is marked before it answers.
    for (const button of within(scenario()).getAllByRole("button")) expect(button.hasAttribute("disabled")).toBe(true)
    expect(within(scenario()).queryByText(/Cách tốt nhất/)).toBeNull()
    release()

    expect(await within(scenario()).findByText("Cách tốt nhất:")).toBeTruthy()
    expect(fake.bodies.find((entry) => entry.call === "POST /academy/lessons/ch02-l01/scenario")?.body).toEqual({ choice: 0 })
    expect(scenarioOption("Mở thêm tài khoản mới").getAttribute("aria-pressed")).toBe("true")
    expect(scenarioOption("Mở thêm tài khoản mới").className).toContain("border-destructive")
    expect(scenarioOption("Gọi lại khách chưa giao dịch").className).toContain("border-(--status-success)")
    for (const button of within(scenario()).getAllByRole("button")) expect(button.hasAttribute("disabled")).toBe(true)
    // A wrong choice opens the quiz too.
    expect(await screen.findByRole("button", { name: "Làm bài kiểm tra" })).toBeTruthy()
    expect(fake.count("POST /academy/lessons/ch02-l01/scenario")).toBe(1)
  })

  it("shows the stored choice and its debrief on reload, with the quiz open", async () => {
    install({ scenarios: { "ch02-l01": 1 } })
    await openItem("ch02-l01", "Bài học 2.1")
    expect(scenarioOption("Gọi lại khách chưa giao dịch").getAttribute("aria-pressed")).toBe("true")
    expect(within(scenario()).getByText("Cách tốt nhất:")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Làm bài kiểm tra" })).toBeTruthy()
  })

  it("reports a failed save and keeps the options available", async () => {
    fake.fail("scenario", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    await user.click(scenarioOption("Chuyển công ty"))
    expect(await within(scenario()).findByText(/Chưa lưu được lựa chọn/)).toBeTruthy()
    expect(scenarioOption("Chuyển công ty").hasAttribute("disabled")).toBe(false)
    expect(screen.queryByRole("button", { name: "Làm bài kiểm tra" })).toBeNull()
  })
})

describe("notes: checklists and workpads saved to the account", () => {
  it("saves a workpad after a pause with the revision it saw and says Đã lưu vào tài khoản", async () => {
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    await waitFor(() => expect(fake.calls).toContain("GET /academy/lessons/ch02-l01/notes"))
    expect(screen.getByText("Khách của bạn là ai?")).toBeTruthy()
    expect(screen.getByText("Họ lo điều gì nhất?")).toBeTruthy()
    await user.type(screen.getByRole("textbox", { name: "Bài tự làm: chân dung khách hàng" }), "Nhân viên văn phòng")
    expect(await screen.findByText("Đã lưu vào tài khoản", {}, { timeout: 3000 })).toBeTruthy()
    // One debounced request, not one per keystroke.
    expect(notesPuts()).toEqual([{ texts: { l2: "Nhân viên văn phòng" }, expected_revision: 0 }])
    expect(fake.notes.get("ch02-l01")?.texts).toEqual({ l2: "Nhân viên văn phòng" })
  })

  it("ticks checklist items by `${id}:${item}` and counts a self check as x/N", async () => {
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    expect(screen.getByText("Số mục đã đạt: 0/3")).toBeTruthy()
    await user.click(screen.getByRole("checkbox", { name: "Ảnh đại diện rõ mặt" }))
    await user.click(screen.getByRole("checkbox", { name: "Viết mục tiêu ba tháng" }))
    expect(screen.getByText("Số mục đã đạt: 1/3")).toBeTruthy()
    await waitFor(() => expect(fake.notes.get("ch02-l01")?.checks).toEqual({ "br2a:0": true, "l1:0": true }), { timeout: 3000 })
  })

  it("adopts notes saved elsewhere on a 409 and re-applies only the keys edited here", async () => {
    install({ notes: { "ch02-l01": { revision: 1, texts: { l2: "Bản cũ" } } } })
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    const pad = await screen.findByRole("textbox", { name: "Bài tự làm: chân dung khách hàng" })
    await waitFor(() => expect((pad as HTMLTextAreaElement).value).toBe("Bản cũ"))
    fake.saveNotesElsewhere("ch02-l01", { checks: { "l1:1": true } })

    await user.clear(pad)
    await user.type(pad, "Bản mới")
    await waitFor(() => expect(fake.notes.get("ch02-l01")?.revision).toBe(3), { timeout: 3000 })
    expect(notesPuts().map((body) => (body as { expected_revision: number }).expected_revision)).toEqual([1, 2])
    expect(fake.notes.get("ch02-l01")).toMatchObject({ texts: { l2: "Bản mới" }, checks: { "l1:1": true } })
    // The tick saved elsewhere shows up here.
    expect((screen.getByRole("checkbox", { name: "Tính ngược số người cần tiếp cận" }) as HTMLElement).getAttribute("data-state")).toBe("checked")
  })

  it("keeps unsent work through a remount when saving fails, and sends it again", async () => {
    fake.fail("notes", new ApiError("Lỗi", 503, "SERVICE_UNAVAILABLE"), 0)
    const user = userEvent.setup()
    const first = await openItem("ch02-l01", "Bài học 2.1")
    await waitFor(() => expect(fake.calls).toContain("GET /academy/lessons/ch02-l01/notes"))
    fake.fail("notes", new ApiError("Lỗi", 503, "SERVICE_UNAVAILABLE"), 1)
    await user.type(screen.getByRole("textbox", { name: "Bài tự làm: chân dung khách hàng" }), "Chưa gửi")
    expect(await screen.findByText("Chưa lưu được.", {}, { timeout: 3000 })).toBeTruthy()
    first.unmount()

    await openItem("ch02-l01", "Bài học 2.1")
    const pad = screen.getByRole("textbox", { name: "Bài tự làm: chân dung khách hàng" }) as HTMLTextAreaElement
    expect(pad.value).toBe("Chưa gửi")
    await waitFor(() => expect(fake.notes.get("ch02-l01")?.texts).toEqual({ l2: "Chưa gửi" }), { timeout: 3000 })
  })

  it("drops a restored draft key the lesson no longer has before sending the rest", async () => {
    saveNotesDraft("learner-1", "ch02-l01", { texts: { renamed: "Bản cũ", l2: "Còn giữ" }, checks: {}, scores: {} })
    await openItem("ch02-l01", "Bài học 2.1")
    await waitFor(() => expect(fake.notes.get("ch02-l01")?.texts).toEqual({ l2: "Còn giữ" }), { timeout: 3000 })
    expect(notesPuts()).toEqual([{ texts: { l2: "Còn giữ" }, expected_revision: 0 }])
    expect(loadNotesDraft("learner-1", "ch02-l01")).toBeNull()
  })

  it("a 422 INVALID_NOTES drops the refused key and saves the other blocks instead of failing forever", async () => {
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    await waitFor(() => expect(fake.calls).toContain("GET /academy/lessons/ch02-l01/notes"))
    fake.fail(
      "notes",
      new ApiError("Ghi chú chỉ được lưu cho các ô của bài học này.", 422, {
        code: "INVALID_NOTES",
        details: [{ field: "checks", key: "l1:0", reason: "unknown_key" }],
      }),
      1,
    )
    await user.click(screen.getByRole("checkbox", { name: "Viết mục tiêu ba tháng" }))
    await user.type(screen.getByRole("textbox", { name: "Bài tự làm: chân dung khách hàng" }), "Vẫn lưu")
    await waitFor(() => expect(fake.notes.get("ch02-l01")?.texts).toEqual({ l2: "Vẫn lưu" }), { timeout: 3000 })
    expect(fake.notes.get("ch02-l01")?.checks).toEqual({})
    expect(await screen.findByText("Đã lưu vào tài khoản")).toBeTruthy()
  })

  it("says the notes are too long on a 422 NOTES_TOO_LARGE instead of offering a useless retry", async () => {
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    await waitFor(() => expect(fake.calls).toContain("GET /academy/lessons/ch02-l01/notes"))
    fake.fail("notes", new ApiError("Ghi chú quá lớn.", 422, "NOTES_TOO_LARGE"), 1)
    await user.type(screen.getByRole("textbox", { name: "Bài tự làm: chân dung khách hàng" }), "Rất dài")
    expect(await screen.findByText(/Ghi chú quá dài nên chưa lưu được/, {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull()
  })

  it("never reads notes for a lesson without notes blocks", async () => {
    await openItem("ch01-l01", "Bài học 1.1")
    expect(fake.calls.some((call) => call.endsWith("/notes"))).toBe(false)
  })
})

describe("IncomeCalculator", () => {
  it("computes 20 clients × 200 triệu as 4.200.000 đ and follows the inputs without saving", async () => {
    const user = userEvent.setup()
    await openItem("ch02-l01", "Bài học 2.1")
    expect(screen.getByText("4.200.000 đ")).toBeTruthy()
    const clients = screen.getByRole("spinbutton", { name: "Số khách còn giao dịch" })
    await user.clear(clients)
    await user.type(clients, "10")
    expect(screen.getByText("2.100.000 đ")).toBeTruthy()
    await user.clear(clients)
    expect(screen.getByText("0 đ")).toBeTruthy()
    expect(notesPuts()).toEqual([])
  })
})

describe("practice room: client case and roleplay score", () => {
  const practice = { completed: keysBefore("ch04-l01") }
  beforeEach(() => install(practice))

  it("lists the four prompts, saves the analysis and toggles Xem gợi ý phân tích / Ẩn gợi ý", async () => {
    const user = userEvent.setup()
    await openItem("ch03-practice", "Phòng tập thực chiến")
    expect(screen.getByRole("heading", { level: 5, name: "Bạn tự phân tích trước" })).toBeTruthy()
    // Profile column labels follow the mockup (.cp: Thông tin khách / Tâm lý / Câu thường nói).
    for (const label of ["Thông tin khách", "Tâm lý", "Câu thường nói"]) expect(screen.getByText(label)).toBeTruthy()
    for (const prompt of ["Khách sợ điều gì?", "Bạn trả lời câu khách hay nói thế nào?", "Gợi ý hướng nào?", "Câu chốt là gì?"]) {
      expect(screen.getByText(prompt).className).toContain("text-[15px]")
    }
    const toggle = screen.getByRole("button", { name: "Xem gợi ý phân tích" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByText("Khách sợ mua đúng đỉnh.").closest("dl")?.hidden).toBe(true)
    await user.click(toggle)
    expect(screen.getByRole("button", { name: "Ẩn gợi ý" }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Khách sợ mua đúng đỉnh.").closest("dl")?.hidden).toBe(false)

    await user.type(screen.getByRole("textbox", { name: "Bạn tự phân tích trước" }), "Chia nhỏ vốn")
    await waitFor(() => expect(fake.notes.get("ch03-practice")?.texts).toEqual({ case1: "Chia nhỏ vốn" }), { timeout: 3000 })
  })

  it("starts at 30/60 and shows the bands 48 and 36 from stored scores", async () => {
    const first = await openItem("ch03-practice", "Phòng tập thực chiến")
    expect(await screen.findByText("30/60")).toBeTruthy()
    // The section title names the card; the untitled card adds no second heading.
    expect(screen.getAllByRole("heading", { name: "Đóng vai và chấm điểm" })).toHaveLength(1)
    expect(screen.getByRole("region", { name: "Chấm điểm đóng vai" })).toBeTruthy()
    expect(screen.getByText("Cần học lại")).toBeTruthy()
    first.unmount()

    install({ ...practice, notes: { "ch03-practice": { scores: { sc6: [8, 8, 8, 8, 8, 8] } } } })
    const second = await openItem("ch03-practice", "Phòng tập thực chiến")
    expect(await screen.findByText("48/60")).toBeTruthy()
    expect(screen.getByText("Sẵn sàng gặp khách thật")).toBeTruthy()
    second.unmount()

    install({ ...practice, notes: { "ch03-practice": { scores: { sc6: [6, 6, 6, 6, 6, 6] } } } })
    await openItem("ch03-practice", "Phòng tập thực chiến")
    expect(await screen.findByText("36/60")).toBeTruthy()
    expect(screen.getByText("Cần luyện thêm")).toBeTruthy()
  })

  it("moves a criterion with the keyboard and saves the six scores", async () => {
    const user = userEvent.setup()
    await openItem("ch03-practice", "Phòng tập thực chiến")
    const group = await screen.findByRole("group", { name: "Tạo thiện cảm" })
    const slider = within(group).getByRole("slider")
    slider.focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByText("31/60")).toBeTruthy()
    await waitFor(() => expect(fake.notes.get("ch03-practice")?.scores).toEqual({ sc6: [6, 5, 5, 5, 5, 5] }), { timeout: 3000 })
  })
})
