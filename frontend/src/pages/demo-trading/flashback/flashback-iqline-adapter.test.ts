import { describe, expect, it, vi } from "vitest"

import { computeIndicator as computeLib } from "@/lib/iqline/indicators"
import type { ChartIndicatorInput } from "@/lib/iqline/types"

import type { FlashbackBar, FlashbackOrder } from "./flashback-api"
import type { ChartIndicator } from "./flashback-context"
import type { Drawing as LegacyDrawing } from "./flashback-drawings"
import { INDICATOR_METAS } from "./flashback-test-support"
import { computeIndicator as computeOld, defaultParams } from "./flashback-indicators"
import {
  applyIndicatorChange,
  flattenParams,
  indicatorTitleOf,
  legacyDrawingsToLib,
  ordersToMarkers,
  toChartInputs,
  toLibBars,
} from "./flashback-iqline-adapter"
import { MAX_INDICATORS } from "./flashback-indicator-store"

/** Dữ liệu giả ngẫu nhiên cố định: bước đi ngẫu nhiên, nến hợp lệ, khối lượng dương. */
function walk(count: number, seed = 7): FlashbackBar[] {
  let state = seed
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  let close = 25_000
  return Array.from({ length: count }, (_, index) => {
    const open = close
    close = Math.max(1_000, open * (1 + (next() - 0.5) * 0.05))
    const high = Math.max(open, close) * (1 + next() * 0.01)
    const low = Math.min(open, close) * (1 - next() * 0.01)
    return { session: index, open, high, low, close, volume: Math.round(500_000 + next() * 2_000_000) }
  })
}

const chartIndicator = (overrides: Partial<ChartIndicator>): ChartIndicator => ({
  key: "s0",
  id: "rsi",
  params: { period: 14, level: { lower: 30, upper: 70 } },
  label: "RSI 14",
  color: "var(--chart-1)",
  hidden: false,
  plot: { kind: "pane", series: [] },
  ...overrides,
})

describe("toLibBars", () => {
  it("chỉ đưa OHLCV vào thư viện: không trường session hay bất cứ trường lạ nào của server", () => {
    const warmup = walk(5)
    const bars = walk(3, 9).map((bar) => ({ ...bar, date: "2026-10-05", symbol: "VNM" }) as FlashbackBar)
    const out = toLibBars(warmup, bars)
    expect(out).toHaveLength(8)
    for (const bar of out) expect(Object.keys(bar).sort()).toEqual(["close", "high", "low", "open", "volume"])
    expect(out[5]).toEqual({ open: bars[0].open, high: bars[0].high, low: bars[0].low, close: bars[0].close, volume: bars[0].volume })
  })
})

describe("flattenParams: tham số cũ sang tham số IQLine", () => {
  it("cặp ngưỡng level thành lower và upper phẳng", () => {
    expect(flattenParams("rsi", { period: 14, level: { lower: 30, upper: 70 } })).toEqual({ period: 14, lower: 30, upper: 70 })
    expect(flattenParams("stochastic", { k: 14, d: 3, smooth: 3, level: { lower: 20, upper: 80 } })).toEqual({ k: 14, d: 3, smooth: 3, lower: 20, upper: 80 })
    for (const id of ["cci", "roc", "williams_r", "mfi"]) {
      expect(flattenParams(id, { period: 10, level: { lower: -5, upper: 5 } })).toEqual({ period: 10, lower: -5, upper: 5 })
    }
  })

  it("số thì giữ nguyên; không có level thì không thêm lower, upper", () => {
    expect(flattenParams("macd", { fast: 12, slow: 26, signal: 9 })).toEqual({ fast: 12, slow: 26, signal: 9 })
    expect(flattenParams("ma", { period: 50 })).toEqual({ period: 50 })
    expect(flattenParams("rsi", {})).toEqual({})
  })

  it("CMF: level là một số (ngưỡng duy nhất); nếu lỡ là cặp thì lấy lower như công thức cũ", () => {
    expect(flattenParams("cmf", { period: 20, level: 0.05 })).toEqual({ period: 20, level: 0.05 })
    expect(flattenParams("cmf", { period: 20, level: { lower: -0.1, upper: 0.1 } })).toEqual({ period: 20, level: -0.1 })
  })

  it("không sửa đối tượng đầu vào", () => {
    const input = { period: 14, level: { lower: 30, upper: 70 } }
    flattenParams("rsi", input)
    expect(input).toEqual({ period: 14, level: { lower: 30, upper: 70 } })
  })
})

