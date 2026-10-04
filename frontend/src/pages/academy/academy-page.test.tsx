import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"

import {
  attemptFixture,
  curriculumFixture,
  lessonFixture,
  passedResultFixture,
  registryFixture,
  sharedConfigFixture,
} from "./test-fixtures"

const mocks = vi.hoisted(() => ({
  getCurriculum: vi.fn(),
  getLesson: vi.fn(),
  createAttempt: vi.fn(),
  submitAttempt: vi.fn(),
  getSharedConfig: vi.fn(),
  getTechnicalRegistry: vi.fn(),
  saveSharedConfig: vi.fn(),
  listLists: vi.fn(),
}))

vi.mock("@/pages/strategy/filter/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/strategy/filter/api")>()),
  listLists: mocks.listLists,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, isPremium: true, premiumLoading: false, openAuth: vi.fn() }),
}))

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getCurriculum: mocks.getCurriculum,
  getLesson: mocks.getLesson,
  createAttempt: mocks.createAttempt,
  submitAttempt: mocks.submitAttempt,
}))

vi.mock("@/lib/shared-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared-config")>()),
  getSharedConfig: mocks.getSharedConfig,
  getTechnicalRegistry: mocks.getTechnicalRegistry,
  saveSharedConfig: mocks.saveSharedConfig,
}))

import { AcademyPage } from "./academy-page"

function renderAcademy(path = "/hoc-vien/ch01-l01") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/hoc-vien" element={<AcademyPage />} />
          <Route path="/hoc-vien/:lessonId" element={<AcademyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function sidebar() {
  return within((await screen.findAllByRole("navigation", { name: "Chương trình Học viện" }))[0])
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.getCurriculum.mockResolvedValue(curriculumFixture())
  mocks.getLesson.mockImplementation((id: string) => Promise.resolve(lessonFixture(id)))
  mocks.getSharedConfig.mockResolvedValue(sharedConfigFixture())
  mocks.getTechnicalRegistry.mockResolvedValue(registryFixture())
  mocks.listLists.mockResolvedValue([
    { id: "l1", name: "Ngân hàng", filter_id: null, filter_version: null, tickers: ["VCB", "ACB"], as_of: "2026-05-01T00:00:00Z", data_source: "x", scope: null, created_at: null },
  ])
})

