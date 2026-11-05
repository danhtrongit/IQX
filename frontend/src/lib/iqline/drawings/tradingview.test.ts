/**
 * Chuyển layout TradingView sang IQLine (§11). Bộ mẫu tự viết, đã ẩn danh: mã giả, giá và thời gian giả, id ngẫu nhiên.
 * Hình dạng theo `charts[].panes[].sources[]` của `widget.save`.
 */
import { describe, expect, it } from "vitest"

import { getIndicator, validateIndicatorParams } from "../indicators"
import { fromTradingViewLayout, intervalStepSeconds } from "./index"
import { STUDY_RULES } from "./tradingview"

const T0 = 1_700_000_400 // thứ tư 2023-11-15 05:20 giờ Việt Nam, trong tuần giao dịch
const DAY = 86_400

const main = (extra: Record<string, unknown> = {}) => ({
  type: "MainSeries",
  id: "_seriesId",
  zorder: 0,
  state: { style: 1, interval: "D", symbol: "AAA", ...extra },
})

const study = (name: string, shortName: string, inputs: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  type: "Study",
  id: `st-${shortName}`,
  state: { inputs, ...extra },
  metaInfo: { id: `${name}@tv-basicstudies-1`, description: name, shortDescription: shortName },
})

const line = (type: string, points: { time_t: number; offset?: number; price: number; interval?: string }[], state: Record<string, unknown> = {}, id = `ln-${type}`) => ({
  type,
  id,
  state: { symbol: "AAA", interval: "D", ...state },
  points,
  ownerSourceId: "_seriesId",
})

/** Layout đủ mọi loại có trong số liệu production (GĐ 0): 3 xu hướng, 1 thước giá, 1 chữ nhật, 1 VbP cố định, và các chỉ báo. */
function productionLike() {
  return {
    layout: "s",
    charts: [
      {
        version: 2,
        panes: [
          {
            sources: [
              main(),
              study("Moving Average", "MA", { length: 20, source: "close", offset: 0 }),
              study("Bollinger Bands", "BB", { in_0: 20, in_1: 2.5 }),
              study("Donchian Channels", "DC", { in_0: 55 }),
              study("Volume Profile Visible Range", "VbPVisible"),
              line("LineToolTrendLine", [{ time_t: T0, price: 25.5 }, { time_t: T0 + 10 * DAY, price: 27.25 }], { linewidth: 3, linestyle: 2 }, "t1"),
              line("LineToolTrendLine", [{ time_t: T0 - 20 * DAY, price: 20 }, { time_t: T0 - 5 * DAY, price: 24 }], { frozen: true }, "t2"),
              line("LineToolTrendLine", [{ time_t: T0 + 3 * DAY, price: 21 }, { time_t: T0 + 9 * DAY, price: 22 }], { visible: false }, "t3"),
              line("LineToolPriceRange", [{ time_t: T0, price: 24 }, { time_t: T0 + 5 * DAY, price: 26 }], {}, "pr"),
              line("LineToolRectangle", [{ time_t: T0, price: 23 }, { time_t: T0 + 4 * DAY, price: 25 }], { fillBackground: false }, "rc"),
              line("LineToolVbPFixed", [{ time_t: T0, price: 23 }, { time_t: T0 + 4 * DAY, price: 25 }], {}, "vbp"),
              study("Ichimoku Cloud", "Ichimoku", { in_0: 10, in_1: 30, in_2: 60, in_3: 30 }),
              study("Volatility O-H-L-C", "Volatility O-H-L-C"),
            ],
          },
          { sources: [study("Volume", "Volume", { maLength: 30 })] },
          { sources: [study("Relative Strength Index", "RSI", { length: 14 }), study("Bollinger Bands Width", "BBW", { length: 20 })] },
          { sources: [study("MACD", "MACD", { in_0: 12, in_1: 26, in_3: "close", in_2: 9 })] },
          { sources: [study("Chaikin Money Flow", "CMF", { length: 21 })] },
        ],
      },
    ],
  }
}