describe("toChartInputs", () => {
  it("giữ khoá, id, trạng thái ẩn và đổi tham số", () => {
    const out = toChartInputs([chartIndicator({}), chartIndicator({ key: "s1", id: "ma", params: { period: 20 }, hidden: true })])
    expect(out).toEqual([
      { key: "s0", id: "rsi", params: { period: 14, lower: 30, upper: 70 }, hidden: false },
      { key: "s1", id: "ma", params: { period: 20 }, hidden: true },
    ])
  })

  it(`tối đa ${MAX_INDICATORS} chỉ báo: phần thừa không đi vào biểu đồ`, () => {
    const many = Array.from({ length: MAX_INDICATORS + 5 }, (_, index) => chartIndicator({ key: `s${index}` }))
    const out = toChartInputs(many)
    expect(out).toHaveLength(MAX_INDICATORS)
    expect(out.at(-1)?.key).toBe(`s${MAX_INDICATORS - 1}`)
  })

  it("chỉ báo không có params (đã lưu cũ) không làm hỏng", () => {
    expect(toChartInputs([chartIndicator({ params: undefined })])[0].params).toEqual({})
  })
})

describe("indicatorTitleOf", () => {
  it("dùng nhãn của Flashback theo khoá, khoá lạ thì giữ tên của thư viện", () => {
    const title = indicatorTitleOf([chartIndicator({ label: "RSI 14" })])
    expect(title({ key: "s0", id: "rsi", params: {} }, "RSI (14)")).toBe("RSI 14")
    expect(title({ key: "zz", id: "rsi", params: {} }, "RSI (14)")).toBe("RSI (14)")
  })
})

describe("applyIndicatorChange", () => {
  const list: ChartIndicatorInput[] = [
    { key: "a", id: "ma", params: {} },
    { key: "b", id: "rsi", params: {}, hidden: true },
    { key: "c", id: "cci", params: {}, hidden: false },
  ]
  const actions = () => ({ toggle: vi.fn(), remove: vi.fn() })

  it("khoá mất đi là xoá chỉ báo đó", () => {
    const fns = actions()
    applyIndicatorChange(list, [list[0], list[2]], fns)
    expect(fns.remove).toHaveBeenCalledExactlyOnceWith("b")
    expect(fns.toggle).not.toHaveBeenCalled()
  })

  it("hidden đổi là bật tắt chỉ báo đó (undefined coi như false)", () => {
    const fns = actions()
    applyIndicatorChange(list, [{ ...list[0], hidden: true }, { ...list[1], hidden: false }, list[2]], fns)
    expect(fns.toggle.mock.calls.map((call) => call[0])).toEqual(["a", "b"])
    expect(fns.remove).not.toHaveBeenCalled()
    const same = actions()
    applyIndicatorChange(list, [list[0], list[1], { ...list[2], hidden: undefined }], same)
    expect(same.toggle).not.toHaveBeenCalled()
  })
})

