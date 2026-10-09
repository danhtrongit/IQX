import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PracticeMain } from "./practice-main"
import { PracticePanel } from "./practice-panel"
import { PracticeProvider } from "./practice-provider"
import { createBackend, type FakeBackend } from "./practice.backend"
import { makeRun } from "./practice.fixtures"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  apiResponse: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    code?: string
    details?: unknown
    constructor(message: string, status: number, options?: string | { code?: string; details?: unknown }) {
      super(message)
      this.status = status
      const values = typeof options === "string" ? { code: options } : options
      this.code = values?.code
      this.details = values?.details
    }
  },
}))

let backend: FakeBackend

beforeEach(() => {
  backend = createBackend()
  mocks.api.mockReset()
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.api(path, init))
  window.localStorage.clear()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  // Reduced motion: the replay starts paused so tests control it explicitly.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => vi.unstubAllGlobals())

function renderPractice(indicatorId = "rsi") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/demo-trading?view=bot&practice=${indicatorId}`]}>
        <PracticeProvider indicatorId={indicatorId}>
          <aside data-testid="panel">
            <PracticePanel />
          </aside>
          <div data-testid="main">
            <PracticeMain />
          </div>
        </PracticeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const panel = () => within(screen.getByTestId("panel"))
const main = () => within(screen.getByTestId("main"))
const buyLevel = () => panel().getByLabelText("Ngưỡng quá bán") as HTMLInputElement
const periodInput = () => panel().getByLabelText("Chu kỳ RSI") as HTMLInputElement
const holdInput = () => panel().getByLabelText("Thời gian giữ tối đa") as HTMLInputElement
const startButton = () => panel().getByRole("button", { name: "Bắt đầu" }) as HTMLButtonElement

/** Clicks a button once it is armed (the primary actions are briefly disabled after a phase change). */
async function press(user: ReturnType<typeof userEvent.setup>, scope: ReturnType<typeof within>, name: string | RegExp) {
  const button = (await scope.findByRole("button", { name })) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false), { timeout: 2500 })
  await user.click(button)
}

async function ready() {
  await screen.findByRole("button", { name: "Bắt đầu" })
  await waitFor(() => expect(screen.getByTestId("practice-chart")).toBeTruthy())
}

async function startAndFinish(user: ReturnType<typeof userEvent.setup>) {
  await ready()
  await press(user, panel(), "Bắt đầu")
  await main().findByTestId("practice-results")
  await press(user, panel(), "Xem kết quả ngay")
  await main().findByText("Kết quả 24 tháng")
}

describe("hidden case", () => {
  it("renders no symbol, company name or calendar date anywhere in the DOM", async () => {
    renderPractice()
    await ready()
    const html = document.body.innerHTML
    expect(html).not.toMatch(/\b(VNM|FPT|HPG|VCB|MWG|VIC|TCB|SSI)\b/)
    expect(html).not.toMatch(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/)
    expect(document.body.textContent).not.toMatch(/Cổ phiếu ẩn danh|Quan sát \d|Kiểm thử \d/)
    expect(document.body.textContent).toMatch(/Phiên -?\d+/)
    expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 01 / 30")
    // Before Start only the observation window is on screen: the last label is Phiên 0.
    const labels = [...screen.getByTestId("practice-chart").querySelectorAll('[data-axis="session"]')].map((node) => node.textContent)
    expect(labels.at(-1)).toBe("Phiên 0")
  })

  it("loads the state with GET only and never writes a draft on load", async () => {
    renderPractice()
    await ready()
    expect(backend.callsTo("PUT", /draft/)).toHaveLength(0)
    expect(backend.callsTo("GET", /\/practice\/rsi\/state/)).toHaveLength(1)
  })
})

describe("editing the draft", () => {
  it("debounces the draft save, carries expected_revision and does not save on each keystroke", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.clear(periodInput())
    await user.type(periodInput(), "10")
    expect(backend.callsTo("PUT", /draft/)).toHaveLength(0)
    await waitFor(() => expect(backend.callsTo("PUT", /draft/)).toHaveLength(1), { timeout: 3000 })
    const body = backend.callsTo("PUT", /draft/)[0].body as { expected_revision: number; draft: { buy: { params: { period: number } } } }
    expect(body.expected_revision).toBe(1)
    expect(body.draft.buy.params.period).toBe(10)

    await user.clear(buyLevel())
    await user.type(buyLevel(), "20")
    await waitFor(() => expect(backend.callsTo("PUT", /draft/)).toHaveLength(2), { timeout: 3000 })
    expect((backend.callsTo("PUT", /draft/)[1].body as { expected_revision: number }).expected_revision).toBe(2)
  })

  it("a save that meets another tab's revision re-reads it and writes this tab's edit on top", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    backend.state = { ...backend.state, draft_revision: 5 }
    await user.clear(periodInput())
    await user.type(periodInput(), "12")
    await waitFor(() => expect(backend.callsTo("PUT", /draft/)).toHaveLength(2), { timeout: 4000 })
    const revisions = backend.callsTo("PUT", /draft/).map((call) => (call.body as { expected_revision: number }).expected_revision)
    expect(revisions).toEqual([1, 5])
    expect((backend.callsTo("PUT", /draft/)[1].body as { draft: { buy: { params: { period: number } } } }).draft.buy.params.period).toBe(12)
    expect(periodInput().value).toBe("12")
    expect(backend.state.draft.buy.params.period).toBe(12)
  })

  it("does not write half-typed values", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.clear(periodInput())
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(backend.callsTo("PUT", /draft/)).toHaveLength(0)
    expect(startButton().disabled).toBe(true)
  })

  it("Mặc định resets only the side being edited (params and operators), never hold or the other side", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.clear(buyLevel())
    await user.type(buyLevel(), "20")
    await user.clear(holdInput())
    await user.type(holdInput(), "25")
    await user.selectOptions(panel().getByLabelText("Dấu điều kiện 1"), ">")
    await user.click(panel().getByRole("button", { name: "Điều kiện Bán" }))
    await user.clear(panel().getByLabelText("Ngưỡng quá mua"))
    await user.type(panel().getByLabelText("Ngưỡng quá mua"), "80")
    await user.click(panel().getByRole("button", { name: "Điều kiện Mua" }))
    await user.click(panel().getByRole("button", { name: /Mặc định/ }))
    expect(buyLevel().value).toBe("30")
    expect((panel().getByLabelText("Dấu điều kiện 1") as HTMLSelectElement).value).toBe("<")
    expect(holdInput().value).toBe("25")
    await user.click(panel().getByRole("button", { name: "Điều kiện Bán" }))
    expect((panel().getByLabelText("Ngưỡng quá mua") as HTMLInputElement).value).toBe("80")
  })

  it.each([
    ["0", /nguyên từ 1 đến 1\.000/],
    ["1001", /nguyên từ 1 đến 1\.000/],
    ["1.5", /nguyên từ 1 đến 1\.000/],
    ["-4", /nguyên từ 1 đến 1\.000/],
  ])("hold %j is refused: error shown, Bắt đầu disabled, nothing sent", async (value, message) => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.clear(holdInput())
    await user.type(holdInput(), value)
    expect(panel().getAllByText(message).length).toBeGreaterThan(0)
    expect(holdInput().getAttribute("aria-invalid")).toBe("true")
    expect(startButton().disabled).toBe(true)
    await user.click(startButton())
    expect(backend.callsTo("POST", /runs/)).toHaveLength(0)
  })

  it("accepts the limits 1 and 1000", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    for (const value of ["1", "1000"]) {
      await user.clear(holdInput())
      await user.type(holdInput(), value)
      expect(startButton().disabled).toBe(false)
    }
  })

  it("needs the Buy side on to start", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(panel().getByRole("switch", { name: "Bật Mua" }))
    expect(startButton().disabled).toBe(true)
    expect(panel().getAllByText("Bật điều kiện Mua để bắt đầu.").length).toBeGreaterThan(0)
  })

  it("the chart legend follows the side and the params of that side", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    const legend = () => within(screen.getByTestId("practice-legend"))
    expect(legend().getByTestId("legend-side").textContent).toBe("Tham số phía Mua")
    expect(legend().getByText("RSI 14")).toBeTruthy()
    await user.clear(periodInput())
    await user.type(periodInput(), "10")
    await waitFor(() => expect(legend().getByText("RSI 10")).toBeTruthy(), { timeout: 3000 })
    await user.click(legend().getByRole("button", { name: "Bán" }))
    expect(legend().getByTestId("legend-side").textContent).toBe("Tham số phía Bán")
    expect(legend().getByText("RSI 14")).toBeTruthy()
    expect(legend().getByText(/Ngưỡng 70/)).toBeTruthy()
    expect(legend().getByText(/Mốc tham khảo 50/)).toBeTruthy()
  })
})

describe("start", () => {
  it("locks the form with one start request carrying ordinal, case id, config and an idempotency key", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await waitFor(() => expect(startButton().disabled).toBe(false), { timeout: 2500 })
    await user.dblClick(startButton())
    await panel().findByRole("button", { name: "Xem kết quả ngay" })
    // The second click of the double click must not trigger the next action ("Xem kết quả ngay") by accident.
    expect(main().getByText("Kết quả đang chạy")).toBeTruthy()
    const starts = backend.callsTo("POST", /runs/)
    expect(starts).toHaveLength(1)
    const body = starts[0].body as { idempotency_key: string; ordinal: number; case_id: string; config: { hold_max_sessions: number } }
    expect(body.ordinal).toBe(1)
    expect(body.case_id).toBe(backend.state.case.case_id)
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    expect(body.config.hold_max_sessions).toBe(60)

    expect(panel().getByText("Đã khóa")).toBeTruthy()
    expect(periodInput().disabled).toBe(true)
    expect(buyLevel().disabled).toBe(true)
    expect(holdInput().disabled).toBe(true)
    expect(panel().getByRole("switch", { name: "Bật Mua" }).hasAttribute("disabled")).toBe(true)
    expect((panel().getByLabelText("Dấu điều kiện 1") as HTMLSelectElement).disabled).toBe(true)
    expect(panel().queryByRole("button", { name: /Mặc định/ })).toBeNull()
    expect(panel().queryByRole("button", { name: "Bắt đầu" })).toBeNull()
    // A pending edit can no longer reach the server once the config is locked.
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(backend.callsTo("PUT", /draft/)).toHaveLength(0)
  })

  it("replays from the first session: results are running, the next case is not offered yet", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await main().findByText("Kết quả đang chạy")
    expect(main().getByTestId("practice-status").textContent).toMatch(/Đã tạm dừng|Đang chạy/)
    expect(panel().queryByRole("button", { name: /Tập luyện tiếp/ })).toBeNull()
    expect(main().getByRole("button", { name: "Xem kết quả ngay" })).toBeTruthy()
    expect(main().getByLabelText("Tốc độ chạy")).toBeTruthy()
  })

  it("play advances the replay and Xem kết quả ngay completes it", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await main().findByText("Kết quả đang chạy")
    await user.click(main().getByRole("button", { name: "Tiếp tục" }))
    await waitFor(() => expect(main().getByTestId("practice-status").textContent).toMatch(/Đang chạy · Phiên (?!1\/)\d+\/504/), { timeout: 3000 })
    await user.click(main().getByRole("button", { name: "Tạm dừng" }))
    await press(user, main(), "Xem kết quả ngay")
    await main().findByText("Kết quả 24 tháng")
    expect(main().getByTestId("practice-status").textContent).toBe("Đã hoàn thành")
    expect(panel().getByRole("button", { name: /Tập luyện tiếp/ })).toBeTruthy()
  })

  it("a transient data failure keeps the form editable and does not consume the case", async () => {
    const user = userEvent.setup()
    backend.startFailures.push({ status: 503, code: "PRACTICE_DATA_UNAVAILABLE", message: "x" })
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    const alert = await panel().findByText(/Dữ liệu của tình huống này tạm thời chưa sẵn sàng/)
    expect(alert).toBeTruthy()
    expect(periodInput().disabled).toBe(false)
    expect(backend.state.current_run).toBeNull()
    await press(user, panel(), "Thử lại")
    await panel().findByRole("button", { name: "Xem kết quả ngay" })
  })

  it("compute failure keeps the locked run and retries with the same idempotency key", async () => {
    const user = userEvent.setup()
    backend.failComputeOnce = true
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await panel().findByRole("button", { name: "Thử lại" })
    expect(periodInput().disabled).toBe(true)
    expect(screen.getAllByText(/Không tính được kết quả lượt này/).length).toBeGreaterThan(0)
    await press(user, panel(), "Thử lại")
    await panel().findByRole("button", { name: "Xem kết quả ngay" })
    const starts = backend.callsTo("POST", /runs/).map((call) => (call.body as { idempotency_key: string }).idempotency_key)
    expect(starts).toHaveLength(2)
    expect(starts[0]).toBe(starts[1])
  })

  it("403 not granted links to the lesson of the indicator", async () => {
    backend.stateFailure = { status: 403, code: "CAPABILITY_LOCKED", message: "Cần hoàn thành bài học" }
    renderPractice()
    const notice = await screen.findAllByText(/Bạn chưa mở khóa chỉ báo RSI/)
    expect(notice.length).toBeGreaterThan(0)
    const link = (await screen.findAllByRole("link", { name: /Học bài RSI/ }))[0]
    expect(link.getAttribute("href")).toBe("/demo-trading?view=academy&lesson=ch01-l01")
    expect(screen.queryByRole("button", { name: "Bắt đầu" })).toBeNull()
  })
})

describe("results", () => {
  it("shows exactly two KPI tiles, the comment without its rule id and the full trade table", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    const kpis = main().getByTestId("practice-kpis")
    const tiles = kpis.querySelectorAll("[data-kpi]")
    expect(tiles).toHaveLength(2)
    expect([...tiles].map((tile) => tile.querySelector("p")?.textContent)).toEqual(["Tổng lợi nhuận", "Số giao dịch"])
    expect(within(kpis).getByText("3")).toBeTruthy()
    const result = backend.runs.values().next().value!.result!
    const expected = `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(result.kpis.total_return! * 100).replace("-", "\u2212")}%`
    expect(tiles[0].querySelector("strong")?.textContent).toBe(expected)

    const comment = main().getByTestId("practice-comment")
    expect(comment.textContent).toContain(result.comment.text!)
    expect(document.body.innerHTML).not.toMatch(/portfolio_result|buy_open_without_sell|comment_rule_id|rule_id/)

    const table = main().getByTestId("practice-trades")
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent)
    expect(headers).toEqual(["#", "Phiên mua", "Giá mua (đ)", "Phiên bán / Đang giữ", "Giá bán (đ)", "Thời gian giữ", "Lãi / lỗ", "Xem"])
    const rows = table.querySelectorAll("tbody tr")
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain("Điều kiện RSI")
    expect(rows[1].textContent).toContain("Hết thời gian giữ")
    expect(rows[2].textContent).toContain("Đang giữ")
    expect(rows[2].textContent).toContain("Tạm tính")
    expect(rows[2].textContent).toContain("—")
    expect(main().getByText("2 đã bán · 1 đang giữ")).toBeTruthy()
  })

  it("never shows a fake 0% when the final valuation is missing", async () => {
    const user = userEvent.setup()
    backend.valuation = "missing"
    renderPractice()
    await startAndFinish(user)
    const kpis = main().getByTestId("practice-kpis")
    expect(kpis.querySelector('[data-kpi="total_return"] strong')?.textContent).toBe("—")
    expect(within(kpis).getByText("Chưa đủ dữ liệu định giá cuối kỳ.")).toBeTruthy()
    expect(kpis.textContent).not.toContain("0,00%")
    expect(main().getByTestId("practice-comment").textContent).toContain("chưa có nhận xét")
  })

  it("lists the pending orders left at the end of the window", async () => {
    const user = userEvent.setup()
    const run = makeRun()
    run.result!.pending_orders = [{ side: "sell", signal_session: 503, reason: "max_holding", time_due: true, status: "unfilled_end_of_window" }]
    backend = createBackend()
    const original = backend.api
    backend.api = async (path, init) => {
      const value = (await original(path, init)) as { result?: typeof run.result }
      if (value?.result) value.result.pending_orders = run.result!.pending_orders
      return value
    }
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.api(path, init))
    renderPractice()
    await startAndFinish(user)
    const pending = main().getByTestId("practice-pending")
    expect(pending.textContent).toContain("chưa được tính là đã khớp")
    expect(pending.textContent).toContain("Lệnh Bán do hết thời gian giữ")
    expect(pending.textContent).toContain("Phiên 503")
  })

  it("opens the decision detail from a row and jumps the chart from Xem điểm Mua/Bán", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const dialog = await screen.findByRole("dialog")
    const detail = within(dialog)
    expect(detail.getByText("Giao dịch 1 · RSI")).toBeTruthy()
    expect(detail.getByText("Điều kiện Mua · Phiên 19")).toBeTruthy()
    expect(detail.getByText("Điều kiện Bán · Phiên 44")).toBeTruthy()
    expect(detail.getByTestId("evidence-params-buy").textContent).toContain("Chu kỳ RSI 14 phiên")
    expect(detail.getAllByText("✓ Đạt").length).toBe(4)
    expect(detail.getAllByText(/Phiên trước \(T−1\)/).length).toBeGreaterThan(0)
    expect(detail.getByTestId("trade-fees").textContent).toContain("Phí mua")
    expect(detail.getByTestId("trade-fees").textContent).toContain("Phí và thuế bán")
    expect(detail.getByTestId("trade-fees").textContent).toContain("giá mở cửa Phiên 20")
    await user.click(detail.getByRole("button", { name: "Xem điểm Bán" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The window now ends a little after Phiên 45 instead of at the last session.
    const slider = main().getByLabelText("Dịch vùng biểu đồ đã mở") as HTMLInputElement
    expect(Number(slider.value)).toBe(45 + 26)
  })

  it("explains a time exit separately from an indicator exit", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    await user.click(main().getByRole("button", { name: "Xem giao dịch 2" }))
    const detail = within(await screen.findByRole("dialog"))
    expect(detail.getByText("Hết thời gian giữ · Phiên 159")).toBeTruthy()
    expect(detail.getByTestId("time-exit").textContent).toContain("giới hạn của lượt là 60 phiên")
  })
})

describe("next, history and the end of the set", () => {
  it("Tập luyện tiếp is only offered once the replay is done and a double click advances exactly one case", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await main().findByText("Kết quả đang chạy")
    expect(screen.queryByRole("button", { name: /Tập luyện tiếp/ })).toBeNull()
    await press(user, panel(), "Xem kết quả ngay")
    const nextButton = (await panel().findByRole("button", { name: /Tập luyện tiếp/ })) as HTMLButtonElement
    await waitFor(() => expect(nextButton.disabled).toBe(false), { timeout: 2500 })
    await user.dblClick(nextButton)
    await waitFor(() => expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 02 / 30"))
    const advances = backend.callsTo("POST", /next/)
    expect(advances).toHaveLength(1)
    expect(advances[0].body).toMatchObject({ expected_cursor: 1 })
    expect((advances[0].body as { idempotency_key: string }).idempotency_key.length).toBeGreaterThanOrEqual(8)
    // The started config carries over to the new case and the form is editable again; the second
    // click of the double click did not start case 2 by accident.
    await panel().findByRole("button", { name: "Bắt đầu" })
    expect(periodInput().disabled).toBe(false)
    expect(backend.state.ordinal).toBe(2)
    expect(backend.callsTo("POST", /runs/)).toHaveLength(1)
  })

  it("a next that lost the race to another tab is explained and Tải lại shows the new case", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    // Another tab already moved to case 2.
    backend.state = { ...backend.state, ordinal: 2, status: "ready", current_run: null, can_start: true, can_next: false, case: { ...backend.state.case, ordinal: 2, case_id: "00000000-0000-4000-8000-000000000002" } }
    await press(user, panel(), /Tập luyện tiếp/)
    const notice = await panel().findByText("Tiến trình đã thay đổi ở nơi khác.")
    expect(notice).toBeTruthy()
    expect(backend.callsTo("POST", /next/)).toHaveLength(1)
    await user.click(panel().getByRole("button", { name: "Tải lại" }))
    await panel().findByRole("button", { name: "Bắt đầu" })
    expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 02 / 30")
    expect(panel().queryByText("Tiến trình đã thay đổi ở nơi khác.")).toBeNull()
  })

  it("an older run opens read-only with Về lượt hiện tại and no way to run it again", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    await press(user, panel(), /Tập luyện tiếp/)
    await panel().findByRole("button", { name: "Bắt đầu" })
    await user.click(main().getByRole("button", { name: "Lượt đã luyện" }))
    const history = within(await screen.findByTestId("practice-history"))
    expect(await history.findByText("Lượt 01")).toBeTruthy()
    expect(history.getByText(/Mua: 14 \/ 30 · < · >/)).toBeTruthy()
    await user.click(history.getByRole("button", { name: "Xem lượt 01" }))
    await main().findByTestId("past-banner")
    expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 01 / 30")
    expect(periodInput().disabled).toBe(true)
    expect(panel().getByText("Đã khóa")).toBeTruthy()
    expect(panel().queryByRole("button", { name: "Bắt đầu" })).toBeNull()
    expect(panel().queryByRole("button", { name: /Tập luyện tiếp/ })).toBeNull()
    expect(main().getByTestId("practice-status").textContent).toBe("Đã hoàn thành · xem lại")
    expect(main().getByText("Kết quả 24 tháng")).toBeTruthy()
    await press(user, panel(), "Về lượt hiện tại")
    await panel().findByRole("button", { name: "Bắt đầu" })
    expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 02 / 30")
    expect(backend.callsTo("POST", /runs/)).toHaveLength(1)
  })

  it("after case 30 shows the finished state: no next, no wrap, history still reachable", async () => {
    const user = userEvent.setup()
    backend = createBackend({ state: { ordinal: 30, case: { case_id: "00000000-0000-4000-8000-00000000001e", ordinal: 30, window_bars: 130 } } })
    mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.api(path, init))
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await main().findByText("Kết quả đang chạy")
    await press(user, panel(), "Xem kết quả ngay")
    await main().findByTestId("set-completed")
    const finished = panel().getByRole("button", { name: "Đã hết 30 lượt" }) as HTMLButtonElement
    expect(finished.disabled).toBe(true)
    expect(screen.queryByRole("button", { name: /Tập luyện tiếp/ })).toBeNull()
    expect(backend.callsTo("POST", /next/)).toHaveLength(0)
    expect(main().getByRole("button", { name: "Lượt đã luyện" })).toBeTruthy()
  })

  it("restores a mid-replay position after a reload from the stored UI preference", async () => {
    const user = userEvent.setup()
    const first = renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await main().findByText("Kết quả đang chạy")
    await user.click(main().getByRole("button", { name: "Tiếp tục" }))
    await waitFor(() => expect(main().getByTestId("practice-status").textContent).toMatch(/Phiên (?!1\/)\d+\/504/), { timeout: 3000 })
    await user.click(main().getByRole("button", { name: "Tạm dừng" }))
    const shown = main().getByTestId("practice-status").textContent
    first.unmount()
    renderPractice()
    await main().findByText("Kết quả đang chạy")
    expect(main().getByTestId("practice-status").textContent).toBe(shown?.replace("Đang chạy", "Đã tạm dừng"))
    // One run only: reloading never starts a second one.
    expect(backend.callsTo("POST", /runs/)).toHaveLength(1)
    await press(user, main(), "Xem kết quả ngay")
    await main().findByText("Kết quả 24 tháng")
  })
})
