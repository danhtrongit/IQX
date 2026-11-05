/** Nam châm ba mức của `snapToOhlc` và `anchorFromPoint`: tắt, yếu (trong ngưỡng) và mạnh (luôn hút về nến gần nhất). */
import { describe, expect, it } from "vitest"

import { makeCoords } from "./__fixtures__/coords"
import { SNAP_TOLERANCE, anchorFromPoint, normalizeMagnet, snapToOhlc } from "./index"
import type { Bar } from "../types"

// 10px mỗi phiên, tâm nến ở (phiên + 0,5) x 10; giá 0-300 trên khung 300px nên y = 300 - giá.
const COORDS = makeCoords({ mode: "session", viewport: { from: -0.5, to: 49.5 }, plot: { left: 0, top: 0, right: 500, bottom: 300 }, price: { low: 0, high: 300 } })
const px = (session: number) => (session + 0.5) * 10
const bar = (open: number, high: number, low: number, close: number): Bar => ({ open, high, low, close, volume: 1 })
// Nến 0 và 1 khác nhau để thấy được nến nào được chọn.
const BARS: Bar[] = [bar(100, 140, 90, 120), bar(200, 260, 180, 230), bar(50, 80, 40, 60)]

describe("snapToOhlc: yếu", () => {
  it("hút khi trong ngưỡng, không hút khi xa hơn", () => {
    expect(snapToOhlc({ x: px(0), y: 300 - 140 + 5 }, COORDS, BARS)).toEqual({ index: 0, price: 140, field: "high" })
    expect(snapToOhlc({ x: px(0), y: 300 - 140 - SNAP_TOLERANCE - 1 }, COORDS, BARS)).toBeNull()
    expect(snapToOhlc({ x: px(0), y: 300 - 140 + 5 }, COORDS, BARS, SNAP_TOLERANCE, "weak")).toEqual({ index: 0, price: 140, field: "high" })
  })

  it("con trỏ ngoài vùng có nến thì không hút", () => {
    expect(snapToOhlc({ x: px(5), y: 100 }, COORDS, BARS)).toBeNull()
    expect(snapToOhlc({ x: px(-3), y: 100 }, COORDS, BARS)).toBeNull()
  })

  it("không có nến thì không hút", () => {
    expect(snapToOhlc({ x: 50, y: 100 }, COORDS, [])).toBeNull()
    expect(snapToOhlc({ x: 50, y: 100 }, COORDS, [], SNAP_TOLERANCE, "strong")).toBeNull()
  })
})

describe("snapToOhlc: mạnh", () => {
  it("luôn hút về giá gần nhất của nến dưới con trỏ, dù xa hơn ngưỡng", () => {
    expect(snapToOhlc({ x: px(0), y: 0 }, COORDS, BARS, SNAP_TOLERANCE, "strong")).toEqual({ index: 0, price: 140, field: "high" })
    expect(snapToOhlc({ x: px(0), y: 299 }, COORDS, BARS, SNAP_TOLERANCE, "strong")).toEqual({ index: 0, price: 90, field: "low" })
    expect(snapToOhlc({ x: px(1), y: 300 - 215 }, COORDS, BARS, SNAP_TOLERANCE, "strong")).toEqual({ index: 1, price: 230, field: "close" })
  })

  it("ngoài vùng có nến thì hút về nến gần nhất ở hai đầu", () => {
    expect(snapToOhlc({ x: px(20), y: 300 - 70 }, COORDS, BARS, SNAP_TOLERANCE, "strong")).toMatchObject({ index: 2, price: 60 })
    expect(snapToOhlc({ x: px(-6), y: 300 - 95 }, COORDS, BARS, SNAP_TOLERANCE, "strong")).toMatchObject({ index: 0, price: 90 })
  })

  it("bỏ qua giá không hữu hạn, vẫn hút về giá còn lại", () => {
    const broken: Bar[] = [{ open: NaN, high: 140, low: 90, close: NaN, volume: 1 }]
    expect(snapToOhlc({ x: px(0), y: 0 }, COORDS, broken, SNAP_TOLERANCE, "strong")).toMatchObject({ price: 140 })
  })
})

describe("anchorFromPoint theo chế độ nam châm", () => {
  const point = { x: px(1), y: 300 - 215 }
  it("tắt: giữ nguyên điểm bấm; yếu: xa ngưỡng thì giữ; mạnh: hút", () => {
    expect(anchorFromPoint(point, COORDS).price).toBeCloseTo(215, 6)
    expect(anchorFromPoint(point, COORDS, { snap: { bars: BARS } }).price).toBeCloseTo(215, 6)
    expect(anchorFromPoint(point, COORDS, { snap: { bars: BARS, strength: "weak" } }).price).toBeCloseTo(215, 6)
    expect(anchorFromPoint(point, COORDS, { snap: { bars: BARS, strength: "strong" } })).toEqual({ session: 1, price: 230 })
  })

  it("mạnh hút cả chỉ số về tâm nến", () => {
    const off = { x: px(1) + 3, y: point.y }
    const anchor = anchorFromPoint(off, COORDS, { snap: { bars: BARS, strength: "strong" } })
    expect(anchor).toEqual({ session: 1, price: 230 })
  })
})

describe("normalizeMagnet", () => {
  it("true của layout cũ thành yếu, false và giá trị lạ thành tắt", () => {
    expect(normalizeMagnet(true)).toBe("weak")
    expect(normalizeMagnet(false)).toBe("off")
    expect(normalizeMagnet("weak")).toBe("weak")
    expect(normalizeMagnet("strong")).toBe("strong")
    expect(normalizeMagnet("off")).toBe("off")
    for (const bad of [undefined, null, 1, 0, "true", "mạnh", {}, []]) expect(normalizeMagnet(bad)).toBe("off")
  })
})
