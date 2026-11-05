/**
 * Vòng đời của `<IQLine mode="market" />` (docs/iqline-design.md §6): đổi mã và khung, huỷ yêu cầu đang chạy, kết quả về muộn,
 * hình vẽ theo mã, lưu sau khi nạp xong, callback và giao diện đổi tại chỗ, nạp thêm lịch sử, nến realtime, lỗi và thử lại.
 * Datafeed và store là đồ giả có điều khiển; canvas là canvas giả.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TOOL_SPECS } from "../drawings"
import { makeTimedBars } from "../scene/test-support"
import type { ChartDocument, ChartIndicatorInput, Drawing, IQLineDatafeed, IQLineHandle, IQLineStore, TimedBar } from "../types"
import { IQLine, type IQLineProps } from "./IQLine"
import { DEFAULT_INDICATORS, INITIAL_BARS, OLDER_BARS } from "./market-defaults"
import { installCanvasEnv, installRadixPolyfills, type CanvasEnv } from "./test-env"

installRadixPolyfills()

let env: CanvasEnv
beforeEach(() => {
  env = installCanvasEnv()
})
afterEach(() => vi.unstubAllGlobals())

type GetBars = Parameters<IQLineDatafeed["getBars"]>[0]
type Pending = { query: GetBars; resolve: (value: { bars: TimedBar[]; noMoreHistory: boolean }) => void; reject: (error: unknown) => void }

/** Datafeed giả: mỗi lần `getBars` là một lời hứa chờ test quyết định; huỷ thì từ chối bằng AbortError như datafeed thật. */
function fakeFeed(options: { rejectOnAbort?: boolean } = {}) {
  const pending: Pending[] = []
  const subscribers: { symbol: string; interval: string; onBar: (bar: TimedBar) => void; unsubscribe: ReturnType<typeof vi.fn> }[] = []
  const feed: IQLineDatafeed = {
    getBars: (query) =>
      new Promise((resolve, reject) => {
        pending.push({ query, resolve, reject })
        if (options.rejectOnAbort !== false) query.signal.addEventListener("abort", () => reject(new DOMException("Đã huỷ", "AbortError")))
      }),
    subscribeBars: vi.fn((symbol, interval, onBar) => {
      const unsubscribe = vi.fn()
      subscribers.push({ symbol, interval, onBar, unsubscribe })
      return unsubscribe
    }),
    getMarks: vi.fn(async () => []),
  }
  return { feed, pending, subscribers }
}

function fakeStore(docs: Record<string, ChartDocument | null> = {}) {
  const store: IQLineStore = { load: vi.fn(async (symbol: string) => docs[symbol] ?? null), save: vi.fn() }
  return store
}

/** Nến của một mã: giá đóng cửa của nến cuối là `last`, để phân biệt dữ liệu của hai mã. */
function barsOf(count: number, last: number): TimedBar[] {
  const base = makeTimedBars(count, "D")
  return base.map((bar, index) => (index === count - 1 ? { ...bar, open: last, high: last + 1, low: last - 1, close: last } : bar))
}

const trend = (id: string): Drawing => ({
  id,
  tool: "trend",
  anchors: [
    { time: makeTimedBars(250, "D")[200].time, price: 100 },
    { time: makeTimedBars(250, "D")[230].time, price: 110 },
  ],
  style: { ...TOOL_SPECS.trend.defaultStyle },
})
const docOf = (drawings: Drawing[], extra: Partial<ChartDocument["iqline"]> = {}): ChartDocument => ({ iqline: { version: 1, drawings, indicators: [...DEFAULT_INDICATORS], chartType: "candles", ...extra } })

