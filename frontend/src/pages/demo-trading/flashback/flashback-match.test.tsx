/**
 * Màn chơi, khung đặt lệnh, chỉ báo và cửa sổ kết quả của Flashback v2 (spec §6, §7).
 */
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceFrameContext, type WorkspaceFrameState } from "@/components/layout/workspace-frame-context"

import { FlashbackMain } from "./flashback-main"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import {
  INDICATOR_METAS,
  ME,
  MINH,
  ROOM_CODE,
  createFlashbackBackend,
  listingRow,
  type BackendOptions,
  type FlashbackBackend,
} from "./flashback-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  openAuth: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, openAuth: mocks.openAuth }),
}))
vi.mock("../shop/use-shop", () => ({ useShopState: () => ({ data: { wallet: { balance: 5_000 } } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: FlashbackBackend

/** Ván đang chơi giữa hai người (mình và Minh), cược 100 xu. */
function setup(options: BackendOptions = {}) {
  backend = createFlashbackBackend({
    room: { status: "playing", owner: ME, members: [ME, MINH] },
    ...options,
  })
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return backend
}

function renderGame(frame?: WorkspaceFrameState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const game = (
    <FlashbackProvider>
      <FlashbackMain />
      <FlashbackPanel />
    </FlashbackProvider>
  )
  return render(
    <QueryClientProvider client={client}>
      {frame ? <WorkspaceFrameContext.Provider value={frame}>{game}</WorkspaceFrameContext.Provider> : game}
    </QueryClientProvider>,
  )
}

/** Trạng thái khung làm việc giả: cột bên phải (màn hình rộng) hoặc lớp trượt (điện thoại). */
function frameState(overrides: Partial<WorkspaceFrameState> = {}): WorkspaceFrameState {
  return {
    open: false,
    overlay: false,
    railBar: false,
    collapsed: false,
    panelId: "panel",
    panelLabel: "Flashback",
    setOpen: vi.fn(),
    revealPanel: vi.fn(),
    ...overrides,
  }
}

/** Giả lập khung biểu đồ rộng như máy tính (jsdom không có bố cục nên mặc định là bố cục điện thoại). */
function stubChartWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width })
}

async function findGame() {
  await screen.findByTestId("flashback-clock")
  await waitFor(() => expect(screen.getByTestId("flashback-session")).toBeTruthy())
}

const tiles = () => screen.getByRole("region", { name: "Số liệu ván chơi" })
const tileValue = (label: string) => within(tiles()).getByText(label).nextElementSibling?.textContent
const orderForm = () => screen.getByRole("region", { name: "Đặt lệnh" })
const nextButton = () => screen.getByTestId("flashback-next")

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  mocks.api.mockReset()
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  window.localStorage.clear()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth")
})