describe("layout đủ loại như dữ liệu production", () => {
  const result = fromTradingViewLayout(productionLike())

  it("chuyển 3 loại hình: xu hướng, thước đo giá, hình chữ nhật; điểm neo là time và price", () => {
    const { drawings } = result.document.iqline
    expect(drawings.map((drawing) => drawing.tool)).toEqual(["trend", "trend", "trend", "measure", "rectangle"])
    expect(drawings[0].anchors).toEqual([
      { time: T0, price: 25.5 },
      { time: T0 + 10 * DAY, price: 27.25 },
    ])
    expect(drawings.map((drawing) => drawing.id)).toEqual(["tv-t1", "tv-t2", "tv-t3", "tv-pr", "tv-rc"])
    expect(result.convertedDrawings).toBe(5)
  })

  it("giữ độ dày, nét đứt, khoá, ẩn và nền của hình chữ nhật", () => {
    const [first, second, third, , rectangle] = result.document.iqline.drawings
    expect(first.style).toMatchObject({ width: 3, dash: "dashed", color: "chart-2" })
    expect(first.locked).toBeUndefined()
    expect(second.locked).toBe(true)
    expect(third.hidden).toBe(true)
    expect(rectangle.style.fill).toBe(false)
  })

  it("chuyển 11 loại chỉ báo theo bảng §11 (có cả Ichimoku Cloud và Volatility O-H-L-C), kèm tham số đọc được", () => {
    const { indicators } = result.document.iqline
    expect(indicators.map((indicator) => indicator.id)).toEqual(["ma", "bollinger", "donchian", "volume_profile", "ichimoku", "volatility_ohlc", "volume", "rsi", "bb_width", "macd", "cmf"])
    const byId = Object.fromEntries(indicators.map((indicator) => [indicator.id, indicator.params]))
    expect(byId.ma).toEqual({ period: 20 })
    expect(byId.bollinger).toEqual({ period: 20, k: 2.5 })
    expect(byId.donchian).toEqual({ period: 55 })
    expect(byId.volume).toEqual({ lookback: 30 })
    expect(byId.rsi).toEqual({ period: 14 })
    expect(byId.macd).toEqual({ fast: 12, slow: 26, signal: 9 })
    expect(byId.cmf).toEqual({ period: 21 })
    expect(byId.ichimoku).toEqual({ conversion: 10, base: 30, spanB: 60, displacement: 30 })
    expect(byId.volatility_ohlc).toEqual({})
    expect(new Set(indicators.map((indicator) => indicator.key)).size).toBe(indicators.length)
    expect(result.convertedIndicators).toBe(11)
  })

  it("mọi chỉ báo chuyển được đều có trong sổ chỉ báo và tham số hợp lệ", () => {
    for (const indicator of result.document.iqline.indicators) {
      expect(getIndicator(indicator.id), indicator.id).toBeDefined()
      expect(validateIndicatorParams(indicator.id, indicator.params), indicator.id).toBeNull()
    }
  })

  it("chỉ còn VbP cố định là không chuyển được, và báo số lượng bỏ qua; Ichimoku và Volatility O-H-L-C không còn bị bỏ", () => {
    expect(result.skippedDrawings).toBe(1)
    expect(result.skippedIndicators).toBe(0)
    expect(result.skippedByType).toEqual({ LineToolVbPFixed: 1 })
  })

  it("kiểu nến theo MainSeries; giữ nguyên `charts` gốc cùng tham chiếu", () => {
    const layout = productionLike()
    const converted = fromTradingViewLayout(layout)
    expect(converted.document.iqline.version).toBe(1)
    expect(converted.document.iqline.chartType).toBe("candles")
    expect(converted.document.charts).toBe(layout.charts)
    expect(converted.chartsDropped).toBe(false)
  })

  it("không sửa dữ liệu vào", () => {
    const layout = productionLike()
    const snapshot = JSON.stringify(layout)
    fromTradingViewLayout(layout)
    expect(JSON.stringify(layout)).toBe(snapshot)
  })
})