function setup(overrides: Partial<IQLineProps> = {}, feedOptions = {}) {
  const { feed, pending, subscribers } = fakeFeed(feedOptions)
  const store = fakeStore()
  const onIndicatorsChange = vi.fn()
  const props: IQLineProps = { mode: "market", theme: "dark", symbol: "FPT", interval: "D", datafeed: feed, store, indicators: DEFAULT_INDICATORS, onIndicatorsChange, ...overrides }
  const view = render(<IQLine {...props} />)
  env.measure(900, 600)
  const update = (next: Partial<IQLineProps>) => view.rerender(<IQLine {...props} {...next} />)
  return { ...view, update, feed, pending, subscribers, store, onIndicatorsChange, props }
}

const resolveWith = (item: Pending, bars: TimedBar[], noMoreHistory = true) => act(async () => item.resolve({ bars, noMoreHistory }))
const legend = () => screen.getByRole("group", { name: "Chú giải biểu đồ" })
const topCanvas = (container: HTMLElement) => container.querySelector('canvas[data-iqline-layer="top"]')

describe("IQLine: nạp dữ liệu", () => {
  it("hiện trạng thái đang tải, xin đúng số nến rồi vẽ chú giải khi có dữ liệu", async () => {
    const { pending } = setup()
    expect(screen.getByRole("status").textContent).toContain("Đang tải")
    expect(pending).toHaveLength(1)
    expect(pending[0].query).toMatchObject({ symbol: "FPT", interval: "D", countBack: INITIAL_BARS })
    expect(pending[0].query.to).toBeGreaterThan(Date.now() / 1000)
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(screen.queryByRole("status")).toBeNull()
    expect(legend().textContent).toContain("66,50")
  })

  it("không có nến nào thì báo chưa có dữ liệu", async () => {
    const { pending } = setup()
    await resolveWith(pending[0], [])
    expect(screen.getByRole("status").textContent).toContain("Chưa có dữ liệu")
  })

  it("lỗi mạng hiện thông báo và nút thử lại xin lại dữ liệu", async () => {
    const { pending } = setup()
    await act(async () => pending[0].reject(new Error("mạng")))
    expect(screen.getByRole("status").textContent).toContain("Không tải được")
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }))
    expect(pending).toHaveLength(2)
    expect(screen.getByRole("status").textContent).toContain("Đang tải")
    await resolveWith(pending[1], barsOf(250, 70))
    expect(legend().textContent).toContain("70,00")
  })

  it("yêu cầu bị huỷ (AbortError) không bị coi là lỗi", async () => {
    const { pending } = setup()
    await act(async () => pending[0].reject(new DOMException("x", "AbortError")))
    expect(screen.getByRole("status").textContent).toContain("Đang tải")
  })
})

describe("IQLine: đổi mã và khung", () => {
  it("đổi mã huỷ yêu cầu đang chạy và xin nến của mã mới", () => {
    const { pending, update } = setup()
    update({ symbol: "VN30" })
    expect(pending[0].query.signal.aborted).toBe(true)
    expect(pending[1].query).toMatchObject({ symbol: "VN30", interval: "D" })
  })

  it("đổi khung huỷ yêu cầu đang chạy", () => {
    const { pending, update } = setup()
    update({ interval: "5" })
    expect(pending[0].query.signal.aborted).toBe(true)
    expect(pending[1].query).toMatchObject({ symbol: "FPT", interval: "5" })
  })

  it("kết quả của mã cũ về muộn không ghi đè dữ liệu của mã mới", async () => {
    const { pending, update } = setup({}, { rejectOnAbort: false })
    update({ symbol: "VN30" })
    await resolveWith(pending[1], barsOf(250, 1250))
    expect(legend().textContent).toContain("VN30")
    expect(legend().textContent).toContain("1.250,00")
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(legend().textContent).toContain("1.250,00")
    expect(legend().textContent).not.toContain("66,50")
  })

  it("kết quả cũ về muộn cũng không làm trạng thái đang tải của khung mới biến mất", async () => {
    const { pending, update } = setup({}, { rejectOnAbort: false })
    update({ interval: "5" })
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(screen.getByRole("status").textContent).toContain("Đang tải")
  })

  it("không dựng lại component: canvas giữ nguyên qua đổi mã và đổi khung", async () => {
    const { container, pending, update } = setup()
    const canvas = topCanvas(container)
    await resolveWith(pending[0], barsOf(250, 66.5))
    update({ symbol: "VN30" })
    update({ interval: "W" })
    expect(topCanvas(container)).toBe(canvas)
  })
})

