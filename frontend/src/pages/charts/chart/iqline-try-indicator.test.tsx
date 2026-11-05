/**
 * Chỉ báo mở từ URL (`?chi-bao=`) cho `/bieu-do` (docs/iqline-design.md §13): đọc tham số, kiểm tra id, trộn vào danh sách của mã
 * mà không trùng, và không ghi đè layout đã lưu cho tới khi người dùng tự đổi. Phần cuối chạy `IQLineMarketChart` thật với
 * store, datafeed và báo giá giả.
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_INDICATORS, MAX_INDICATORS } from "@/lib/iqline/react/market-defaults"
import { installCanvasEnv, installRadixPolyfills, type CanvasEnv } from "@/lib/iqline/react/test-env"
import { makeTimedBars } from "@/lib/iqline/scene/test-support"
import type { ChartDocument, ChartIndicatorInput, IQLineDatafeed, IQLineStore } from "@/lib/iqline/types"

import IQLineMarketChart from "./iqline-chart"
import { isTryableIndicator, mergeTryIndicators, withTryIndicators } from "./iqline-try-indicator"
import { readTryIndicatorParam, tryIndicatorHref } from "./try-indicator-param"

const mocks = vi.hoisted(() => ({ store: null as unknown as IQLineStore }))

vi.mock("./iqline-store", () => ({ getIQLineStore: () => mocks.store }))
vi.mock("@/pages/demo-trading/market/use-quote", () => ({ useQuote: () => ({ data: null }) }))
vi.mock("./iqline-datafeed", async (importOriginal) => {
  const feed: IQLineDatafeed = {
    getBars: async () => ({ bars: makeTimedBars(250, "D"), noMoreHistory: true }),
    subscribeBars: () => () => undefined,
    getMarks: async () => [],
  }
  return { ...(await importOriginal<typeof import("./iqline-datafeed")>()), createIQLineDatafeed: () => feed }
})

installRadixPolyfills()

const entry = (id: string, extra: Partial<ChartIndicatorInput> = {}): ChartIndicatorInput => ({ key: `${id}-saved`, id, params: {}, ...extra })
const ids = (list: readonly ChartIndicatorInput[]) => list.map((item) => item.id)
const docOf = (indicators: ChartIndicatorInput[], extra: Partial<ChartDocument> = {}): ChartDocument => ({ iqline: { version: 1, drawings: [], indicators, chartType: "candles" }, ...extra })

describe("readTryIndicatorParam và tryIndicatorHref", () => {
  const read = (query: string) => readTryIndicatorParam(new URLSearchParams(query))

  it("đọc chi-bao, bỏ giá trị sai dạng, giữ một bản của giá trị trùng và giữ thứ tự", () => {
    expect(read("chi-bao=rsi")).toEqual(["rsi"])
    expect(read("symbol=FPT&chi-bao=macd&chi-bao=rsi&chi-bao=macd")).toEqual(["macd", "rsi"])
    expect(read("chi-bao=%20williams_r%20")).toEqual(["williams_r"])
    expect(read("")).toEqual([])
    expect(read("chi-bao=")).toEqual([])
    for (const bad of ["RSI", "1rsi", "rsi;drop", "../x", "rsi%20ma", "a".repeat(40), "__proto__"]) expect(read(`chi-bao=${bad}`), bad).toEqual([])
  })

  it("chỉ đọc một số giá trị đầu", () => {
    const many = Array.from({ length: 40 }, (_, index) => `chi-bao=x${index}`).join("&")
    expect(read(many)).toHaveLength(12)
  })

  it("liên kết từ Học viện đọc lại được", () => {
    expect(tryIndicatorHref("rsi")).toBe("/bieu-do?chi-bao=rsi")
    expect(read(tryIndicatorHref("williams_r").split("?")[1])).toEqual(["williams_r"])
  })
})

describe("isTryableIndicator", () => {
  it("chấp nhận id trong sổ đăng ký, kể cả chỉ báo bổ sung, và bỏ id lạ", () => {
    for (const id of ["rsi", "macd", "volume", "atr", "bb_width"]) expect(isTryableIndicator(id), id).toBe(true)
    for (const id of ["khong_co", "", "toString", "constructor"]) expect(isTryableIndicator(id), id).toBe(false)
  })
})

describe("mergeTryIndicators", () => {
  it("thêm vào cuối danh sách đang có, với khoá mới và tham số mặc định", () => {
    const current = [entry("volume"), entry("macd")]
    const next = mergeTryIndicators(current, ["rsi"])
    expect(ids(next)).toEqual(["volume", "macd", "rsi"])
    expect(next[2]).toMatchObject({ id: "rsi", params: {} })
    expect(new Set(next.map((item) => item.key)).size).toBe(3)
    expect(ids(current)).toEqual(["volume", "macd"])
  })

  it("không thêm trùng: đã có chỉ báo đang hiện cùng id thì giữ nguyên, và hai id trùng nhau chỉ thêm một", () => {
    const current = [entry("volume"), entry("rsi", { params: { period: 9 } })]
    expect(mergeTryIndicators(current, ["rsi"])).toEqual(current)
    expect(ids(mergeTryIndicators([entry("volume")], ["rsi", "rsi"]))).toEqual(["volume", "rsi"])
    expect(ids(mergeTryIndicators(DEFAULT_INDICATORS, ["volume"]))).toEqual(["volume"])
  })

  it("chỉ báo cùng id đang ẩn thì được hiện lại, các chỉ báo khác không đổi", () => {
    const current = [entry("volume"), entry("rsi", { hidden: true, params: { period: 9 } })]
    const next = mergeTryIndicators(current, ["rsi"])
    expect(next).toEqual([entry("volume"), entry("rsi", { hidden: false, params: { period: 9 } })])
    expect(current[1].hidden).toBe(true)
  })

  it("id lạ bị bỏ qua và danh sách đầy thì không thêm", () => {
    const current = [entry("volume")]
    expect(mergeTryIndicators(current, ["khong_co"])).toEqual(current)
    const full = Array.from({ length: MAX_INDICATORS }, (_, index) => entry("ma", { key: `ma-${index}` }))
    expect(mergeTryIndicators(full, ["rsi"])).toHaveLength(MAX_INDICATORS)
    expect(ids(mergeTryIndicators(full, ["rsi"]))).not.toContain("rsi")
  })
})

describe("withTryIndicators", () => {
  function fakeStore(doc: ChartDocument | null) {
    const store: IQLineStore = { load: vi.fn(async () => doc), save: vi.fn() }
    return store
  }

  it("không có id hợp lệ thì trả lại đúng store", () => {
    const store = fakeStore(null)
    expect(withTryIndicators(store, [])).toBe(store)
    expect(withTryIndicators(store, ["khong_co"])).toBe(store)
  })

  it("trộn vào layout đã lưu, giữ hình vẽ, kiểu nến và khoá charts của TradingView", async () => {
    const saved = docOf([entry("volume"), entry("macd")], { charts: [{ panes: [] }] })
    saved.iqline.chartType = "line"
    const store = fakeStore(saved)
    const loaded = await withTryIndicators(store, ["rsi", "khong_co"]).load("FPT")
    expect(ids(loaded?.iqline.indicators ?? [])).toEqual(["volume", "macd", "rsi"])
    expect(loaded?.iqline.chartType).toBe("line")
    expect(loaded?.charts).toEqual([{ panes: [] }])
    // Bản đã lưu không bị sửa tại chỗ.
    expect(ids(saved.iqline.indicators)).toEqual(["volume", "macd"])
    expect(store.save).not.toHaveBeenCalled()
  })

  it("mã chưa có layout thì dùng chỉ báo mặc định cộng chỉ báo mở ra; load lỗi cũng vậy", async () => {
    const loaded = await withTryIndicators(fakeStore(null), ["rsi"]).load("FPT")
    expect(ids(loaded?.iqline.indicators ?? [])).toEqual(["volume", "rsi"])
    expect(loaded?.iqline.drawings).toEqual([])
    const failing: IQLineStore = { load: vi.fn(async () => Promise.reject(new Error("mạng"))), save: vi.fn() }
    expect(ids((await withTryIndicators(failing, ["rsi"]).load("FPT"))?.iqline.indicators ?? [])).toEqual(["volume", "rsi"])
  })

  it("save đi thẳng xuống store; sau khi người dùng lưu một mã thì lần nạp sau của mã đó không trộn lại", async () => {
    const store = fakeStore(docOf([entry("volume")]))
    const wrapped = withTryIndicators(store, ["rsi"])
    const mine = docOf([entry("volume"), entry("macd")])
    wrapped.save("fpt", mine)
    expect(store.save).toHaveBeenCalledWith("fpt", mine)
    vi.mocked(store.load).mockResolvedValue(mine)
    expect(ids((await wrapped.load("FPT"))?.iqline.indicators ?? [])).toEqual(["volume", "macd"])
    // Mã khác chưa được người dùng đổi nên vẫn nhận chỉ báo mở ra.
    expect(ids((await wrapped.load("VNM"))?.iqline.indicators ?? [])).toEqual(["volume", "macd", "rsi"])
  })
})

describe("IQLineMarketChart với ?chi-bao=", () => {
  let env: CanvasEnv
  let store: IQLineStore
  beforeEach(() => {
    env = installCanvasEnv()
    store = { load: vi.fn(async () => null), save: vi.fn() }
    mocks.store = store
  })
  afterEach(() => vi.unstubAllGlobals())

  function mount(saved: ChartDocument | null, tryIndicators?: readonly string[]) {
    vi.mocked(store.load).mockResolvedValue(saved)
    const view = render(<IQLineMarketChart symbol="FPT" interval="D" theme="dark" tryIndicators={tryIndicators} />)
    env.measure(900, 600)
    return view
  }
  const hideButtons = () => screen.queryAllByRole("button", { name: /^Ẩn / }).map((button) => button.getAttribute("aria-label"))
  const settle = async () => {
    await screen.findByRole("button", { name: /^Ẩn Khối lượng/ })
    await waitFor(() => expect(store.load).toHaveBeenCalled())
  }

  it("thêm chỉ báo của bài vào layout đã lưu của mã và không gọi save", async () => {
    mount(docOf([entry("volume"), entry("macd")]), ["rsi"])
    await screen.findByRole("button", { name: /^Ẩn RSI/ })
    expect(hideButtons()).toHaveLength(3)
    expect(hideButtons().some((label) => label?.includes("MACD"))).toBe(true)
    expect(store.save).not.toHaveBeenCalled()
  })

  it("mã chưa có layout thì có ô khối lượng mặc định cộng chỉ báo mở ra, vẫn không save", async () => {
    mount(null, ["rsi"])
    await screen.findByRole("button", { name: /^Ẩn RSI/ })
    expect(hideButtons()).toHaveLength(2)
    expect(store.save).not.toHaveBeenCalled()
  })

  it("không trùng: layout đã có RSI thì chỉ có một RSI", async () => {
    mount(docOf([entry("volume"), entry("rsi")]), ["rsi", "rsi"])
    await screen.findByRole("button", { name: /^Ẩn RSI/ })
    expect(screen.getAllByRole("button", { name: /^Ẩn RSI/ })).toHaveLength(1)
    expect(hideButtons()).toHaveLength(2)
  })

  it("RSI đang ẩn trong layout đã lưu thì hiện ra", async () => {
    mount(docOf([entry("volume"), entry("rsi", { hidden: true })]), ["rsi"])
    await screen.findByRole("button", { name: /^Ẩn RSI/ })
    expect(screen.queryByRole("button", { name: /^Hiện RSI/ })).toBeNull()
    expect(store.save).not.toHaveBeenCalled()
  })

  it("id lạ thì bỏ qua, biểu đồ vẫn dùng layout đã lưu, không lỗi", async () => {
    mount(docOf([entry("volume"), entry("macd")]), ["khong_co", "__proto__"])
    await settle()
    await screen.findByRole("button", { name: /^Ẩn MACD/ })
    expect(hideButtons()).toHaveLength(2)
    expect(store.save).not.toHaveBeenCalled()
  })

  it("không có tham số thì chạy như cũ", async () => {
    mount(docOf([entry("volume"), entry("macd")]))
    await screen.findByRole("button", { name: /^Ẩn MACD/ })
    expect(hideButtons()).toHaveLength(2)
    expect(store.save).not.toHaveBeenCalled()
  })

  it("người dùng tự đổi (xoá một chỉ báo) thì mới lưu, và bản lưu mang cả chỉ báo mở ra", async () => {
    mount(docOf([entry("volume"), entry("macd")]), ["rsi"])
    await screen.findByRole("button", { name: /^Ẩn RSI/ })
    expect(store.save).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole("button", { name: /^Xoá MACD/ }))
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1))
    const [symbol, document] = vi.mocked(store.save).mock.calls[0]
    expect(symbol).toBe("FPT")
    expect(ids(document.iqline.indicators)).toEqual(["volume", "rsi"])
    // Chỉ báo vừa xoá không hiện lại.
    expect(screen.queryByRole("button", { name: /^Ẩn MACD/ })).toBeNull()
  })
})
