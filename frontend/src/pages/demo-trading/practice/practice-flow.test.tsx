import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PracticeMain } from "./practice-main"
import { PracticePanel } from "./practice-panel"
import { PracticeProvider } from "./practice-provider"
import { formatMoneyVnd } from "./practice-model"
import { createBackend, type FakeBackend } from "./practice.backend"
import { OUTDATED_RUN_ERROR, OUTDATED_RUN_ID, ROWS_INDICATORS, briefOf, makeLegacyRun, makeOutdatedRun, makeOutdatedState, makeRun, registryRows } from "./practice.fixtures"

vi.setConfig({ testTimeout: 20_000 })

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

/** The tests talk to the backend they were given (the mock reads the variable at call time). */
function install(next: FakeBackend): FakeBackend {
  backend = next
  return next
}

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

type User = ReturnType<typeof userEvent.setup>
type Tab = "buy" | "sell"
const TAB_NAME: Record<Tab, string> = { buy: "Mua", sell: "Bán" }

type RowBody = Record<string, unknown>
type SideBody = { enabled: boolean; rules: RowBody[] }
type ConfigBody = { buy: SideBody; sell: SideBody; hold_max_sessions: number }
type DraftBody = { expected_revision: number; draft: ConfigBody }
type StartBody = { idempotency_key: string; ordinal: number; case_id: string; config: ConfigBody }
type PreviewBody = { buy_rows?: RowBody[]; sell_rows?: RowBody[]; buy_params?: Record<string, number>; sell_params?: Record<string, number> }

const savedDrafts = () => backend.callsTo("PUT", /draft/).map((call) => call.body as DraftBody)
const previews = () => backend.callsTo("POST", /preview/).map((call) => call.body as PreviewBody)
const rulesOf = (config: unknown, tab: Tab): RowBody[] => (config as ConfigBody)[tab].rules

const panel = () => within(screen.getByTestId("panel"))
const main = () => within(screen.getByTestId("main"))
const legend = () => within(screen.getByTestId("practice-legend"))
const holdInput = () => panel().getByLabelText("Thời gian giữ tối đa") as HTMLInputElement
const startButton = () => panel().getByRole("button", { name: "Bắt đầu" }) as HTMLButtonElement

/** A field of a condition row, found by the label the shared rows give it: `Chu kỳ RSI (dòng 1, Mua)`. */
const rowField = (label: string, row: number, tab: Tab = "buy") => panel().getByLabelText(`${label} (dòng ${row}, ${TAB_NAME[tab]})`) as HTMLInputElement
const period = (row = 1, tab: Tab = "buy") => rowField("Chu kỳ RSI", row, tab)
const threshold = (row = 1, tab: Tab = "buy") => rowField("Ngưỡng RSI", row, tab)
const comparison = (row = 1, tab: Tab = "buy") => rowField("Dấu so sánh", row, tab)
const direction = (row = 2, tab: Tab = "buy") => rowField("Xu hướng RSI", row, tab)
const rowSwitch = (row: number, tab: Tab = "buy") => panel().getByRole("switch", { name: `Bật điều kiện ${row} (${TAB_NAME[tab]})` })
/** The tab button; its name gains a suffix while the tab has an error. */
const tabButton = (tab: Tab) => panel().getByRole("button", { name: new RegExp(`^Điều kiện ${TAB_NAME[tab]}`) })

async function typeInto(user: User, input: HTMLElement, text: string) {
  await user.clear(input)
  await user.type(input, text)
}

/** Clicks a button once it is armed (the primary actions are briefly disabled after a phase change). */
async function press(user: User, scope: ReturnType<typeof within>, name: string | RegExp) {
  const button = (await scope.findByRole("button", { name })) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false), { timeout: 2500 })
  await user.click(button)
}

/** The form is up, the chart preview is drawn and Bắt đầu is armed. */
async function ready() {
  await screen.findByRole("button", { name: "Bắt đầu" })
  await waitFor(() => expect(screen.getByTestId("practice-chart")).toBeTruthy())
  await waitFor(() => expect(startButton().disabled).toBe(false), { timeout: 2500 })
}

async function startAndFinish(user: User) {
  await ready()
  await press(user, panel(), "Bắt đầu")
  await main().findByTestId("practice-results")
  await press(user, panel(), "Xem kết quả ngay")
  await main().findByText("Kết quả 24 tháng")
}