describe("ordersToMarkers", () => {
  const order = (step: number, side: "buy" | "sell"): FlashbackOrder => ({ id: `o${step}${side}`, step, side }) as FlashbackOrder

  it("lệnh khớp ở phiên n nằm ở nến viewBars - 1 + n; mua thành buy, bán thành sell", () => {
    expect(ordersToMarkers([order(0, "buy"), order(3, "sell")], 40, 45)).toEqual([
      { session: 39, side: "buy" },
      { session: 42, side: "sell" },
    ])
  })

  it("bỏ lệnh ở phiên chưa mở và phiên âm", () => {
    expect(ordersToMarkers([order(6, "buy"), order(-50, "buy"), order(5, "sell")], 40, 44)).toEqual([{ session: 44, side: "sell" }])
  })
})

describe("legacyDrawingsToLib", () => {
  const legacy: LegacyDrawing[] = [
    { id: 1, kind: "trend", a: { session: 3, price: 100 }, b: { session: 9, price: 120 } },
    { id: 2, kind: "fib", a: { session: 4.5, price: 130 }, b: { session: 20, price: 90 } },
  ]

  it("trend giữ nguyên, fib thành fib-retracement; điểm đầu (100%) vẫn là neo đầu", () => {
    const out = legacyDrawingsToLib(legacy)
    expect(out.map((shape) => [shape.id, shape.tool])).toEqual([
      ["d1", "trend"],
      ["d2", "fib-retracement"],
    ])
    expect(out[1].anchors).toEqual([
      { session: 4.5, price: 130 },
      { session: 20, price: 90 },
    ])
    expect(out[0].style.width).toBeGreaterThan(0)
  })

  it("không có hình thì trả mảng rỗng", () => {
    expect(legacyDrawingsToLib([])).toEqual([])
  })
})

describe("công thức: indicators của IQLine bằng công thức cũ của Flashback trong 1e-9", () => {
  const history = walk(420)
  const libBars = toLibBars([], history)

  for (const meta of INDICATOR_METAS) {
    it(`${meta.id}: mọi chuỗi và histogram khớp từng nến`, () => {
      // Metadata giả của test-support không khai báo ngưỡng của Stochastic; metadata thật của server có (20 và 80).
      const oldParams = meta.id === "stochastic" ? { ...defaultParams(meta), level: { lower: 20, upper: 80 } } : defaultParams(meta)
      const old = computeOld(meta.id, oldParams, history)
      const lib = computeLib({ id: meta.id, params: flattenParams(meta.id, oldParams) }, libBars)
      expect(lib, `không tính được ${meta.id}`).not.toBeNull()
      expect(lib!.kind).toBe(old.kind)
      // MACD cũ để cột histogram làm một chuỗi (`histogram: true`); IQLine tách riêng ở `plot.histogram`.
      const oldLines = old.series.filter((item) => !item.histogram)
      const oldColumns = [...old.series.filter((item) => item.histogram).map((item) => item.values), ...(old.histogram ? [old.histogram] : [])]
      expect(lib!.series.length).toBe(oldLines.length)
      const same = (label: string, expected: readonly (number | null)[], actual: readonly (number | null)[] | undefined) => {
        expect(actual?.length, label).toBe(expected.length)
        expected.forEach((value, index) => {
          const other = actual![index]
          if (value === null || value === undefined) expect(other == null, `${label}[${index}] phải rỗng`).toBe(true)
          else {
            expect(other, `${label}[${index}] không được rỗng`).not.toBeNull()
            expect(Math.abs((other as number) - value), `${label}[${index}]`).toBeLessThan(1e-9)
          }
        })
      }
      oldLines.forEach((oldSeries, seriesIndex) => same(`${meta.id} chuỗi ${seriesIndex}`, oldSeries.values, lib!.series[seriesIndex].values))
      oldColumns.forEach((column) => same(`${meta.id} histogram`, column, lib!.histogram?.values))
      // Ngưỡng ngang, vạch 0 và miền cố định của ô riêng cũng giống bản cũ.
      expect(lib!.levels?.map((level) => level.value) ?? []).toEqual(old.levels?.map((level) => level.value) ?? [])
      expect(lib!.zero === true).toBe(old.zero === true)
      expect(lib!.range).toEqual(old.range)
    })
  }
})