describe("chỉ báo đợt 2 có tên rõ ràng trong layout", () => {
  const convertStudies = (studies: ReturnType<typeof study>[]) =>
    fromTradingViewLayout({ charts: [{ panes: [{ sources: [main(), ...studies] }] }] })

  it("mỗi tên TradingView chuyển đúng id, kèm tham số đọc được", () => {
    const result = convertStudies([
      study("VWAP", "VWAP"),
      study("SuperTrend", "SuperTrend", { length: 7, factor: 2.5 }),
      study("Moving Average Weighted", "WMA", { length: 12 }),
      study("Hull Moving Average", "HMA", { length: 21 }),
      study("Volume Weighted Moving Average", "VWMA", { length: 30 }),
      study("Envelopes", "ENV", { length: 25, percent: 5 }),
      study("Pivot Points Standard", "Pivots"),
      study("Aroon", "Aroon", { length: 14 }),
      study("TRIX", "TRIX", { length: 12 }),
      study("Ultimate Oscillator", "UO", { in_0: 5, in_1: 10, in_2: 20 }),
      study("Awesome Oscillator", "AO"),
      study("Momentum", "Mom", { length: 14 }),
      study("Standard Deviation", "StdDev", { length: 30 }),
      study("Accumulation/Distribution", "Accum/Dist"),
      study("Volatility O-H-L-C", "Volatility O-H-L-C", { length: 20 }),
    ])
    const byId = Object.fromEntries(result.document.iqline.indicators.map((indicator) => [indicator.id, indicator.params]))
    expect(Object.keys(byId)).toEqual(["vwap", "supertrend", "wma", "hma", "vwma", "envelope", "pivot_points", "aroon", "trix", "ultimate_oscillator", "awesome_oscillator", "momentum", "std_dev", "accum_dist", "volatility_ohlc"])
    expect(byId.supertrend).toEqual({ period: 7, multiplier: 2.5 })
    expect(byId.wma).toEqual({ period: 12 })
    expect(byId.envelope).toEqual({ period: 25, percent: 5 })
    expect(byId.ultimate_oscillator).toEqual({ short: 5, mid: 10, long: 20 })
    expect(byId.volatility_ohlc).toEqual({ period: 20 })
    expect(result.skippedIndicators).toBe(0)
    for (const indicator of result.document.iqline.indicators) expect(validateIndicatorParams(indicator.id, indicator.params), indicator.id).toBeNull()
  })

  it("Moving Average Weighted không bị nhầm với Moving Average (SMA)", () => {
    const [weighted, plain] = convertStudies([study("Moving Average Weighted", "WMA"), study("Moving Average", "MA")]).document.iqline.indicators
    expect(weighted.id).toBe("wma")
    expect(plain.id).toBe("ma")
  })

  it("Ichimoku không có tham số đọc được thì để chỉ báo dùng mặc định", () => {
    const [ichimoku] = convertStudies([study("Ichimoku Cloud", "Ichimoku")]).document.iqline.indicators
    expect(ichimoku).toMatchObject({ id: "ichimoku", params: {} })
  })

  it("mọi `id` trong bảng chỉ báo có trong sổ đăng ký", () => {
    for (const rule of STUDY_RULES) expect(getIndicator(rule.id), rule.id).toBeDefined()
  })

  it("chỉ báo lạ vẫn bị bỏ qua và báo", () => {
    const result = convertStudies([study("Zig Zag", "ZigZag")])
    expect(result.skippedIndicators).toBe(1)
    expect(result.skippedByType).toEqual({ "Zig Zag": 1 })
  })
})

describe("điểm neo: offset đổi theo bước của khung", () => {
  const convert = (interval: string, offset: number, tool = "LineToolTrendLine") => {
    const layout = {
      charts: [
        {
          panes: [
            {
              sources: [
                main({ interval }),
                line(tool, [{ time_t: T0, price: 10, interval }, { time_t: T0, offset, price: 12, interval }]),
              ],
            },
          ],
        },
      ],
    }
    return fromTradingViewLayout(layout).document.iqline.drawings[0]?.anchors[1]
  }

  it("bước của từng khung", () => {
    expect(intervalStepSeconds("1")).toBe(60)
    expect(intervalStepSeconds("5")).toBe(300)
    expect(intervalStepSeconds("15")).toBe(900)
    expect(intervalStepSeconds("30")).toBe(1800)
    expect(intervalStepSeconds("60")).toBe(3600)
    expect(intervalStepSeconds("240")).toBe(14_400)
    expect(intervalStepSeconds("D")).toBe(DAY)
    expect(intervalStepSeconds("1W")).toBe(7 * DAY)
    expect(intervalStepSeconds("M")).toBe(30 * DAY)
    expect(intervalStepSeconds("15S")).toBeNull()
  })

  it("khung phút: time_t cộng offset x bước", () => {
    expect(convert("5", 3)).toEqual({ time: T0 + 900, price: 12 })
    expect(convert("60", 2)).toEqual({ time: T0 + 7200, price: 12 })
    expect(convert("1", 0)).toEqual({ time: T0, price: 12 })
  })

  it("khung tuần cộng theo tuần; khung ngày bỏ cuối tuần", () => {
    expect(convert("W", 2)).toEqual({ time: T0 + 14 * DAY, price: 12 })
    // T0 là thứ tư: 1 ngày giao dịch là thứ năm, 2 là thứ sáu, 3 là thứ hai tuần sau, 4 là thứ ba, 5 là thứ tư.
    expect(convert("D", 1)).toEqual({ time: T0 + DAY, price: 12 })
    expect(convert("D", 4)).toEqual({ time: T0 + 6 * DAY, price: 12 })
    expect(convert("D", 5)).toEqual({ time: T0 + 7 * DAY, price: 12 })
    expect(convert("D", 12)).toEqual({ time: T0 + 16 * DAY, price: 12 })
  })

  it("điểm không có interval riêng dùng interval của hình rồi của MainSeries", () => {
    const layout = {
      charts: [{ panes: [{ sources: [main({ interval: "15" }), { ...line("LineToolRectangle", [{ time_t: T0, price: 1 }, { time_t: T0, offset: 2, price: 2 }]), state: {} }] }] }],
    }
    const anchors = fromTradingViewLayout(layout).document.iqline.drawings[0].anchors
    expect(anchors[1]).toEqual({ time: T0 + 1800, price: 2 })
  })

  it("offset phi lý thì bỏ hình thay vì ném lỗi", () => {
    expect(convert("D", 5e9)).toBeUndefined()
  })
})