describe("Flashback: thanh người chơi và đồng hồ chung", () => {
  it("mỗi người một ô avatar, tên và % lợi nhuận; dòng của mình có nền nhạt", async () => {
    setup()
    renderGame()
    await findGame()
    const cells = screen.getAllByTestId("flashback-player")
    expect(cells.map((cell) => cell.getAttribute("data-me"))).toEqual(["true", "false"])
    expect(within(cells[0]).getByText("Linh")).toBeTruthy()
    expect(within(cells[1]).getByText("Minh")).toBeTruthy()
    expect(cells[0].textContent).toContain("0,00%")
    expect(cells[1].textContent).toContain("0,00%")
    expect(cells[0].className).toContain("bg-primary/10")
    expect(cells[1].className).not.toContain("bg-primary/10")
  })

  it("người dẫn đầu có viền vàng quanh avatar; một mình thì không có", async () => {
    setup()
    backend.setRivalPnl(MINH.user_id, 3.5)
    renderGame()
    await findGame()
    const cells = screen.getAllByTestId("flashback-player")
    expect(cells.map((cell) => cell.getAttribute("data-leader"))).toEqual(["false", "true"])
    expect(cells[1].querySelector("[class*='ring-chart-2']")).not.toBeNull()
    expect(cells[0].querySelector("[class*='ring-chart-2']")).toBeNull()
    expect(cells[1].textContent).toContain("+3,50%")
  })

  it("chơi một mình: không ai dẫn đầu", async () => {
    setup({ room: { status: "playing", owner: ME, members: [ME] }, match: { rivals: [] } })
    renderGame()
    await findGame()
    expect(screen.getAllByTestId("flashback-player")).toHaveLength(1)
    expect(screen.getByTestId("flashback-player").getAttribute("data-leader")).toBe("false")
  })

  it("đồng hồ chung đếm lùi mm:ss ở giữa; còn dưới 1 phút thì chuyển đỏ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ match: { remainingMs: 63_000 } })
    renderGame()
    await findGame()
    const clock = screen.getByTestId("flashback-clock")
    expect(clock.textContent).toBe("01:03")
    expect(clock.getAttribute("data-low")).toBe("false")

    await advance(4_000)
    await waitFor(() => expect(screen.getByTestId("flashback-clock").textContent).toBe("00:59"))
    expect(screen.getByTestId("flashback-clock").getAttribute("data-low")).toBe("true")
    expect(screen.getByTestId("flashback-clock").querySelector("b")?.className).toContain("text-destructive")
  })

  it("ván đã kết thúc thì đồng hồ ghi Kết thúc", async () => {
    setup({ match: { status: "ended" } })
    renderGame()
    await screen.findByTestId("flashback-result")
    expect(screen.getByTestId("flashback-clock").textContent).toBe("Kết thúc")
  })
})

describe("Flashback: số liệu và biểu đồ", () => {
  it("ba ô: Phiên, Tổng tài sản, Tiền mặt; không có ô Lợi nhuận", async () => {
    setup()
    renderGame()
    await findGame()
    expect(tileValue("Phiên")).toBe("0 / 30")
    expect(tileValue("Tổng tài sản")).toBe("10.000.000")
    expect(tileValue("Tiền mặt")).toBe("10.000.000")
    expect(within(tiles()).queryByText("Lợi nhuận")).toBeNull()
    const progress = within(tiles()).getByRole("progressbar", { name: "Tiến độ phiên" })
    expect(progress.getAttribute("aria-valuenow")).toBe("0")
    expect(progress.getAttribute("aria-valuemax")).toBe("30")
  })

  it("trục ngang có nhãn Lịch sử {n} phiên, Phiên 1, phiên giữa và Phiên {n}", async () => {
    stubChartWidth(1000)
    setup()
    renderGame()
    await findGame()
    const chart = screen.getByRole("img", { name: "Biểu đồ nến Flashback" })
    const labels = Array.from(chart.querySelectorAll("text")).map((node) => node.textContent)
    for (const label of ["Lịch sử 60 phiên", "Phiên 1", "Phiên 15", "Phiên 30"]) expect(labels).toContain(label)
    expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 0")
  })

  it("điện thoại: nhãn trục rút gọn và biểu đồ dùng chiều cao điện thoại", async () => {
    setup()
    renderGame()
    await findGame()
    const chart = screen.getByRole("img", { name: "Biểu đồ nến Flashback" })
    const labels = Array.from(chart.querySelectorAll("text")).map((node) => node.textContent)
    expect(labels).toContain("Lịch sử")
    expect(labels).not.toContain("Lịch sử 60 phiên")
    expect(chart.parentElement?.getAttribute("data-narrow")).toBe("true")
    expect(document.querySelector('[data-pane="price"]')?.getAttribute("data-plot-height")).toBe("240")
    expect(document.querySelector('[data-pane="volume"]')?.getAttribute("data-plot-height")).toBe("70")
  })

  it("máy tính: ô giá 300px và ô khối lượng 90px", async () => {
    stubChartWidth(1000)
    setup()
    renderGame()
    await findGame()
    expect(document.querySelector('[data-pane="price"]')?.getAttribute("data-plot-height")).toBe("300")
    expect(document.querySelector('[data-pane="volume"]')?.getAttribute("data-plot-height")).toBe("90")
    expect(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }).parentElement?.getAttribute("data-narrow")).toBe("false")
  })

  it("số phiên xem và chơi theo đúng phòng: 45 xem, 40 chơi thì trục ghi Lịch sử 45 phiên và Phiên 40", async () => {
    stubChartWidth(1000)
    setup({ room: { status: "playing", owner: ME, members: [ME, MINH], settings: { view_bars: 45, play_bars: 40 } } })
    renderGame()
    await findGame()
    const labels = Array.from(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }).querySelectorAll("text")).map((node) => node.textContent)
    for (const label of ["Lịch sử 45 phiên", "Phiên 1", "Phiên 20", "Phiên 40"]) expect(labels).toContain(label)
    expect(tileValue("Phiên")).toBe("0 / 40")
  })
})

