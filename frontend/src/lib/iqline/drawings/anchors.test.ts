/**
 * Điểm neo giữ theo khoá ổn định (`time` ở market, `session` ở flashback); chỉ số chỉ tính khi vẽ (docs/iqline-design.md §4, §17).
 * Nạp thêm lịch sử và đổi khung thời gian không được làm lệch hình.
 */
import { describe, expect, it } from "vitest"

import { evenTimes, makeCoords } from "./__fixtures__/coords"
import { TOOL_SPECS, anchorFromPoint, drawingCommands, drawingsReducer, hitDrawing, hitHandle, INITIAL_DRAWINGS, moveHandle, resolveAnchors } from "./index"
import type { Anchor, Drawing } from "../types"

const DAY = 86_400
const START = 1_700_000_000
const PLOT = { left: 0, top: 0, right: 600, bottom: 300 }
const PRICE = { low: 0, high: 100 }

function trendAt(times: readonly number[], a: number, b: number): Drawing {
  return {
    id: "d1",
    tool: "trend",
    anchors: [
      { time: times[a], price: 30 },
      { time: times[b], price: 70 },
    ],
    style: TOOL_SPECS.trend.defaultStyle,
  }
}

describe("nạp thêm lịch sử (§7: dịch viewport đúng số nến vừa thêm)", () => {
  const times = evenTimes(200, START, DAY)
  const older = evenTimes(100, START - 100 * DAY, DAY)
  const merged = [...older, ...times]
  const before = makeCoords({ times, viewport: { from: 100, to: 160 }, plot: PLOT, price: PRICE })
  const after = makeCoords({ times: merged, viewport: { from: 200, to: 260 }, plot: PLOT, price: PRICE })

  it("lệnh vẽ giống hệt nhau trước và sau khi nạp 100 nến cũ, dù chỉ số của mọi nến đã đổi", () => {
    const drawing = trendAt(times, 120, 140)
    expect(drawingCommands([drawing], after)).toEqual(drawingCommands([drawing], before))
    expect(before.indexOfAnchor(drawing.anchors[0])).toBeCloseTo(120, 9)
    expect(after.indexOfAnchor(drawing.anchors[0])).toBeCloseTo(220, 9)
  })

  it("chọn hình và bắt tay nắm cho cùng kết quả ở cùng vị trí màn hình", () => {
    const drawing = trendAt(times, 120, 140)
    const mid = { x: (before.xOfIndex(120) + before.xOfIndex(140)) / 2, y: before.yOfPrice(50) }
    expect(hitDrawing([drawing], mid, before)?.id).toBe("d1")
    expect(hitDrawing([drawing], mid, after)?.id).toBe("d1")
    const end = { x: before.xOfIndex(140) + 2, y: before.yOfPrice(70) }
    expect(hitHandle(drawing, end, before)).toBe(1)
    expect(hitHandle(drawing, end, after)).toBe(1)
  })

  it("điểm neo vẽ sau khi nạp thêm cho cùng `time` như trước khi nạp, và chỉ có hai khoá time, price", () => {
    const point = { x: before.xOfIndex(130), y: before.yOfPrice(40) }
    const a = anchorFromPoint(point, before)
    const b = anchorFromPoint(point, after)
    expect(Object.keys(a)).toEqual(["time", "price"])
    expect("time" in a && "time" in b && a.time).toBeCloseTo("time" in b ? b.time : 0, 6)
  })

  it("điểm neo ở vùng tương lai vẫn đúng khi có nến thật nối vào", () => {
    const future = { time: times[199] + 5 * DAY, price: 50 }
    const grown = [...times, ...evenTimes(10, times[199] + DAY, DAY)]
    const sparse = makeCoords({ times, viewport: { from: 150, to: 215 }, plot: PLOT, price: PRICE })
    const dense = makeCoords({ times: grown, viewport: { from: 150, to: 215 }, plot: PLOT, price: PRICE })
    expect(sparse.xOfIndex(sparse.indexOfAnchor(future) ?? NaN)).toBeCloseTo(dense.xOfIndex(dense.indexOfAnchor(future) ?? NaN), 6)
    expect(dense.indexOfAnchor(future)).toBeCloseTo(204, 9)
  })
})

