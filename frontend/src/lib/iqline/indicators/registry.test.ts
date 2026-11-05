import { afterEach, describe, expect, it } from "vitest"
import type { IndicatorDefinition } from "../types"
import { computeIndicator, getIndicator, listIndicators, paramsKey, registerIndicator, resolveIndicatorParams, unregisterIndicator, validateIndicatorParams } from "./index"
import { goldenBars } from "./test-support"

const EXPECTED_IDS = [
  // 16 chỉ báo trong danh mục, theo thứ tự bảng ở §9
  "volume",
  "ma",
  "bollinger",
  "ema",
  "ma_cross",
  "donchian",
  "rsi",
  "macd",
  "dmi",
  "stochastic",
  "cci",
  "roc",
  "williams_r",
  "obv",
  "mfi",
  "cmf",
  // 7 chỉ báo bổ sung
  "atr",
  "atr_percent",
  "adx",
  "keltner",
  "bb_width",
  "psar",
  "relative_volume",
  // 16 chỉ báo đợt 2: 8 trên ô giá rồi 8 ô riêng
  "ichimoku",
  "vwap",
  "supertrend",
  "wma",
  "hma",
  "vwma",
  "envelope",
  "pivot_points",
  "aroon",
  "trix",
  "ultimate_oscillator",
  "awesome_oscillator",
  "momentum",
  "std_dev",
  "accum_dist",
  "volatility_ohlc",
  // Volume Profile
  "volume_profile",
]

const custom = (id: string, overrides: Partial<IndicatorDefinition> = {}): IndicatorDefinition => ({
  id,
  name: `Thử ${id}`,
  kind: "pane",
  params: [{ key: "period", min: 1, max: 200, default: 14 }],
  flashback: false,
  compute: (bars) => ({ kind: "pane", series: [{ key: "x", label: "x", values: bars.map((bar) => bar.close), color: "chart-1" }] }),
  ...overrides,
})

const registered: string[] = []
function register(definition: IndicatorDefinition): void {
  registerIndicator(definition)
  registered.push(definition.id)
}
afterEach(() => {
  for (const id of registered.splice(0)) unregisterIndicator(id)
})