describe("IQLine: hình vẽ theo mã", () => {
  const openList = async () => {
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /Danh sách hình vẽ/ }))
    return user
  }

  it("nạp hình của mã từ store; đổi mã thì không mang hình mã cũ sang", async () => {
    const store = fakeStore({ FPT: docOf([trend("d1"), trend("d2")]), VN30: null })
    const { pending, update } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    await waitFor(() => expect(store.load).toHaveBeenCalledWith("FPT"))
    const user = await openList()
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Hình vẽ trên biểu đồ" })).getAllByRole("listitem")).toHaveLength(2))
    await user.keyboard("{Escape}")
    update({ symbol: "VN30" })
    await waitFor(() => expect(store.load).toHaveBeenCalledWith("VN30"))
    await resolveWith(pending[1], barsOf(250, 1250))
    await openList()
    expect(screen.getByText(/Chưa có hình nào/)).toBeTruthy()
  })

  it("chỉ báo và kiểu hiển thị của mã được nạp từ store, mã chưa có dữ liệu về mặc định", async () => {
    const saved: ChartIndicatorInput[] = [{ key: "rsi-1", id: "rsi", params: { period: 9 } }]
    const store = fakeStore({ FPT: docOf([], { indicators: saved, chartType: "line" }) })
    const { pending, onIndicatorsChange, update } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    await waitFor(() => expect(onIndicatorsChange).toHaveBeenLastCalledWith(saved))
    expect(screen.getByRole("button", { name: "Kiểu hiển thị: Đường" })).toBeTruthy()
    update({ symbol: "VN30" })
    await waitFor(() => expect(onIndicatorsChange).toHaveBeenLastCalledWith(DEFAULT_INDICATORS))
    expect(screen.getByRole("button", { name: "Kiểu hiển thị: Nến" })).toBeTruthy()
  })

  it("chỉ lưu sau khi đã nạp xong hình của mã hiện tại", async () => {
    let release: (doc: ChartDocument | null) => void = () => undefined
    const store: IQLineStore = { load: vi.fn(() => new Promise<ChartDocument | null>((resolve) => (release = resolve))), save: vi.fn() }
    const { pending, props } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Kiểu hiển thị: Nến" }))
    await user.click(screen.getByRole("menuitemradio", { name: "Vùng" }))
    expect(store.save).not.toHaveBeenCalled()
    await act(async () => release(docOf([])))
    await user.click(screen.getByRole("button", { name: "Kiểu hiển thị: Nến" }))
    await user.click(screen.getByRole("menuitemradio", { name: "Vùng" }))
    expect(store.save).toHaveBeenCalledWith("FPT", { iqline: { version: 1, drawings: [], indicators: [...props.indicators], chartType: "area" } })
  })

  it("ẩn chỉ báo từ chú giải: báo trang và lưu đúng mã, không lẫn hình của mã khác", async () => {
    const store = fakeStore({ FPT: docOf([]), VN30: null })
    const { pending, update, onIndicatorsChange } = setup({ store, indicators: [{ key: "volume", id: "volume", params: {} }] })
    await resolveWith(pending[0], barsOf(250, 66.5))
    await waitFor(() => expect(store.load).toHaveBeenCalledWith("FPT"))
    update({ symbol: "VN30", indicators: [{ key: "volume", id: "volume", params: {} }] })
    await resolveWith(pending[1], barsOf(250, 1250))
    await waitFor(() => expect(store.load).toHaveBeenCalledWith("VN30"))
    onIndicatorsChange.mockClear()
    await userEvent.setup().click(await screen.findByRole("button", { name: "Ẩn Khối lượng (20)" }))
    expect(onIndicatorsChange).toHaveBeenCalledWith([{ key: "volume", id: "volume", params: {}, hidden: true }])
    expect(store.save).toHaveBeenLastCalledWith("VN30", expect.objectContaining({ iqline: expect.objectContaining({ drawings: [], indicators: [{ key: "volume", id: "volume", params: {}, hidden: true }] }) }))
  })

  it("không có store thì không nạp, không lưu và vẫn hoạt động", async () => {
    const { pending } = setup({ store: undefined })
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(legend().textContent).toContain("66,50")
  })

  it("store ném lỗi khi nạp thì biểu đồ vẫn dùng được với hình trống", async () => {
    const store: IQLineStore = { load: vi.fn(() => Promise.reject(new Error("hỏng"))), save: vi.fn() }
    const { pending } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    await userEvent.setup().click(await screen.findByRole("button", { name: /Danh sách hình vẽ/ }))
    expect(screen.getByText(/Chưa có hình nào/)).toBeTruthy()
  })
})

