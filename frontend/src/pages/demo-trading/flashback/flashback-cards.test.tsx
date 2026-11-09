/**
 * Thẻ nến trong màn chơi Flashback (Candle Dojo spec v1.2 §9): khối "Thẻ trong ván", khung và nhãn mẫu nến trên biểu đồ, thẻ bật lên rồi
 * bay vào khay. Server giả (`flashback-test-support.ts`) trả thẻ ở `cards` của ảnh chụp ván và `card` của phản hồi "Phiên tiếp"; client
 * không tự nhận diện. Biểu đồ SVG cũ (mặc định trong test) và IQLine (`?iqline=1`) cùng vẽ khung từ dữ liệu đó.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AXIS_RIGHT } from "@/lib/iqline/react/chart-helpers"
import { installCanvasEnv } from "@/lib/iqline/react/test-env"

import { CARDS_TRAY_HEIGHT } from "./flashback-cards-model"
import { FlashbackMain } from "./flashback-main"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import { ME, MINH, createFlashbackBackend, type BackendOptions, type FlashbackBackend } from "./flashback-test-support"
import { useMatchCards } from "./use-flashback-cards"
import { CHART_BOTTOM_RESERVE } from "./use-chart-fit"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  openAuth: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, openAuth: mocks.openAuth }),
}))
vi.mock("@/hooks/use-resolved-theme", () => ({ useResolvedTheme: () => "dark" }))
vi.mock("../shop/use-shop", () => ({ useShopState: () => ({ data: { wallet: { balance: 5_000 } } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("./flashback-model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./flashback-model")>()),
  RESULT_LOCK_SECONDS: 0,
}))

let backend: FlashbackBackend

function setup(options: BackendOptions = {}) {
  backend = createFlashbackBackend({ room: { status: "playing", owner: ME, members: [ME, MINH] }, ...options })
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

/** jsdom không có bố cục: bề rộng khung chứa của biểu đồ là giá trị giả này. */
function stubChartWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width })
}

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

async function findGame() {
  await screen.findByTestId("flashback-clock")
  await waitFor(() => expect(screen.getByTestId("flashback-session")).toBeTruthy(), { timeout: 8000 })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const nextButton = () => screen.getByTestId("flashback-next")
const tray = () => screen.getByTestId("flashback-cards-tray")
const slots = () => Array.from(tray().querySelectorAll<HTMLElement>("[data-card-slot]"))
const boxes = () => Array.from(document.querySelectorAll<HTMLElement>("[data-card-box]"))
const labels = () => Array.from(document.querySelectorAll<HTMLElement>("[data-card-label]"))
const dots = () => Array.from(document.querySelectorAll<HTMLElement>("[data-card-dot]"))
const popup = () => screen.queryByTestId("flashback-card-popup")
const boxOf = (playIdx: number) => document.querySelector<HTMLElement>(`[data-card-box="${playIdx}"]`)
const slotOf = (playIdx: number) => document.querySelector<HTMLElement>(`[data-card-slot="${playIdx}"]`)

async function pressNext() {
  fireEvent.click(nextButton())
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
  stubChartWidth(1000)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth")
  window.history.replaceState(null, "", "/")
})

