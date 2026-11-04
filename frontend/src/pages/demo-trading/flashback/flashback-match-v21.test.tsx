/**
 * Màn chơi Flashback v2.1: thanh người chơi (§6.1), biểu cảm (§6.4), điểm và cấp ở cửa sổ kết quả
 * (§1, §3.3), cấp và vương miện trên avatar (§4.3) và công cụ vẽ (§7).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FlashbackMain } from "./flashback-main"
import { REACTION_EMOJIS } from "./flashback-model"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import {
  HOA,
  ME,
  MINH,
  ROOM_CODE,
  createFlashbackBackend,
  historyItem,
  matchIdOf,
  type BackendOptions,
  type FlashbackBackend,
  type Person,
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

function renderGame() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FlashbackProvider>
        <FlashbackMain />
        <FlashbackPanel />
      </FlashbackProvider>
    </QueryClientProvider>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function findGame() {
  await screen.findByTestId("flashback-clock")
  await waitFor(() => expect(screen.getByTestId("flashback-session")).toBeTruthy())
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const cells = () => screen.getAllByTestId("flashback-player")
const cellName = (cell: HTMLElement) => cell.querySelector("b")?.textContent
const bubblesOf = (cell: HTMLElement) => within(cell).queryAllByTestId("flashback-reaction")
const reactionPosts = () => backend.calls.filter((call) => call.method === "POST" && call.path.endsWith("/reactions"))

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
})

// ------------------------------------------------------------------ thanh người chơi

describe("Flashback v2.1: thanh người chơi (§6.1)", () => {
  it('hàng trên ghi "{n} người chơi · {m} đã xong" và cập nhật khi có người hoàn thành', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ room: { status: "playing", owner: ME, members: [ME, MINH, HOA] }, match: { rivals: [{ person: MINH, pnl: 0, finished: false }, { person: HOA, pnl: 0, finished: false }] } })
    renderGame()
    await findGame()
    expect(screen.getByTestId("flashback-player-count").textContent).toBe("3 người chơi · 0 đã xong")

    backend.rivalFinishes(MINH.user_id, 1)
    await advance(2_100)
    await waitFor(() => expect(screen.getByTestId("flashback-player-count").textContent).toBe("3 người chơi · 1 đã xong"))
  })

  it("ván kết thúc thì chỉ còn số người chơi, không còn số người đã xong", async () => {
    setup({ match: { status: "ended", rivals: [{ person: MINH, pnl: 2, finished: true }] } })
    renderGame()
    await screen.findByTestId("flashback-result")
    expect(screen.getByTestId("flashback-player-count").textContent).toBe("2 người chơi")
  })

  it("mình đứng đầu, những người còn lại giữ thứ tự vào phòng", async () => {
    setup({
      room: { status: "playing", owner: MINH, members: [MINH, HOA, ME] },
      match: { rivals: [{ person: MINH, pnl: 0, finished: false }, { person: HOA, pnl: 0, finished: false }] },
    })
    renderGame()
    await findGame()
    expect(cells().map(cellName)).toEqual(["Linh", "Minh", "Hòa"])
    expect(cells().map((cell) => cell.getAttribute("data-me"))).toEqual(["true", "false", "false"])
  })

  it("thẻ người chơi xếp một hàng cuộn ngang, mỗi thẻ không co lại", async () => {
    setup()
    renderGame()
    await findGame()
    const list = screen.getByTestId("flashback-player-list")
    expect(list.className).toContain("overflow-x-auto")
    expect(list.className).toContain("flex")
    expect(list.className).not.toContain("flex-wrap")
    for (const cell of cells()) expect(cell.className).toContain("shrink-0")
  })

  it("phòng 30 người: đủ 30 thẻ trong cùng một hàng cuộn ngang", async () => {
    const rivals: Person[] = Array.from({ length: 29 }, (_, index) => ({ user_id: `rival-${index + 1}`, name: `Bạn ${index + 1}`, avatar_url: null }))
    setup({
      room: { status: "playing", owner: ME, members: [ME, ...rivals], settings: { max_players: 30 } },
      match: { rivals: rivals.map((person) => ({ person, pnl: 0, finished: false })) },
    })
    renderGame()
    await findGame()
    expect(cells()).toHaveLength(30)
    expect(screen.getByTestId("flashback-player-count").textContent).toBe("30 người chơi · 0 đã xong")
    expect(within(screen.getByTestId("flashback-player-list")).getAllByTestId("flashback-player")).toHaveLength(30)
  })

  it("mỗi thẻ có ô cấp và vương miện nếu đang top 3 toàn hệ thống", async () => {
    setup({
      me: { level: 5 },
      room: { status: "playing", owner: ME, members: [ME, { ...MINH, level: 9, crown: 3 }] },
      match: { rivals: [{ person: { ...MINH, level: 9, crown: 3 }, pnl: 0, finished: false }] },
    })
    renderGame()
    await findGame()
    const [mine, rival] = cells()
    expect(within(mine).getByRole("img", { name: "Cấp 5" })).toBeTruthy()
    expect(within(mine).queryByTestId("flashback-crown")).toBeNull()
    expect(within(rival).getByRole("img", { name: "Cấp 9" })).toBeTruthy()
    expect(within(rival).getByRole("img", { name: "Top 3" })).toBeTruthy()
    expect(within(rival).getByTestId("flashback-crown").getAttribute("data-crown")).toBe("3")
  })

  it("thanh cập nhật không dựng lại danh sách: nút DOM và vị trí cuộn được giữ nguyên", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    renderGame()
    await findGame()
    const list = screen.getByTestId("flashback-player-list")
    const before = cells()
    list.scrollLeft = 24

    backend.rivalFinishes(MINH.user_id, 1)
    await advance(2_100)
    await waitFor(() => expect(cells()[1].getAttribute("data-status")).toBe("done"))
    expect(screen.getByTestId("flashback-player-list")).toBe(list)
    expect(cells()[0]).toBe(before[0])
    expect(cells()[1]).toBe(before[1])
    expect(list.scrollLeft).toBe(24)
  })
})

// ------------------------------------------------------------------ biểu cảm

describe("Flashback v2.1: biểu cảm (§6.4)", () => {
  async function openPicker(user: User) {
    await user.click(screen.getByRole("button", { name: "Gửi biểu cảm" }))
    return screen.findByTestId("flashback-reaction-picker")
  }

  async function pickReaction(user: User, emoji: string) {
    await openPicker(user)
    await user.click(await screen.findByRole("button", { name: `Gửi ${emoji}` }))
  }

  it("nút biểu cảm mở bảng 12 biểu cảm xếp 6 cột đúng thứ tự", async () => {
    setup()
    const user = userEvent.setup()
    renderGame()
    await findGame()
    expect(screen.queryByTestId("flashback-reaction-picker")).toBeNull()

    const picker = await openPicker(user)
    expect(picker.className).toContain("grid-cols-6")
    const options = within(picker).getAllByTestId("flashback-reaction-option")
    expect(options).toHaveLength(12)
    expect(options.map((option) => option.textContent)).toEqual([...REACTION_EMOJIS])
  })

  it("bấm ra ngoài thì bảng đóng", async () => {
    setup()
    const user = userEvent.setup()
    renderGame()
    await findGame()
    await openPicker(user)
    await user.click(document.body)
    await waitFor(() => expect(screen.queryByTestId("flashback-reaction-picker")).toBeNull())
    expect(reactionPosts()).toHaveLength(0)
  })

  it("chọn một biểu cảm thì bảng đóng, gửi đúng một lần và hiện bong bóng ngay ở avatar của mình", async () => {
    setup()
    const user = userEvent.setup()
    renderGame()
    await findGame()
    await pickReaction(user, "🚀")
    await waitFor(() => expect(screen.queryByTestId("flashback-reaction-picker")).toBeNull())

    const mine = bubblesOf(cells()[0])
    expect(mine).toHaveLength(1)
    expect(mine[0].getAttribute("data-emoji")).toBe("🚀")
    expect(mine[0].textContent).toBe("🚀")
    expect(mine[0].className).toContain("fb-reaction")
    expect(mine[0].getAttribute("aria-hidden")).toBe("true")
    expect(bubblesOf(cells()[1])).toHaveLength(0)

    await waitFor(() => expect(reactionPosts()).toHaveLength(1))
    expect(reactionPosts()[0].body).toEqual({ emoji: "🚀" })
  })

  it("bong bóng của mình chỉ hiện một cái dù server gửi lại, và biến mất sau khoảng 2,5 giây", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    renderGame()
    await findGame()
    await pickReaction(user, "🚀")
    await waitFor(() => expect(reactionPosts()).toHaveLength(1))

    // Một lần hỏi trạng thái trả lại chính biểu cảm của mình: không được hiện thêm bong bóng thứ hai.
    const polls = () => backend.calls.filter((call) => call.method === "GET" && call.path.endsWith("/state")).length
    const before = polls()
    await advance(2_100)
    expect(polls()).toBeGreaterThan(before)
    expect(bubblesOf(cells()[0]).length).toBeLessThanOrEqual(1)
    expect(bubblesOf(cells()[1])).toHaveLength(0)

    await advance(600)
    expect(bubblesOf(cells()[0])).toHaveLength(0)
  })

  it("biểu cảm của người khác tới qua lần hỏi trạng thái và hiện ở avatar của họ, rồi mờ đi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    renderGame()
    await findGame()
    expect(bubblesOf(cells()[1])).toHaveLength(0)

    backend.rivalReacts(MINH.user_id, "😂")
    await advance(2_100)
    await waitFor(() => expect(bubblesOf(cells()[1])).toHaveLength(1))
    const bubble = bubblesOf(cells()[1])[0]
    expect(bubble.getAttribute("data-emoji")).toBe("😂")
    // Biểu cảm đã đi một phần đường: bong bóng bắt đầu ở đúng điểm của hoạt ảnh theo tuổi của nó.
    expect(bubble.style.animationDelay).toMatch(/^-\d+ms$/)
    expect(bubblesOf(cells()[0])).toHaveLength(0)

    await advance(1_000)
    await waitFor(() => expect(bubblesOf(cells()[1])).toHaveLength(0))
  })

  it("biểu cảm đã quá cũ khi tới thì không hiện", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    renderGame()
    await findGame()
    const polls = () => backend.calls.filter((call) => call.method === "GET" && call.path.endsWith("/state")).length
    const before = polls()
    backend.rivalReacts(MINH.user_id, "😂", 3_000)
    await advance(2_100)
    // Lần hỏi trạng thái đã chạy và đã trả biểu cảm này, nhưng nó quá cũ nên không còn gì để hiện.
    expect(polls()).toBeGreaterThan(before)
    expect(bubblesOf(cells()[1])).toHaveLength(0)
  })

  it("gửi quá nhanh (dưới 1,5 giây) thì báo Từ từ thôi 😄 và không gửi thêm; sau đó gửi lại được", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    renderGame()
    await findGame()

    await pickReaction(user, "🚀")
    await pickReaction(user, "🔥")
    expect(mocks.toast.info).toHaveBeenCalledWith("Từ từ thôi 😄")
    await waitFor(() => expect(reactionPosts()).toHaveLength(1))
    expect(bubblesOf(cells()[0])).toHaveLength(1)

    await advance(1_600)
    await pickReaction(user, "🔥")
    await waitFor(() => expect(reactionPosts()).toHaveLength(2))
    expect(reactionPosts()[1].body).toEqual({ emoji: "🔥" })
    expect(mocks.toast.info).toHaveBeenCalledTimes(1)
  })

  it("server từ chối thì bong bóng của mình biến mất và báo lý do", async () => {
    setup()
    backend.fail("POST /flashback/matches/:id/reactions", { status: 429, code: "RATE_LIMITED", message: "Bạn gửi biểu cảm quá nhanh" })
    const user = userEvent.setup()
    renderGame()
    await findGame()
    await pickReaction(user, "🚀")
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Bạn gửi biểu cảm quá nhanh"))
    await waitFor(() => expect(bubblesOf(cells()[0])).toHaveLength(0))
  })

  it("ván đã kết thúc thì không còn nút biểu cảm", async () => {
    setup({ match: { status: "ended", rivals: [{ person: MINH, pnl: 2, finished: true }] } })
    renderGame()
    await screen.findByTestId("flashback-result")
    expect(screen.queryByTestId("flashback-reaction-button")).toBeNull()
  })

  it("người đã hoàn thành vẫn gửi được biểu cảm khi ván còn tiếp tục", async () => {
    setup({ match: { step: 30, finished: true } })
    renderGame()
    await screen.findByTestId("flashback-waiting")
    expect(screen.getByTestId("flashback-reaction-button")).toBeTruthy()
  })
})

// ------------------------------------------------------------------ cửa sổ kết quả

describe("Flashback v2.1: cửa sổ kết quả, điểm và cấp (§1, §3.3, §4.3)", () => {
  async function resultOf(options: BackendOptions) {
    setup({ match: { status: "ended", finished: true, step: 30 }, ...options })
    renderGame()
    return within(await screen.findByTestId("flashback-result"))
  }

  /** Dòng xếp hạng của một người trong cửa sổ kết quả. */
  const rowOf = (name: string) => {
    const row = within(screen.getByTestId("flashback-result-rows"))
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes(name))
    if (!row) throw new Error(`Không có dòng ${name}`)
    return row
  }

  it("người thắng +10 điểm, người thua +3 điểm; dòng tiến độ của mình khi thua", async () => {
    const dialog = await resultOf({ match: { status: "ended", finished: true, step: 30, rivals: [{ person: MINH, pnl: 2, finished: true }] } })
    expect(within(rowOf("Minh")).getByTestId("flashback-result-points").textContent).toBe("+10 điểm")
    expect(within(rowOf("Linh")).getByTestId("flashback-result-points").textContent).toBe("+3 điểm")
    const progress = dialog.getByTestId("flashback-progress")
    expect(progress.getAttribute("data-kind")).toBe("progress")
    expect(progress.textContent).toBe("Điểm +3 · Cấp 1 · 3 điểm · còn 17 điểm lên cấp 2")
  })

  it("mình thắng được +10 và dòng tiến độ tính từ điểm trước ván", async () => {
    const dialog = await resultOf({
      progress: { points: 70 },
      match: { status: "ended", finished: true, step: 30, cash: 10_150_000, rivals: [{ person: MINH, pnl: -1.5, finished: true }] },
    })
    expect(dialog.getByText("Bạn thắng")).toBeTruthy()
    expect(within(rowOf("Linh")).getByTestId("flashback-result-points").textContent).toBe("+10 điểm")
    expect(within(rowOf("Minh")).getByTestId("flashback-result-points").textContent).toBe("+3 điểm")
    expect(dialog.getByTestId("flashback-progress").textContent).toBe("Điểm +10 · Cấp 3 · 80 điểm · còn 10 điểm lên cấp 4")
  })

  it("đủ điểm lên cấp thì hiện 🎉 Lên cấp N! Bạn có X điểm.", async () => {
    const dialog = await resultOf({
      progress: { points: 85 },
      match: { status: "ended", finished: true, step: 30, cash: 10_150_000, rivals: [{ person: MINH, pnl: -1.5, finished: true }] },
    })
    const progress = dialog.getByTestId("flashback-progress")
    expect(progress.getAttribute("data-kind")).toBe("level-up")
    expect(progress.textContent).toBe("🎉 Lên cấp 4! Bạn có 95 điểm.")
  })

  it("hoà ở hạng 1 thì cả hai cùng +10 điểm", async () => {
    const dialog = await resultOf({ match: { status: "ended", finished: true, step: 30, rivals: [{ person: MINH, pnl: 0, finished: true }] } })
    expect(dialog.getByText("Hoà")).toBeTruthy()
    expect(dialog.getAllByTestId("flashback-result-points").map((cell) => cell.textContent)).toEqual(["+10 điểm", "+10 điểm"])
  })

  it("điểm cố định theo ván, không đổi theo số người: 1 người thắng +10, 4 người còn lại +3", async () => {
    const rivals: Person[] = [MINH, HOA, { user_id: "user-4", name: "Nam", avatar_url: null }, { user_id: "user-5", name: "Lan", avatar_url: null }]
    const dialog = await resultOf({
      room: { status: "playing", owner: ME, members: [ME, ...rivals] },
      match: { status: "ended", finished: true, step: 30, rivals: rivals.map((person, index) => ({ person, pnl: index === 0 ? 3 : -index, finished: true })) },
    })
    expect(dialog.getAllByTestId("flashback-result-points").map((cell) => cell.textContent)).toEqual([
      "+10 điểm",
      "+3 điểm",
      "+3 điểm",
      "+3 điểm",
      "+3 điểm",
    ])
  })

  it("chơi một mình: không có điểm ở dòng nào và dòng tiến độ ghi không tính điểm cấp", async () => {
    const dialog = await resultOf({
      room: { status: "playing", owner: ME, members: [ME] },
      match: { status: "ended", finished: true, step: 30, rivals: [] },
    })
    expect(dialog.queryAllByTestId("flashback-result-points")).toHaveLength(0)
    const progress = dialog.getByTestId("flashback-progress")
    expect(progress.getAttribute("data-kind")).toBe("solo")
    expect(progress.textContent).toBe("Chơi 1 mình không tính điểm cấp.")
  })

  it("mỗi dòng có avatar kèm ô cấp, và vương miện cho người đang top 3", async () => {
    const crowned: Person = { ...MINH, level: 12, crown: 1 }
    await resultOf({
      me: { level: 5 },
      room: { status: "playing", owner: ME, members: [ME, crowned] },
      match: { status: "ended", finished: true, step: 30, rivals: [{ person: crowned, pnl: 2, finished: true }] },
    })
    const minh = within(rowOf("Minh"))
    expect(minh.getByRole("img", { name: "Cấp 12" })).toBeTruthy()
    expect(minh.getByRole("img", { name: "Top 1" })).toBeTruthy()
    const linh = within(rowOf("Linh"))
    expect(linh.getByRole("img", { name: "Cấp 5" })).toBeTruthy()
    expect(linh.queryByTestId("flashback-crown")).toBeNull()
  })

  it("phòng 30 người: bảng xếp hạng cao tối đa khoảng nửa màn hình và cuộn được, cửa sổ vẫn vừa màn hình", async () => {
    const rivals: Person[] = Array.from({ length: 29 }, (_, index) => ({ user_id: `rival-${index + 1}`, name: `Bạn ${index + 1}`, avatar_url: null }))
    const dialog = await resultOf({
      room: { status: "playing", owner: ME, members: [ME, ...rivals], settings: { max_players: 30 } },
      match: { status: "ended", finished: true, step: 30, rivals: rivals.map((person, index) => ({ person, pnl: index - 10, finished: true })) },
    })
    const rows = dialog.getByTestId("flashback-result-rows")
    expect(within(rows).getAllByRole("listitem")).toHaveLength(30)
    expect(rows.className).toContain("max-h-[46vh]")
    expect(rows.className).toContain("overflow-y-auto")
    const box = screen.getByTestId("flashback-result")
    expect(box.className).toContain("max-h-[calc(100dvh-2rem)]")
    expect(box.className).toContain("overflow-y-auto")
    // Nút và dòng tiến độ nằm ngoài vùng cuộn của bảng nên luôn thấy được.
    expect(rows.contains(dialog.getByTestId("flashback-progress"))).toBe(false)
    expect(rows.contains(dialog.getByRole("button", { name: "Chơi lại" }))).toBe(false)
  })

  it("Về sảnh: thẻ cấp hiện điểm mới của ván vừa chơi", async () => {
    const user = userEvent.setup()
    const dialog = await resultOf({
      progress: { points: 70, rank: 12 },
      match: { status: "ended", finished: true, step: 30, cash: 10_150_000, rivals: [{ person: MINH, pnl: -1.5, finished: true }] },
    })
    expect(dialog.getByTestId("flashback-progress").textContent).toContain("80 điểm")
    // Server đã cộng 10 điểm của ván này.
    backend.state.points = 80
    await user.click(dialog.getByRole("button", { name: "Về sảnh" }))
    const card = await screen.findByTestId("flashback-level-card")
    await waitFor(() => expect(within(card).getByText("80 điểm")).toBeTruthy())
    expect(within(card).getByText("Còn 10 điểm lên cấp 4")).toBeTruthy()
  })

  it("Về sảnh: ván vừa chơi nằm đầu danh sách Lịch sử đấu (§11.11)", async () => {
    const user = userEvent.setup()
    const dialog = await resultOf({
      history: [historyItem({ match_id: matchIdOf(90), room_id: "900090", ended_at: new Date(Date.now() - 86_400_000).toISOString() })],
      match: { status: "ended", finished: true, step: 30, cash: 10_150_000, rivals: [{ person: MINH, pnl: -1.5, finished: true }] },
    })
    // Server đã ghi ván này vào lịch sử của mình khi ván kết thúc.
    backend.state.history.unshift(historyItem({ match_id: matchIdOf(1), room_id: ROOM_CODE, ended_at: new Date().toISOString() }))
    await user.click(dialog.getByRole("button", { name: "Về sảnh" }))
    await screen.findByRole("button", { name: "Chơi phòng bất kỳ" })

    await user.click(screen.getByRole("tab", { name: "Lịch sử đấu" }))
    const rows = await screen.findAllByTestId("flashback-history-row")
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain(`Phòng ${ROOM_CODE}`)
    expect(rows[1].textContent).toContain("Phòng 900090")
  })
})