describe("kiểu biểu đồ", () => {
  const typeFor = (style: unknown) => fromTradingViewLayout({ charts: [{ panes: [{ sources: [main({ style })] }] }] }).document.iqline.chartType
  it("đổi style của MainSeries sang kiểu hiển thị của IQLine", () => {
    expect(typeFor(0)).toBe("ohlc")
    expect(typeFor(1)).toBe("candles")
    expect(typeFor(2)).toBe("line")
    expect(typeFor(3)).toBe("area")
    expect(typeFor(8)).toBe("heikin-ashi")
    expect(typeFor(9)).toBe("hollow")
    expect(typeFor(4)).toBe("candles")
    expect(typeFor("x")).toBe("candles")
  })
})

describe("hình trên ô chỉ báo và nhiều biểu đồ", () => {
  it("hình nằm ở ô chỉ báo (không có MainSeries) được tính là bỏ qua vì đơn vị khác với giá", () => {
    const layout = {
      charts: [
        {
          panes: [
            { sources: [main()] },
            { sources: [study("Relative Strength Index", "RSI"), line("LineToolTrendLine", [{ time_t: T0, price: 30 }, { time_t: T0 + DAY, price: 70 }])] },
          ],
        },
      ],
    }
    const result = fromTradingViewLayout(layout)
    expect(result.document.iqline.drawings).toEqual([])
    expect(result.skippedDrawings).toBe(1)
    expect(result.convertedIndicators).toBe(1)
  })

  it("chỉ biểu đồ đầu tiên được chuyển, các biểu đồ sau tính là bỏ qua", () => {
    const layout = {
      charts: [
        { panes: [{ sources: [main(), study("Volume", "Volume")] }] },
        { panes: [{ sources: [main(), study("Volume", "Volume"), line("LineToolTrendLine", [{ time_t: T0, price: 1 }, { time_t: T0, price: 2 }])] }] },
      ],
    }
    const result = fromTradingViewLayout(layout)
    expect(result.convertedIndicators).toBe(1)
    expect(result.skippedIndicators).toBe(1)
    expect(result.skippedDrawings).toBe(1)
  })

  it("chỉ báo ẩn trong TradingView giữ trạng thái ẩn; chỉ báo nội bộ bị bỏ qua không báo", () => {
    const layout = {
      charts: [
        {
          panes: [
            {
              sources: [
                main(),
                study("Relative Strength Index", "RSI", { length: 7 }, { visible: false }),
                { type: "Study", id: "hid", state: {}, metaInfo: { id: "Internal@x", is_hidden_study: true } },
                { type: "ChartEventsSource", id: "ev" },
              ],
            },
          ],
        },
      ],
    }
    const result = fromTradingViewLayout(layout)
    expect(result.document.iqline.indicators).toEqual([{ key: "tv-st-RSI", id: "rsi", params: { period: 7 }, hidden: true }])
    expect(result.skippedIndicators).toBe(0)
  })
})