describe("Flashback: khối Thẻ trong ván", () => {
  it("chưa gặp thẻ nào: nhãn, số 0 và câu hướng dẫn; biểu đồ không có khung nào", async () => {
    setup()
    renderGame()
    await findGame()
    expect(within(tray()).getByText("Thẻ trong ván")).toBeTruthy()
    expect(screen.getByTestId("flashback-cards-count").textContent).toBe("0")
    expect(screen.getByTestId("flashback-cards-empty").textContent).toBe("Gặp mẫu nến trùng thẻ bạn có, thẻ sẽ hiện ở đây.")
    expect(slots()).toHaveLength(0)
    expect(boxes()).toHaveLength(0)
  })

  it("máy tính: cùng hàng với nút Phiên tiếp; biểu đồ chừa đúng chiều cao khối để màn chơi vẫn vừa một màn hình", async () => {
    setup()
    renderGame()
    await findGame()
    expect(tray().parentElement).toBe(nextButton().parentElement)
    expect(nextButton().compareDocumentPosition(tray()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tray().style.height).toBe(`${CARDS_TRAY_HEIGHT}px`)
    // Hàng dưới biểu đồ cao bằng khối thẻ thay vì nút 36px.
    expect(CHART_BOTTOM_RESERVE).toBe(80 - 36 + CARDS_TRAY_HEIGHT)
  })

  it("vào lại ván: dựng lại khay từ ảnh chụp, cũ nhất bên trái, mỗi thẻ ghi Phiên N, và đủ khung trên biểu đồ; không bật thẻ nào lên", async () => {
    setup({
      match: {
        step: 4,
        cards: [
          { card_id: "doji", card_n: 1, play_idx: 1 },
          { card_id: "sao_mai", card_n: 3, play_idx: 4 },
        ],
      },
    })
    renderGame()
    await findGame()
    expect(screen.getByTestId("flashback-cards-count").textContent).toBe("2")
    expect(slots().map((slot) => slot.getAttribute("aria-label"))).toEqual(["Doji, Phiên 1", "Morning Star, Phiên 4"])
    expect(slots().map((slot) => slot.querySelector("small")?.textContent)).toEqual(["Phiên 1", "Phiên 4"])
    expect(slots().every((slot) => slot.getAttribute("data-waiting") === "false")).toBe(true)
    expect(screen.queryByTestId("flashback-cards-empty")).toBeNull()
    // Khung của cả hai thẻ, màu theo bậc (Doji bậc 1, Morning Star bậc 3), nhãn tên của cả hai (đều trong 3 thẻ gần nhất).
    expect(boxes().map((box) => box.getAttribute("data-tier"))).toEqual(["1", "3"])
    expect(labels().map((label) => label.textContent)).toEqual(["Doji", "Morning Star"])
    expect(popup()).toBeNull()
    // Toạ độ khớp biểu đồ SVG: 90 ô (60 xem + 30 chơi) trên bề rộng 1000 - 6 - 62; Doji (mẫu 1 nến, phiên 1) là nến 60, Morning Star (3 nến, phiên 4) là nến 61..63.
    const slot = (1000 - 6 - 62) / 90
    expect(Number.parseFloat(boxOf(1)!.style.left)).toBeCloseTo(60 * slot, 0)
    expect(Number.parseFloat(boxOf(1)!.style.width)).toBeCloseTo(slot, 0)
    expect(Number.parseFloat(boxOf(4)!.style.left)).toBeCloseTo(61 * slot, 0)
    expect(Number.parseFloat(boxOf(4)!.style.width)).toBeCloseTo(3 * slot, 0)
  })

  it("nhiều thẻ thì khay tự cuộn tới thẻ mới nhất (bên phải)", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 777 })
    try {
      setup({ match: { step: 2, cards: [{ card_id: "doji", card_n: 1, play_idx: 1 }, { card_id: "bua", card_n: 1, play_idx: 2 }] } })
      renderGame()
      await findGame()
      const row = screen.getByTestId("flashback-cards-row")
      await waitFor(() => expect(row.scrollLeft).toBe(777))
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth")
    }
  })

  it("lớp phủ khung không nhận con trỏ nên không chặn công cụ vẽ, Mua, Bán", async () => {
    setup({ match: { step: 1, cards: [{ card_id: "doji", card_n: 1, play_idx: 1 }] } })
    renderGame()
    await findGame()
    const overlay = screen.getByTestId("flashback-card-overlay")
    expect(overlay.className).toContain("pointer-events-none")
    expect(overlay.parentElement?.className).toContain("pointer-events-none")
  })

  it("phiên mở ra có thẻ: khay thêm đúng một thẻ ghi Phiên 1 và đúng tên; khung và nhãn hiện trên biểu đồ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ cardAtStep: { 1: { id: "doji", n: 1 } } })
    renderGame()
    await findGame()
    expect(slots()).toHaveLength(0)
    await pressNext()
    await waitFor(() => expect(slots()).toHaveLength(1))
    expect(slots()[0].getAttribute("aria-label")).toBe("Doji, Phiên 1")
    expect(slots()[0].querySelector("small")?.textContent).toBe("Phiên 1")
    expect(screen.getByTestId("flashback-cards-count").textContent).toBe("1")
    expect(boxes()).toHaveLength(1)
    expect(labels().map((label) => label.textContent)).toEqual(["Doji"])
  })

  it("phiên không có thẻ (hoặc thẻ mình chưa sở hữu, server không trả): khay và biểu đồ không đổi", async () => {
    setup()
    renderGame()
    await findGame()
    await pressNext()
    await waitFor(() => expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 1"))
    expect(slots()).toHaveLength(0)
    expect(boxes()).toHaveLength(0)
    expect(popup()).toBeNull()
  })

  it("nhiều thẻ: cũ nhất bên trái, mới nhất bên phải; chỉ 3 thẻ gần nhất có nhãn tên, thẻ cũ hơn thu thành chấm; hai khung chồng nhau cùng giữ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({
      cardAtStep: {
        1: { id: "marubozu_tang", n: 1 },
        2: { id: "harami_giam", n: 2 },
        3: { id: "doji", n: 1 },
        4: { id: "sao_mai", n: 3 },
      },
    })
    renderGame()
    await findGame()
    for (let step = 1; step <= 4; step += 1) {
      await pressNext()
      await waitFor(() => expect(slots()).toHaveLength(step))
    }
    expect(slots().map((slot) => slot.querySelector("small")?.textContent)).toEqual(["Phiên 1", "Phiên 2", "Phiên 3", "Phiên 4"])
    expect(slots().map((slot) => slot.getAttribute("data-card-id"))).toEqual(["marubozu_tang", "harami_giam", "doji", "sao_mai"])
    expect(boxes()).toHaveLength(4)
    expect(labels().map((label) => label.textContent)).toEqual(["Bearish Harami", "Doji", "Morning Star"])
    expect(dots().map((dot) => dot.getAttribute("data-card-dot"))).toEqual(["1"])
    // Marubozu (phiên 1) và Bearish Harami (phiên 2) chồng nhau ở nến phiên 1 và 2: cả hai khung còn.
    expect(boxOf(1)).not.toBeNull()
    expect(boxOf(2)).not.toBeNull()
  })

  it("thẻ bật lên rồi bay vào khay: lật 0,4 giây, giữ 0,9 giây, bay 0,6 giây; ô đích để trống lúc bay, khung đậm lên rồi trở lại", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ cardAtStep: { 1: { id: "doji", n: 1 } } })
    renderGame()
    await findGame()
    await pressNext()
    await waitFor(() => expect(popup()).not.toBeNull())
    const pop = popup()!
    expect(pop.getAttribute("data-card-id")).toBe("doji")
    expect(pop.getAttribute("data-phase")).toBe("pop")
    // Không chặn thao tác: không nhận con trỏ, nằm ở body, ẩn với trình đọc màn hình (đã có thông báo riêng).
    expect(pop.className).toContain("pointer-events-none")
    expect(pop.parentElement).toBe(document.body)
    expect(screen.getByText(/gặp thẻ Doji/)).toBeTruthy()
    // Ô đích trống và khung đậm hơn trong lúc thẻ còn trên biểu đồ.
    expect(slotOf(1)?.getAttribute("data-waiting")).toBe("true")
    expect(boxOf(1)?.getAttribute("data-highlighted")).toBe("true")
    expect(boxOf(1)?.style.borderWidth).toBe("2.4px")

    await advance(450)
    expect(popup()?.getAttribute("data-phase")).toBe("hold")
    await advance(900)
    expect(popup()?.getAttribute("data-phase")).toBe("fly")
    expect(slotOf(1)?.getAttribute("data-waiting")).toBe("true")
    await advance(650)
    expect(popup()).toBeNull()
    expect(slotOf(1)?.getAttribute("data-waiting")).toBe("false")
    expect(boxOf(1)?.getAttribute("data-highlighted")).toBe("false")
    expect(boxOf(1)?.style.borderWidth).toBe("1.4px")
  })

  it("bấm Phiên tiếp khi thẻ chưa bay xong: thẻ vào khay ngay, khung hết đậm, rồi mới mở phiên mới", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ cardAtStep: { 1: { id: "doji", n: 1 } } })
    renderGame()
    await findGame()
    await pressNext()
    await waitFor(() => expect(popup()).not.toBeNull())
    expect(slotOf(1)?.getAttribute("data-waiting")).toBe("true")
    await pressNext()
    await waitFor(() => expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 2"))
    expect(popup()).toBeNull()
    expect(slotOf(1)?.getAttribute("data-waiting")).toBe("false")
    expect(boxOf(1)?.getAttribute("data-highlighted")).toBe("false")
    expect(slots()).toHaveLength(1)
  })

  it("giảm chuyển động: không có thẻ bật lên, thẻ vào khay ngay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubMatchMedia(true)
    setup({ cardAtStep: { 1: { id: "nhan_chim_tang", n: 2 } } })
    renderGame()
    await findGame()
    await pressNext()
    await waitFor(() => expect(slots()).toHaveLength(1))
    expect(popup()).toBeNull()
    expect(slotOf(1)?.getAttribute("data-waiting")).toBe("false")
    expect(slotOf(1)?.getAttribute("aria-label")).toBe("Bullish Engulfing, Phiên 1")
    await advance(2500)
    expect(popup()).toBeNull()
    expect(boxOf(1)?.getAttribute("data-highlighted")).toBe("false")
  })

  it("bấm một thẻ trong khay: khung của mẫu đó đậm lên 1,6 giây rồi tự trở lại; các khung khác không đổi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({
      match: {
        step: 4,
        cards: [
          { card_id: "doji", card_n: 1, play_idx: 1 },
          { card_id: "sao_mai", card_n: 3, play_idx: 4 },
        ],
      },
    })
    renderGame()
    await findGame()
    expect(boxes().every((box) => box.getAttribute("data-highlighted") === "false")).toBe(true)
    fireEvent.click(slotOf(4)!)
    expect(boxOf(4)?.getAttribute("data-highlighted")).toBe("true")
    expect(boxOf(1)?.getAttribute("data-highlighted")).toBe("false")
    await advance(1500)
    expect(boxOf(4)?.getAttribute("data-highlighted")).toBe("true")
    await advance(200)
    expect(boxOf(4)?.getAttribute("data-highlighted")).toBe("false")
  })

  it("hết ván khay giữ nguyên để xem lại", async () => {
    setup({ match: { status: "ended", step: 2, cards: [{ card_id: "doji", card_n: 1, play_idx: 2 }] } })
    renderGame()
    await screen.findByTestId("flashback-result")
    expect(slots().map((slot) => slot.getAttribute("aria-label"))).toEqual(["Doji, Phiên 2"])
    expect(screen.getByTestId("flashback-cards-count").textContent).toBe("1")
  })
})

