/**
 * Sảnh Flashback v2.1 (spec §2 đến §5): ba tab, thẻ cấp, bảng xếp hạng với bục top 3, lịch sử đấu và
 * cấp, vương miện trên avatar ở danh sách phòng và phòng chờ.
 */
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { FlashbackHistoryItem } from "./flashback-api"
import { FlashbackMain } from "./flashback-main"
import { FlashbackProvider } from "./flashback-provider"
import {
  ME,
  MINH,
  createFlashbackBackend,
  historyItem,
  leaderboardRow,
  levelOf,
  listingRow,
  matchIdOf,
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

function setup(options: BackendOptions = {}) {
  backend = createFlashbackBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return backend
}

function renderFlashback() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FlashbackProvider>
        <FlashbackMain />
      </FlashbackProvider>
    </QueryClientProvider>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function findLobby() {
  await screen.findByRole("button", { name: "Chơi phòng bất kỳ" })
}

async function openTab(user: User, name: "Phòng chơi" | "Bảng xếp hạng" | "Lịch sử đấu") {
  await user.click(screen.getByRole("tab", { name }))
}

beforeEach(() => {
  mocks.api.mockReset()
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

describe("Flashback sảnh v2.1: ba tab (§2.2)", () => {
  it("có ba tab Phòng chơi, Bảng xếp hạng, Lịch sử đấu và mở sẵn Phòng chơi", async () => {
    setup({ listing: [listingRow({ id: "111111" })] })
    renderFlashback()
    await findLobby()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Phòng chơi", "Bảng xếp hạng", "Lịch sử đấu"])
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"])
    expect(await screen.findAllByTestId("flashback-room-row")).toHaveLength(1)
    expect(screen.queryByTestId("flashback-leaderboard")).toBeNull()
    expect(screen.queryByTestId("flashback-history")).toBeNull()
  })

  it("chuyển tab đổi nội dung; tab Phòng chơi giữ nguyên thanh nhập ID, Tạo phòng và bộ lọc", async () => {
    setup({ listing: [listingRow({ id: "111111" })], leaderboard: { rows: [leaderboardRow({ rank: 1, name: "Hà" })] } })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    expect(screen.getByRole("button", { name: "Tạo phòng" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Đang chờ" })).toBeTruthy()

    await openTab(user, "Bảng xếp hạng")
    expect(await screen.findByTestId("flashback-leaderboard")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Bảng xếp hạng" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.queryByRole("button", { name: "Chơi phòng bất kỳ" })).toBeNull()

    await openTab(user, "Lịch sử đấu")
    expect(await screen.findByTestId("flashback-history")).toBeTruthy()
    expect(screen.queryByTestId("flashback-leaderboard")).toBeNull()

    await openTab(user, "Phòng chơi")
    await findLobby()
    expect(screen.getByRole("button", { name: "Tạo phòng" })).toBeTruthy()
  })

  it("bảng xếp hạng và lịch sử chỉ được tải khi mở tab", async () => {
    setup()
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    expect(backend.callsTo("GET", "/flashback/leaderboard")).toHaveLength(0)
    expect(backend.callsTo("GET", "/flashback/me/history")).toHaveLength(0)

    await openTab(user, "Bảng xếp hạng")
    await screen.findByTestId("flashback-leaderboard")
    expect(backend.callsTo("GET", "/flashback/leaderboard")).toHaveLength(1)
    expect(backend.callsTo("GET", "/flashback/me/history")).toHaveLength(0)

    await openTab(user, "Lịch sử đấu")
    await screen.findByTestId("flashback-history")
    expect(backend.callsTo("GET", "/flashback/me/history").length).toBeGreaterThan(0)
  })
})

describe("Flashback sảnh v2.1: thẻ cấp (§2.1)", () => {
  it("hiện Cấp, điểm, điểm còn thiếu, thanh tiến độ trong cấp và hạng toàn hệ thống", async () => {
    setup({ progress: { points: 70, rank: 12, games: 14, wins: 6 } })
    renderFlashback()
    const card = await screen.findByTestId("flashback-level-card")
    expect(within(card).getByText("Cấp 3")).toBeTruthy()
    expect(within(card).getByText("70 điểm")).toBeTruthy()
    expect(within(card).getByText("Còn 20 điểm lên cấp 4")).toBeTruthy()
    expect(within(card).getByText("Top 12")).toBeTruthy()
    const bar = within(card).getByRole("progressbar", { name: "Tiến độ trong cấp" })
    expect(bar.getAttribute("aria-valuenow")).toBe("50")
  })

  it("người chưa có điểm là Cấp 1 và Chưa xếp hạng", async () => {
    setup()
    renderFlashback()
    const card = await screen.findByTestId("flashback-level-card")
    expect(within(card).getByText("Cấp 1")).toBeTruthy()
    expect(within(card).getByText("0 điểm")).toBeTruthy()
    expect(within(card).getByText("Còn 20 điểm lên cấp 2")).toBeTruthy()
    expect(within(card).getByText("Chưa xếp hạng")).toBeTruthy()
  })

  it("thẻ chỉ để xem: không có nút hay liên kết, bấm vào không làm gì", async () => {
    setup({ progress: { points: 70, rank: 12 } })
    const user = userEvent.setup()
    renderFlashback()
    const card = await screen.findByTestId("flashback-level-card")
    expect(card.tagName).toBe("SECTION")
    expect(within(card).queryAllByRole("button")).toHaveLength(0)
    expect(within(card).queryAllByRole("link")).toHaveLength(0)
    expect(card.closest("button, a")).toBeNull()

    await findLobby()
    const before = backend.calls.length
    await user.click(card)
    expect(backend.calls).toHaveLength(before)
    expect(screen.getByRole("tab", { name: "Phòng chơi" }).getAttribute("aria-selected")).toBe("true")
  })

  it("thẻ cấp nằm ở đầu sảnh nên vẫn thấy khi sang tab khác", async () => {
    setup({ progress: { points: 70, rank: 12 } })
    const user = userEvent.setup()
    renderFlashback()
    await screen.findByTestId("flashback-level-card")
    await openTab(user, "Lịch sử đấu")
    await screen.findByTestId("flashback-history")
    expect(screen.getByTestId("flashback-level-card")).toBeTruthy()
  })

  it("không tải được cấp thì sảnh vẫn dùng được, chỉ không có thẻ", async () => {
    setup({ listing: [listingRow({ id: "111111" })] })
    backend.fail("GET /flashback/me/level", { status: 503, code: "UNAVAILABLE", message: "Máy chủ bận" })
    renderFlashback()
    await findLobby()
    expect(await screen.findAllByTestId("flashback-room-row")).toHaveLength(1)
    expect(screen.queryByTestId("flashback-level-card")).toBeNull()
  })
})

describe("Flashback sảnh v2.1: bảng xếp hạng (§4)", () => {
  const BOARD = [
    leaderboardRow({ rank: 1, name: "Hà", points: 480 }),
    leaderboardRow({ rank: 2, name: "Bình", points: 420 }),
    leaderboardRow({ rank: 3, name: "Khoa", points: 399 }),
    leaderboardRow({ rank: 4, name: "Lan", points: 250, wins: 20, games: 33 }),
    leaderboardRow({ rank: 5, name: "Linh", points: 240, wins: 9, games: 21, is_me: true, user_id: "user-1" }),
  ]

  async function openBoard(options: BackendOptions) {
    setup(options)
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    await openTab(user, "Bảng xếp hạng")
    return screen.findByTestId("flashback-leaderboard")
  }

  it("dòng luật điểm ở đầu: thắng +10, thua +3, chơi 1 mình không tính điểm", async () => {
    const board = await openBoard({ leaderboard: { rows: BOARD } })
    expect(within(board).getByText("Thắng +10 điểm · Thua +3 điểm · Chơi 1 mình không tính điểm")).toBeTruthy()
    expect(within(board).getByRole("heading", { name: "Bảng xếp hạng" })).toBeTruthy()
  })

  it("bục top 3 xếp 2 - 1 - 3, mỗi người có vương miện đúng hạng, tên, điểm và bệ ghi hạng", async () => {
    await openBoard({ leaderboard: { rows: BOARD } })
    const podium = screen.getByTestId("flashback-podium")
    const pods = within(podium).getAllByTestId(/^flashback-pod-/)
    expect(pods.map((pod) => pod.getAttribute("data-testid"))).toEqual(["flashback-pod-2", "flashback-pod-1", "flashback-pod-3"])
    expect(pods.map((pod) => within(pod).getByTestId("flashback-crown").getAttribute("data-crown"))).toEqual(["2", "1", "3"])
    expect(pods.map((pod) => within(pod).getByRole("img", { name: /^Top \d$/ }).getAttribute("aria-label"))).toEqual([
      "Top 2",
      "Top 1",
      "Top 3",
    ])
    expect(within(pods[1]).getByText("Hà")).toBeTruthy()
    expect(within(pods[1]).getByText("480 điểm")).toBeTruthy()
    expect(within(pods[0]).getByText("Bình")).toBeTruthy()
    expect(within(pods[2]).getByText("Khoa")).toBeTruthy()
    expect(within(pods[1]).getByRole("img", { name: "Hạng 1" })).toBeTruthy()
    expect(within(pods[0]).getByRole("img", { name: "Hạng 2" })).toBeTruthy()
    expect(within(pods[2]).getByRole("img", { name: "Hạng 3" })).toBeTruthy()
  })

  it("mỗi người trên bục có ô cấp đúng theo điểm", async () => {
    await openBoard({ leaderboard: { rows: BOARD } })
    const pods = within(screen.getByTestId("flashback-podium")).getAllByTestId(/^flashback-pod-/)
    expect(pods.map((pod) => within(pod).getByTestId("flashback-level").getAttribute("aria-label"))).toEqual([
      `Cấp ${levelOf(420)}`,
      `Cấp ${levelOf(480)}`,
      `Cấp ${levelOf(399)}`,
    ])
  })

  it("từ hạng 4 là bảng Hạng, Avatar, Người chơi, Điểm, Thắng/Ván; không có vương miện", async () => {
    await openBoard({ leaderboard: { rows: BOARD } })
    const list = screen.getByRole("list", { name: "Từ hạng 4" })
    const rows = within(list).getAllByTestId("flashback-leaderboard-row")
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("4")
    expect(rows[0].textContent).toContain("Lan")
    expect(rows[0].textContent).toContain("250")
    expect(rows[0].textContent).toContain("20/33")
    expect(within(rows[0]).getByTestId("flashback-level").getAttribute("aria-label")).toBe(`Cấp ${levelOf(250)}`)
    expect(within(rows[0]).queryByTestId("flashback-crown")).toBeNull()
    expect(screen.getByText("Hạng")).toBeTruthy()
    expect(screen.getByText("Người chơi")).toBeTruthy()
    expect(screen.getByText("Thắng/Ván")).toBeTruthy()
  })

  it("dòng của mình có nền xanh và (bạn)", async () => {
    await openBoard({ leaderboard: { rows: BOARD } })
    const rows = screen.getAllByTestId("flashback-leaderboard-row")
    expect(rows.map((row) => row.getAttribute("data-me"))).toEqual(["false", "true"])
    expect(rows[1].className).toContain("bg-primary/10")
    expect(within(rows[1]).getByText("(bạn)")).toBeTruthy()
    expect(within(rows[0]).queryByText("(bạn)")).toBeNull()
  })

  it("mình nằm trong top 3 thì bệ của mình được đánh dấu", async () => {
    const rows = BOARD.map((row) => (row.rank === 2 ? { ...row, is_me: true, user_id: "user-1" } : { ...row, is_me: false }))
    await openBoard({ leaderboard: { rows } })
    expect(screen.getByTestId("flashback-pod-2").getAttribute("data-me")).toBe("true")
    expect(screen.getByTestId("flashback-pod-1").getAttribute("data-me")).toBe("false")
    // Tên của mình trên bục có màu xanh (§4.2), tên người khác thì không.
    expect(within(screen.getByTestId("flashback-pod-2")).getByText("Bình").className).toContain("text-primary")
    expect(within(screen.getByTestId("flashback-pod-1")).getByText("Hà").className).not.toContain("text-primary")
  })

  it("chỉ lấy top 50, chia trang 10 người (không cuộn); mình ngoài top 50 thì có dòng … rồi dòng của mình", async () => {
    const user = userEvent.setup()
    const top = Array.from({ length: 50 }, (_, index) => leaderboardRow({ rank: index + 1, name: `Người ${index + 1}` }))
    const mine = leaderboardRow({ rank: 87, name: "Linh", points: 12, is_me: true, user_id: "user-1" })
    await openBoard({ leaderboard: { rows: top, me: mine } })
    expect(backend.callsTo("GET", "/flashback/leaderboard")[0].path).toContain("limit=50")

    const rowsOf = () => within(screen.getByRole("list", { name: "Từ hạng 4" })).getAllByTestId("flashback-leaderboard-row")
    // Trang 1: hạng 4 đến 13, cộng dòng của mình.
    expect(rowsOf()).toHaveLength(11)
    expect(rowsOf()[0].textContent).toContain("Người 4")
    expect(rowsOf()[9].textContent).toContain("Người 13")
    expect(rowsOf()[10].getAttribute("data-me")).toBe("true")
    expect(rowsOf()[10].textContent).toContain("87")
    expect(within(rowsOf()[10]).getByText("(bạn)")).toBeTruthy()
    const nav = screen.getByRole("navigation", { name: "Phân trang bảng xếp hạng" })
    expect(within(nav).getByText("Trang 1/5")).toBeTruthy()
    expect(within(nav).getByRole("button", { name: "Trang trước" })).toHaveProperty("disabled", true)
    expect(screen.queryByTestId("flashback-leaderboard-scroll")).toBeNull()

    // Trang cuối: hạng 44 đến 50 (7 người), dòng … rồi dòng của mình vẫn ở cuối.
    for (let index = 0; index < 4; index += 1) await user.click(within(nav).getByRole("button", { name: "Trang sau" }))
    expect(within(nav).getByText("Trang 5/5")).toBeTruthy()
    expect(within(nav).getByRole("button", { name: "Trang sau" })).toHaveProperty("disabled", true)
    const rows = rowsOf()
    expect(rows).toHaveLength(8)
    expect(rows[0].textContent).toContain("Người 44")
    expect(rows[6].textContent).toContain("Người 50")
    const gap = within(screen.getByRole("list", { name: "Từ hạng 4" })).getByText("…")
    expect(gap.compareDocumentPosition(rows[7]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("mình trong top 50 thì không có dòng … và không lặp dòng của mình", async () => {
    await openBoard({ leaderboard: { rows: BOARD, me: null } })
    expect(screen.queryByText("…")).toBeNull()
    expect(screen.getAllByText("(bạn)")).toHaveLength(1)
  })

  it("chưa có ai thì báo trống, không có bục", async () => {
    await openBoard({ leaderboard: { rows: [] } })
    expect(screen.getByText("Chưa có người chơi nào trên bảng xếp hạng")).toBeTruthy()
    expect(screen.queryByTestId("flashback-podium")).toBeNull()
  })

  it("mới có 2 người thì bục hạng 3 ghi Chưa có", async () => {
    await openBoard({ leaderboard: { rows: BOARD.slice(0, 2) } })
    const pod = screen.getByTestId("flashback-pod-3")
    expect(within(pod).getByText("Chưa có")).toBeTruthy()
    expect(within(pod).queryByTestId("flashback-crown")).toBeNull()
  })

  it("lỗi tải thì có nút Thử lại", async () => {
    setup({ leaderboard: { rows: BOARD } })
    backend.fail("GET /flashback/leaderboard", { status: 503, code: "UNAVAILABLE", message: "Máy chủ bận" })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    await openTab(user, "Bảng xếp hạng")
    await screen.findByText("Chưa tải được bảng xếp hạng")
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByTestId("flashback-podium")).toBeTruthy()
  })
})

describe("Flashback sảnh v2.1: lịch sử đấu (§5)", () => {
  const HOUR = 3_600_000
  const DAY = 24 * HOUR
  const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString()
  /** Ván thứ n, mới nhất trước: n càng lớn thì càng cũ. */
  const game = (n: number, overrides: Partial<FlashbackHistoryItem> = {}) =>
    historyItem({ match_id: matchIdOf(n), room_id: String(100_000 + n), ended_at: agoIso(n * HOUR), ...overrides })

  const WIN = game(1, { ended_at: new Date(2026, 9, 31, 9, 5).toISOString() })
  const LOSE = game(2, {
    result: "lose",
    rank: 2,
    points: 3,
    xu: -50,
    stake_xu: 50,
    pnl_pct: -0.015,
    pnl_percent: -1.5,
    symbol: "FPT",
    orders: [],
  })
  const SOLO = game(3, {
    result: "solo",
    rank: 1,
    player_count: 1,
    points: 0,
    xu: 0,
    stake_xu: 0,
    pnl_pct: 0.008,
    pnl_percent: 0.8,
    symbol: "HPG",
    players: [
      { user_id: "user-1", name: "Linh", avatar_url: null, crown: null, level: 3, is_me: true, pnl_pct: 0.008, pnl_percent: 0.8, points: 0, rank: 1, xu: 0 },
    ],
  })

  async function openHistory(options: BackendOptions) {
    setup(options)
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    await openTab(user, "Lịch sử đấu")
    await screen.findByTestId("flashback-history")
    return user
  }

  const rowsNow = () => screen.queryAllByTestId("flashback-history-row")
  /** Giá trị, ghi chú và lớp màu của một ô tổng kết theo nhãn. */
  const tile = (label: string) => {
    const found = screen.getAllByTestId("flashback-history-tile").find((element) => element.firstElementChild?.textContent === label)
    if (!found) throw new Error(`Không có ô ${label}`)
    return {
      value: found.querySelector("b")?.textContent,
      note: found.querySelector("small")?.textContent,
      valueClass: found.querySelector("b")?.className ?? "",
    }
  }
  const resultGroup = () => within(screen.getByRole("group", { name: "Lọc kết quả" }))
  const daysGroup = () => within(screen.getByRole("group", { name: "Lọc thời gian" }))

  it("sáu ô tổng kết: Số ván, Thắng / Tỷ lệ, Xu, Điểm cấp, Lãi trung bình, Ván tốt nhất", async () => {
    await openHistory({ history: [WIN, LOSE, SOLO] })
    await waitFor(() => expect(screen.getAllByTestId("flashback-history-tile")).toHaveLength(6))
    const labels = screen.getAllByTestId("flashback-history-tile").map((element) => element.firstElementChild?.textContent)
    expect(labels).toEqual(["Số ván", "Thắng / Tỷ lệ", "Xu", "Điểm cấp", "Lãi trung bình", "Ván tốt nhất"])

    expect(tile("Số ván")).toMatchObject({ value: "3", note: "1 ván chơi 1 mình" })
    expect(tile("Thắng / Tỷ lệ")).toMatchObject({ value: "1 · 50%", note: "Ván từ 2 người" })
    expect(tile("Xu").value).toBe("+50")
    expect(tile("Xu").valueClass).toContain("text-price-up")
    expect(tile("Điểm cấp").value).toBe("+13")
    expect(tile("Lãi trung bình").value).toBe("+0,55%")
    expect(tile("Lãi trung bình").valueClass).toContain("text-price-up")
    expect(tile("Ván tốt nhất")).toMatchObject({ value: "+2,34%", note: "VNM" })
  })

  it("gọi đúng API của chính mình, không có tham số người dùng", async () => {
    await openHistory({ history: [WIN] })
    await screen.findAllByTestId("flashback-history-row")
    const list = backend.callsTo("GET", "/flashback/me/history?")
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].path).toContain("result=all")
    expect(list[0].path).toContain("days=all")
    expect(list[0].path).toContain("page=1")
    expect(backend.callsTo("GET", "/flashback/me/history/summary").length).toBeGreaterThan(0)
    for (const call of backend.callsTo("GET", "/flashback/me/history")) expect(call.path).not.toMatch(/user/i)
  })

  it("mỗi ván một dòng: thời gian và phòng, kết quả và hạng, mã và khoảng ngày, lợi nhuận và xu, điểm", async () => {
    await openHistory({ history: [WIN, LOSE, SOLO] })
    const rows = await screen.findAllByTestId("flashback-history-row")
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.getAttribute("data-result"))).toEqual(["win", "lose", "solo"])

    const win = within(rows[0])
    expect(win.getByText("31/10/2026 09:05")).toBeTruthy()
    expect(win.getByText("Phòng 100001 · 2 người · 60/30 phiên · 10 phút")).toBeTruthy()
    expect(win.getByText("Thắng")).toBeTruthy()
    expect(win.getByText("Hạng 1/2")).toBeTruthy()
    expect(win.getByText("VNM")).toBeTruthy()
    expect(rows[0].textContent).toContain("02/01/2026")
    expect(rows[0].textContent).toContain("31/03/2026")
    expect(win.getByText("+2,34%").className).toContain("text-price-up")
    expect(win.getByText("+100 xu")).toBeTruthy()
    expect(win.getByText("+10 điểm")).toBeTruthy()

    const lose = within(rows[1])
    expect(lose.getByText("Thua")).toBeTruthy()
    expect(lose.getByText("Hạng 2/2")).toBeTruthy()
    expect(lose.getByText("−1,50%").className).toContain("text-price-down")
    expect(lose.getByText("−50 xu")).toBeTruthy()
    expect(lose.getByText("+3 điểm")).toBeTruthy()

    const solo = within(rows[2])
    expect(solo.getByText("Chơi 1 mình")).toBeTruthy()
    expect(solo.queryByText(/^Hạng/)).toBeNull()
    expect(solo.getByText("Không cược")).toBeTruthy()
    expect(solo.getByText("HPG")).toBeTruthy()
    expect(solo.getByText("Không tính điểm")).toBeTruthy()
    expect(solo.queryByText(/\+\d+ điểm/)).toBeNull()
  })

  it("ván hoà hạng 1 hiện Hoà và vẫn được +10 điểm", async () => {
    await openHistory({ history: [game(1, { result: "tie", rank: 1, points: 10, xu: 0 })] })
    const row = within((await screen.findAllByTestId("flashback-history-row"))[0])
    expect(row.getByText("Hoà")).toBeTruthy()
    expect(row.getByText("+10 điểm")).toBeTruthy()
  })

  it("bộ lọc kết quả Tất cả, Thắng, Thua, Chơi 1 mình lọc danh sách; ô tổng kết không đổi", async () => {
    const user = await openHistory({ history: [WIN, LOSE, SOLO] })
    await waitFor(() => expect(rowsNow()).toHaveLength(3))
    expect(resultGroup().getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(resultGroup().getByRole("button", { name: "Thắng" }))
    await waitFor(() => expect(rowsNow().map((row) => row.getAttribute("data-result"))).toEqual(["win"]))
    expect(resultGroup().getByRole("button", { name: "Thắng" }).getAttribute("aria-pressed")).toBe("true")
    expect(resultGroup().getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("false")
    expect(backend.callsTo("GET", "/flashback/me/history?").some((call) => call.path.includes("result=win"))).toBe(true)
    expect(tile("Số ván").value).toBe("3")

    await user.click(resultGroup().getByRole("button", { name: "Thua" }))
    await waitFor(() => expect(rowsNow().map((row) => row.getAttribute("data-result"))).toEqual(["lose"]))

    await user.click(resultGroup().getByRole("button", { name: "Chơi 1 mình" }))
    await waitFor(() => expect(rowsNow().map((row) => row.getAttribute("data-result"))).toEqual(["solo"]))

    await user.click(resultGroup().getByRole("button", { name: "Tất cả" }))
    await waitFor(() => expect(rowsNow()).toHaveLength(3))
  })

  it("bộ lọc thời gian 7 ngày, 30 ngày, Tất cả lọc cả danh sách lẫn sáu ô tổng kết", async () => {
    const recent = game(1)
    const middle = game(2, { ended_at: agoIso(10 * DAY) })
    const old = game(3, { ended_at: agoIso(45 * DAY) })
    const user = await openHistory({ history: [recent, middle, old] })
    await waitFor(() => expect(rowsNow()).toHaveLength(3))
    expect(daysGroup().getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(daysGroup().getByRole("button", { name: "7 ngày" }))
    await waitFor(() => expect(rowsNow()).toHaveLength(1))
    await waitFor(() => expect(tile("Số ván").value).toBe("1"))
    expect(daysGroup().getByRole("button", { name: "7 ngày" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(daysGroup().getByRole("button", { name: "30 ngày" }))
    await waitFor(() => expect(rowsNow()).toHaveLength(2))
    await waitFor(() => expect(tile("Điểm cấp").value).toBe("+20"))

    await user.click(daysGroup().getByRole("button", { name: "Tất cả" }))
    await waitFor(() => expect(rowsNow()).toHaveLength(3))
    await waitFor(() => expect(tile("Điểm cấp").value).toBe("+30"))
  })

  it("bấm một dòng mở chi tiết: kết quả mọi người trong ván và lệnh của chính mình; bấm lại thì đóng", async () => {
    const user = await openHistory({ history: [WIN, LOSE] })
    const rows = await screen.findAllByTestId("flashback-history-row")
    const button = within(rows[0]).getByRole("button")
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(within(rows[0]).queryByTestId("flashback-history-detail")).toBeNull()

    await user.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    const detail = within(rows[0]).getByTestId("flashback-history-detail")

    const players = within(detail).getAllByRole("listitem")
    expect(players).toHaveLength(2)
    expect(players[0].getAttribute("data-me")).toBe("true")
    expect(players[0].textContent).toContain("Linh")
    expect(players[0].textContent).toContain("+2,34%")
    expect(players[0].textContent).toContain("+100 xu")
    expect(players[0].textContent).toContain("+10 điểm")
    expect(within(players[0]).getByRole("img", { name: "Cấp 3" })).toBeTruthy()
    expect(players[1].textContent).toContain("Minh")
    expect(players[1].textContent).toContain("−1,00%")
    expect(players[1].textContent).toContain("−100 xu")
    expect(players[1].textContent).toContain("+3 điểm")
    expect(within(players[1]).getByRole("img", { name: "Top 2" })).toBeTruthy()
    expect(within(players[1]).getByRole("img", { name: "Cấp 7" })).toBeTruthy()

    expect(within(detail).getByText("Lệnh của bạn · 2 lệnh · tiền mặt cuối ván 42%")).toBeTruthy()
    const orders = within(detail).getAllByTestId("flashback-history-order")
    expect(orders).toHaveLength(2)
    expect(orders[0].textContent).toBe("3Mua10028.8004.320")
    expect(orders[1].textContent).toBe("12Bán10029.5004.425")

    await user.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(within(rows[0]).queryByTestId("flashback-history-detail")).toBeNull()
  })

  it("chỉ có lệnh của mình: một bảng lệnh duy nhất, không có lệnh của người khác", async () => {
    const user = await openHistory({ history: [WIN] })
    await user.click(within((await screen.findAllByTestId("flashback-history-row"))[0]).getByRole("button"))
    const detail = screen.getByTestId("flashback-history-detail")
    expect(within(detail).getAllByRole("table")).toHaveLength(1)
    expect(within(detail).getByRole("region", { name: "Lệnh của bạn" })).toBeTruthy()
    expect(within(detail).queryByText(/Lệnh của Minh/)).toBeNull()
    expect(screen.queryByText(/xem lại biểu đồ/i)).toBeNull()
  })

  it("mở một ván thì ván đang mở trước đó đóng lại; ván không có lệnh ghi Không có lệnh", async () => {
    const user = await openHistory({ history: [WIN, LOSE] })
    const rows = await screen.findAllByTestId("flashback-history-row")
    await user.click(within(rows[0]).getByRole("button"))
    expect(screen.getAllByTestId("flashback-history-detail")).toHaveLength(1)
    await user.click(within(rows[1]).getByRole("button"))
    expect(screen.getAllByTestId("flashback-history-detail")).toHaveLength(1)
    expect(within(rows[0]).queryByTestId("flashback-history-detail")).toBeNull()
    expect(within(rows[1]).getByText("Không có lệnh")).toBeTruthy()
    expect(rows.map((row) => row.getAttribute("data-open"))).toEqual(["false", "true"])
  })

  it("20 ván mỗi trang: 45 ván là 3 trang, có Trang trước và Trang sau", async () => {
    const history = Array.from({ length: 45 }, (_, index) => game(index + 1))
    const user = await openHistory({ history })
    await waitFor(() => expect(rowsNow()).toHaveLength(20))
    const nav = screen.getByRole("navigation", { name: "Phân trang lịch sử" })
    expect(within(nav).getByText("Trang 1/3")).toBeTruthy()
    expect((within(nav).getByRole("button", { name: "Trang trước" }) as HTMLButtonElement).disabled).toBe(true)
    expect(rowsNow()[0].textContent).toContain("Phòng 100001")

    await user.click(within(nav).getByRole("button", { name: "Trang sau" }))
    await within(nav).findByText("Trang 2/3")
    await waitFor(() => expect(rowsNow()[0].textContent).toContain("Phòng 100021"))
    expect(rowsNow()).toHaveLength(20)
    expect(backend.callsTo("GET", "/flashback/me/history?").some((call) => call.path.includes("page=2"))).toBe(true)

    await user.click(within(nav).getByRole("button", { name: "Trang sau" }))
    await within(nav).findByText("Trang 3/3")
    await waitFor(() => expect(rowsNow()).toHaveLength(5))
    expect((within(nav).getByRole("button", { name: "Trang sau" }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(within(nav).getByRole("button", { name: "Trang trước" }))
    await within(nav).findByText("Trang 2/3")
    await waitFor(() => expect(rowsNow()).toHaveLength(20))
  })

  it("giữ mọi ván nhưng chỉ hiện 200 ván gần nhất: 230 ván là 10 trang", async () => {
    const history = Array.from({ length: 230 }, (_, index) => game(index + 1))
    await openHistory({ history })
    const nav = await screen.findByRole("navigation", { name: "Phân trang lịch sử" })
    expect(within(nav).getByText("Trang 1/10")).toBeTruthy()
  })

  it("đổi bộ lọc thì về trang 1 và đóng chi tiết đang mở", async () => {
    const history = Array.from({ length: 45 }, (_, index) => game(index + 1))
    const user = await openHistory({ history })
    const nav = await screen.findByRole("navigation", { name: "Phân trang lịch sử" })
    await user.click(within(nav).getByRole("button", { name: "Trang sau" }))
    await within(nav).findByText("Trang 2/3")
    await waitFor(() => expect(rowsNow()[0].textContent).toContain("Phòng 100021"))
    await user.click(within(rowsNow()[0]).getByRole("button"))
    expect(screen.getAllByTestId("flashback-history-detail")).toHaveLength(1)

    await user.click(daysGroup().getByRole("button", { name: "30 ngày" }))
    await within(screen.getByRole("navigation", { name: "Phân trang lịch sử" })).findByText("Trang 1/3")
    await waitFor(() => expect(rowsNow()[0].textContent).toContain("Phòng 100001"))
    expect(screen.queryAllByTestId("flashback-history-detail")).toHaveLength(0)
  })

  it("một trang thì không có thanh phân trang", async () => {
    await openHistory({ history: [WIN, LOSE, SOLO] })
    await screen.findAllByTestId("flashback-history-row")
    expect(screen.queryByRole("navigation", { name: "Phân trang lịch sử" })).toBeNull()
  })

  it("chưa có ván nào thì báo Chưa có ván nào và các ô tổng kết là 0", async () => {
    await openHistory({ history: [] })
    expect(await screen.findByText("Chưa có ván nào")).toBeTruthy()
    await waitFor(() => expect(screen.getAllByTestId("flashback-history-tile")).toHaveLength(6))
    expect(tile("Số ván").value).toBe("0")
    expect(tile("Thắng / Tỷ lệ").value).toBe("0 · 0%")
    expect(tile("Điểm cấp").value).toBe("+0")
  })

  it("lọc ra không còn ván nào cũng báo Chưa có ván nào", async () => {
    const user = await openHistory({ history: [WIN] })
    await screen.findAllByTestId("flashback-history-row")
    await user.click(resultGroup().getByRole("button", { name: "Chơi 1 mình" }))
    expect(await screen.findByText("Chưa có ván nào")).toBeTruthy()
  })

  it("lỗi tải danh sách thì có nút Thử lại", async () => {
    setup({ history: [WIN] })
    backend.fail("GET /flashback/me/history", { status: 503, code: "UNAVAILABLE", message: "Máy chủ bận" })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    await openTab(user, "Lịch sử đấu")
    await screen.findByText("Chưa tải được lịch sử đấu")
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findAllByTestId("flashback-history-row")).toHaveLength(1)
  })
})

describe("Flashback sảnh v2.1: cấp và vương miện trên avatar (§3.3, §4.3)", () => {
  it("danh sách phòng: chủ phòng có ô cấp; hạng 1, 2, 3 toàn hệ thống có thêm vương miện", async () => {
    setup({
      listing: [
        listingRow({ id: "111111", owner: { name: "Minh", avatar_url: null, level: 12, crown: 1 } }),
        listingRow({ id: "222222", owner: { name: "Hòa", avatar_url: null, level: 4 } }),
        listingRow({ id: "333333", owner: { name: "Nam", avatar_url: null, level: 9, crown: 3 } }),
      ],
    })
    renderFlashback()
    await findLobby()
    const rows = await screen.findAllByTestId("flashback-room-row")

    expect(within(rows[0]).getByRole("img", { name: "Cấp 12" })).toBeTruthy()
    expect(within(rows[0]).getByRole("img", { name: "Top 1" })).toBeTruthy()
    expect(within(rows[0]).getByTestId("flashback-crown").getAttribute("data-crown")).toBe("1")

    expect(within(rows[1]).getByRole("img", { name: "Cấp 4" })).toBeTruthy()
    expect(within(rows[1]).queryByTestId("flashback-crown")).toBeNull()

    expect(within(rows[2]).getByRole("img", { name: "Cấp 9" })).toBeTruthy()
    expect(within(rows[2]).getByRole("img", { name: "Top 3" })).toBeTruthy()
  })

  it("phòng chờ: mỗi ô người chơi có ô cấp và vương miện nếu đang top 3", async () => {
    setup({
      room: { status: "waiting", owner: ME, members: [ME, { ...MINH, level: 7, crown: 2 }] },
      me: { level: 3 },
    })
    renderFlashback()
    await screen.findByTestId("flashback-room-id")
    const slots = screen.getAllByTestId("flashback-slot")
    expect(slots).toHaveLength(2)

    expect(within(slots[0]).getByText("Linh")).toBeTruthy()
    expect(within(slots[0]).getByRole("img", { name: "Cấp 3" })).toBeTruthy()
    expect(within(slots[0]).queryByTestId("flashback-crown")).toBeNull()

    expect(within(slots[1]).getByText("Minh")).toBeTruthy()
    expect(within(slots[1]).getByRole("img", { name: "Cấp 7" })).toBeTruthy()
    expect(within(slots[1]).getByRole("img", { name: "Top 2" })).toBeTruthy()
  })
})