describe("Flashback: phiên tiếp và hoàn thành", () => {
  it("Phiên tiếp gọi server và mở thêm đúng một nến", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    expect(nextButton().textContent).toContain("Phiên tiếp")

    await user.click(nextButton())
    await waitFor(() => expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 1"))
    expect(backend.callsTo("POST", "/flashback/matches/")).toHaveLength(1)
    expect(tileValue("Phiên")).toBe("1 / 30")
  })

  it("mỗi người tự bấm Phiên tiếp, không chờ người khác", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    await user.click(nextButton())
    await waitFor(() => expect(tileValue("Phiên")).toBe("1 / 30"))
    await user.click(nextButton())
    await waitFor(() => expect(tileValue("Phiên")).toBe("2 / 30"))
    expect(backend.match().rivals[0].finished).toBe(false)
  })

  it("ở phiên cuối nút đổi thành Hoàn thành; bấm xong thì Đã hoàn thành và hiện lớp Chờ người chơi khác", async () => {
    const user = userEvent.setup()
    setup({ match: { step: 29 } })
    renderGame()
    await findGame()
    await user.click(nextButton())
    await waitFor(() => expect(nextButton().textContent).toBe("Hoàn thành"))
    expect(screen.queryByTestId("flashback-waiting")).toBeNull()

    await user.click(nextButton())
    const overlay = await screen.findByTestId("flashback-waiting")
    expect(within(overlay).getByText("Chờ người chơi khác")).toBeTruthy()
    expect(within(overlay).getByText("Còn 1 người đang chơi")).toBeTruthy()
    expect(nextButton().textContent).toBe("Đã hoàn thành")
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true)
    expect(backend.callsTo("POST", "/flashback/matches/").map((call) => call.path.split("/").pop())).toEqual(["next", "finish"])

    // Sau khi hoàn thành không đặt lệnh được nữa.
    expect((within(orderForm()).getByLabelText("Số cổ phiếu") as HTMLInputElement).disabled).toBe(true)
    expect((within(orderForm()).getByRole("button", { name: "Đặt mua" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("người khác hoàn thành thì ván kết thúc và hiện cửa sổ kết quả; Xem lại biểu đồ rồi Xem kết quả", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    setup({ match: { step: 30, finished: true } })
    renderGame()
    await screen.findByTestId("flashback-waiting")
    expect(screen.queryByTestId("flashback-result")).toBeNull()

    backend.rivalFinishes(MINH.user_id, 2)
    await advance(2_100)
    const dialog = await screen.findByTestId("flashback-result")
    expect(within(dialog).getByText("Minh thắng")).toBeTruthy()
    expect(screen.queryByTestId("flashback-waiting")).toBeNull()

    await user.click(within(dialog).getByRole("button", { name: "Xem lại biểu đồ" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-result")).toBeNull())
    expect(nextButton().textContent).toBe("Xem kết quả")
    await user.click(nextButton())
    expect(await screen.findByTestId("flashback-result")).toBeTruthy()
  })
})

describe("Flashback: cửa sổ kết quả", () => {
  async function finishedGame(rivalPnl: number) {
    setup({ match: { status: "ended", finished: true, step: 30, rivals: [{ person: MINH, pnl: rivalPnl, finished: true }] } })
    renderGame()
    return within(await screen.findByTestId("flashback-result"))
  }

  it("tiêu đề, xếp hạng, mã cổ phiếu và thời gian; chỉ dòng người thắng có xu", async () => {
    const dialog = await finishedGame(2)
    expect(dialog.getByText("Minh thắng")).toBeTruthy()
    const rows = dialog.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("Minh")
    expect(rows[0].textContent).toContain("+2,00%")
    expect(rows[0].textContent).toContain("+200 xu")
    expect(rows[1].textContent).toContain("Linh")
    expect(rows[1].textContent).toContain("0,00%")
    expect(rows[1].textContent).not.toContain("xu")
    expect(rows[1].getAttribute("data-me")).toBe("true")
    expect(dialog.getByText("VNM")).toBeTruthy()
    expect(dialog.getByText("02/01/2026")).toBeTruthy()
    expect(dialog.getByText("31/03/2026")).toBeTruthy()
    expect(dialog.getByRole("button", { name: "Xem lại biểu đồ" })).toBeTruthy()
    expect(dialog.getByRole("button", { name: "Về sảnh" })).toBeTruthy()
    expect(dialog.getByRole("button", { name: "Chơi lại" })).toBeTruthy()
  })

  it("mình thắng thì tiêu đề Bạn thắng và dòng của mình có xu", async () => {
    setup({ match: { status: "ended", finished: true, step: 30, cash: 10_150_000, rivals: [{ person: MINH, pnl: -1.5, finished: true }] } })
    renderGame()
    const dialog = within(await screen.findByTestId("flashback-result"))
    expect(dialog.getByText("Bạn thắng")).toBeTruthy()
    const rows = dialog.getAllByRole("listitem")
    expect(rows[0].getAttribute("data-me")).toBe("true")
    expect(rows[0].textContent).toContain("+1,50%")
    expect(rows[0].textContent).toContain("+200 xu")
    expect(rows[1].textContent).toContain("−1,50%")
    expect(rows[1].textContent).not.toContain("xu")
  })

  it("chơi một mình: tiêu đề Kết quả, không ai có xu", async () => {
    setup({
      room: { status: "playing", owner: ME, members: [ME] },
      match: { status: "ended", finished: true, step: 30, rivals: [] },
    })
    renderGame()
    const dialog = within(await screen.findByTestId("flashback-result"))
    expect(dialog.getByText("Kết quả")).toBeTruthy()
    expect(dialog.getAllByRole("listitem")).toHaveLength(1)
    expect(dialog.getAllByRole("listitem")[0].textContent).not.toContain("xu")
  })

  it("hoà ở 0%: tiêu đề Hoà và dòng người thắng ghi Hoàn xu cược", async () => {
    const dialog = await finishedGame(0)
    expect(dialog.getByText("Hoà")).toBeTruthy()
    expect(dialog.getAllByText("Hoàn xu cược")).toHaveLength(2)
  })

  it("Chơi lại đưa cả phòng về phòng chờ, rồi chủ phòng bắt đầu ván mới", async () => {
    const user = userEvent.setup()
    const dialog = await finishedGame(2)
    await user.click(dialog.getByRole("button", { name: "Chơi lại" }))
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe(ROOM_CODE)
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/replay`)).toHaveLength(1)
    expect(screen.queryByTestId("flashback-result")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
    await findGame()
    expect(tileValue("Phiên")).toBe("0 / 30")
    expect(screen.queryByTestId("flashback-result")).toBeNull()
    expect(screen.queryByTestId("flashback-waiting")).toBeNull()
  })

  it("người khác bấm Chơi lại thì người còn ở màn kết quả sang phòng chờ, chưa bị kéo vào ván mới", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const dialog = await finishedGame(2)
    await user.click(dialog.getByRole("button", { name: "Xem lại biểu đồ" }))
    expect(screen.queryByTestId("flashback-result")).toBeNull()
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()

    backend.replayByOther()
    await advance(3_100)
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe(ROOM_CODE)
    expect(screen.getByRole("button", { name: "Rời phòng" })).toBeTruthy()
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/replay`)).toHaveLength(0)
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/start`)).toHaveLength(0)
  })

  it("ván mới do chủ phòng bắt đầu sau khi chơi lại kéo người còn ở màn kết quả sang ván đó", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const dialog = await finishedGame(2)
    expect(dialog.getByText("Minh thắng")).toBeTruthy()
    backend.replayByOther()
    backend.startByOwner()
    await advance(3_100)
    await findGame()
    expect(tileValue("Phiên")).toBe("0 / 30")
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
  })

  it("Chơi lại mà không đủ xu: báo câu của server và về sảnh", async () => {
    const user = userEvent.setup()
    const dialog = await finishedGame(2)
    backend.fail("POST /flashback/rooms/:code/replay", { status: 409, code: "XU_INSUFFICIENT", message: "Không đủ 100 xu để chơi lại" })
    backend.state.listing.push(listingRow({ id: "111111" }))
    await user.click(dialog.getByRole("button", { name: "Chơi lại" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Không đủ 100 xu để chơi lại"))
    await screen.findByRole("button", { name: "Chơi phòng bất kỳ" })
    expect(screen.queryByTestId("flashback-result")).toBeNull()
  })

  it("Về sảnh rời phòng và về sảnh", async () => {
    const user = userEvent.setup()
    const dialog = await finishedGame(2)
    await user.click(dialog.getByRole("button", { name: "Về sảnh" }))
    await screen.findByRole("button", { name: "Chơi phòng bất kỳ" })
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/leave`)).toHaveLength(1)
  })
})

describe("Flashback: hết giờ", () => {
  it("hết giờ thì báo Hết giờ một lần và mở kết quả", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    renderGame()
    await findGame()

    backend.setRemaining(0)
    await advance(2_100)
    await screen.findByTestId("flashback-result")
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Hết giờ"))
    await advance(6_000)
    expect(mocks.toast.info.mock.calls.filter(([message]) => message === "Hết giờ")).toHaveLength(1)
    expect(screen.getByTestId("flashback-clock").textContent).toBe("Kết thúc")
  })

  it("chủ phòng vừa bấm Bắt đầu rồi hết giờ cũng được báo Hết giờ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup({ room: { status: "waiting", owner: ME, members: [ME, MINH] } })
    renderGame()
    await user.click(await screen.findByRole("button", { name: "Bắt đầu" }))
    await findGame()

    backend.setRemaining(0)
    await advance(2_100)
    await screen.findByTestId("flashback-result")
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Hết giờ"))
    expect(mocks.toast.info.mock.calls.filter(([message]) => message === "Hết giờ")).toHaveLength(1)
  })

  it("mở lại ván đã kết thúc vì hết giờ thì không báo Hết giờ nữa", async () => {
    setup({ match: { status: "ended", remainingMs: 0 } })
    backend.match().endReason = "timeout"
    renderGame()
    await screen.findByTestId("flashback-result")
    expect(mocks.toast.info).not.toHaveBeenCalledWith("Hết giờ")
  })
})