describe("Flashback: khung mẫu nến trên biểu đồ IQLine", () => {
  it("?iqline=1: khung vẽ ở lớp phủ của biểu đồ, màu theo bậc, không nhận con trỏ, và cập nhật khi mở thêm phiên", async () => {
    window.history.replaceState(null, "", "/?iqline=1")
    const env = installCanvasEnv()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({
      match: { step: 1, cards: [{ card_id: "nhan_chim_tang", card_n: 2, play_idx: 1 }] },
      cardAtStep: { 2: { id: "doji", n: 1 } },
    })
    renderGame()
    await findGame()
    env.measure(1000, 480)
    const overlay = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-iqline-overlay]")
      expect(found).not.toBeNull()
      return found!
    })
    expect(overlay.className).toContain("pointer-events-none")
    expect(boxes().map((box) => box.getAttribute("data-tier"))).toEqual(["2"])
    expect(overlay.contains(boxOf(1))).toBe(true)
    expect(labels().map((label) => label.textContent)).toEqual(["Bullish Engulfing"])
    // Toạ độ khớp biểu đồ: 90 ô (60 xem + 30 chơi) trên bề rộng 1000 - 62 của trục giá; mẫu 2 nến của phiên 1 là nến 59 và 60.
    const barPx = (1000 - AXIS_RIGHT) / 90
    expect(Number.parseFloat(boxOf(1)!.style.left)).toBeCloseTo(59 * barPx, 0)
    expect(Number.parseFloat(boxOf(1)!.style.width)).toBeCloseTo(2 * barPx, 0)
    expect(Number.parseFloat(boxOf(1)!.style.width)).toBeGreaterThan(0)
    expect(Number.parseFloat(boxOf(1)!.style.height)).toBeGreaterThan(0)

    await pressNext()
    // Thẻ bật lên: khung của mẫu mới xuất hiện ngay cạnh khung cũ và đậm lên (bắt ngay lúc nó hiện, trước khi thẻ bay xong).
    await waitFor(() => {
      expect(popup()).not.toBeNull()
      expect(boxes().map((box) => box.getAttribute("data-tier"))).toEqual(["2", "1"])
      expect(boxOf(2)?.getAttribute("data-highlighted")).toBe("true")
    })
    expect(slots()).toHaveLength(2)
  })
})

