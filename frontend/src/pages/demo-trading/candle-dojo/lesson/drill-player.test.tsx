import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { CD_HUNT_SECONDS } from "@/lib/candle-dojo/grading"
import { DrillPlayer } from "./drill-player"
import { loadLessonBank, type LessonBank } from "./lesson-data"
import {
  apiError,
  createDojoBackend,
  renderWithProviders,
  stubReducedMotion,
  tapBar,
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
afterEach(() => {
  vi.useRealTimers()
})

// Hammer: mục tiêu ở nến 3, 14, 36.
const TARGETS = [3, 14, 36]

function setup(options: { preview?: boolean; backend?: DojoBackendOptions } = {}) {
  const backend = createDojoBackend(bank, options.backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  const onExit = vi.fn()
  const onFinished = vi.fn()
  renderWithProviders(<DrillPlayer lessonId="hammer" preview={options.preview ?? false} onExit={onExit} onFinished={onFinished} />)
  return { backend, onExit, onFinished }
}

const drillCalls = (backend: ReturnType<typeof createDojoBackend>) => backend.callsTo("POST", /\/drill\/complete$/)

describe("Luyện công mỗi ngày", () => {
  it("tìm đủ mẫu: gửi bài và các lần chạm, hiện số mẫu, +20 xu và chuỗi ngày từ server", async () => {
    const { backend, onFinished } = setup()
    expect(screen.getByRole("heading", { name: "Tìm hết các Hammer" })).toBeTruthy()
    expect(screen.getByText("Luyện công mỗi ngày")).toBeTruthy()
    for (const tap of [TARGETS[0], 47, TARGETS[1], TARGETS[2]]) tapBar(tap)

    expect(await screen.findByText("3/3 · +20 xu")).toBeTruthy()
    expect(screen.getByText("Đã giữ chuỗi luyện công.")).toBeTruthy()
    expect(screen.getByText("Chuỗi luyện công: 5 ngày")).toBeTruthy()
    const calls = drillCalls(backend)
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({ lesson_id: "hammer", taps: [3, 47, 14, 36] })

    await userEvent.setup().click(screen.getByRole("button", { name: "Về Dojo" }))
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it("đã nhận xu luyện công hôm nay: nói rõ và không hiện +20 xu", async () => {
    setup({ backend: { drillReward: 0, streakDays: 6 } })
    for (const tap of TARGETS) tapBar(tap)
    expect(await screen.findByText("Hôm nay bạn đã nhận xu luyện công.")).toBeTruthy()
    expect(screen.getByText("Chuỗi luyện công: 6 ngày")).toBeTruthy()
    expect(screen.queryByText(/\+20 xu/)).toBeNull()
  })

  it("hết 30 giây: gửi các lần chạm đã có và hiện số mẫu tìm được", async () => {
    vi.useFakeTimers()
    const { backend } = setup()
    tapBar(TARGETS[0])
    // Tua đủ 30 giây rồi thêm một nhịp cho lệnh gửi (TanStack Query thông báo bằng setTimeout) hoàn tất.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CD_HUNT_SECONDS * 1000 + 50)
    })

    expect(screen.getByText("1/3 · +20 xu")).toBeTruthy()
    expect(drillCalls(backend)).toHaveLength(1)
    expect(drillCalls(backend)[0].body).toEqual({ lesson_id: "hammer", taps: [3] })
  })

  it("chế độ xem trước: không gọi API, không xu, có ghi chú không lưu", async () => {
    const { onFinished } = setup({ preview: true })
    expect(screen.getAllByText("Xem trước: không lưu tiến độ").length).toBeGreaterThan(0)
    for (const tap of TARGETS) tapBar(tap)

    // Số mẫu hiện ở bảng đếm và ở thanh kết quả.
    expect(screen.getAllByText("3/3")).toHaveLength(2)
    expect(screen.queryByText(/\+20 xu/)).toBeNull()
    await userEvent.setup().click(screen.getByRole("button", { name: "Về Dojo" }))
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("gửi lỗi thì báo rõ, cho thử lại đúng các lần chạm cũ", async () => {
    const { backend } = setup({ backend: { failDrillOnce: apiError(503, "UNAVAILABLE", "Máy chủ đang bận") } })
    for (const tap of TARGETS) tapBar(tap)

    expect(await screen.findByText("Chưa ghi nhận được luyện công.")).toBeTruthy()
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByText("3/3 · +20 xu")).toBeTruthy()
    const calls = drillCalls(backend)
    expect(calls).toHaveLength(2)
    expect(calls[1].body).toEqual(calls[0].body)
  })

  it("thoát bằng nút X giữa chừng: không gửi gì", async () => {
    const { backend, onExit } = setup()
    tapBar(TARGETS[0])
    await userEvent.setup().click(screen.getByRole("button", { name: "Thoát bài học" }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(backend.calls).toHaveLength(0)
  })
})