/** A backend whose current case already holds this succeeded run. */
function withCurrentRun(run: ReturnType<typeof makeRun>, extra: Parameters<typeof createBackend>[0] = {}): FakeBackend {
  const brief = briefOf(run)
  return install(
    createBackend({
      ...extra,
      state: { current_run: brief, runs: [brief], status: "completed", can_start: false, can_next: true, completed_count: 1, ...extra.state },
      runs: [run],
    }),
  )
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

describe("condition rows", () => {
  it("lists the registry rows of the open tab as sentences with their own values and switches, with no shared parameter grid", async () => {
    renderPractice()
    await ready()
    const list = panel().getByRole("list", { name: "Điều kiện Mua" })
    expect([...list.querySelectorAll("li")].map((item) => item.getAttribute("data-row-id"))).toEqual(["rsi.level", "rsi.trend"])
    expect(period(1).value).toBe("14")
    expect(comparison(1).value).toBe("<")
    expect(threshold(1).value).toBe("30")
    expect(period(2).value).toBe("14")
    expect(direction(2).value).toBe("up")
    expect(rowSwitch(1).getAttribute("aria-checked")).toBe("true")
    expect(rowSwitch(2).getAttribute("aria-checked")).toBe("true")
    expect(panel().getByTestId("row-count-buy").textContent).toBe("2/2 điều kiện được bật · Các điều kiện đang bật phải đồng thời thỏa mãn")
    // The old shared parameter block and its labels are gone.
    expect(screen.getByTestId("panel").querySelector("[data-param]")).toBeNull()
    expect(panel().queryByLabelText("Ngưỡng quá bán")).toBeNull()
    expect(panel().queryByLabelText("Chu kỳ RSI")).toBeNull()
    expect(panel().queryByLabelText("Dấu điều kiện 1")).toBeNull()
  })

  it("the Bán tab has its own rows and values", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(tabButton("sell"))
    expect(panel().getByRole("list", { name: "Điều kiện Bán" })).toBeTruthy()
    expect(panel().queryByRole("list", { name: "Điều kiện Mua" })).toBeNull()
    expect(period(1, "sell").value).toBe("14")
    expect(comparison(1, "sell").value).toBe(">")
    expect(threshold(1, "sell").value).toBe("70")
    expect(direction(2, "sell").value).toBe("down")
  })

  it("each row keeps its own values: changing the period of one row leaves the other row and the other tab alone", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await typeInto(user, period(2), "9")
    expect(period(1).value).toBe("14")
    expect(period(2).value).toBe("9")
    await waitFor(() => expect(savedDrafts()).toHaveLength(1), { timeout: 3000 })
    expect(rulesOf(savedDrafts()[0].draft, "buy").map((row) => row.period)).toEqual([14, 9])
    expect(rulesOf(savedDrafts()[0].draft, "sell").map((row) => row.period)).toEqual([14, 14])
  })

  it("switching a row off keeps its values, saves it as off and leaves Bắt đầu possible while another row is on", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(rowSwitch(2))
    expect(rowSwitch(2).getAttribute("aria-checked")).toBe("false")
    // A row that is off is dimmed and still editable.
    expect(period(2).value).toBe("14")
    expect(panel().getByTestId("row-count-buy").textContent).toMatch(/^1\/2 điều kiện được bật/)
    await waitFor(() => expect(savedDrafts()).toHaveLength(1), { timeout: 3000 })
    expect(rulesOf(savedDrafts()[0].draft, "buy")[1]).toEqual({ id: "rsi.trend", enabled: false, period: 14, dir: "up" })
    expect(startButton().disabled).toBe(false)
  })

  it("a tab that is on with no row on says it gives no signal, and a run can still start", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(rowSwitch(1))
    await user.click(rowSwitch(2))
    expect(panel().getByTestId("no-rows-on").textContent).toBe("Chưa bật điều kiện Mua nào nên lượt này sẽ không có lệnh Mua.")
    expect(startButton().disabled).toBe(false)
    await user.click(tabButton("sell"))
    expect(panel().queryByTestId("no-rows-on")).toBeNull()
    await user.click(rowSwitch(1, "sell"))
    await user.click(rowSwitch(2, "sell"))
    expect(panel().getByTestId("no-rows-on").textContent).toBe("Chưa bật điều kiện Bán nào nên lượt chỉ thoát khi hết thời gian giữ tối đa.")
    expect(startButton().disabled).toBe(false)
  })
})