describe("đổi khung thời gian", () => {
  const daily = evenTimes(500, START, DAY)
  const weekly = evenTimes(100, START, 5 * DAY)
  const inDaily = makeCoords({ times: daily, viewport: { from: 100, to: 160 }, plot: PLOT, price: PRICE })
  const inWeekly = makeCoords({ times: weekly, viewport: { from: 20, to: 32 }, plot: PLOT, price: PRICE })

  it("điểm neo thuộc khung khác vẫn nằm đúng thời điểm: x tỷ lệ với `time`, không với chỉ số", () => {
    // Nến ngày 120 là đầu nến tuần 24 (120 / 5); nến ngày 123 nằm 0,6 nến tuần sau đó.
    expect(inWeekly.indexOfAnchor({ time: daily[120], price: 1 })).toBeCloseTo(24, 9)
    expect(inWeekly.indexOfAnchor({ time: daily[123], price: 1 })).toBeCloseTo(24.6, 9)
    expect(inDaily.indexOfAnchor({ time: daily[123], price: 1 })).toBeCloseTo(123, 9)
  })

  it("kéo một tay nắm ở khung tuần giữ nguyên điểm neo còn lại (cùng tham chiếu, không làm tròn) và đúng thời điểm khi quay về khung ngày", () => {
    const drawing = trendAt(daily, 123, 143)
    const target = { x: inWeekly.xOfIndex(28.4), y: inWeekly.yOfPrice(80) }
    const moved = moveHandle(drawing, 1, target, inWeekly)
    expect(moved.anchors[0]).toBe(drawing.anchors[0])
    expect(Object.keys(moved.anchors[1])).toEqual(["time", "price"])
    const movedTime = (moved.anchors[1] as { time: number }).time
    // Chỉ số tuần 28,4 là ngày 142: đúng 28,4 x 5 = 142.
    expect(movedTime).toBeCloseTo(daily[142], 4)
    expect(inDaily.indexOfAnchor(moved.anchors[1])).toBeCloseTo(142, 6)
    expect(moved.anchors[1].price).toBeCloseTo(80, 9)
  })

  it("hình vẽ ở khung ngày hiện lại đúng chỗ sau một vòng ngày, tuần, ngày", () => {
    const drawing = trendAt(daily, 123, 143)
    const first = resolveAnchors(drawing.anchors, inDaily)
    expect(resolveAnchors(drawing.anchors, inWeekly)).not.toEqual(first)
    expect(resolveAnchors(drawing.anchors, inDaily)).toEqual(first)
  })
})

describe("flashback: điểm neo theo phiên", () => {
  const coordsFor = (from: number, to: number) => makeCoords({ mode: "session", viewport: { from, to }, plot: PLOT, price: PRICE })
  const drawing: Drawing = {
    id: "d1",
    tool: "fib-retracement",
    anchors: [
      { session: 30, price: 40 },
      { session: 50, price: 80 },
    ],
    style: TOOL_SPECS["fib-retracement"].defaultStyle,
  }

  it("zoom và kéo đổi vị trí màn hình nhưng không đổi điểm neo; hình luôn đi theo phiên", () => {
    const wide = coordsFor(20, 80)
    const zoomed = coordsFor(25, 45)
    expect(resolveAnchors(drawing.anchors, zoomed)?.[0].x).toBeCloseTo(zoomed.xOfIndex(30), 9)
    expect(resolveAnchors(drawing.anchors, wide)?.[0].x).toBeCloseTo(wide.xOfIndex(30), 9)
    expect(zoomed.xOfIndex(30)).not.toBeCloseTo(wide.xOfIndex(30), 3)
    const hit = { x: zoomed.xOfIndex(40), y: zoomed.yOfPrice(60) }
    expect(hitDrawing([drawing], hit, zoomed)?.id).toBe("d1")
  })

  it("điểm neo mới của Flashback là {session, price}, không bao giờ có trường thời gian", () => {
    const coords = coordsFor(20, 80)
    const anchor = anchorFromPoint({ x: 100, y: 100 }, coords)
    expect(Object.keys(anchor).sort()).toEqual(["price", "session"])
    let state = drawingsReducer(INITIAL_DRAWINGS, { type: "tool", tool: "trend" })
    state = drawingsReducer(state, { type: "anchor", anchor })
    state = drawingsReducer(state, { type: "anchor", anchor: anchorFromPoint({ x: 300, y: 200 }, coords) })
    for (const placed of state.shapes[0].anchors as Anchor[]) expect("time" in placed).toBe(false)
    expect(JSON.stringify(state.shapes)).not.toContain("time")
  })
})