describe("sổ đăng ký", () => {
  it("có đúng 40 chỉ báo theo thứ tự §9, 16 trong danh mục và 24 chỉ ở market", () => {
    const all = listIndicators()
    expect(all.map((definition) => definition.id)).toEqual(EXPECTED_IDS)
    expect(listIndicators({ flashback: true })).toHaveLength(16)
    expect(all.filter((definition) => !definition.flashback).map((definition) => definition.id)).toEqual([
      "atr",
      "atr_percent",
      "adx",
      "keltner",
      "bb_width",
      "psar",
      "relative_volume",
      "ichimoku",
      "vwap",
      "supertrend",
      "wma",
      "hma",
      "vwma",
      "envelope",
      "pivot_points",
      "aroon",
      "trix",
      "ultimate_oscillator",
      "awesome_oscillator",
      "momentum",
      "std_dev",
      "accum_dist",
      "volatility_ohlc",
      "volume_profile",
    ])
  })

  it("16 chỉ báo đợt 2 đều flashback: false, nên không bao giờ vào Flashback", () => {
    for (const id of EXPECTED_IDS.slice(23, 39)) expect(getIndicator(id)?.flashback, id).toBe(false)
  })

  it("kind đúng nhóm: 1 ô khối lượng, trên ô giá, còn lại ô riêng", () => {
    const kinds = Object.fromEntries(listIndicators().map((definition) => [definition.id, definition.kind]))
    expect(kinds.volume).toBe("vol")
    for (const id of ["ma", "bollinger", "ema", "ma_cross", "donchian", "keltner", "psar", "volume_profile", "ichimoku", "vwap", "supertrend", "wma", "hma", "vwma", "envelope", "pivot_points"]) expect(kinds[id], id).toBe("over")
    for (const id of ["rsi", "macd", "dmi", "stochastic", "cci", "roc", "williams_r", "obv", "mfi", "cmf", "atr", "atr_percent", "adx", "bb_width", "relative_volume", "aroon", "trix", "ultimate_oscillator", "awesome_oscillator", "momentum", "std_dev", "accum_dist", "volatility_ohlc"]) {
      expect(kinds[id], id).toBe("pane")
    }
    expect(listIndicators({ kind: "vol" })).toHaveLength(1)
  })

  it("không cho trùng id, kể cả chỉ báo có sẵn", () => {
    expect(() => registerIndicator(custom("rsi"))).toThrow(/đã được đăng ký/)
    register(custom("my_atr"))
    expect(() => registerIndicator(custom("my_atr"))).toThrow(/đã được đăng ký/)
    expect(getIndicator("my_atr")?.name).toBe("Thử my_atr")
    expect(listIndicators().at(-1)?.id).toBe("my_atr")
    expect(unregisterIndicator("my_atr")).toBe(true)
    registered.pop()
    expect(getIndicator("my_atr")).toBeUndefined()
    expect(unregisterIndicator("my_atr")).toBe(false)
  })

  it("từ chối định nghĩa hỏng ngay lúc đăng ký", () => {
    expect(() => registerIndicator(custom("Bad Id"))).toThrow(/id không hợp lệ/)
    expect(() => registerIndicator(custom("x1", { kind: "overlay" as never }))).toThrow(/kind/)
    expect(() => registerIndicator(custom("x2", { params: [{ key: "a", default: 1 }, { key: "a", default: 2 }] }))).toThrow(/trùng/)
    expect(() => registerIndicator(custom("x3", { params: [{ key: "a", min: 5, max: 1, default: 3 }] }))).toThrow(/min lớn hơn max/)
    expect(() => registerIndicator(custom("x4", { params: [{ key: "a", min: 1, max: 5, default: 9 }] }))).toThrow(/ngoài miền/)
    expect(() => registerIndicator(custom("x5", { params: [{ key: "a", default: "z", options: ["x", "y"] }] }))).toThrow(/options/)
    expect(() => registerIndicator(custom("x6", { compute: undefined as never }))).toThrow(/compute/)
    for (const id of ["x1", "x2", "x3", "x4", "x5", "x6", "Bad Id"]) expect(getIndicator(id)).toBeUndefined()
  })

  it("ví dụ ở §9 chạy được: atr tự đăng ký có compute riêng", () => {
    register(
      custom("atr_demo", {
        compute: (bars, params) => ({ kind: "pane", series: [{ key: "atr", label: `ATR ${String(params.period)}`, values: bars.map(() => 1), color: "chart-1" }] }),
      }),
    )
    const plot = computeIndicator({ id: "atr_demo", params: { period: 14 } }, goldenBars(5))
    expect(plot?.series[0].values).toEqual([1, 1, 1, 1, 1])
    expect(plot?.series[0].label).toBe("ATR 14")
  })
})