describe("editing the draft", () => {
  it("debounces the draft save, carries expected_revision and does not save on each keystroke", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await typeInto(user, period(1), "10")
    expect(backend.callsTo("PUT", /draft/)).toHaveLength(0)
    await waitFor(() => expect(savedDrafts()).toHaveLength(1), { timeout: 3000 })
    const body = savedDrafts()[0]
    expect(body.expected_revision).toBe(1)
    expect(rulesOf(body.draft, "buy")).toEqual([
      { id: "rsi.level", enabled: true, period: 10, op: "<", threshold: 30 },
      { id: "rsi.trend", enabled: true, period: 14, dir: "up" },
    ])
    expect(rulesOf(body.draft, "sell")).toEqual([
      { id: "rsi.level", enabled: true, period: 14, op: ">", threshold: 70 },
      { id: "rsi.trend", enabled: true, period: 14, dir: "down" },
    ])
    expect(body.draft.buy.enabled).toBe(true)
    expect(body.draft.hold_max_sessions).toBe(60)

    await typeInto(user, threshold(1), "20")
    await waitFor(() => expect(savedDrafts()).toHaveLength(2), { timeout: 3000 })
    expect(savedDrafts()[1].expected_revision).toBe(2)
    expect(rulesOf(savedDrafts()[1].draft, "buy")[0]).toEqual({ id: "rsi.level", enabled: true, period: 10, op: "<", threshold: 20 })
  })

  it("a save that meets another tab's revision re-reads it and writes this tab's edit on top", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    backend.state = { ...backend.state, draft_revision: 5 }
    await typeInto(user, period(1), "12")
    await waitFor(() => expect(savedDrafts()).toHaveLength(2), { timeout: 4000 })
    expect(savedDrafts().map((body) => body.expected_revision)).toEqual([1, 5])
    expect(rulesOf(savedDrafts()[1].draft, "buy")[0].period).toBe(12)
    expect(period(1).value).toBe("12")
    expect(rulesOf(backend.state.draft, "buy")[0].period).toBe(12)
  })

  it("does not write half-typed values", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.clear(period(1))
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(backend.callsTo("PUT", /draft/)).toHaveLength(0)
    expect(startButton().disabled).toBe(true)
    expect(period(1).getAttribute("aria-invalid")).toBe("true")
    expect(panel().getByTestId("row-errors-buy").textContent).toBe("Mua · dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
  })

  it("Mặc định resets the rows of the side being edited, never the hold time or the other side", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await typeInto(user, threshold(1), "20")
    await typeInto(user, holdInput(), "25")
    await user.selectOptions(comparison(1), ">")
    await user.click(rowSwitch(2))
    await user.click(tabButton("sell"))
    await typeInto(user, threshold(1, "sell"), "80")
    await user.click(tabButton("buy"))
    await user.click(panel().getByRole("button", { name: /Mặc định/ }))
    expect(threshold(1).value).toBe("30")
    expect(comparison(1).value).toBe("<")
    expect(rowSwitch(2).getAttribute("aria-checked")).toBe("true")
    expect(holdInput().value).toBe("25")
    await user.click(tabButton("sell"))
    expect(threshold(1, "sell").value).toBe("80")
  })

  it("an out-of-range value is flagged on its own field with the server's message; nothing is repaired and nothing starts", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await typeInto(user, period(2), "1")
    const message = "Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên."
    expect(period(2).value).toBe("1")
    expect(period(2).getAttribute("aria-invalid")).toBe("true")
    expect(period(1).getAttribute("aria-invalid")).toBeNull()
    expect(panel().getByTestId("row-errors-buy").textContent).toBe(message)
    expect(panel().getByTestId("start-blocker").textContent).toBe(message)
    expect(tabButton("buy").textContent).toContain("(có lỗi)")
    expect(startButton().disabled).toBe(true)
    await user.click(startButton())
    expect(backend.callsTo("POST", /runs/)).toHaveLength(0)
    // What was typed is what is saved: the server judges it at Start.
    await waitFor(() => expect(savedDrafts()).toHaveLength(1), { timeout: 3000 })
    expect(rulesOf(savedDrafts()[0].draft, "buy")[1].period).toBe(1)
    // A valid value clears the message and arms Bắt đầu again.
    await typeInto(user, period(2), "9")
    expect(panel().queryByTestId("row-errors-buy")).toBeNull()
    expect(period(2).getAttribute("aria-invalid")).toBeNull()
    expect(startButton().disabled).toBe(false)
  })

  it("the rows of a tab that is switched off are still checked before Start, and the other tab shows the marker", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(tabButton("sell"))
    await user.click(panel().getByRole("switch", { name: "Bật Bán" }))
    await typeInto(user, threshold(1, "sell"), "150")
    const message = "Bán · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên."
    expect(panel().getByTestId("row-errors-sell").textContent).toBe(message)
    expect(startButton().disabled).toBe(true)
    await user.click(tabButton("buy"))
    expect(panel().getByRole("button", { name: "Điều kiện Bán (có lỗi)" })).toBeTruthy()
    expect(panel().getByTestId("start-blocker").textContent).toBe(message)
    expect(startButton().disabled).toBe(true)
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
    await typeInto(user, holdInput(), value)
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
      await typeInto(user, holdInput(), value)
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

  it.each([
    ["cmf", "Ngưỡng CMF", "-0.05", -0.05],
    ["cci", "Ngưỡng CCI", "-150", -150],
    ["williams_r", "Ngưỡng Williams %R", "-85", -85],
    ["roc", "Ngưỡng ROC (%)", "-2.5", -2.5],
  ])("%s: a negative or decimal threshold is kept as typed and saved as that number", async (indicatorId, label, text, value) => {
    install(createBackend({ indicatorId }))
    const user = userEvent.setup()
    renderPractice(indicatorId)
    await ready()
    const input = rowField(label, 1)
    await typeInto(user, input, text)
    expect(input.value).toBe(text)
    expect(input.getAttribute("aria-invalid")).toBeNull()
    expect(startButton().disabled).toBe(false)
    await waitFor(() => expect(savedDrafts()).toHaveLength(1), { timeout: 3000 })
    expect(rulesOf(savedDrafts()[0].draft, "buy")[0].threshold).toBe(value)
  })
})

describe("chart legend and preview", () => {
  it("the legend follows the side and the rows of that side", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    expect(legend().getByTestId("legend-side").textContent).toBe("Điều kiện phía Mua")
    expect(legend().getByText("RSI 14")).toBeTruthy()
    expect(legend().getByText(/Ngưỡng 30/)).toBeTruthy()
    await typeInto(user, period(1), "10")
    await waitFor(() => expect(legend().getByText("RSI 10")).toBeTruthy(), { timeout: 3000 })
    // The second row still reads RSI 14, so the side draws two lines.
    expect(legend().getByText("RSI 14")).toBeTruthy()
    await user.click(legend().getByRole("button", { name: "Bán" }))
    expect(legend().getByTestId("legend-side").textContent).toBe("Điều kiện phía Bán")
    expect(legend().getByText("RSI 14")).toBeTruthy()
    expect(legend().queryByText("RSI 10")).toBeNull()
    expect(legend().getByText(/Ngưỡng 70/)).toBeTruthy()
    expect(legend().getByText(/Mốc tham khảo 50/)).toBeTruthy()
  })

  it("draws a line per row on the chart, each tagged with its row, and none for a row switched off", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    const lines = () => [...screen.getByTestId("practice-chart").querySelectorAll("path[data-series]")].map((node) => [node.getAttribute("data-series"), node.getAttribute("data-row")])
    expect(lines()).toEqual([["rsi.level.value", "rsi.level"]])
    await typeInto(user, period(2), "9")
    await waitFor(() => expect(lines()).toEqual([["rsi.level.value", "rsi.level"], ["rsi.trend.value", "rsi.trend"]]), { timeout: 3000 })
    await user.click(rowSwitch(1))
    await waitFor(() => expect(lines()).toEqual([["rsi.trend.value", "rsi.trend"]]), { timeout: 3000 })
  })

  it("the preview sends every row of both tabs; a half-typed row that is off never blocks it, one that is on does", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    const before = previews().length
    expect(before).toBeGreaterThan(0)
    const first = previews()[0]
    expect(first.buy_rows).toEqual([
      { id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 30 },
      { id: "rsi.trend", enabled: true, period: 14, dir: "up" },
    ])
    expect(first.sell_rows).toHaveLength(2)
    expect(first.buy_params).toBeUndefined()

    // Row 2 off with a period of 20: sent as it is.
    await user.click(rowSwitch(2))
    await typeInto(user, period(2), "20")
    await waitFor(() => expect(previews().at(-1)?.buy_rows?.[1]).toEqual({ id: "rsi.trend", enabled: false, period: 20, dir: "up" }), { timeout: 3000 })

    // Then half-typed while still off: the chart goes on drawing the rows that are on, and the row travels with its registry default.
    await user.clear(period(2))
    await waitFor(() => expect(previews().at(-1)?.buy_rows?.[1]).toEqual({ id: "rsi.trend", enabled: false, period: 14, dir: "up" }), { timeout: 3000 })
    expect(screen.getByTestId("practice-chart")).toBeTruthy()
    for (const body of previews()) for (const row of [...(body.buy_rows ?? []), ...(body.sell_rows ?? [])]) expect(Number.isFinite(row.period)).toBe(true)
    // Start is still blocked by the message of that row.
    expect(startButton().disabled).toBe(true)
    expect(panel().getByTestId("row-errors-buy").textContent).toBe("Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")

    // Switched on while empty: the chart would have to draw it, so no preview is sent for it.
    const sent = previews().length
    await user.click(rowSwitch(2))
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(previews().length).toBe(sent)
    await typeInto(user, period(2), "9")
    await waitFor(() => expect(previews().at(-1)?.buy_rows?.[1]).toEqual({ id: "rsi.trend", enabled: true, period: 9, dir: "up" }), { timeout: 3000 })
  })
})