// ------------------------------------------------------------------ công cụ vẽ

describe("Flashback v2.1: công cụ vẽ (§7)", () => {
  /** Toạ độ trong khung giá của biểu đồ giả: rộng 580, cao 380, khung giá trải từ y = 56 tới y = 264. */
  const A = { x: 100, y: 120 }
  const B = { x: 300, y: 200 }

  const svg = () => screen.getByRole("img", { name: "Biểu đồ nến Flashback" })
  const shapes = () => screen.queryAllByTestId("flashback-drawing")
  const committed = () => shapes().filter((shape) => shape.getAttribute("data-preview") === "false")
  const handles = () => screen.queryAllByTestId("flashback-drawing-handle")
  const trendButton = () => screen.getByTestId("flashback-draw-trend")
  const fibButton = () => screen.getByTestId("flashback-draw-fib")
  const clearButton = () => screen.getByTestId("flashback-draw-clear")

  /** jsdom không có PointerEvent: sự kiện chuột mang tên sự kiện con trỏ vẫn tới được onPointer* của React. */
  function pointer(type: "pointerdown" | "pointermove" | "pointerup", at: { x: number; y: number }) {
    fireEvent(svg(), new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 }))
  }

  function clickAt(at: { x: number; y: number }) {
    pointer("pointerdown", at)
    pointer("pointerup", at)
  }

  /** Bật công cụ rồi bấm điểm đầu và điểm cuối. */
  async function draw(user: User, tool: "trend" | "fib", from = A, to = B) {
    await user.click(tool === "trend" ? trendButton() : fibButton())
    clickAt(from)
    clickAt(to)
  }

  async function playing() {
    setup()
    const user = userEvent.setup()
    renderGame()
    await findGame()
    return user
  }

  it("ba nút Xu hướng, Fibonacci, Xoá nằm cùng hàng với nút Các chỉ báo; không có nút Con trỏ", async () => {
    await playing()
    const toolbar = screen.getByRole("group", { name: "Công cụ vẽ" })
    expect(within(toolbar).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      "flashback-draw-trend",
      "flashback-draw-fib",
      "flashback-draw-clear",
    ])
    expect(within(toolbar).getByRole("button", { name: "Xu hướng" })).toBeTruthy()
    expect(within(toolbar).getByRole("button", { name: "Fibonacci" })).toBeTruthy()
    expect(within(toolbar).getByRole("button", { name: "Xoá" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /con trỏ/i })).toBeNull()
    expect(toolbar.parentElement?.contains(screen.getByRole("button", { name: "Các chỉ báo" }))).toBe(true)
  })

  it("công cụ đang bật thì nút sáng, bấm lại thì huỷ, chọn công cụ khác thì chuyển", async () => {
    const user = await playing()
    expect(trendButton().getAttribute("aria-pressed")).toBe("false")
    expect(fibButton().getAttribute("aria-pressed")).toBe("false")
    expect(svg().getAttribute("data-draw-mode")).toBe("none")

    await user.click(trendButton())
    expect(trendButton().getAttribute("aria-pressed")).toBe("true")
    expect(svg().getAttribute("data-draw-mode")).toBe("trend")
    expect(svg().getAttribute("class")).toContain("cursor-crosshair")
    expect(svg().getAttribute("class")).toContain("touch-none")

    await user.click(trendButton())
    expect(trendButton().getAttribute("aria-pressed")).toBe("false")
    expect(svg().getAttribute("data-draw-mode")).toBe("none")
    expect(svg().getAttribute("class")).toContain("touch-pan-y")

    await user.click(trendButton())
    await user.click(fibButton())
    expect(trendButton().getAttribute("aria-pressed")).toBe("false")
    expect(fibButton().getAttribute("aria-pressed")).toBe("true")
    expect(svg().getAttribute("data-draw-mode")).toBe("fib")
  })

  it("đường xu hướng: bấm điểm đầu rồi điểm cuối, vẽ xong tự về chế độ bình thường và hình đang được chọn", async () => {
    const user = await playing()
    await user.click(trendButton())
    pointer("pointerdown", A)
    pointer("pointerup", A)
    // Mới có điểm đầu: chỉ có bản xem trước, chưa có hình.
    expect(committed()).toHaveLength(0)
    expect(trendButton().getAttribute("aria-pressed")).toBe("true")

    pointer("pointermove", { x: 200, y: 140 })
    pointer("pointerdown", B)
    pointer("pointerup", B)
    expect(committed()).toHaveLength(1)
    expect(committed()[0].getAttribute("data-kind")).toBe("trend")
    expect(committed()[0].getAttribute("data-selected")).toBe("true")
    expect(committed()[0].querySelector("line")).not.toBeNull()
    expect(handles()).toHaveLength(2)
    expect(trendButton().getAttribute("aria-pressed")).toBe("false")
    expect(svg().getAttribute("data-draw-mode")).toBe("none")
    expect(shapes().filter((shape) => shape.getAttribute("data-preview") === "true")).toHaveLength(0)
  })

  it("vẽ bằng cách nhấn giữ ở điểm đầu, kéo rồi thả ở điểm cuối", async () => {
    const user = await playing()
    await user.click(trendButton())
    pointer("pointerdown", A)
    pointer("pointermove", { x: 200, y: 160 })
    pointer("pointerup", B)
    expect(committed()).toHaveLength(1)
    expect(trendButton().getAttribute("aria-pressed")).toBe("false")
  })

  it("chỉ vẽ được trên khung giá: bấm ở ô khối lượng thì bỏ qua", async () => {
    const user = await playing()
    await user.click(trendButton())
    clickAt({ x: 100, y: 300 })
    expect(shapes()).toHaveLength(0)
    expect(trendButton().getAttribute("aria-pressed")).toBe("true")
    clickAt({ x: 560, y: 120 })
    expect(shapes()).toHaveLength(0)
  })

  it("Fibonacci: 7 mức 0, 23,6, 38,2, 50, 61,8, 78,6, 100% với giá theo công thức", async () => {
    const user = await playing()
    await draw(user, "fib")
    const fib = committed()[0]
    expect(fib.getAttribute("data-kind")).toBe("fib")
    const labels = Array.from(fib.querySelectorAll("text")).map((node) => node.textContent ?? "")
    expect(labels.map((label) => label.split(" · ")[0])).toEqual(["0%", "23,6%", "38,2%", "50%", "61,8%", "78,6%", "100%"])
    const prices = labels.map((label) => Number((label.split(" · ")[1] ?? "").replace(/\./g, "")))
    for (const price of prices) expect(Number.isFinite(price) && price > 0).toBe(true)
    // Điểm đầu (A, cao hơn) là 100%, điểm cuối (B, thấp hơn) là 0%; mức 50% là trung bình của hai đầu.
    expect(prices[6]).toBeGreaterThan(prices[0])
    expect(Math.abs(prices[3] - (prices[0] + prices[6]) / 2)).toBeLessThanOrEqual(1)
    // Giá tại mức L = giá cuối − (giá cuối − giá đầu) × L.
    const expected = (level: number) => prices[0] - (prices[0] - prices[6]) * level
    expect(Math.abs(prices[4] - expected(0.618))).toBeLessThanOrEqual(1)
    expect(Math.abs(prices[1] - expected(0.236))).toBeLessThanOrEqual(1)
  })

  it("Esc huỷ lúc đang vẽ: bỏ công cụ và bản xem trước, không để lại hình", async () => {
    const user = await playing()
    await user.click(fibButton())
    clickAt(A)
    expect(shapes().some((shape) => shape.getAttribute("data-preview") === "true")).toBe(true)
    await user.keyboard("{Escape}")
    expect(shapes()).toHaveLength(0)
    expect(fibButton().getAttribute("aria-pressed")).toBe("false")
    expect(svg().getAttribute("data-draw-mode")).toBe("none")
  })

  it("bấm vào hình thì chọn, bấm vào chỗ trống thì bỏ chọn", async () => {
    const user = await playing()
    await draw(user, "trend")
    expect(committed()[0].getAttribute("data-selected")).toBe("true")

    clickAt({ x: 400, y: 240 })
    expect(committed()[0].getAttribute("data-selected")).toBe("false")
    expect(handles()).toHaveLength(0)

    // Điểm giữa đường nối A và B.
    clickAt({ x: 200, y: 160 })
    expect(committed()[0].getAttribute("data-selected")).toBe("true")
    expect(handles()).toHaveLength(2)
  })

  it("hình đang chọn có hai tay nắm; kéo một tay nắm thì đổi đúng đầu đó", async () => {
    const user = await playing()
    await draw(user, "trend")
    const before = handles().map((handle) => [Number(handle.getAttribute("cx")), Number(handle.getAttribute("cy"))])
    expect(before[0][0]).toBeCloseTo(A.x, 3)
    expect(before[1][0]).toBeCloseTo(B.x, 3)

    // Kéo tay nắm điểm đầu sang (150, 100).
    pointer("pointerdown", A)
    pointer("pointermove", { x: 150, y: 100 })
    pointer("pointerup", { x: 150, y: 100 })
    const after = handles().map((handle) => [Number(handle.getAttribute("cx")), Number(handle.getAttribute("cy"))])
    expect(after[0][0]).toBeCloseTo(150, 3)
    expect(after[0][1]).toBeCloseTo(100, 3)
    expect(after[1][0]).toBeCloseTo(B.x, 3)
    expect(after[1][1]).toBeCloseTo(B.y, 3)
    expect(committed()).toHaveLength(1)
    expect(committed()[0].getAttribute("data-selected")).toBe("true")
  })

  it("Delete xoá hình đang chọn; không có hình nào được chọn thì không xoá gì", async () => {
    const user = await playing()
    await draw(user, "trend")
    await draw(user, "fib", { x: 120, y: 90 }, { x: 320, y: 230 })
    expect(committed()).toHaveLength(2)
    // Hình vừa vẽ (Fibonacci) đang được chọn.
    await user.keyboard("{Delete}")
    expect(committed().map((shape) => shape.getAttribute("data-kind"))).toEqual(["trend"])

    clickAt({ x: 450, y: 250 })
    expect(committed()[0].getAttribute("data-selected")).toBe("false")
    await user.keyboard("{Delete}")
    expect(committed()).toHaveLength(1)

    clickAt({ x: 200, y: 160 })
    await user.keyboard("{Delete}")
    expect(committed()).toHaveLength(0)
  })

  it("Backspace cũng xoá hình đang chọn (§7.4); gõ trong ô nhập thì không xoá", async () => {
    const user = await playing()
    await draw(user, "trend")
    expect(committed()).toHaveLength(1)

    // Đang gõ số cổ phiếu thì phím xoá lùi chỉ sửa chữ, không đụng tới hình vẽ.
    const qty = within(screen.getByRole("region", { name: "Đặt lệnh" })).getByLabelText("Số cổ phiếu")
    await user.type(qty, "12{Backspace}")
    expect((qty as HTMLInputElement).value).toBe("1")
    expect(committed()).toHaveLength(1)

    await user.click(document.body)
    await user.keyboard("{Backspace}")
    expect(committed()).toHaveLength(0)
  })

  it("nút Xoá: chưa có hình thì báo Chưa có hình vẽ", async () => {
    const user = await playing()
    await user.click(clearButton())
    expect(mocks.toast.info).toHaveBeenCalledWith("Chưa có hình vẽ")
  })

  it("nút Xoá: đang chọn hình thì xoá hình đó; không chọn hình nào thì xoá hết", async () => {
    const user = await playing()
    await draw(user, "trend")
    await draw(user, "fib", { x: 120, y: 90 }, { x: 320, y: 230 })
    await draw(user, "trend", { x: 140, y: 100 }, { x: 340, y: 150 })
    expect(committed()).toHaveLength(3)

    await user.click(clearButton())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Đã xoá hình vẽ")
    expect(committed()).toHaveLength(2)

    clickAt({ x: 480, y: 255 })
    expect(committed().every((shape) => shape.getAttribute("data-selected") === "false")).toBe(true)
    await user.click(clearButton())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Đã xoá 2 hình vẽ")
    expect(committed()).toHaveLength(0)
  })

  it("hình vẽ chỉ ở trình duyệt: không có lời gọi nào tới server", async () => {
    const user = await playing()
    const before = backend.calls.length
    await draw(user, "trend")
    await draw(user, "fib")
    await user.click(clearButton())
    expect(backend.calls.slice(before).filter((call) => call.method !== "GET")).toHaveLength(0)
    expect(backend.calls.slice(before).some((call) => /draw|shape|fib|trend/i.test(call.path))).toBe(false)
  })

  it("Xem lại biểu đồ giữ hình vẽ; sang ván mới thì hình vẽ bắt đầu lại", async () => {
    setup({ match: { status: "ended", finished: true, step: 30, rivals: [{ person: MINH, pnl: 2, finished: true }] } })
    const user = userEvent.setup()
    renderGame()
    const dialog = within(await screen.findByTestId("flashback-result"))
    await user.click(dialog.getByRole("button", { name: "Xem lại biểu đồ" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-result")).toBeNull())

    await draw(user, "trend")
    expect(committed()).toHaveLength(1)

    await user.click(screen.getByTestId("flashback-next"))
    const again = within(await screen.findByTestId("flashback-result"))
    await user.click(again.getByRole("button", { name: "Xem lại biểu đồ" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-result")).toBeNull())
    expect(committed()).toHaveLength(1)

    await user.click(screen.getByTestId("flashback-next"))
    const last = within(await screen.findByTestId("flashback-result"))
    await user.click(last.getByRole("button", { name: "Chơi lại" }))
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe(ROOM_CODE)
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
    await findGame()
    expect(shapes()).toHaveLength(0)
    expect(handles()).toHaveLength(0)
  })
})