describe("IQLine: callback và giao diện đổi tại chỗ", () => {
  it("đổi hàm callback không dựng lại canvas, không nạp lại dữ liệu hay hình vẽ", async () => {
    const store = fakeStore({ FPT: docOf([trend("d1")]) })
    const { container, pending, feed, update } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    const canvas = topCanvas(container)
    update({ store, onMarkClick: vi.fn(), onIndicatorsChange: vi.fn(), formatPrice: undefined })
    update({ store, onMarkClick: vi.fn(), onIndicatorsChange: vi.fn() })
    expect(topCanvas(container)).toBe(canvas)
    expect(pending).toHaveLength(1)
    expect(store.load).toHaveBeenCalledTimes(1)
    expect(feed.subscribeBars).toHaveBeenCalledTimes(1)
  })

  it("đổi giao diện sáng tối giữ hình vẽ, không nạp lại gì", async () => {
    const store = fakeStore({ FPT: docOf([trend("d1")]) })
    const { container, pending, update } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    await waitFor(() => expect(store.load).toHaveBeenCalled())
    const canvas = topCanvas(container)
    update({ store, theme: "light" })
    env.flush()
    expect(topCanvas(container)).toBe(canvas)
    expect(pending).toHaveLength(1)
    expect(store.load).toHaveBeenCalledTimes(1)
    await userEvent.setup().click(await screen.findByRole("button", { name: /Danh sách hình vẽ/ }))
    expect(within(screen.getByRole("list", { name: "Hình vẽ trên biểu đồ" })).getAllByRole("listitem")).toHaveLength(1)
  })
})