describe("start", () => {
  it("locks the form with one start request carrying ordinal, case id, the rows and an idempotency key", async () => {
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.dblClick(startButton())
    await panel().findByRole("button", { name: "Xem kết quả ngay" })
    // The second click of the double click must not trigger the next action ("Xem kết quả ngay") by accident.
    expect(main().getByText("Kết quả đang chạy")).toBeTruthy()
    const starts = backend.callsTo("POST", /runs/)
    expect(starts).toHaveLength(1)
    const body = starts[0].body as StartBody
    expect(body.ordinal).toBe(1)
    expect(body.case_id).toBe(backend.state.case.case_id)
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    expect(body.config.hold_max_sessions).toBe(60)
    expect(rulesOf(body.config, "buy")).toEqual([
      { id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 30 },
      { id: "rsi.trend", enabled: true, period: 14, dir: "up" },
    ])
    expect(rulesOf(body.config, "sell")).toEqual([
      { id: "rsi.level", enabled: true, period: 14, op: ">", threshold: 70 },
      { id: "rsi.trend", enabled: true, period: 14, dir: "down" },
    ])

    // Locked: the same sentences as text, no input and no switch to flip.
    expect(panel().getByText("Đã khóa")).toBeTruthy()
    expect(panel().queryByLabelText("Chu kỳ RSI (dòng 1, Mua)")).toBeNull()
    const list = panel().getByRole("list", { name: "Điều kiện Mua" })
    const values = (rowId: string) => [...list.querySelectorAll(`[data-row-id="${rowId}"] strong`)].map((node) => node.textContent)
    expect(values("rsi.level")).toEqual(["14", "<", "30"])
    expect(values("rsi.trend")).toEqual(["14", "lên"])
    expect(rowSwitch(1).hasAttribute("disabled")).toBe(true)
    expect(rowSwitch(2).hasAttribute("disabled")).toBe(true)
    expect(holdInput().disabled).toBe(true)
    expect(panel().getByRole("switch", { name: "Bật Mua" }).hasAttribute("disabled")).toBe(true)
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
    expect(period(1).disabled).toBe(false)
    expect(backend.state.current_run).toBeNull()
    await press(user, panel(), "Thử lại")
    await panel().findByRole("button", { name: "Xem kết quả ngay" })
  })

  it("a refused start lists the row messages of the server and keeps the form editable", async () => {
    const user = userEvent.setup()
    backend.startFailures.push({
      status: 422,
      code: "PRACTICE_CONFIG_INVALID",
      message: "Cấu hình điều kiện không hợp lệ.",
      details: [
        { path: "buy.rules.1.period", message: "Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên." },
        { path: "sell.rules.0.threshold", message: "Bán · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên." },
      ],
    })
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    expect(await panel().findByText("Cấu hình điều kiện không hợp lệ.")).toBeTruthy()
    expect(panel().getByText("Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")).toBeTruthy()
    expect(panel().getByText("Bán · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên.")).toBeTruthy()
    expect(period(1).disabled).toBe(false)
    expect(backend.state.current_run).toBeNull()
  })

  it("compute failure keeps the locked run and retries with the same idempotency key", async () => {
    const user = userEvent.setup()
    backend.failComputeOnce = true
    renderPractice()
    await ready()
    await press(user, panel(), "Bắt đầu")
    await panel().findByRole("button", { name: "Thử lại" })
    expect(panel().getByText("Đã khóa")).toBeTruthy()
    expect(panel().queryByLabelText("Chu kỳ RSI (dòng 1, Mua)")).toBeNull()
    expect(screen.getAllByText(/Không tính được kết quả lượt này/).length).toBeGreaterThan(0)
    await press(user, panel(), "Thử lại")
    await panel().findByRole("button", { name: "Xem kết quả ngay" })
    const starts = backend.callsTo("POST", /runs/).map((call) => (call.body as StartBody).idempotency_key)
    expect(starts).toHaveLength(2)
    expect(starts[0]).toBe(starts[1])
  })

  it("403 not granted links to the lesson of the indicator", async () => {
    backend.stateFailure = { status: 403, code: "CAPABILITY_LOCKED", message: "Cần hoàn thành bài học" }
    renderPractice()
    const notice = await screen.findAllByText(/Bạn chưa mở khóa chỉ báo RSI/)
    expect(notice.length).toBeGreaterThan(0)
    const link = (await screen.findAllByRole("link", { name: /Học bài RSI/ }))[0]
    expect(link.getAttribute("href")).toBe("/demo-trading?view=academy&lesson=ch04-l06")
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
    const expected = `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(result.kpis.total_return! * 100).replace("-", "−")}%`
    expect(tiles[0].querySelector("strong")?.textContent).toBe(expected)

    const comment = main().getByTestId("practice-comment")
    expect(comment.textContent).toContain(result.comment.text!)
    expect(document.body.innerHTML).not.toMatch(/portfolio_result|buy_open_without_sell|comment_rule_id/)

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
    install(createBackend())
    const original = backend.api
    backend.api = async (path, init) => {
      const value = (await original(path, init)) as { result?: typeof run.result }
      if (value?.result) value.result.pending_orders = run.result!.pending_orders
      return value
    }
    renderPractice()
    await startAndFinish(user)
    const pending = main().getByTestId("practice-pending")
    expect(pending.textContent).toContain("chưa được tính là đã khớp")
    expect(pending.textContent).toContain("Lệnh Bán do hết thời gian giữ")
    expect(pending.textContent).toContain("Phiên 503")
  })
})