describe("Flashback: trạng thái thẻ trong ván (useMatchCards)", () => {
  const raw = (...items: [string, number, number][]) => items.map(([card_id, card_n, play_idx]) => ({ card_id, card_n, play_idx }))

  it("lần dựng đầu không bật thẻ nào lên; danh sách dài thêm ở đúng phiên đang mở thì thẻ mới là thẻ vừa tới", () => {
    const { result, rerender } = renderHook(({ cards, step }) => useMatchCards(cards, step), {
      initialProps: { cards: raw(["doji", 1, 2]), step: 2 },
    })
    expect(result.current.cards.map((card) => card.playIdx)).toEqual([2])
    expect(result.current.arrival).toBeNull()
    rerender({ cards: raw(["doji", 1, 2], ["bua", 1, 3]), step: 3 })
    expect(result.current.cards.map((card) => card.cardId)).toEqual(["doji", "bua"])
    expect(result.current.arrival).toMatchObject({ cardId: "bua", playIdx: 3 })
  })

  it("danh sách dài thêm mà thẻ không thuộc phiên đang mở (tải lại) thì không bật lên; ván mới (dựng lại hook) bắt đầu trống", () => {
    const { result, rerender } = renderHook(({ cards, step }) => useMatchCards(cards, step), {
      initialProps: { cards: raw(), step: 5 },
    })
    rerender({ cards: raw(["doji", 1, 2]), step: 5 })
    expect(result.current.cards).toHaveLength(1)
    expect(result.current.arrival).toBeNull()
    const fresh = renderHook(() => useMatchCards(raw(), 0))
    expect(fresh.result.current.cards).toEqual([])
  })

  it("bấm thẻ trong khay: khung đậm 1,6 giây rồi tự tắt", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useMatchCards(raw(["doji", 1, 1]), 1))
    act(() => result.current.flash(1))
    expect(result.current.focus).toBe(1)
    act(() => vi.advanceTimersByTime(1599))
    expect(result.current.focus).toBe(1)
    act(() => vi.advanceTimersByTime(2))
    expect(result.current.focus).toBeNull()
  })
})