describe("Flashback: khung đặt lệnh", () => {
  it("không có tab Xếp hạng: chỉ có khung đặt lệnh, cổ phiếu đang giữ và lệnh đã khớp", async () => {
    setup()
    renderGame()
    await findGame()
    await within(orderForm()).findByLabelText("Số cổ phiếu")
    expect(screen.queryByText("Xếp hạng")).toBeNull()
    expect(screen.queryByRole("tab")).toBeNull()
    expect(screen.getByText("Cổ phiếu đang giữ")).toBeTruthy()
    expect(screen.getByText("Lệnh đã khớp")).toBeTruthy()
    expect(screen.getByText("Chưa có cổ phiếu")).toBeTruthy()
    expect(screen.getByText("Chưa có lệnh")).toBeTruthy()
  })

  it("150 cp ở giá 28.800: giá trị 4.320.000, phí 6.480 và tổng trả 4.326.480", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const form = within(orderForm())
    await waitFor(() => expect(form.getByText("Giá khớp").nextElementSibling?.textContent).toBe("28.800"))
    expect(form.getByText("Mua tối đa").nextElementSibling?.textContent).toBe("346 cp")
    await user.type(form.getByLabelText("Số cổ phiếu"), "150")
    expect(form.getByText("Giá trị lệnh").nextElementSibling?.textContent).toBe("4.320.000")
    expect(form.getByText("Phí 0,15%").nextElementSibling?.textContent).toBe("6.480")
    expect(form.getByText("Tổng tiền trả").nextElementSibling?.textContent).toBe("4.326.480")
  })

  it("vượt Mua tối đa thì báo Không đủ tiền mặt và không đặt được", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const form = within(orderForm())
    await user.type(form.getByLabelText("Số cổ phiếu"), "500")
    expect(form.getByRole("alert").textContent).toBe("Không đủ tiền mặt")
    expect((form.getByRole("button", { name: "Đặt mua" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("đặt mua: gửi lệnh với khoá chống trùng, cập nhật tiền mặt, cổ phiếu đang giữ và lệnh đã khớp", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const form = within(orderForm())
    await user.type(form.getByLabelText("Số cổ phiếu"), "150")
    await user.click(form.getByRole("button", { name: "Đặt mua" }))

    await waitFor(() => expect(tileValue("Tiền mặt")).toBe("5.673.520"))
    expect(tileValue("Tổng tài sản")).toBe("9.993.520")
    const order = backend.callsTo("POST", "/flashback/matches/").find((call) => call.path.endsWith("/orders"))
    expect(order?.body).toMatchObject({ side: "buy", qty: 150 })
    expect(typeof order?.body?.idempotency_key).toBe("string")
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã mua 150 cp giá 28.800")
    expect((form.getByLabelText("Số cổ phiếu") as HTMLInputElement).value).toBe("")

    const holdings = screen.getByText("Cổ phiếu đang giữ").closest("section") as HTMLElement
    expect(within(holdings).getByText("150")).toBeTruthy()
    expect(within(holdings).getByText("Chờ về · còn 2 phiên")).toBeTruthy()
    const orders = screen.getByText("Lệnh đã khớp").closest("section") as HTMLElement
    expect(within(orders).getByText("Phiên 0")).toBeTruthy()
    expect(within(orders).getByText("Mua")).toBeTruthy()
    expect(within(orders).getByText("150 cp × 28.800")).toBeTruthy()
    expect(within(orders).getByText("−4.326.480")).toBeTruthy()
  })

  it("cổ phiếu mới mua chưa bán được (T+2); sau hai phiên thì bán được và nhận tiền về", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const form = within(orderForm())
    await user.type(form.getByLabelText("Số cổ phiếu"), "100")
    await user.click(form.getByRole("button", { name: "Đặt mua" }))
    await waitFor(() => expect(tileValue("Tiền mặt")).toBe("7.115.680"))

    await user.click(form.getByRole("button", { name: "Bán" }))
    expect(form.getByText("Bán được").nextElementSibling?.textContent).toBe("0 cp")
    await user.type(form.getByLabelText("Số cổ phiếu"), "100")
    expect(form.getByRole("alert").textContent).toBe("Cổ phiếu mua chưa đủ T+2, chưa bán được")
    expect((form.getByRole("button", { name: "Đặt bán" }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(nextButton())
    await waitFor(() => expect(tileValue("Phiên")).toBe("1 / 30"))
    await user.click(nextButton())
    await waitFor(() => expect(tileValue("Phiên")).toBe("2 / 30"))
    await waitFor(() => expect(form.queryByRole("alert")).toBeNull())
    expect(form.getByText("Bán được").nextElementSibling?.textContent).toBe("100 cp")
    expect(within(screen.getByText("Cổ phiếu đang giữ").closest("section") as HTMLElement).getByText("Đã về")).toBeTruthy()

    await user.click(form.getByRole("button", { name: "Đặt bán" }))
    await waitFor(() => expect(tileValue("Tiền mặt")).toBe("9.988.480"))
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã bán 100 cp giá 28.800")
    const orders = screen.getByText("Lệnh đã khớp").closest("section") as HTMLElement
    expect(within(orders).getByText("+2.872.800")).toBeTruthy()
  })

  it("lệnh gửi lại sau lỗi mạng dùng lại đúng khoá cũ để server không khớp hai lần", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const form = within(orderForm())
    await user.type(form.getByLabelText("Số cổ phiếu"), "10")
    backend.fail("POST /flashback/matches/:id/orders", { status: 503, code: "UNAVAILABLE", message: "Máy chủ bận" })
    await user.click(form.getByRole("button", { name: "Đặt mua" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Máy chủ bận"))
    await user.click(form.getByRole("button", { name: "Đặt mua" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    const keys = backend
      .callsTo("POST", "/flashback/matches/")
      .filter((call) => call.path.endsWith("/orders"))
      .map((call) => call.body?.idempotency_key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it("phím tắt: B và S chọn Mua hoặc Bán và đưa con trỏ vào ô số cổ phiếu; Space là Phiên tiếp", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const form = within(orderForm())

    await user.keyboard("s")
    expect(form.getByRole("button", { name: "Bán" }).getAttribute("aria-pressed")).toBe("true")
    await waitFor(() => expect(document.activeElement).toBe(form.getByLabelText("Số cổ phiếu")))

    await user.click(document.body)
    await user.keyboard("b")
    expect(form.getByRole("button", { name: "Mua" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(document.body)
    await user.keyboard("[Space]")
    await waitFor(() => expect(tileValue("Phiên")).toBe("1 / 30"))
  })

  it("phím B trên màn hình rộng bung lại panel đã thu gọn và đưa con trỏ vào ô ngay, không chờ hiệu ứng trượt", async () => {
    const user = userEvent.setup()
    setup()
    const frame = frameState({ collapsed: true })
    renderGame(frame)
    await findGame()
    await user.keyboard("b")
    expect(frame.revealPanel).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(document.activeElement).toBe(within(orderForm()).getByLabelText("Số cổ phiếu")), { timeout: 200 })
  })

  it("trên điện thoại phím Mua ở thanh đáy mở lớp panel và chỉ đưa con trỏ vào ô sau khi lớp trượt xong", async () => {
    const user = userEvent.setup()
    setup()
    const frame = frameState({ overlay: true, railBar: true })
    renderGame(frame)
    await findGame()
    await user.click(screen.getByTestId("flashback-buy-mobile"))
    expect(frame.revealPanel).toHaveBeenCalledTimes(1)
    const field = within(orderForm()).getByLabelText("Số cổ phiếu")
    expect(document.activeElement).not.toBe(field)
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it("thanh nút cố định ở đáy điện thoại có Mua, Bán và Phiên tiếp", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    expect(screen.getByTestId("flashback-buy-mobile").textContent).toBe("Mua")
    expect(screen.getByTestId("flashback-sell-mobile").textContent).toBe("Bán")
    expect(screen.getByTestId("flashback-next-mobile").textContent).toContain("Phiên tiếp")
    await user.click(screen.getByTestId("flashback-sell-mobile"))
    expect(within(orderForm()).getByRole("button", { name: "Bán" }).getAttribute("aria-pressed")).toBe("true")
    await user.click(screen.getByTestId("flashback-next-mobile"))
    await waitFor(() => expect(tileValue("Phiên")).toBe("1 / 30"))
  })
})

describe("Flashback: chỉ báo", () => {
  const picker = () => within(screen.getByTestId("indicator-picker"))

  async function addIndicator(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
    await screen.findByTestId("indicator-picker")
    await user.click(picker().getByRole("button", { name: new RegExp(`^${name}`) }))
    await waitFor(() => expect(screen.queryByTestId("indicator-picker")).toBeNull())
  }

  const chartHeight = () => Number(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }).parentElement?.getAttribute("data-chart-height"))
  const panes = (name: string) => Array.from(document.querySelectorAll(`[data-pane="${name}"]`))

  it("hộp chọn liệt kê đủ 16 chỉ báo cho mọi người, không khoá theo Học viện", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
    await screen.findByTestId("indicator-picker")
    expect(picker().getAllByRole("listitem")).toHaveLength(16)
    for (const meta of INDICATOR_METAS) expect(picker().getByRole("button", { name: new RegExp(`^${meta.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeTruthy()
    expect(screen.getByTestId("indicator-picker").textContent).not.toMatch(/khoá|khóa|mở khoá|Học viện|bài học/i)
  })

  it("ô tìm kiếm lọc theo tên", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
    await user.type(await screen.findByLabelText("Tìm kiếm chỉ báo"), "macd")
    expect(picker().getAllByRole("listitem")).toHaveLength(1)
    await user.clear(screen.getByLabelText("Tìm kiếm chỉ báo"))
    await user.type(screen.getByLabelText("Tìm kiếm chỉ báo"), "zzz")
    expect(picker().getByText("Không có chỉ báo phù hợp")).toBeTruthy()
  })

  it("chỉ báo có ô riêng cao 130px (110px trên điện thoại), mỗi ô một dải chú giải, thêm thì biểu đồ dài thêm", async () => {
    stubChartWidth(1000)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const base = chartHeight()
    expect(panes("indicator")).toHaveLength(0)

    await addIndicator(user, "RSI")
    expect(panes("indicator")).toHaveLength(1)
    expect(panes("indicator")[0].getAttribute("data-plot-height")).toBe("130")
    expect(panes("indicator")[0].querySelectorAll("button").length).toBe(3)
    const afterOne = chartHeight()
    expect(afterOne - base).toBe(130 + 24 + 4 + 10)

    await addIndicator(user, "MACD")
    expect(panes("indicator")).toHaveLength(2)
    expect(panes("indicator").map((pane) => pane.getAttribute("data-plot-height"))).toEqual(["130", "130"])
    expect(chartHeight() - afterOne).toBe(130 + 24 + 4 + 10)
    // Ô giá và ô khối lượng giữ nguyên chiều cao, không bị ép nhỏ lại.
    expect(panes("price")[0].getAttribute("data-plot-height")).toBe("300")
    expect(panes("volume")[0].getAttribute("data-plot-height")).toBe("90")
  })

  it("điện thoại: chỉ báo 110px, ô giá 240px, ô khối lượng 70px", async () => {
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    await addIndicator(user, "RSI")
    expect(panes("indicator")[0].getAttribute("data-plot-height")).toBe("110")
    expect(panes("price")[0].getAttribute("data-plot-height")).toBe("240")
    expect(panes("volume")[0].getAttribute("data-plot-height")).toBe("70")
  })

  it("chỉ báo vẽ trên giá thêm một dòng vào dải chú giải của ô giá; chỉ báo khối lượng vào ô khối lượng", async () => {
    stubChartWidth(1000)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    expect(panes("price")[0].getAttribute("data-legend-height")).toBe(String(24 + 4))
    expect(panes("volume")[0].getAttribute("data-legend-height")).toBe("24")

    await addIndicator(user, "MA / SMA")
    expect(panes("price")[0].getAttribute("data-legend-height")).toBe(String(24 + 24 + 4))
    expect(panes("indicator")).toHaveLength(0)

    await addIndicator(user, "Khối lượng")
    expect(panes("volume")[0].getAttribute("data-legend-height")).toBe("48")
  })

  it("ẩn, cài đặt và xóa một chỉ báo; chỉ báo được nhớ trong trình duyệt", async () => {
    stubChartWidth(1000)
    const user = userEvent.setup()
    setup()
    const { unmount } = renderGame()
    await findGame()
    await addIndicator(user, "RSI")

    await user.click(screen.getByRole("button", { name: "Ẩn RSI 14" }))
    expect(screen.getByRole("button", { name: "Hiện RSI 14" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Hiện RSI 14" }))

    await user.click(screen.getByRole("button", { name: "Cài đặt RSI 14" }))
    const settings = within(await screen.findByTestId("indicator-settings"))
    const period = settings.getByLabelText("Chu kỳ RSI")
    await user.clear(period)
    await user.type(period, "3")
    await user.click(settings.getByRole("button", { name: "OK" }))
    expect(settings.getByRole("alert").textContent).toBe("Chu kỳ RSI phải từ 5 đến 50")
    await user.clear(period)
    await user.type(period, "20")
    await user.click(settings.getByRole("button", { name: "OK" }))
    await screen.findByRole("button", { name: "Cài đặt RSI 20" })

    unmount()
    setup()
    renderGame()
    await findGame()
    expect(await screen.findByRole("button", { name: "Cài đặt RSI 20" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Xóa RSI 20" }))
    await waitFor(() => expect(panes("indicator")).toHaveLength(0))
  })
})