describe("kiểm tra tham số theo spec", () => {
  it("tham số mặc định và tham số rỗng đều hợp lệ", () => {
    for (const definition of listIndicators()) {
      expect(validateIndicatorParams(definition.id, {}), definition.id).toBeNull()
      expect(validateIndicatorParams(definition.id, Object.fromEntries(definition.params.map((spec) => [spec.key, spec.default]))), definition.id).toBeNull()
    }
  })

  it("báo khoá lạ, ngoài miền, không nguyên, sai bước, không phải số", () => {
    expect(validateIndicatorParams("ma", { period: 20, foo: 1 })).toMatch(/không có tham số "foo"/)
    expect(validateIndicatorParams("ma", { period: 4 })).toMatch(/5 đến 200/)
    expect(validateIndicatorParams("ma", { period: 201 })).toMatch(/5 đến 200/)
    expect(validateIndicatorParams("ma", { period: 20.5 })).toMatch(/số nguyên/)
    expect(validateIndicatorParams("ma", { period: Number.NaN })).toMatch(/số hữu hạn/)
    expect(validateIndicatorParams("ma", { period: Number.POSITIVE_INFINITY })).toMatch(/số hữu hạn/)
    expect(validateIndicatorParams("ma", { period: "20" })).toMatch(/phải là một số/)
    expect(validateIndicatorParams("ma", { period: true })).toMatch(/phải là một số/)
    expect(validateIndicatorParams("bollinger", { k: 2.05 })).toMatch(/bội của 0.1/)
    expect(validateIndicatorParams("bollinger", { k: 2.1 })).toBeNull()
    expect(validateIndicatorParams("roc", { lower: -0.3, upper: 0.7 })).toBeNull()
    expect(validateIndicatorParams("nope", {})).toMatch(/Không có chỉ báo/)
  })

  it("luật chéo: nhanh phải nhỏ hơn chậm, ngưỡng dưới nhỏ hơn ngưỡng trên, SAR step < max", () => {
    expect(validateIndicatorParams("macd", { fast: 26, slow: 26 })).toMatch(/nhỏ hơn/)
    expect(validateIndicatorParams("macd", { fast: 12, slow: 26 })).toBeNull()
    expect(validateIndicatorParams("ma_cross", { fast: 50, slow: 20 })).toMatch(/nhỏ hơn/)
    expect(validateIndicatorParams("rsi", { lower: 70, upper: 30 })).toMatch(/Ngưỡng dưới/)
    expect(validateIndicatorParams("rsi", { lower: 50, upper: 50 })).toMatch(/Ngưỡng dưới/)
    expect(validateIndicatorParams("psar", { step: 0.1, max: 0.1 })).toMatch(/nhỏ hơn/)
    // luật chéo dùng cả giá trị mặc định của tham số không truyền
    expect(validateIndicatorParams("ma_cross", { fast: 60 })).toMatch(/nhỏ hơn/)
  })

  it("tham số chuỗi và logic theo options", () => {
    register(
      custom("with_options", {
        params: [
          { key: "source", default: "close", options: ["close", "hl2"] },
          { key: "smooth", default: true },
        ],
      }),
    )
    expect(validateIndicatorParams("with_options", { source: "hl2", smooth: false })).toBeNull()
    expect(validateIndicatorParams("with_options", { source: "open" })).toMatch(/một trong: close, hl2/)
    expect(validateIndicatorParams("with_options", { source: 1 })).toMatch(/chuỗi/)
    expect(validateIndicatorParams("with_options", { smooth: "yes" })).toMatch(/đúng hoặc sai/)
  })

  it("điền mặc định và tạo khoá ổn định không phụ thuộc thứ tự khoá", () => {
    expect(resolveIndicatorParams("macd", { slow: 30 })).toEqual({ fast: 12, slow: 30, signal: 9 })
    expect(resolveIndicatorParams("nope", {})).toBeNull()
    expect(paramsKey("macd", { slow: 30, fast: 12 })).toBe(paramsKey("macd", { fast: 12, signal: 9, slow: 30 }))
    expect(paramsKey("macd", { slow: 30 })).not.toBe(paramsKey("macd", {}))
  })

  it("tham số sai không ném lỗi: computeIndicator cho null, compute trả biểu đồ rỗng", () => {
    const bars = goldenBars(60)
    expect(computeIndicator({ id: "ma", params: { period: 0 } }, bars)).toBeNull()
    expect(computeIndicator({ id: "ma", params: { period: -3 } }, bars)).toBeNull()
    expect(computeIndicator({ id: "khong-co", params: {} }, bars)).toBeNull()
    const direct = getIndicator("ema")!.compute(bars, { period: 0 }, ["chart-1"])
    expect(direct).toEqual({ kind: "over", series: [] })
    expect(() => getIndicator("macd")!.compute(bars, { fast: 99, slow: 5, signal: 9 }, ["chart-1"])).not.toThrow()
  })
})
