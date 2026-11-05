import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { api, getAccessToken } from "@/lib/api"
import type { ChartDocument, Drawing } from "@/lib/iqline/types"

import { createIQLineStore, getIQLineStore } from "./iqline-store"

vi.mock("@/lib/api", () => ({ api: vi.fn(), getAccessToken: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))

const DAY = 86_400
const T0 = 1_700_000_400
const MESSAGE_DRAWINGS = "1 hình vẽ không chuyển được sang IQLine"
const MESSAGE_BOTH = "hình vẽ hoặc chỉ báo không chuyển được sang IQLine"

let counter = 0
/** Mỗi test một mã riêng: danh sách "đã báo" của store nằm trong module và sống qua các test. */
const nextSymbol = () => `S${++counter}`

const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub }))}.s`
const signIn = (sub: string) => vi.mocked(getAccessToken).mockReturnValue(tokenFor(sub))
const iqlineKey = (owner: string, symbol: string) => `iqx.iqline_drawings_v1_${owner}:${symbol}`
const tradingViewKey = (owner: string, symbol: string) => `iqx.tv_drawings_v2_${owner}:${symbol}`
const stored = (key: string): unknown => JSON.parse(localStorage.getItem(key) ?? "null")

const drawing = (id: string): Drawing => ({
  id,
  tool: "trend",
  anchors: [
    { time: T0, price: 10 },
    { time: T0 + DAY, price: 11 },
  ],
  style: { color: "chart-2", width: 1.7, dash: "solid" },
})
const document = (drawings: Drawing[] = [], extra: Partial<ChartDocument> = {}): ChartDocument => ({
  iqline: { version: 1, drawings, indicators: [], chartType: "candles" },
  ...extra,
})

// Layout TradingView mẫu, cùng hình dạng với `src/lib/iqline/drawings/tradingview.test.ts`.
const main = () => ({ type: "MainSeries", id: "_seriesId", state: { style: 1, interval: "D", symbol: "AAA" } })
const study = (name: string, shortName: string, inputs: Record<string, unknown> = {}) => ({
  type: "Study",
  id: `st-${shortName}`,
  state: { inputs },
  metaInfo: { id: `${name}@tv-basicstudies-1`, description: name, shortDescription: shortName },
})
const line = (type: string, id: string) => ({
  type,
  id,
  state: { symbol: "AAA", interval: "D" },
  points: [
    { time_t: T0, price: 25.5 },
    { time_t: T0 + 10 * DAY, price: 27.25 },
  ],
  ownerSourceId: "_seriesId",
})
const layout = (sources: unknown[]) => ({ layout: "s", charts: [{ version: 2, panes: [{ sources }] }] })
const trendAndIchimoku = () => layout([main(), study("Moving Average", "MA", { length: 20 }), line("LineToolTrendLine", "t1"), study("Ichimoku Cloud", "Ichimoku", { in_0: 9 })])

/** Server trả `state` cho GET và nhận mọi PUT. */
function mockServer(state: unknown) {
  vi.mocked(api).mockImplementation(async (_path, init) => (init?.method === "PUT" ? { symbol: "X", state: null, updated_at: null } : { symbol: "X", state, updated_at: null }))
}
const puts = () => vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "PUT")
const putBody = (index = 0): { state: ChartDocument } => JSON.parse(String(puts()[index]?.[1]?.body)) as { state: ChartDocument }

beforeEach(() => {
  // Không trả về mock: vitest coi giá trị hàm trả về của hook là hàm dọn dẹp.
  vi.mocked(api).mockReset()
  vi.mocked(getAccessToken).mockReset()
  vi.mocked(toast.info).mockReset()
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe("load: thứ tự nguồn", () => {
  it("server, rồi bản đệm iqline, rồi bản đệm TradingView cũ", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const store = createIQLineStore({ notify: vi.fn() })
    localStorage.setItem(iqlineKey("user:u1", sym), JSON.stringify(document([drawing("ls")])))
    localStorage.setItem(tradingViewKey("user:u1", sym), JSON.stringify(layout([main(), line("LineToolTrendLine", "t1")])))

    mockServer(document([drawing("server")]))
    expect((await store.load(sym))?.iqline.drawings.map((d) => d.id)).toEqual(["server"])
    expect(vi.mocked(api).mock.calls[0]?.[0]).toBe(`/chart-drawings/${sym}`)

    mockServer(null)
    expect((await store.load(sym))?.iqline.drawings.map((d) => d.id)).toEqual(["ls"])

    localStorage.removeItem(iqlineKey("user:u1", sym))
    expect((await store.load(sym))?.iqline.drawings.map((d) => d.id)).toEqual(["tv-t1"])
  })

  it("lỗi mạng hoặc state không đọc được thì rơi về bản đệm", async () => {
    signIn("u1")
    const store = createIQLineStore({ notify: vi.fn() })
    const first = nextSymbol()
    localStorage.setItem(iqlineKey("user:u1", first), JSON.stringify(document([drawing("ls")])))

    vi.mocked(api).mockRejectedValue(new Error("mất mạng"))
    expect((await store.load(first))?.iqline.drawings.map((d) => d.id)).toEqual(["ls"])

    mockServer({ rác: true })
    expect((await store.load(first))?.iqline.drawings.map((d) => d.id)).toEqual(["ls"])

    // Mock chưa cấu hình trả undefined, không được làm load ném lỗi.
    vi.mocked(api).mockReset()
    expect((await store.load(first))?.iqline.drawings.map((d) => d.id)).toEqual(["ls"])
  })

  it("khách không gọi API, đọc bản đệm iqline trước rồi tới TradingView", async () => {
    const sym = nextSymbol()
    const store = createIQLineStore({ notify: vi.fn() })
    localStorage.setItem(tradingViewKey("guest", sym), JSON.stringify(layout([main(), line("LineToolTrendLine", "t9")])))
    expect((await store.load(sym))?.iqline.drawings.map((d) => d.id)).toEqual(["tv-t9"])

    localStorage.setItem(iqlineKey("guest", sym), JSON.stringify(document([drawing("g1")])))
    expect((await store.load(sym))?.iqline.drawings.map((d) => d.id)).toEqual(["g1"])
    expect(api).not.toHaveBeenCalled()
  })

  it("mã được chuẩn hoá chữ hoa khi dựng khoá và đường dẫn", async () => {
    signIn("u1")
    mockServer(null)
    const store = createIQLineStore()
    localStorage.setItem(iqlineKey("user:u1", "VNM"), JSON.stringify(document([drawing("up")])))
    expect((await store.load("vnm"))?.iqline.drawings.map((d) => d.id)).toEqual(["up"])
    expect(vi.mocked(api).mock.calls[0]?.[0]).toBe("/chart-drawings/VNM")
  })

  it("không có nguồn nào thì trả null; không xác định được chủ sở hữu thì trả null và không gọi API", async () => {
    const store = createIQLineStore()
    expect(await store.load(nextSymbol())).toBeNull()

    vi.mocked(getAccessToken).mockReturnValue("không-phải-jwt")
    expect(await store.load(nextSymbol())).toBeNull()
    store.save("VNM", document([drawing("a")]))
    expect(api).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})

describe("load: chuyển layout TradingView", () => {
  it("Trend Line và Ichimoku: tài liệu đúng, giữ charts, báo đúng một lần dù tải hai lần", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const layoutState = trendAndIchimoku()
    mockServer(layoutState)
    const notify = vi.fn()
    const store = createIQLineStore({ notify })

    const first = await store.load(sym)
    expect(first?.iqline.drawings.map((d) => [d.id, d.tool])).toEqual([["tv-t1", "trend"]])
    expect(first?.iqline.drawings[0].anchors).toEqual([
      { time: T0, price: 25.5 },
      { time: T0 + 10 * DAY, price: 27.25 },
    ])
    expect(first?.iqline.indicators.map((i) => i.id)).toEqual(["ma"])
    expect(first?.iqline.indicators[0].params).toEqual({ period: 20 })
    expect(first?.charts).toBe(layoutState.charts)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(`1 ${MESSAGE_BOTH}`)

    await store.load(sym)
    await store.load(sym)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("vẫn chỉ báo một lần khi không ghi được bản đệm nên lần sau phải chuyển lại", async () => {
    const sym = nextSymbol()
    localStorage.setItem(tradingViewKey("guest", sym), JSON.stringify(trendAndIchimoku()))
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    const notify = vi.fn()
    const store = createIQLineStore({ notify })
    expect((await store.load(sym))?.iqline.drawings).toHaveLength(1)
    expect((await store.load(sym))?.iqline.drawings).toHaveLength(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("báo riêng cho từng (tài khoản, mã)", async () => {
    const sym = nextSymbol()
    const notify = vi.fn()
    const store = createIQLineStore({ notify })
    localStorage.setItem(tradingViewKey("guest", sym), JSON.stringify(trendAndIchimoku()))
    localStorage.setItem(tradingViewKey("user:u7", sym), JSON.stringify(trendAndIchimoku()))
    localStorage.setItem(tradingViewKey("guest", `${sym}B`), JSON.stringify(trendAndIchimoku()))

    await store.load(sym)
    signIn("u7")
    mockServer(null)
    await store.load(sym)
    vi.mocked(getAccessToken).mockReset()
    await store.load(`${sym}B`)
    expect(notify).toHaveBeenCalledTimes(3)
  })

  it("câu báo: chỉ hình vẽ, và hình vẽ cùng chỉ báo với N là tổng", async () => {
    const onlyDrawing = vi.fn()
    const drawingStore = createIQLineStore({ notify: onlyDrawing })
    const a = nextSymbol()
    localStorage.setItem(tradingViewKey("guest", a), JSON.stringify(layout([main(), line("LineToolTrendLine", "t1"), line("LineToolVbPFixed", "v1")])))
    await drawingStore.load(a)
    expect(onlyDrawing).toHaveBeenCalledWith(MESSAGE_DRAWINGS)

    const both = vi.fn()
    const bothStore = createIQLineStore({ notify: both })
    const b = nextSymbol()
    localStorage.setItem(
      tradingViewKey("guest", b),
      JSON.stringify(layout([main(), line("LineToolVbPFixed", "v1"), line("LineToolFibRetracement", "f1"), study("Ichimoku Cloud", "Ichimoku")])),
    )
    await bothStore.load(b)
    expect(both).toHaveBeenCalledWith(`3 ${MESSAGE_BOTH}`)

    // Không có gì bị bỏ thì không báo.
    const none = vi.fn()
    const quiet = createIQLineStore({ notify: none })
    const c = nextSymbol()
    localStorage.setItem(tradingViewKey("guest", c), JSON.stringify(layout([main(), line("LineToolTrendLine", "t1")])))
    await quiet.load(c)
    expect(none).not.toHaveBeenCalled()
  })

  it("mặc định báo bằng toast.info của sonner", async () => {
    const sym = nextSymbol()
    localStorage.setItem(tradingViewKey("guest", sym), JSON.stringify(layout([main(), line("LineToolVbPFixed", "v1")])))
    await createIQLineStore().load(sym)
    expect(toast.info).toHaveBeenCalledWith(MESSAGE_DRAWINGS)
  })

  it("notify ném lỗi cũng không làm hỏng việc nạp", async () => {
    const sym = nextSymbol()
    localStorage.setItem(tradingViewKey("guest", sym), JSON.stringify(trendAndIchimoku()))
    const store = createIQLineStore({
      notify: () => {
        throw new Error("toast hỏng")
      },
    })
    expect((await store.load(sym))?.iqline.drawings).toHaveLength(1)
  })

  it("lưu ngay bản đã chuyển: bản đệm có iqline và charts, người đăng nhập đặt lịch PUT, lần nạp sau không chuyển lại", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const layoutState = trendAndIchimoku()
    mockServer(layoutState)
    const notify = vi.fn()
    const store = createIQLineStore({ notify })
    await store.load(sym)

    const cached = stored(iqlineKey("user:u1", sym)) as ChartDocument
    expect(cached.iqline.drawings.map((d) => d.id)).toEqual(["tv-t1"])
    expect(cached.charts).toEqual(layoutState.charts)

    expect(puts()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(1)
    expect(putBody().state.iqline.drawings.map((d) => d.id)).toEqual(["tv-t1"])
    expect(putBody().state.charts).toEqual(layoutState.charts)

    // Server giờ đã có iqline: nạp lại không còn chuyển đổi nên không báo thêm.
    mockServer(putBody().state)
    await store.load(sym)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("khách chuyển từ bản đệm TradingView cũ, lưu xuống bản đệm iqline và không gọi API", async () => {
    const sym = nextSymbol()
    localStorage.setItem(tradingViewKey("guest", sym), JSON.stringify(trendAndIchimoku()))
    await createIQLineStore({ notify: vi.fn() }).load(sym)
    expect((stored(iqlineKey("guest", sym)) as ChartDocument).iqline.drawings).toHaveLength(1)
    // Bản đệm TradingView gốc còn nguyên để quay về TradingView.
    expect(localStorage.getItem(tradingViewKey("guest", sym))).not.toBeNull()
    await vi.advanceTimersByTimeAsync(5000)
    expect(api).not.toHaveBeenCalled()
  })

  it("layout không có gì để chuyển thì không ghi gì", async () => {
    signIn("u1")
    mockServer(layout([main()]))
    const sym = nextSymbol()
    const doc = await createIQLineStore({ notify: vi.fn() }).load(sym)
    expect(doc?.iqline.drawings).toEqual([])
    expect(localStorage.getItem(iqlineKey("user:u1", sym))).toBeNull()
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(0)
  })
})

describe("load: tài liệu iqline có phần tử hỏng", () => {
  it("bỏ phần tử hỏng, nạp phần còn lại", async () => {
    const sym = nextSymbol()
    const good = drawing("good")
    localStorage.setItem(
      iqlineKey("guest", sym),
      JSON.stringify({
        iqline: {
          version: 1,
          chartType: "line",
          drawings: [
            good,
            { ...drawing("bad-tool"), tool: "bogus" },
            { ...drawing("bad-anchor"), anchors: [{ time: "x", price: 1 }, { time: 2, price: 3 }] },
            { ...drawing("few-anchors"), anchors: [{ time: 1, price: 1 }] },
            { ...drawing("nan-price"), anchors: [{ time: 1, price: null }, { time: 2, price: 3 }] },
            { tool: "trend", anchors: good.anchors },
            null,
            "chuỗi",
            { ...good, style: { color: "khong-phai-token", width: -3, dash: "wavy" } },
            { ...drawing("session"), anchors: [{ session: 3, price: 5 }, { session: 9, price: 6 }], locked: true, hidden: true, text: "ghi chú" },
          ],
          indicators: [
            { key: "k1", id: "rsi", params: { period: 14, bad: { nested: true }, nan: null, flag: true, name: "x" } },
            { key: 5, id: "ma", params: {} },
            { id: "ema", params: {} },
            null,
            { key: "k2", id: "ma", params: "hỏng", hidden: true },
          ],
        },
      }),
    )
    const doc = await createIQLineStore().load(sym)
    expect(doc?.iqline.chartType).toBe("line")
    expect(doc?.iqline.drawings.map((d) => d.id)).toEqual(["good", "session"])
    expect(doc?.iqline.drawings[0].style).toEqual(good.style)
    expect(doc?.iqline.drawings[1]).toMatchObject({ locked: true, hidden: true, text: "ghi chú", anchors: [{ session: 3, price: 5 }, { session: 9, price: 6 }] })
    expect(doc?.iqline.indicators).toEqual([
      { key: "k1", id: "rsi", params: { period: 14, flag: true, name: "x" } },
      { key: "k2", id: "ma", params: {}, hidden: true },
    ])
  })

  it("chỉnh style hỏng về mặc định của công cụ, chartType lạ về nến thường, loại trùng id", async () => {
    const sym = nextSymbol()
    const good = drawing("dup")
    localStorage.setItem(
      iqlineKey("guest", sym),
      JSON.stringify({
        iqline: {
          version: 1,
          chartType: "hình-lạ",
          drawings: [{ ...good, style: { color: "khong-phai-token", width: -3, dash: "wavy" } }, good],
          indicators: [{ key: "same", id: "rsi", params: {} }, { key: "same", id: "rsi", params: {} }, { key: "other", id: "rsi", params: {} }],
        },
      }),
    )
    const doc = await createIQLineStore().load(sym)
    expect(doc?.iqline.chartType).toBe("candles")
    expect(doc?.iqline.drawings).toHaveLength(1)
    expect(doc?.iqline.drawings[0].style).toEqual({ color: "chart-2", width: 1.7, dash: "solid" })
    expect(doc?.iqline.indicators.map((i) => i.key)).toEqual(["same", "other"])
  })

  it("khoá iqline không hợp lệ: dùng charts nếu có, nếu không thì bỏ qua nguồn đó", async () => {
    const a = nextSymbol()
    localStorage.setItem(iqlineKey("guest", a), JSON.stringify({ iqline: { version: 2, drawings: [], indicators: [], chartType: "candles" } }))
    expect(await createIQLineStore().load(a)).toBeNull()

    localStorage.setItem(iqlineKey("guest", a), JSON.stringify({ iqline: { version: 1, drawings: "không phải mảng", indicators: [] } }))
    expect(await createIQLineStore().load(a)).toBeNull()

    const b = nextSymbol()
    localStorage.setItem(
      iqlineKey("guest", b),
      JSON.stringify({ iqline: { version: 9 }, ...layout([main(), line("LineToolTrendLine", "t1")]) }),
    )
    expect((await createIQLineStore({ notify: vi.fn() }).load(b))?.iqline.drawings.map((d) => d.id)).toEqual(["tv-t1"])
  })

  it("JSON hỏng hoặc kiểu lạ trong bản đệm thì trả null, không ném", async () => {
    const sym = nextSymbol()
    const store = createIQLineStore()
    localStorage.setItem(iqlineKey("guest", sym), "{không phải json")
    expect(await store.load(sym)).toBeNull()
    for (const value of ["[]", "123", '"text"', "null", "{}"]) {
      localStorage.setItem(iqlineKey("guest", sym), value)
      expect(await store.load(sym)).toBeNull()
    }
  })
})

describe("save", () => {
  it("ghi bản đệm ngay, PUT sau 1500 ms, gộp nhiều lần lưu thành một PUT với bản mới nhất", async () => {
    signIn("u1")
    mockServer(null)
    const store = createIQLineStore()
    const sym = nextSymbol()

    store.save(sym, document([drawing("a")]))
    expect((stored(iqlineKey("user:u1", sym)) as ChartDocument).iqline.drawings.map((d) => d.id)).toEqual(["a"])
    expect(puts()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1000)
    store.save(sym, document([drawing("a"), drawing("b")]))
    expect((stored(iqlineKey("user:u1", sym)) as ChartDocument).iqline.drawings).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1499)
    expect(puts()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(puts()).toHaveLength(1)
    expect(puts()[0]?.[0]).toBe(`/chart-drawings/${sym}`)
    expect(putBody().state.iqline.drawings.map((d) => d.id)).toEqual(["a", "b"])
    expect(Object.keys(putBody())).toEqual(["state"])

    await vi.advanceTimersByTimeAsync(10_000)
    expect(puts()).toHaveLength(1)
  })

  it("debounce theo từng mã", async () => {
    signIn("u1")
    mockServer(null)
    const store = createIQLineStore()
    const a = nextSymbol()
    const b = nextSymbol()
    store.save(a, document([drawing("a")]))
    store.save(b, document([drawing("b")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts().map(([path]) => path).sort()).toEqual([`/chart-drawings/${a}`, `/chart-drawings/${b}`].sort())
  })

  it("khách chỉ ghi trên máy, không gọi API", async () => {
    const store = createIQLineStore()
    const sym = nextSymbol()
    store.save(sym, document([drawing("a")]))
    expect((stored(iqlineKey("guest", sym)) as ChartDocument).iqline.drawings).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api).not.toHaveBeenCalled()
  })

  it("giữ charts của lần nạp trước khi lưu, kể cả khi doc không mang charts", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const charts = [{ keep: "tradingview" }]
    mockServer({ ...document([drawing("old")]), charts })
    const store = createIQLineStore()
    await store.load(sym)

    store.save(sym, document([drawing("new")]))
    expect((stored(iqlineKey("user:u1", sym)) as ChartDocument).charts).toEqual(charts)
    await vi.advanceTimersByTimeAsync(1500)
    expect(putBody().state.charts).toEqual(charts)
    expect(putBody().state.iqline.drawings.map((d) => d.id)).toEqual(["new"])
  })

  it("charts của chính doc được ưu tiên và được nhớ cho lần lưu sau", async () => {
    signIn("u1")
    mockServer(null)
    const sym = nextSymbol()
    const store = createIQLineStore()
    store.save(sym, document([], { charts: [{ a: 1 }] }))
    store.save(sym, document([drawing("x")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(putBody().state.charts).toEqual([{ a: 1 }])
  })

  it("không ghép charts của mã khác hoặc tài khoản khác", async () => {
    signIn("u1")
    const sym = nextSymbol()
    mockServer({ ...document(), charts: [{ keep: "u1" }] })
    const store = createIQLineStore()
    await store.load(sym)

    store.save(`${sym}X`, document([drawing("x")]))
    await vi.advanceTimersByTimeAsync(1500)
    signIn("u2")
    store.save(sym, document([drawing("y")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(2)
    expect(putBody(0).state.charts).toBeUndefined()
    expect(putBody(1).state.charts).toBeUndefined()
  })

  it("nạp lại mà state không còn charts thì không dùng charts cũ", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const store = createIQLineStore()
    mockServer({ ...document(), charts: [{ keep: 1 }] })
    await store.load(sym)
    mockServer(document([drawing("a")]))
    await store.load(sym)
    store.save(sym, document([drawing("b")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(putBody().state.charts).toBeUndefined()
  })

  it("quá 512 KB thì bỏ charts của mã đó khỏi bản đệm và PUT, và không đưa lại ở lần lưu sau", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const huge = [{ blob: "x".repeat(600 * 1024) }]
    mockServer({ ...document([drawing("old")]), charts: huge })
    const store = createIQLineStore()
    const loaded = await store.load(sym)
    expect(loaded?.charts).toBeDefined()

    store.save(sym, document([drawing("new")]))
    const cached = stored(iqlineKey("user:u1", sym)) as ChartDocument
    expect(cached.charts).toBeUndefined()
    expect(cached.iqline.drawings.map((d) => d.id)).toEqual(["new"])
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(1)
    expect(putBody().state.charts).toBeUndefined()
    expect(putBody().state.iqline.drawings.map((d) => d.id)).toEqual(["new"])

    store.save(sym, document([drawing("newer")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(2)
    expect(putBody(1).state.charts).toBeUndefined()
  })

  it("chỉ riêng iqline đã quá 512 KB thì giữ bản đệm và bỏ PUT", async () => {
    signIn("u1")
    mockServer(null)
    const sym = nextSymbol()
    const store = createIQLineStore()
    store.save(sym, document([drawing("small")]))
    const big = Array.from({ length: 4000 }, (_, i) => drawing(`d${i}`))
    store.save(sym, document(big))
    // Bản nhỏ đang chờ gửi cũng bị huỷ, để server không nhận bản cũ hơn bản đệm.
    await vi.advanceTimersByTimeAsync(5000)
    expect(puts()).toHaveLength(0)
    expect((stored(iqlineKey("user:u1", sym)) as ChartDocument).iqline.drawings).toHaveLength(4000)
  })
})

describe("đổi tài khoản giữa chừng", () => {
  it("đổi trong lúc tải thì trả null và không ghi nhầm", async () => {
    signIn("u1")
    const sym = nextSymbol()
    const notify = vi.fn()
    vi.mocked(api).mockImplementation(async () => {
      signIn("u2")
      return { symbol: sym, state: trendAndIchimoku(), updated_at: null }
    })
    expect(await createIQLineStore({ notify }).load(sym)).toBeNull()
    expect(notify).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(puts()).toHaveLength(0)
  })

  it("đổi trong lúc tải rồi API lỗi thì cũng trả null, không đọc bản đệm của tài khoản cũ", async () => {
    signIn("u1")
    const sym = nextSymbol()
    localStorage.setItem(iqlineKey("user:u1", sym), JSON.stringify(document([drawing("u1")])))
    vi.mocked(api).mockImplementation(async () => {
      signIn("u2")
      throw new Error("mất mạng")
    })
    expect(await createIQLineStore().load(sym)).toBeNull()
  })

  it("đổi sau khi lưu nhưng trước khi PUT thì không PUT", async () => {
    signIn("u1")
    mockServer(null)
    const sym = nextSymbol()
    const store = createIQLineStore()
    store.save(sym, document([drawing("a")]))
    signIn("u2")
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(0)
    expect(localStorage.getItem(iqlineKey("user:u1", sym))).not.toBeNull()
    expect(localStorage.getItem(iqlineKey("user:u2", sym))).toBeNull()
  })
})

describe("lỗi lưu trữ không làm hỏng biểu đồ", () => {
  it("localStorage.setItem ném lỗi: save không ném và PUT vẫn đi", async () => {
    signIn("u1")
    mockServer(null)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    const store = createIQLineStore()
    expect(() => store.save(nextSymbol(), document([drawing("a")]))).not.toThrow()
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(1)
  })

  it("localStorage.getItem ném lỗi: load trả null", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError")
    })
    expect(await createIQLineStore().load(nextSymbol())).toBeNull()
  })

  it("PUT lỗi mạng bị nuốt, kể cả khi mock trả undefined", async () => {
    signIn("u1")
    const store = createIQLineStore()
    vi.mocked(api).mockRejectedValue(new Error("mất mạng"))
    store.save(nextSymbol(), document([drawing("a")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(1)

    vi.mocked(api).mockReset()
    store.save(nextSymbol(), document([drawing("b")]))
    await vi.advanceTimersByTimeAsync(1500)
    expect(puts()).toHaveLength(1)
  })

  it("tài liệu không tuần tự hoá được (vòng tham chiếu) thì save không ném và không ghi gì", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const sym = nextSymbol()
    expect(() => createIQLineStore().save(sym, document([], { charts: [circular] }))).not.toThrow()
    expect(localStorage.getItem(iqlineKey("guest", sym))).toBeNull()
  })
})

describe("getIQLineStore", () => {
  it("là singleton", () => {
    expect(getIQLineStore()).toBe(getIQLineStore())
  })
})