describe("IQLine: nến realtime và lịch sử", () => {
  it("đăng ký nến mới sau khi có dữ liệu; nến mới thay nến cuối, hủy đăng ký khi đổi mã", async () => {
    const { pending, subscribers, update } = setup()
    expect(subscribers).toHaveLength(0)
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0]).toMatchObject({ symbol: "FPT", interval: "D" })
    const last = barsOf(250, 66.5).at(-1)!
    act(() => subscribers[0].onBar({ ...last, close: 68.25, high: 69 }))
    expect(legend().textContent).toContain("68,25")
    act(() => subscribers[0].onBar({ ...last, time: last.time + 86_400, open: 68.25, high: 70, low: 68, close: 69.5 }))
    expect(legend().textContent).toContain("69,50")
    update({ symbol: "VN30" })
    expect(subscribers[0].unsubscribe).toHaveBeenCalled()
  })

  it("nến realtime của mã cũ về muộn không lẫn vào mã mới", async () => {
    const { pending, subscribers, update } = setup()
    await resolveWith(pending[0], barsOf(250, 66.5))
    update({ symbol: "VN30" })
    await resolveWith(pending[1], barsOf(250, 1250))
    act(() => subscribers[0].onBar({ ...barsOf(250, 66.5).at(-1)!, close: 99 }))
    expect(legend().textContent).toContain("1.250,00")
    expect(legend().textContent).not.toContain("99,00")
  })

  it("kéo gần mép trái thì nạp thêm lịch sử cũ hơn nến đầu; hết lịch sử thì dừng", async () => {
    const all = barsOf(330, 66.5)
    const recent = all.slice(270)
    const { pending } = setup()
    await resolveWith(pending[0], recent, false)
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].query).toMatchObject({ symbol: "FPT", interval: "D", countBack: OLDER_BARS, to: recent[0].time })
    await resolveWith(pending[1], all.slice(240, 270), true)
    expect(legend().textContent).toContain("66,50")
    expect(pending).toHaveLength(2)
  })

  it("lịch sử về muộn sau khi đổi mã bị bỏ", async () => {
    const { pending, update } = setup({}, { rejectOnAbort: false })
    await resolveWith(pending[0], barsOf(60, 66.5), false)
    await waitFor(() => expect(pending).toHaveLength(2))
    update({ symbol: "VN30" })
    await resolveWith(pending[2], barsOf(250, 1250))
    await resolveWith(pending[1], barsOf(30, 5), true)
    expect(legend().textContent).toContain("1.250,00")
  })

  it("xin đánh dấu tin theo khoảng của dữ liệu", async () => {
    const { pending, feed } = setup()
    const bars = barsOf(250, 66.5)
    await resolveWith(pending[0], bars)
    await waitFor(() => expect(feed.getMarks).toHaveBeenCalled())
    expect(vi.mocked(feed.getMarks!).mock.calls[0][0]).toMatchObject({ symbol: "FPT", from: bars[0].time })
  })
})

describe("IQLine: tay cầm và thanh công cụ", () => {
  it("tay cầm có hoàn tác, làm lại, về khung mặc định và chụp ảnh", async () => {
    const ref = createRef<IQLineHandle>()
    const { pending } = setup({ ref })
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(ref.current).toMatchObject({ fitContent: expect.any(Function), screenshot: expect.any(Function), undo: expect.any(Function), redo: expect.any(Function) })
    act(() => {
      ref.current!.fitContent()
      ref.current!.undo()
      ref.current!.redo()
    })
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })))
    await expect(ref.current!.screenshot()).resolves.toBeInstanceOf(Blob)
  })

  it("không có onIndicatorsChange thì chỉ báo chỉ để xem: không nút thêm, không nút sửa", async () => {
    const { pending } = setup({ onIndicatorsChange: undefined })
    await resolveWith(pending[0], barsOf(250, 66.5))
    expect(screen.queryByRole("button", { name: "Chỉ báo" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Cài đặt/ })).toBeNull()
  })

  it("thêm chỉ báo từ hộp thoại: trang nhận danh sách mới và store nhận bản lưu", async () => {
    const store = fakeStore({ FPT: docOf([]) })
    const { pending, onIndicatorsChange } = setup({ store })
    await resolveWith(pending[0], barsOf(250, 66.5))
    await waitFor(() => expect(store.load).toHaveBeenCalled())
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Chỉ báo" }))
    await user.click(await screen.findByRole("button", { name: "RSI" }))
    const next = onIndicatorsChange.mock.calls.at(-1)![0] as ChartIndicatorInput[]
    expect(next.map((item) => item.id)).toEqual(["volume", "rsi"])
    expect(store.save).toHaveBeenLastCalledWith("FPT", expect.objectContaining({ iqline: expect.objectContaining({ indicators: next }) }))
  })

  it("ô khung thời gian chỉ hiện khi trang truyền onIntervalChange", async () => {
    const onIntervalChange = vi.fn()
    const { pending } = setup({ onIntervalChange })
    await resolveWith(pending[0], barsOf(250, 66.5))
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Khung thời gian" }))
    await user.click(screen.getByRole("option", { name: "1 tuần" }))
    expect(onIntervalChange).toHaveBeenCalledWith("W")
  })
})
