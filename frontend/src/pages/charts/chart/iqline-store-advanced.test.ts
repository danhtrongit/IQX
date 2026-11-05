/** Lưu và nạp lại chín công cụ vẽ đợt 2 qua kho của IQLine: điểm neo `time`, kiểu, khoá, ẩn, ghi chú và các trường hợp hỏng. */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { api, getAccessToken } from "@/lib/api"
import { ADVANCED_TOOLS, TOOL_SPECS, anchorCountOf } from "@/lib/iqline/drawings"
import type { ChartDocument, Drawing } from "@/lib/iqline/types"

import { createIQLineStore } from "./iqline-store"

vi.mock("@/lib/api", () => ({ api: vi.fn(), getAccessToken: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))

const DAY = 86_400
const T0 = 1_700_000_400

let counter = 0
/** Mỗi test một mã riêng: danh sách "đã báo" của store nằm trong module và sống qua các test. */
const nextSymbol = () => `ADV${++counter}`

const advancedDrawing = (tool: (typeof ADVANCED_TOOLS)[number], index: number, extra: Partial<Drawing> = {}): Drawing => ({
  id: `d${index + 1}`,
  tool,
  anchors: Array.from({ length: anchorCountOf(tool) }, (_, point) => ({ time: T0 + (index * 10 + point * 3) * DAY, price: 25 + point * 1.5 + index * 0.25 })),
  style: { ...TOOL_SPECS[tool].defaultStyle },
  ...extra,
})

const documentOf = (drawings: Drawing[]): ChartDocument => ({ iqline: { version: 1, drawings, indicators: [], chartType: "candles" } })
const cacheKey = (symbol: string) => `iqx.iqline_drawings_v1_guest:${symbol}`

beforeEach(() => {
  vi.mocked(api).mockReset()
  vi.mocked(getAccessToken).mockReset()
  localStorage.clear()
})

describe("kho lưu trữ: công cụ đợt 2", () => {
  it("chín công cụ lưu rồi nạp lại giống hệt (điểm neo time, kiểu, khoá, ẩn)", async () => {
    const symbol = nextSymbol()
    const drawings = ADVANCED_TOOLS.map((tool, index) =>
      advancedDrawing(tool, index, index % 3 === 0 ? { locked: true } : index % 3 === 1 ? { hidden: true } : { style: { color: "chart-8", width: 3, dash: "dashed", fill: false } }),
    )
    const store = createIQLineStore({ notify: vi.fn() })
    store.save(symbol, documentOf(drawings))
    const stored = JSON.parse(localStorage.getItem(cacheKey(symbol)) ?? "null") as ChartDocument
    expect(stored.iqline.drawings.map((drawing) => drawing.tool)).toEqual([...ADVANCED_TOOLS])
    const loaded = await store.load(symbol)
    expect(loaded?.iqline.drawings).toEqual(drawings)
    for (const drawing of loaded?.iqline.drawings ?? []) {
      expect(drawing.anchors).toHaveLength(anchorCountOf(drawing.tool))
      for (const anchor of drawing.anchors) expect(Object.keys(anchor).sort()).toEqual(["price", "time"])
    }
  })

  it("người đăng nhập: bản gửi lên server nạp lại đúng", async () => {
    vi.useFakeTimers()
    try {
      const payload = `h.${btoa(JSON.stringify({ sub: "u9" }))}.s`
      vi.mocked(getAccessToken).mockReturnValue(payload)
      let serverState: unknown = null
      vi.mocked(api).mockImplementation(async (_path, init) => {
        if (init?.method === "PUT") {
          serverState = (JSON.parse(String(init.body)) as { state: unknown }).state
          return { symbol: "X", state: null, updated_at: null }
        }
        return { symbol: "X", state: serverState, updated_at: null }
      })
      const symbol = nextSymbol()
      const drawings = ADVANCED_TOOLS.map((tool, index) => advancedDrawing(tool, index))
      const store = createIQLineStore({ notify: vi.fn() })
      store.save(symbol, documentOf(drawings))
      await vi.advanceTimersByTimeAsync(2_000)
      expect(serverState).not.toBeNull()
      localStorage.clear()
      expect((await store.load(symbol))?.iqline.drawings).toEqual(drawings)
    } finally {
      vi.useRealTimers()
    }
  })

  it("thiếu điểm neo thì bỏ hình, thừa thì cắt bớt, công cụ lạ thì bỏ, hình khác vẫn giữ", async () => {
    const symbol = nextSymbol()
    const good = advancedDrawing("xabcd", 0)
    const short = advancedDrawing("head-shoulders", 1)
    short.anchors = short.anchors.slice(0, 6)
    const long = advancedDrawing("pitchfork", 2)
    long.anchors = [...long.anchors, { time: T0 + 99 * DAY, price: 30 }]
    const unknown = { ...advancedDrawing("gann-box", 3), tool: "gann-square" } as unknown as Drawing
    localStorage.setItem(cacheKey(symbol), JSON.stringify(documentOf([good, short, long, unknown])))
    const store = createIQLineStore({ notify: vi.fn() })
    const loaded = (await store.load(symbol))?.iqline.drawings ?? []
    expect(loaded.map((drawing) => drawing.id)).toEqual(["d1", "d3"])
    expect(loaded[1].anchors).toHaveLength(3)
    expect(loaded[1].anchors).toEqual(advancedDrawing("pitchfork", 2).anchors)
  })

  it("layout TradingView có chín loại công cụ đợt 2: chuyển, lưu xuống bản đệm iqline, nạp lại giống hệt, không báo bỏ gì", async () => {
    const symbol = nextSymbol()
    const types = ["LineToolFibTimeZone", "LineToolFibSpeedResistanceFan", "LineToolFibChannel", "LineToolPitchfork", "LineToolGannFan", "LineToolGannComplex", "LineTool5PointsPattern", "LineToolHeadAndShoulders", "LineToolTrianglePattern"]
    const sources = types.map((type, index) => ({
      type,
      id: `s${index}`,
      state: { symbol: "AAA", interval: "D" },
      points: Array.from({ length: anchorCountOf(ADVANCED_TOOLS[index]) }, (_, point) => ({ time_t: T0 + (index * 10 + point * 3) * DAY, price: 25 + point * 1.5 })),
      ownerSourceId: "_seriesId",
    }))
    const layout = { layout: "s", charts: [{ version: 2, panes: [{ sources: [{ type: "MainSeries", id: "_seriesId", state: { style: 1, interval: "D", symbol: "AAA" } }, ...sources] }] }] }
    localStorage.setItem(`iqx.tv_drawings_v2_guest:${symbol}`, JSON.stringify(layout))
    const notify = vi.fn()
    const first = await createIQLineStore({ notify }).load(symbol)
    expect(first?.iqline.drawings.map((drawing) => drawing.tool)).toEqual([...ADVANCED_TOOLS])
    expect(notify).not.toHaveBeenCalled()
    const cached = JSON.parse(localStorage.getItem(cacheKey(symbol)) ?? "null") as ChartDocument
    expect(cached.iqline.drawings).toEqual(first?.iqline.drawings)
    // Lần sau đọc bản đệm iqline (không chuyển lại) và ra đúng các hình đó.
    expect((await createIQLineStore({ notify }).load(symbol))?.iqline.drawings).toEqual(first?.iqline.drawings)
  })

  it("điểm neo không hữu hạn bị bỏ cả hình, màu lạ về màu mặc định của công cụ", async () => {
    const symbol = nextSymbol()
    const broken = advancedDrawing("fib-fan", 0)
    broken.anchors[1] = { time: Number.NaN, price: 1 }
    const oddColor = { ...advancedDrawing("gann-fan", 1), style: { color: "hot-pink", width: 1.7 } } as unknown as Drawing
    localStorage.setItem(cacheKey(symbol), JSON.stringify(documentOf([broken, oddColor])))
    const loaded = (await createIQLineStore({ notify: vi.fn() }).load(symbol))?.iqline.drawings ?? []
    expect(loaded.map((drawing) => drawing.id)).toEqual(["d2"])
    expect(loaded[0].style.color).toBe(TOOL_SPECS["gann-fan"].defaultStyle.color)
  })
})