describe("layout hỏng không bao giờ ném lỗi", () => {
  const empty = { iqline: { version: 1, drawings: [], indicators: [], chartType: "candles" } }

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chuỗi", "xin chào"],
    ["số", 42],
    ["mảng", []],
    ["đối tượng rỗng", {}],
    ["charts không phải mảng", { charts: "x" }],
    ["charts rỗng", { charts: [] }],
    ["phần tử charts là null", { charts: [null, 5, "x"] }],
    ["panes không phải mảng", { charts: [{ panes: {} }] }],
    ["sources không phải mảng", { charts: [{ panes: [{ sources: "x" }] }] }],
    ["sources chứa rác", { charts: [{ panes: [null, { sources: [null, 7, "x", [], {}] }] }] }],
  ])("%s", (_name, input) => {
    const result = fromTradingViewLayout(input)
    expect(result.document).toMatchObject(empty)
    expect(result.convertedDrawings).toBe(0)
    expect(result.convertedIndicators).toBe(0)
  })

  it("hình có điểm neo hỏng bị bỏ qua và đếm, các hình tốt vẫn được chuyển", () => {
    const bad = [
      line("LineToolTrendLine", [{ time_t: T0, price: 1 }]),
      line("LineToolTrendLine", [{ time_t: Number.NaN, price: 1 }, { time_t: T0, price: 2 }]),
      line("LineToolTrendLine", [{ time_t: T0, price: "1" as unknown as number }, { time_t: T0, price: 2 }]),
      line("LineToolTrendLine", [null as unknown as { time_t: number; price: number }, { time_t: T0, price: 2 }]),
      { type: "LineToolTrendLine", id: "no-points" },
      { type: "LineToolRectangle", id: "points-not-array", points: 7 },
      { type: "LineToolRectangle", id: "x", points: [{ time_t: T0, price: 1, offset: "7" }, { time_t: T0, price: 2 }] },
    ]
    const good = line("LineToolTrendLine", [{ time_t: T0, price: 1 }, { time_t: T0 + DAY, price: 2 }], {}, "ok")
    const result = fromTradingViewLayout({ charts: [{ panes: [{ sources: [main(), ...bad, good] }] }] })
    expect(result.document.iqline.drawings.map((drawing) => drawing.id)).toEqual(["tv-ok"])
    expect(result.skippedDrawings).toBe(bad.length)
  })

  it("chỉ báo không có metaInfo hay có tên lạ được đếm là không chuyển được", () => {
    const result = fromTradingViewLayout({
      charts: [{ panes: [{ sources: [main(), { type: "Study", id: "a" }, study("Zig Zag", "ZZ"), { type: "Study", id: "b", metaInfo: { id: 5 } }] }] }],
    })
    expect(result.convertedIndicators).toBe(0)
    expect(result.skippedIndicators).toBe(3)
  })

  it("tham số sai kiểu hoặc không dương thì bỏ, dùng mặc định của chỉ báo", () => {
    const result = fromTradingViewLayout({
      charts: [{ panes: [{ sources: [main(), study("Moving Average", "MA", { length: -3 }), study("RSI", "RSI", { length: "14" }), study("Volume", "Volume", { maLength: Number.NaN })] }] }],
    })
    expect(result.document.iqline.indicators.map((indicator) => indicator.params)).toEqual([{}, {}, {}])
  })

  it("tài liệu có vòng tham chiếu cũng không ném lỗi", () => {
    const layout: Record<string, unknown> = { charts: [{ panes: [{ sources: [main()] }] }] }
    ;(layout.charts as Record<string, unknown>[])[0].self = layout
    const result = fromTradingViewLayout(layout)
    expect(result.chartsDropped).toBe(true)
    expect(result.document.charts).toBeUndefined()
  })
})

describe("giới hạn 512 KB", () => {
  const bulky = (kilobytes: number) => {
    const layout = productionLike()
    ;(layout.charts[0] as Record<string, unknown>).padding = "x".repeat(kilobytes * 1024)
    return layout
  }

  it("dưới giới hạn thì giữ `charts`", () => {
    const result = fromTradingViewLayout(bulky(100))
    expect(result.chartsDropped).toBe(false)
    expect(result.document.charts).toBeDefined()
  })

  it("vượt 512 KB thì bỏ `charts` nhưng vẫn chuyển hình vẽ và chỉ báo", () => {
    const result = fromTradingViewLayout(bulky(600))
    expect(result.chartsDropped).toBe(true)
    expect("charts" in result.document).toBe(false)
    expect(result.document.iqline.drawings).toHaveLength(5)
    expect(result.document.iqline.indicators).toHaveLength(11)
  })

  it("đo theo byte UTF-8, không theo số ký tự", () => {
    const layout = productionLike()
    // 200.000 ký tự có dấu x 3 byte vượt 512 KB, dù số ký tự (200.000) nhỏ hơn 512.000.
    ;(layout.charts[0] as Record<string, unknown>).padding = "ạ".repeat(200_000)
    expect(fromTradingViewLayout(layout).chartsDropped).toBe(true)
  })
})
