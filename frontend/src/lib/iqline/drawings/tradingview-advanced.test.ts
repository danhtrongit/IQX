/**
 * Chuyển layout TradingView sang chín công cụ vẽ đợt 2 (§11). Mẫu TỰ VIẾT theo đúng cấu trúc các công cụ đã có trong
 * `tradingview.test.ts` (`points[]` gồm `time_t`, `offset`, `price`; kiểu nét ở `state`), mã giả và giá giả.
 * CHƯA thử trên layout TradingView thật: tên loại và số điểm lấy theo tên công cụ công khai, chưa đối chiếu với một layout xuất từ widget.
 */
import { describe, expect, it } from "vitest"

import { fromTradingViewLayout } from "./index"
import { ADVANCED_TOOLS, type AdvancedTool } from "./tools-advanced"
import { anchorCountOf } from "./tools"

const T0 = 1_700_000_400 // thứ tư 2023-11-15, trong tuần giao dịch
const DAY = 86_400

type Point = { time_t: number; offset?: number; price: number; interval?: string }

const main = () => ({ type: "MainSeries", id: "_seriesId", state: { style: 1, interval: "D", symbol: "AAA" } })
const line = (type: string, points: Point[], state: Record<string, unknown> = {}, id = `ln-${type}`) => ({
  type,
  id,
  state: { symbol: "AAA", interval: "D", ...state },
  points,
  ownerSourceId: "_seriesId",
})
const layout = (sources: unknown[], extraPanes: unknown[] = []) => ({ layout: "s", charts: [{ version: 2, panes: [{ sources }, ...extraPanes] }] })
/** `count` điểm cách nhau 2 ngày lịch, giá tăng dần, để kiểm thứ tự điểm neo. */
const points = (count: number): Point[] => Array.from({ length: count }, (_, index) => ({ time_t: T0 + index * 2 * DAY, price: 20 + index * 1.5 }))

/** Loại TradingView -> công cụ IQLine mong đợi. */
const MAPPING: readonly [string, AdvancedTool][] = [
  ["LineToolFibTimeZone", "fib-time-zones"],
  ["LineToolFibSpeedResistanceFan", "fib-fan"],
  ["LineToolFibChannel", "fib-channel"],
  ["LineToolPitchfork", "pitchfork"],
  ["LineToolGannFan", "gann-fan"],
  ["LineToolGannComplex", "gann-box"],
  ["LineToolGannSquare", "gann-box"],
  ["LineTool5PointsPattern", "xabcd"],
  ["LineToolHeadAndShoulders", "head-shoulders"],
  ["LineToolTrianglePattern", "triangle-pattern"],
]