describe("decision detail", () => {
  it("shows every condition row of the decision session with its values, numbers and result, and jumps the chart from Xem điểm Mua/Bán", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const dialog = await screen.findByRole("dialog")
    const detail = within(dialog)
    expect(detail.getByText("Giao dịch 1 · RSI")).toBeTruthy()
    expect(detail.getByText("Điều kiện Mua · Phiên 19")).toBeTruthy()
    expect(detail.getByText("Điều kiện Bán · Phiên 44")).toBeTruthy()

    const buy = dialog.querySelector('[data-evidence="buy"]') as HTMLElement
    expect([...buy.querySelectorAll("[data-rule]")].map((node) => node.getAttribute("data-rule"))).toEqual(["rsi.level", "rsi.trend"])
    const level = buy.querySelector('[data-rule="rsi.level"]') as HTMLElement
    expect(within(level).getByTestId("evidence-condition").textContent).toBe("RSI 14 < 30")
    expect(level.textContent).toContain("28,15 < 30")
    expect(within(level).getByTestId("evidence-operands").textContent).toBe("Vế trái: RSI 14 · Vế phải: 30")
    const trend = buy.querySelector('[data-rule="rsi.trend"]') as HTMLElement
    expect(within(trend).getByTestId("evidence-condition").textContent).toBe("RSI 14 xu hướng lên")
    expect(within(trend).getByTestId("evidence-operands").textContent).toBe("Vế trái: RSI 14 · Vế phải: RSI 14 cách 14 phiên")
    expect(detail.getAllByText("✓ Đạt").length).toBe(4)
    // A condition row carries its own values: there is no shared parameter line.
    expect(detail.queryByTestId("evidence-params-buy")).toBeNull()
    expect(detail.queryByTestId("evidence-params-sell")).toBeNull()

    expect(detail.getByTestId("trade-fees").textContent).toContain("Phí mua")
    expect(detail.getByTestId("trade-fees").textContent).toContain("Phí và thuế bán")
    expect(detail.getByTestId("trade-fees").textContent).toContain("giá mở cửa Phiên 20")
    await user.click(detail.getByRole("button", { name: "Xem điểm Bán" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The window now ends a little after Phiên 45 instead of at the last session.
    const slider = main().getByLabelText("Dịch vùng biểu đồ đã mở") as HTMLInputElement
    expect(Number(slider.value)).toBe(45 + 26)
  })

  it("a cross row shows both sessions, and only the rows that were on appear", async () => {
    install(createBackend({ indicatorId: "macd" }))
    const user = userEvent.setup()
    renderPractice("macd")
    await startAndFinish(user)
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const dialog = await screen.findByRole("dialog")
    const buy = dialog.querySelector('[data-evidence="buy"]') as HTMLElement
    // MACD has three rows; only the signal row was on.
    expect([...buy.querySelectorAll("[data-rule]")].map((node) => node.getAttribute("data-rule"))).toEqual(["macd.signal"])
    const rule = buy.querySelector('[data-rule="macd.signal"]') as HTMLElement
    expect(within(rule).getByTestId("evidence-condition").textContent).toBe("MACD 12 / 26 cắt lên Signal 9")
    expect(rule.textContent).toContain("Giao cắt: 25,4 cắt lên 24,8")
    expect(rule.textContent).toContain("Phiên trước (T−1): 24,5 / 24,7")
    expect(within(rule).getByTestId("evidence-operands").textContent).toBe("Vế trái: MACD 12/26 · Vế phải: Signal 9")
  })

  it("explains a time exit separately from an indicator exit", async () => {
    const user = userEvent.setup()
    renderPractice()
    await startAndFinish(user)
    await user.click(main().getByRole("button", { name: "Xem giao dịch 2" }))
    const detail = within(await screen.findByRole("dialog"))
    expect(detail.getByText("Hết thời gian giữ · Phiên 159")).toBeTruthy()
    expect(detail.getByTestId("time-exit").textContent).toContain("giới hạn của lượt là 60 phiên")
    // The sell conditions of that session are listed too, and they were not met.
    expect(detail.getByText(/Điều kiện Bán lúc đó \(chưa đạt\)/)).toBeTruthy()
    expect(detail.getAllByText("✕ Không đạt").length).toBe(2)
  })

  it.each([
    ["the Bán tab was off", "Điều kiện Bán đang tắt."],
    ["no Bán row was on", "Điều kiện Bán đang bật nhưng chưa có dòng nào được bật, nên không có tín hiệu Bán."],
  ])("a side with no verdict says why when %s", async (reason, text) => {
    backend.plan = [{ buy: 20, sell: 80, reason: "max_holding" }, { buy: 200 }]
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(tabButton("sell"))
    if (reason === "the Bán tab was off") {
      await user.click(panel().getByRole("switch", { name: "Bật Bán" }))
    } else {
      await user.click(rowSwitch(1, "sell"))
      await user.click(rowSwitch(2, "sell"))
    }
    await press(user, panel(), "Bắt đầu")
    await main().findByTestId("practice-results")
    await press(user, panel(), "Xem kết quả ngay")
    await main().findByText("Kết quả 24 tháng")
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const detail = within(await screen.findByRole("dialog"))
    expect(detail.getByTestId("time-exit")).toBeTruthy()
    expect(detail.getByTestId("evidence-no-signal-sell").textContent).toBe(text)
    expect(detail.getByText("Điều kiện Bán lúc đó · Phiên 79")).toBeTruthy()
    expect(detail.queryByText(/chưa đạt/)).toBeNull()
  })
})

describe("no lookahead (SPEC V3 §5)", () => {
  it("shows nothing that happens after the displayed session: a held trade has no sell leg, no sell evidence and no later valuation", async () => {
    const run = makeRun()
    withCurrentRun(run)
    window.localStorage.setItem(`iqx.practice.replay.v1:${run.run_id}`, JSON.stringify({ revealed: 30, speed: 1, done: false }))
    const user = userEvent.setup()
    renderPractice()
    await main().findByText("Kết quả đang chạy")
    expect(main().getByTestId("practice-status").textContent).toBe("Đã tạm dừng · Phiên 30/504")
    // Trade 1 is bought at Phiên 20 and sold at Phiên 45, trade 2 is bought at Phiên 100: at Phiên 30 there is one held trade.
    const table = within(main().getByTestId("practice-trades"))
    expect(table.getAllByText("Đang giữ")).toHaveLength(1)
    expect(main().getByTestId("practice-trades").querySelectorAll("tbody tr")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /Giao dịch 1: Mua tại Phiên 20/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Giao dịch 1: Bán/ })).toBeNull()

    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const detail = within(await screen.findByRole("dialog"))
    expect(detail.getByText("Điều kiện Mua · Phiên 19")).toBeTruthy()
    expect(detail.getByText("Đang giữ")).toBeTruthy()
    expect(detail.getByText("Lãi/lỗ tạm tính")).toBeTruthy()
    expect(detail.queryByText("Khớp Bán")).toBeNull()
    expect(detail.queryByText("Phí và thuế bán")).toBeNull()
    expect(detail.queryByText(/Điều kiện Bán/)).toBeNull()
    expect(detail.queryByText(/Phiên 44|Phiên 45|Phiên 504/)).toBeNull()
    expect(detail.queryByRole("button", { name: "Xem điểm Bán" })).toBeNull()
    // The valuation is the close of the displayed session, not of the last one.
    const trade = run.result!.trades[0]
    const close = run.chart!.bars.close[30 - run.chart!.first_session]
    expect(detail.getByText(`đóng cửa Phiên 30: ${formatMoneyVnd(trade.qty * close)}`)).toBeTruthy()

    // The data was only held back: once the replay is done the sell leg and its evidence are there.
    await user.click(detail.getByRole("button", { name: "Đóng" }))
    await press(user, main(), "Xem kết quả ngay")
    await main().findByText("Kết quả 24 tháng")
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const done = within(await screen.findByRole("dialog"))
    expect(done.getByText("Khớp Bán")).toBeTruthy()
    expect(done.getByText("Điều kiện Bán · Phiên 44")).toBeTruthy()
    expect(done.getByRole("button", { name: "Xem điểm Bán" })).toBeTruthy()
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
    expect(period(1).disabled).toBe(false)
    expect(period(1).value).toBe("14")
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
    // A run with condition rows is summed up by its own sentences, and carries no old-format badge.
    expect(history.getByText(/Mua: RSI 14 < 30 và RSI 14 xu hướng lên \| Bán: RSI 14 > 70 và RSI 14 xu hướng xuống/)).toBeTruthy()
    expect(history.queryByText("Định dạng cũ")).toBeNull()
    await user.click(history.getByRole("button", { name: "Xem lượt 01" }))
    await main().findByTestId("past-banner")
    expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 01 / 30")
    expect(panel().queryByLabelText("Chu kỳ RSI (dòng 1, Mua)")).toBeNull()
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
    install(createBackend({ state: { ordinal: 30, case: { case_id: "00000000-0000-4000-8000-00000000001e", ordinal: 30, window_bars: 130 } } }))
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

describe("runs locked before SPEC V3", () => {
  it("a finished old run opens with its own conditions as text, its plain chart line and its old evidence", async () => {
    const run = makeLegacyRun()
    withCurrentRun(run)
    const user = userEvent.setup()
    renderPractice()
    await main().findByText("Kết quả 24 tháng")

    // Panel: the conditions as they were locked, with the old shared parameters, nothing to edit.
    const legacy = panel().getByTestId("legacy-conditions")
    expect(legacy.textContent).toContain("Lượt này khóa theo định dạng điều kiện cũ, với một bộ tham số chung cho cả phía. Kết quả được giữ nguyên.")
    expect(within(legacy).getByText("Chu kỳ RSI")).toBeTruthy()
    expect(within(legacy).getByText("14 phiên")).toBeTruthy()
    expect(within(legacy).getByText("Ngưỡng RSI")).toBeTruthy()
    expect(within(legacy).getByText("30")).toBeTruthy()
    expect(within(legacy).getByText("Điều kiện 1")).toBeTruthy()
    expect(panel().getByText("Đã khóa")).toBeTruthy()
    expect(panel().queryByRole("list", { name: "Điều kiện Mua" })).toBeNull()
    expect(panel().queryByRole("switch", { name: /Bật điều kiện/ })).toBeNull()
    expect(panel().queryByRole("button", { name: "Bắt đầu" })).toBeNull()
    expect(panel().queryByRole("button", { name: /Mặc định/ })).toBeNull()

    // Chart: the plain key, belonging to no row; the legend speaks of parameters, as it used to.
    expect(legend().getByTestId("legend-side").textContent).toBe("Tham số phía Mua")
    const line = screen.getByTestId("chart-pane-indicator").querySelector('path[data-series="value"]')
    expect(line?.getAttribute("d")).toMatch(/^M/)
    expect(line?.hasAttribute("data-row")).toBe(false)
    await user.click(legend().getByRole("button", { name: "Bán" }))
    expect(legend().getByTestId("legend-side").textContent).toBe("Tham số phía Bán")
    expect(within(panel().getByTestId("legacy-conditions")).getByText("70")).toBeTruthy()

    // Evidence: the side's params and the rules r1 / r2, without the row-only lines.
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const dialog = await screen.findByRole("dialog")
    const detail = within(dialog)
    expect(detail.getByTestId("evidence-params-buy").textContent).toContain("Chu kỳ RSI 14 phiên")
    expect(detail.getByTestId("evidence-params-buy").textContent).toContain("Ngưỡng RSI 30")
    expect([...dialog.querySelectorAll('[data-evidence="buy"] [data-rule]')].map((node) => node.getAttribute("data-rule"))).toEqual(["r1", "r2"])
    const conditions = [...dialog.querySelectorAll('[data-evidence="buy"] [data-testid="evidence-condition"]')].map((node) => node.textContent)
    expect(conditions).toEqual(["RSI phiên trước < 30", "RSI > RSI phiên trước"])
    expect(detail.queryByTestId("evidence-operands")).toBeNull()
    expect(detail.getAllByText("✓ Đạt").length).toBe(4)
    expect(detail.getAllByText(/Phiên trước \(T−1\)/).length).toBeGreaterThan(0)
  })

  it("the history lists an old run with the old-format badge and opens it read-only; Về lượt hiện tại brings the editable rows back", async () => {
    const old = makeLegacyRun({ ordinal: 1 })
    install(createBackend({ state: { ordinal: 2, case: { case_id: "00000000-0000-4000-8000-000000000002", ordinal: 2, window_bars: 130 }, runs: [briefOf(old)], completed_count: 1 }, runs: [old] }))
    const user = userEvent.setup()
    renderPractice()
    await ready()
    await user.click(main().getByRole("button", { name: "Lượt đã luyện" }))
    const history = within(await screen.findByTestId("practice-history"))
    expect(await history.findByText("Lượt 01")).toBeTruthy()
    expect(history.getByText("Định dạng cũ")).toBeTruthy()
    expect(history.getByText(/Mua: 14 \/ 30 · < · >/)).toBeTruthy()
    await user.click(history.getByRole("button", { name: "Xem lượt 01" }))
    await main().findByTestId("past-banner")
    await main().findByText("Kết quả 24 tháng")
    expect(panel().getByTestId("legacy-conditions")).toBeTruthy()
    expect(panel().queryByRole("list", { name: "Điều kiện Mua" })).toBeNull()
    await press(user, panel(), "Về lượt hiện tại")
    await panel().findByRole("button", { name: "Bắt đầu" })
    expect(screen.getByTestId("practice-ordinal").textContent).toBe("Lượt 02 / 30")
    expect(period(1).disabled).toBe(false)
    expect(panel().queryByTestId("legacy-conditions")).toBeNull()
    expect(backend.callsTo("POST", /runs/)).toHaveLength(0)
  })

  it("a run locked in the old format that never finished is offered again with the new conditions and replaced by the next start", async () => {
    const stuck = makeOutdatedRun()
    install(createBackend({ state: makeOutdatedState(stuck), runs: [stuck] }))
    const user = userEvent.setup()
    renderPractice()
    await ready()
    // The server's own explanation, the new default rows, nothing locked and nothing to retry.
    expect(panel().getByTestId("outdated-run").textContent).toBe(OUTDATED_RUN_ERROR.message)
    expect(period(1).value).toBe("14")
    expect(period(1).disabled).toBe(false)
    expect(panel().queryByText("Đã khóa")).toBeNull()
    expect(panel().queryByRole("button", { name: "Thử lại" })).toBeNull()
    expect(panel().queryByTestId("legacy-conditions")).toBeNull()
    expect(main().queryByText("Chưa có kết quả")).toBeNull()
    expect(main().getByTestId("practice-status").textContent).toBe("Sẵn sàng luyện tập")
    // It is not a finished run, so the history does not list it.
    await user.click(main().getByRole("button", { name: "Lượt đã luyện" }))
    const history = within(await screen.findByTestId("practice-history"))
    expect(await history.findByText("Chưa có lượt hoàn thành.")).toBeTruthy()
    await user.click(history.getByRole("button", { name: "Đóng" }))

    // The draft can be edited and saved while the stuck run is there.
    await typeInto(user, threshold(1), "25")
    await waitFor(() => expect(savedDrafts()).toHaveLength(1), { timeout: 3000 })
    expect(rulesOf(savedDrafts()[0].draft, "buy")[0]).toEqual({ id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 25 })

    await press(user, panel(), "Bắt đầu")
    await main().findByTestId("practice-results")
    const starts = backend.callsTo("POST", /runs/)
    expect(starts).toHaveLength(1)
    expect(rulesOf((starts[0].body as StartBody).config, "buy")[0]).toEqual({ id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 25 })
    // The stuck run is gone and the new one is the case's run.
    expect(backend.runs.has(OUTDATED_RUN_ID)).toBe(false)
    expect(backend.runs.size).toBe(1)
    expect(screen.queryByTestId("outdated-run")).toBeNull()
    expect(panel().getByText("Đã khóa")).toBeTruthy()
  })
})

describe("Volume keeps its parameters", () => {
  const lookback = () => panel().getByLabelText("Số phiên tham chiếu") as HTMLInputElement
  const multiplier = () => panel().getByLabelText("Hệ số khối lượng") as HTMLInputElement

  it("shows the side's parameters and rule operators, not condition rows", async () => {
    install(createBackend({ indicatorId: "volume" }))
    const user = userEvent.setup()
    renderPractice("volume")
    await ready()
    expect(lookback().value).toBe("20")
    expect(multiplier().value).toBe("1")
    expect((panel().getByLabelText("Dấu điều kiện 1") as HTMLSelectElement).value).toBe(">")
    expect((panel().getByLabelText("Dấu điều kiện 2") as HTMLSelectElement).value).toBe(">")
    expect(panel().queryByRole("list", { name: "Điều kiện Mua" })).toBeNull()
    expect(panel().queryByRole("switch", { name: /Bật điều kiện/ })).toBeNull()
    expect(panel().queryByTestId("row-count-buy")).toBeNull()
    expect(legend().getByTestId("legend-side").textContent).toBe("Tham số phía Mua")
    // Plain keys: the threshold line and the volume bars, tagged with no row.
    const pane = screen.getByTestId("chart-pane-indicator")
    expect(pane.querySelector('path[data-series="threshold"]')?.hasAttribute("data-row")).toBe(false)
    expect(pane.querySelectorAll('rect[data-bar="volume"]').length).toBeGreaterThan(10)

    // The Bán tab has its own parameters and operators, and the chart follows the tab.
    await user.click(tabButton("sell"))
    expect((panel().getByLabelText("Dấu điều kiện 1") as HTMLSelectElement).value).toBe("<")
    expect(legend().getByTestId("legend-side").textContent).toBe("Tham số phía Bán")
  })

  it("saves params and operators, previews with buy_params / sell_params and starts with them", async () => {
    install(createBackend({ indicatorId: "volume" }))
    const user = userEvent.setup()
    renderPractice("volume")
    await ready()
    expect(previews()[0]).toEqual({ buy_params: { lookback: 20, mult: 1 }, sell_params: { lookback: 20, mult: 1 } })
    await typeInto(user, lookback(), "30")
    await user.selectOptions(panel().getByLabelText("Dấu điều kiện 1"), "<")
    await waitFor(() => expect(previews().at(-1)?.buy_params).toEqual({ lookback: 30, mult: 1 }), { timeout: 3000 })
    expect(previews().at(-1)?.buy_rows).toBeUndefined()
    await waitFor(() => expect(savedDrafts().length).toBeGreaterThan(0), { timeout: 3000 })
    const draft = savedDrafts().at(-1)!.draft as unknown as { buy: { params: Record<string, number>; ops: Record<string, string> } }
    expect(draft.buy.params).toEqual({ lookback: 30, mult: 1 })
    expect(draft.buy.ops).toEqual({ r1: "<", r2: ">" })

    await press(user, panel(), "Bắt đầu")
    await main().findByTestId("practice-results")
    const config = (backend.callsTo("POST", /runs/)[0].body as { config: { buy: { params: Record<string, number> } } }).config
    expect(config.buy.params).toEqual({ lookback: 30, mult: 1 })
    expect(panel().getByText("Đã khóa")).toBeTruthy()
    expect(lookback().disabled).toBe(true)
  })

  it("refuses a value outside the range of a parameter and explains the evidence with the params of the run", async () => {
    install(createBackend({ indicatorId: "volume" }))
    const user = userEvent.setup()
    renderPractice("volume")
    await ready()
    await typeInto(user, lookback(), "3")
    expect(lookback().getAttribute("aria-invalid")).toBe("true")
    expect(startButton().disabled).toBe(true)
    await typeInto(user, lookback(), "20")
    expect(startButton().disabled).toBe(false)
    await press(user, panel(), "Bắt đầu")
    await main().findByTestId("practice-results")
    await press(user, panel(), "Xem kết quả ngay")
    await main().findByText("Kết quả 24 tháng")
    await user.click(main().getByRole("button", { name: "Xem giao dịch 1" }))
    const detail = within(await screen.findByRole("dialog"))
    expect(detail.getByTestId("evidence-params-buy").textContent).toBe("Tham số: Số phiên tham chiếu 20 phiên · Hệ số khối lượng 1 lần")
    expect(detail.getAllByTestId("evidence-condition").map((node) => node.textContent).slice(0, 2)).toEqual(["Giá đóng cửa > Giá đóng cửa phiên trước", "Khối lượng > 1 × TB 20 phiên"])
    expect(detail.queryByTestId("evidence-operands")).toBeNull()
  })
})

describe("every row-based indicator renders its rows from the form descriptor", () => {
  it.each(ROWS_INDICATORS)("%s: the registry rows with their switches, no parameter grid, chart lines keyed by row", async (indicatorId) => {
    install(createBackend({ indicatorId }))
    renderPractice(indicatorId)
    await ready()
    const ids = registryRows(indicatorId).map((row) => row.id)
    const list = panel().getByRole("list", { name: "Điều kiện Mua" })
    expect([...list.querySelectorAll("li")].map((item) => item.getAttribute("data-row-id"))).toEqual(ids)
    expect(within(list).getAllByRole("switch")).toHaveLength(ids.length)
    expect(screen.getByTestId("panel").querySelector("[data-param]")).toBeNull()
    expect(panel().getByTestId("row-count-buy").textContent).toMatch(/điều kiện được bật/)
    const lines = [...screen.getByTestId("practice-chart").querySelectorAll("path[data-series]")]
    for (const line of lines) {
      expect(ids, line.getAttribute("data-series") ?? "").toContain(line.getAttribute("data-row"))
      expect(line.getAttribute("data-series")).toMatch(new RegExp(`^${line.getAttribute("data-row")?.replace(".", "\\.")}\\.`))
    }
    expect(legend().getByTestId("legend-side").textContent).toBe("Điều kiện phía Mua")
  })
})
