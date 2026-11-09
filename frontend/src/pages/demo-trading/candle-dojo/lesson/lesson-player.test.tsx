import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { CD_CATALOG_VERSION } from "@/lib/candle-dojo/lessons"
import { LessonPlayer } from "./lesson-player"
import { loadLessonBank, type LessonBank } from "./lesson-data"
import {
  apiError,
  createDojoBackend,
  playLesson,
  renderWithProviders,
  stubReducedMotion,
  tagsOf,
  type DojoBackendOptions,
} from "./lesson-test-support"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("../candle-chart", async () => ({ CandleChart: (await import("./fake-candle-chart")).FakeCandleChart }))

let bank: LessonBank
beforeAll(async () => {
  bank = await loadLessonBank()
})

beforeEach(() => {
  mocks.api.mockReset()
  stubReducedMotion(true)
})

function setup(lessonId: string, options: { preview?: boolean; backend?: DojoBackendOptions } = {}) {
  const backend = createDojoBackend(bank, options.backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  const onExit = vi.fn()
  const onFinished = vi.fn()
  renderWithProviders(<LessonPlayer lessonId={lessonId} preview={options.preview ?? false} onExit={onExit} onFinished={onFinished} />)
  return { backend, onExit, onFinished, user: userEvent.setup() }
}

const lessonCalls = (backend: ReturnType<typeof createDojoBackend>) => backend.callsTo("POST", /\/lessons\/.+\/complete$/)

describe("học một bài ở chế độ thật", () => {
  it("đi đủ 6 bước, gửi một lần mọi chỗ đã chạm và lựa chọn Song sinh, rồi hiện kết quả của server", async () => {
    const { backend, user, onFinished } = setup("doji")
    await playLesson(user, bank.doji)

    expect(await screen.findByRole("img", { name: "3 trên 3 sao" })).toBeTruthy()
    expect(screen.getByText("+100 xu")).toBeTruthy()
    expect(screen.getByText("Xong bài Doji")).toBeTruthy()
    expect(screen.getByText("Mua ngay ở đây hoặc sau trong Shop › Thẻ nến.")).toBeTruthy()
    expect(screen.getByRole("img", { name: /^Doji, thẻ/ })).toBeTruthy()

    const calls = lessonCalls(backend)
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe("/candle-dojo/lessons/doji/complete")
    expect(calls[0].body).toEqual({
      hunt: { taps: bank.doji.hunt.targets.map(([start]) => start) },
      twins: bank.doji.twins.map((twin) => twin.goodSide),
    })

    await user.click(screen.getByRole("button", { name: "Về Dojo" }))
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it("không hiện +100 xu khi server báo không phải lần đầu", async () => {
    const { user } = setup("doji", { backend: { firstTime: false } })
    await playLesson(user, bank.doji)
    await screen.findByRole("img", { name: "3 trên 3 sao" })
    expect(screen.queryByText("+100 xu")).toBeNull()
  })

  it("số sao lấy từ kết quả server: nhầm hai lần ở Săn nến và đúng 1/3 Song sinh thì chỉ 1 sao, gửi cả chạm nhầm", async () => {
    const { user, backend } = setup("doji")
    const huntTaps = [20, 26, 3, 8, 13]
    await playLesson(user, bank.doji, { huntTaps, twinsRight: 1 })

    expect(await screen.findByRole("img", { name: "1 trên 3 sao" })).toBeTruthy()
    const steps = within(screen.getByRole("list", { name: "Kết quả từng bước" })).getAllByRole("listitem")
    expect(steps.map((step) => step.textContent)).toEqual(["Đạt: Hoàn thành", "Chưa đạt: Săn nến 3/3", "Chưa đạt: Song sinh 1/3"])
    expect(lessonCalls(backend)[0].body).toMatchObject({ hunt: { taps: huntTaps } })
  })

  it("Song sinh chọn sai: báo chưa đúng, hiện câu giải thích và tên máy nhận ra trên cả hai biểu đồ", async () => {
    const { user } = setup("doji")
    await playLesson(user, bank.doji, { stopBeforeTwins: true })

    const twin = bank.doji.twins[0]
    await user.click(screen.getByRole("button", { name: `Biểu đồ ${twin.goodSide === "a" ? "B" : "A"}` }))
    expect(screen.getByText("Chưa đúng.")).toBeTruthy()
    expect(screen.getByText(twin.why)).toBeTruthy()
    const names = screen.getAllByTestId("chart").flatMap((chart) => tagsOf(chart).map((tag) => tag.text))
    expect(names.sort()).toEqual(["Doji", "Không phải mẫu nào"])
    expect(screen.getByRole("button", { name: "Câu tiếp" })).toBeTruthy()
  })

  it("thoát bằng nút X bỏ bài, không gọi server", async () => {
    const { backend, user, onExit } = setup("doji")
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    await user.click(screen.getByRole("button", { name: "Thoát bài học" }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(backend.calls).toHaveLength(0)
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("gửi lỗi thì báo rõ và cho gửi lại đúng dữ liệu cũ", async () => {
    const { backend, user } = setup("doji", { backend: { failLessonOnce: apiError(503, "UNAVAILABLE", "Máy chủ đang bận") } })
    await playLesson(user, bank.doji)

    expect(await screen.findByText("Chưa ghi nhận được kết quả.")).toBeTruthy()
    expect(screen.getByText(/Máy chủ đang bận/)).toBeTruthy()
    expect(screen.queryByRole("img", { name: /trên 3 sao/ })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("img", { name: "3 trên 3 sao" })).toBeTruthy()
    const calls = lessonCalls(backend)
    expect(calls).toHaveLength(2)
    expect(calls[1].body).toEqual(calls[0].body)
  })

  it("bài không có trong danh mục: báo không tìm thấy và cho thoát", async () => {
    const { user, onExit } = setup("khong-co")
    expect(await screen.findByText("Không tìm thấy bài học này.")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Thoát" }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

describe("chế độ xem trước", () => {
  it("chạy đủ bài nhưng không gọi API nào, không thưởng xu, ghi chú không lưu tiến độ, không mua được thẻ", async () => {
    const { user, onFinished } = setup("hammer", { preview: true })
    expect(screen.getByText("Xem trước: không lưu tiến độ")).toBeTruthy()
    await playLesson(user, bank.hammer)

    expect(await screen.findByRole("img", { name: "3 trên 3 sao" })).toBeTruthy()
    expect(screen.getByText("Xong bài Hammer & Hanging Man")).toBeTruthy()
    expect(screen.queryByText(/^\+\d+ xu$/)).toBeNull()
    expect(mocks.api).not.toHaveBeenCalled()
    const buyButtons = screen.getAllByRole("button", { name: /^Mua · / })
    expect(buyButtons).toHaveLength(2)
    for (const button of buyButtons) expect((button as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole("button", { name: "Về Dojo" }))
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(mocks.api).not.toHaveBeenCalled()
  })
})

describe("mua thẻ ở màn kết thúc", () => {
  it("đủ xu: mua với giá và phiên bản danh mục đã xác nhận, rồi hiện Đã sở hữu", async () => {
    const { backend, user } = setup("doji", { backend: { balance: 1500 } })
    await playLesson(user, bank.doji)

    const buy = await screen.findByRole("button", { name: "Mua · 300 xu" })
    expect((buy as HTMLButtonElement).disabled).toBe(false)
    await user.click(buy)

    expect(await screen.findByText("Đã sở hữu")).toBeTruthy()
    const purchases = backend.callsTo("POST", /\/purchase$/)
    expect(purchases).toHaveLength(1)
    expect(purchases[0].path).toBe("/candle-dojo/cards/doji/purchase")
    expect(purchases[0].body).toEqual({ expected_price_xu: 300, catalog_version: CD_CATALOG_VERSION })
  })

  it("không đủ xu: nút nền nhạt, chữ vẫn đậm, không bấm được và nói còn thiếu bao nhiêu", async () => {
    const { user } = setup("doji", { backend: { balance: 100 } })
    await playLesson(user, bank.doji)

    const buy = (await screen.findByRole("button", { name: "Mua · 300 xu" })) as HTMLButtonElement
    expect(buy.disabled).toBe(true)
    expect(buy.className).toContain("font-bold")
    expect(buy.className).toContain("bg-secondary")
    // Số dư 100 + thưởng 100 xu lần đầu = 200, còn thiếu 100.
    expect(await screen.findByText("Còn thiếu 100 xu")).toBeTruthy()
  })

  it("đã có thẻ thì hiện Đã sở hữu, không có nút mua", async () => {
    const { user } = setup("doji", { backend: { owned: ["doji"] } })
    await playLesson(user, bank.doji)
    expect(await screen.findByText("Đã sở hữu")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Mua · / })).toBeNull()
  })

  it("giá đổi giữa chừng: báo bằng tiếng Việt, không coi là mua thành công", async () => {
    const { user } = setup("doji", { backend: { purchaseError: apiError(409, "PRICE_CHANGED", "Giá đã đổi") } })
    await playLesson(user, bank.doji)
    await user.click(await screen.findByRole("button", { name: "Mua · 300 xu" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Giá thẻ vừa thay đổi. Kiểm tra giá mới rồi mua lại.")
    expect(screen.queryByText("Đã sở hữu")).toBeNull()
  })

  it("bài hai thẻ: hiện cả hai thẻ của bài, mỗi thẻ một nút mua theo giá bậc", async () => {
    const { user } = setup("hammer")
    await playLesson(user, bank.hammer)
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mua · 300 xu" })).toHaveLength(2))
    expect(screen.getByRole("img", { name: /^Hammer, thẻ/ })).toBeTruthy()
    expect(screen.getByRole("img", { name: /^Hanging Man, thẻ/ })).toBeTruthy()
  })
})