describe("layout TradingView: chín công cụ đợt 2", () => {
  it("mỗi loại chuyển đúng công cụ, đủ số điểm, giữ thứ tự và giá của từng điểm", () => {
    const sources = MAPPING.map(([type, tool], index) => line(type, points(anchorCountOf(tool)), {}, `s${index}`))
    const result = fromTradingViewLayout(layout([main(), ...sources]))
    expect(result.skippedDrawings).toBe(0)
    expect(result.convertedDrawings).toBe(MAPPING.length)
    const drawings = result.document.iqline.drawings
    expect(drawings.map((drawing) => drawing.tool)).toEqual(MAPPING.map(([, tool]) => tool))
    expect(drawings.map((drawing) => drawing.id)).toEqual(MAPPING.map((_, index) => `tv-s${index}`))
    for (const drawing of drawings) {
      expect(drawing.anchors, drawing.tool).toHaveLength(anchorCountOf(drawing.tool))
      drawing.anchors.forEach((anchor, index) => expect(anchor).toEqual({ time: T0 + index * 2 * DAY, price: 20 + index * 1.5 }))
    }
    expect(new Set(ADVANCED_TOOLS.filter((tool) => drawings.some((drawing) => drawing.tool === tool))).size).toBe(ADVANCED_TOOLS.length)
  })

  it("số điểm đúng theo công cụ: 2, 2, 3, 3, 2, 2, 5, 7, 4", () => {
    expect(ADVANCED_TOOLS.map(anchorCountOf)).toEqual([2, 2, 3, 3, 2, 2, 5, 7, 4])
  })

  it("điểm thừa bị cắt, điểm thiếu thì bỏ hình và đếm theo tên loại TradingView", () => {
    const sources = [
      line("LineTool5PointsPattern", points(6), {}, "extra"),
      line("LineToolHeadAndShoulders", points(6), {}, "short"),
      line("LineToolTrianglePattern", points(3), {}, "short2"),
      line("LineToolHeadAndShoulders", points(7), {}, "ok"),
    ]
    const result = fromTradingViewLayout(layout([main(), ...sources]))
    expect(result.document.iqline.drawings.map((drawing) => [drawing.id, drawing.anchors.length])).toEqual([
      ["tv-extra", 5],
      ["tv-ok", 7],
    ])
    expect(result.skippedDrawings).toBe(2)
    expect(result.skippedByType).toEqual({ LineToolHeadAndShoulders: 1, LineToolTrianglePattern: 1 })
  })

  it("điểm ở vùng tương lai: offset cộng theo nến ngày (bỏ cuối tuần), như các công cụ đã có", () => {
    // Thứ tư + 3 nến ngày = thứ hai tuần sau, tức 5 ngày lịch.
    const source = line("LineToolFibTimeZone", [{ time_t: T0, price: 24 }, { time_t: T0, offset: 3, price: 26 }])
    const [drawing] = fromTradingViewLayout(layout([main(), source])).document.iqline.drawings
    expect(drawing.tool).toBe("fib-time-zones")
    expect(drawing.anchors).toEqual([{ time: T0, price: 24 }, { time: T0 + 5 * DAY, price: 26 }])
  })

  it("khung phút: time_t cộng offset x bước của khung", () => {
    const source = line("LineToolGannFan", [{ time_t: T0, price: 24 }, { time_t: T0, offset: 10, price: 28 }], { interval: "15" })
    const [drawing] = fromTradingViewLayout(layout([{ ...main(), state: { style: 1, interval: "15" } }, source])).document.iqline.drawings
    expect(drawing.anchors[1]).toEqual({ time: T0 + 10 * 15 * 60, price: 28 })
  })

  it("giữ khoá, ẩn, độ dày, nét đứt; tắt nền khi TradingView tắt `fillBackground`", () => {
    const sources = [
      line("LineToolFibChannel", points(3), { frozen: true, linewidth: 3, linestyle: 2 }, "a"),
      line("LineToolPitchfork", points(3), { visible: false, fillBackground: false }, "b"),
      line("LineTool5PointsPattern", points(5), { fillBackground: true }, "c"),
      line("LineToolFibSpeedResistanceFan", points(2), { linewidth: 9 }, "d"),
    ]
    const [a, b, c, d] = fromTradingViewLayout(layout([main(), ...sources])).document.iqline.drawings
    expect(a.locked).toBe(true)
    expect(a.style).toMatchObject({ width: 3, dash: "dashed", fill: true })
    expect(b.hidden).toBe(true)
    expect(b.style.fill).toBe(false)
    expect(c.style.fill).toBe(true)
    expect(c.locked).toBeUndefined()
    expect(d.style.width).toBe(4)
  })

  it("biến thể Pitchfork khác (Schiff, Schiff cải tiến, bên trong) và Gann cố định chưa có tương ứng nên bị bỏ và đếm", () => {
    const sources = ["LineToolSchiffPitchfork", "LineToolSchiffPitchfork2", "LineToolInsidePitchfork", "LineToolGannFixed"].map((type) => line(type, points(3)))
    const result = fromTradingViewLayout(layout([main(), ...sources]))
    expect(result.document.iqline.drawings).toEqual([])
    expect(result.skippedDrawings).toBe(4)
    expect(Object.keys(result.skippedByType).sort()).toEqual(["LineToolGannFixed", "LineToolInsidePitchfork", "LineToolSchiffPitchfork", "LineToolSchiffPitchfork2"])
  })

  it("điểm hỏng (không phải số, thiếu time_t, offset vô lý) thì bỏ hình, hình khác vẫn chuyển", () => {
    const broken = points(4)
    broken[2] = { time_t: Number.NaN, price: 3 }
    const noTime = points(3).map((point, index) => (index === 1 ? ({ price: 4 } as Point) : point))
    const hugeOffset = points(2).map((point, index) => (index === 1 ? { ...point, offset: 9_999_999 } : point))
    const sources = [
      line("LineToolTrianglePattern", broken, {}, "nan"),
      line("LineToolFibChannel", noTime, {}, "notime"),
      line("LineToolFibTimeZone", hugeOffset, {}, "huge"),
      line("LineToolGannFan", points(2), {}, "good"),
    ]
    const result = fromTradingViewLayout(layout([main(), ...sources]))
    expect(result.document.iqline.drawings.map((drawing) => drawing.id)).toEqual(["tv-good"])
    expect(result.skippedDrawings).toBe(3)
  })

  it("hình nằm ở ô chỉ báo (không có MainSeries) vẫn bị bỏ vì đơn vị khác với giá", () => {
    const pane = { sources: [line("LineToolXabcdIndicatorPane", points(5)), line("LineTool5PointsPattern", points(5), {}, "in-pane")] }
    const result = fromTradingViewLayout(layout([main(), line("LineToolFibChannel", points(3), {}, "main-pane")], [pane]))
    expect(result.document.iqline.drawings.map((drawing) => drawing.id)).toEqual(["tv-main-pane"])
    expect(result.skippedDrawings).toBe(2)
  })

  it("không sửa dữ liệu vào, và chạy lại cho cùng kết quả", () => {
    const state = layout([main(), ...MAPPING.map(([type, tool], index) => line(type, points(anchorCountOf(tool)), {}, `s${index}`))])
    const snapshot = JSON.stringify(state)
    const first = fromTradingViewLayout(state)
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(fromTradingViewLayout(state).document.iqline.drawings).toEqual(first.document.iqline.drawings)
  })
})