describe("AcademyPage", () => {
  it("renders the 18 chapters in the sidebar and the sanitized lesson", async () => {
    renderAcademy()
    expect(await screen.findByRole("heading", { name: "RSI", level: 2 })).toBeTruthy()
    const nav = await sidebar()
    for (let no = 1; no <= 18; no += 1) expect(nav.getByText(`Chương ${no}`)).toBeTruthy()
    expect(nav.getByRole("link", { name: "Xem bài RSI" }).getAttribute("href")).toBe("/hoc-vien/ch01-l01")
    expect(document.querySelector("script")).toBeNull()
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined()
    expect(await screen.findByText(/Bản đã lưu #3 · Có hiệu lực từ phiên 02\/03\/2026/)).toBeTruthy()
  })

  it("disables Cấu hình and the master switch until the lesson is learned", async () => {
    renderAcademy()
    const nav = await sidebar()
    await waitFor(() => expect((nav.getByRole("button", { name: "Cấu hình MACD" }) as HTMLButtonElement).disabled).toBe(false))
    expect((nav.getByRole("button", { name: "Cấu hình RSI" }) as HTMLButtonElement).disabled).toBe(true)
    expect((nav.getByRole("switch", { name: "Bật/tắt RSI" }) as HTMLButtonElement).disabled).toBe(true)
    expect((nav.getByRole("switch", { name: "Bật/tắt MACD" }) as HTMLButtonElement).disabled).toBe(false)
    const lessonButtons = screen.getAllByRole("button", { name: "Cấu hình RSI" }) as HTMLButtonElement[]
    expect(lessonButtons.length).toBe(2)
    expect(lessonButtons.every(button => button.disabled)).toBe(true)
  })

  it("keeps quiz submit disabled until all 8 questions are answered and shows the server review", async () => {
    const user = userEvent.setup()
    mocks.createAttempt.mockResolvedValue(attemptFixture())
    mocks.submitAttempt.mockResolvedValue(passedResultFixture())
    renderAcademy()
    await user.click(await screen.findByRole("button", { name: "Làm bài kiểm tra · 8 câu" }))
    const submit = await screen.findByRole("button", { name: "Nộp bài" })
    expect(mocks.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: "ch01-l01", content_version: "2.0.0", idempotency_key: expect.any(String) }),
      expect.anything(),
    )
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    for (let index = 1; index <= 7; index += 1) await user.click(screen.getByLabelText(`Phương án A${index}`))
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByLabelText("Phương án A8"))
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await user.click(submit)

    expect(await screen.findByText("8/8 câu đúng · Đạt")).toBeTruthy()
    expect(mocks.submitAttempt).toHaveBeenCalledWith(
      "attempt-1",
      Array.from({ length: 8 }, (_, index) => ({ question_id: `q${index + 1}`, option_id: `q${index + 1}-a` })),
      expect.any(String),
    )
    expect(screen.getByText("Chỉ báo · RSI")).toBeTruthy()
    expect(screen.getByText("Giải thích 1")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Làm lại" }))
    await waitFor(() => expect(mocks.createAttempt).toHaveBeenCalledTimes(2))
    const keys = mocks.createAttempt.mock.calls.map(call => (call[0] as { idempotency_key: string }).idempotency_key)
    expect(keys[0]).not.toBe(keys[1])
  })

  it("keeps the config draft and shows a reload banner on 409 REVISION_CONFLICT", async () => {
    const user = userEvent.setup()
    mocks.saveSharedConfig.mockRejectedValueOnce(new ApiError("Xung đột", 409, { code: "REVISION_CONFLICT", details: { current_revision: 4 } }))
    renderAcademy("/hoc-vien/ch01-l02")
    const nav = await sidebar()
    const configure = nav.getByRole("button", { name: "Cấu hình MACD" })
    await waitFor(() => expect((configure as HTMLButtonElement).disabled).toBe(false))
    await user.click(configure)

    const dialog = await screen.findByRole("dialog", { name: "Cấu hình MACD" })
    const input = within(dialog).getByLabelText(/EMA nhanh/) as HTMLInputElement
    await user.clear(input)
    await user.type(input, "10")
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))

    expect(await within(dialog).findByText("Cấu hình đã thay đổi ở nơi khác")).toBeTruthy()
    expect(mocks.saveSharedConfig).toHaveBeenCalledWith(expect.objectContaining({
      expected_revision: 3,
      idempotency_key: expect.any(String),
      indicators: { macd: expect.objectContaining({ master_enabled: false, buy: expect.objectContaining({ params: { fast: 10 } }) }) },
    }))
    expect((within(dialog).getByLabelText(/EMA nhanh/) as HTMLInputElement).value).toBe("10")
    expect((within(dialog).getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(true)

    mocks.getSharedConfig.mockResolvedValue(sharedConfigFixture(4))
    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }))
    expect(await within(dialog).findByText(/Đã tải bản #4/)).toBeTruthy()
    expect((within(dialog).getByLabelText(/EMA nhanh/) as HTMLInputElement).value).toBe("10")

    mocks.getSharedConfig.mockResolvedValue({ ...sharedConfigFixture(5), effective_session: null, status: "calendar_unavailable" })
    mocks.saveSharedConfig.mockResolvedValueOnce({ revision: 5, config: sharedConfigFixture(5).config, config_hash: "h5", effective_session: null, status: "calendar_unavailable" })
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cấu hình MACD" })).toBeNull())
    expect(mocks.saveSharedConfig).toHaveBeenLastCalledWith(expect.objectContaining({ expected_revision: 4 }))
    expect(await screen.findByText(/Bản đã lưu #5 · Chờ lịch phiên/)).toBeTruthy()
  })

  it("keeps an unsaved master toggle after a 409 and offers Tải lại", async () => {
    const user = userEvent.setup()
    mocks.saveSharedConfig.mockRejectedValueOnce(new ApiError("Xung đột", 409, { code: "REVISION_CONFLICT" }))
    renderAcademy()
    const nav = await sidebar()
    const toggle = nav.getByRole("switch", { name: "Bật/tắt MACD" })
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false))
    await user.click(toggle)

    expect(await screen.findByText("Cấu hình đã thay đổi ở nơi khác")).toBeTruthy()
    expect(mocks.saveSharedConfig).toHaveBeenCalledWith(expect.objectContaining({
      expected_revision: 3,
      indicators: { macd: expect.objectContaining({ master_enabled: true }) },
    }))
    expect(nav.getByRole("switch", { name: "Bật/tắt MACD" }).getAttribute("aria-checked")).toBe("true")
    expect(nav.getByText("Chưa lưu")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeTruthy()
  })

  it("opens the panel instead of enabling both sides when master is turned ON with both sides OFF", async () => {
    const user = userEvent.setup()
    const off = { enabled: false, params: { fast: 12 }, rules: registryFixture().indicators[1].buy.rules }
    mocks.getSharedConfig.mockResolvedValue(sharedConfigFixture(3, { buy: off, sell: { ...off, rules: registryFixture().indicators[1].sell.rules } }))
    renderAcademy()
    const toggle = (await sidebar()).getByRole("switch", { name: "Bật/tắt MACD" })
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false))
    await user.click(toggle)
    const dialog = await screen.findByRole("dialog", { name: "Cấu hình MACD" })
    expect(within(dialog).getByRole("switch", { name: "Tín hiệu Mua" }).getAttribute("aria-checked")).toBe("true")
    expect(mocks.saveSharedConfig).not.toHaveBeenCalled()
  })

  it("hides config controls entirely when shared config is FEATURE_DISABLED", async () => {
    mocks.getSharedConfig.mockRejectedValue(new ApiError("Tắt", 404, { code: "FEATURE_DISABLED" }))
    renderAcademy()
    expect(await screen.findByRole("heading", { name: "RSI", level: 2 })).toBeTruthy()
    await waitFor(() => expect(mocks.getSharedConfig).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Cấu hình/ })).toBeNull())
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.getByRole("button", { name: "Làm bài kiểm tra · 8 câu" })).toBeTruthy()
  })

  it("offers the saved-list picker on fundamental lessons and shows the chosen tickers", async () => {
    mocks.getLesson.mockImplementation((id: string) => Promise.resolve({ ...lessonFixture(id), kind: "fundamental" }))
    renderAcademy()
    const select = await screen.findByLabelText("Danh mục thực hành")
    expect(screen.getByText("Danh mục là danh sách thực hành, không phải vị thế tài khoản.")).toBeTruthy()
    await userEvent.selectOptions(select, "l1")
    expect(await screen.findByText("VCB · ACB · Lưu ngày 2026-05-01")).toBeTruthy()
  })

  it("hides the picker on technical lessons outside chapter 4 and never shows review_status", async () => {
    renderAcademy()
    expect(await screen.findByRole("heading", { name: "RSI", level: 2 })).toBeTruthy()
    expect(screen.queryByText("Danh mục thực hành")).toBeNull()
    expect(mocks.listLists).not.toHaveBeenCalled()
    expect(screen.queryByText(/editorial-v2/)).toBeNull()
  })

  it("links ch02-l15 to the backtest tab", async () => {
    mocks.getLesson.mockImplementation((id: string) => Promise.resolve({ ...lessonFixture(id), chapter: 2 }))
    renderAcademy("/hoc-vien/ch02-l15")
    const link = await screen.findByRole("link", { name: "Thực hành kiểm định" })
    expect(link.getAttribute("href")).toBe("/chien-luoc?tab=backtest")
  })
})
