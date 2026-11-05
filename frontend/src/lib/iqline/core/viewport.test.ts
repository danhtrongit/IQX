import { describe, expect, it } from "vitest"

import {
  clampViewport,
  defaultViewport,
  fitViewport,
  followAppend,
  panViewport,
  panViewportByPixels,
  prependedCount,
  shiftForPrepend,
  viewportLimits,
  visibleIndexRange,
  zoomViewport,
} from "./viewport"

const market = viewportLimits({ slots: 1000, leftPad: 10, rightPad: 20, plotWidth: 800 })
const flashback = viewportLimits({ slots: 90, leftPad: 0, rightPad: 0, plotWidth: 800 })

describe("viewport: kẹp phạm vi", () => {
  it("giới hạn theo số ô và khoảng trống cho phép", () => {
    expect(market.min).toBe(-10.5)
    expect(market.max).toBe(1019.5)
    expect(market.minSpan).toBeCloseTo(20)
    expect(market.maxSpan).toBe(1030)
  })

  it("kéo quá đầu hoặc cuối thì dừng ở biên và giữ nguyên số nến hiện", () => {
    const left = clampViewport({ from: -500, to: -400 }, market)
    expect(left).toEqual({ from: -10.5, to: 89.5 })
    const right = clampViewport({ from: 5000, to: 5100 }, market)
    expect(right.to).toBe(1019.5)
    expect(right.to - right.from).toBe(100)
  })

  it("zoom bị chặn ở hai đầu: không hiện ít hơn minSpan, không nhiều hơn toàn bộ ô", () => {
    const tight = zoomViewport({ from: 100, to: 200 }, 0.0001, 150, market)
    expect(tight.to - tight.from).toBeCloseTo(market.minSpan)
    const wide = zoomViewport({ from: 100, to: 200 }, 1e6, 150, market)
    expect(wide).toEqual(fitViewport(market))
  })

  it("zoom giữ nguyên vị trí của chỉ số dưới con trỏ", () => {
    const view = { from: 100, to: 200 }
    const next = zoomViewport(view, 0.5, 125, market)
    expect((125 - next.from) / (next.to - next.from)).toBeCloseTo(0.25)
    expect(next.to - next.from).toBeCloseTo(50)
  })

  it("kéo bằng pixel: kéo sang phải thì xem phần cũ hơn", () => {
    const next = panViewportByPixels({ from: 100, to: 200 }, 80, 800, market)
    expect(next.from).toBeCloseTo(90)
    expect(panViewport({ from: 100, to: 200 }, 7, market).from).toBe(107)
  })

  it("mặc định: các nến cuối, chừa ô trống bên phải", () => {
    const view = defaultViewport({ slots: 1000, visible: 120, rightPad: 5 }, market)
    expect(view.to).toBe(1004.5)
    expect(view.to - view.from).toBe(120)
  })
})

describe("viewport: Flashback không kéo ra ngoài các ô đã có", () => {
  it("kéo hết về trái dừng ở nến đầu tiên sau warmup (chỉ số 0), không lộ ô âm", () => {
    const view = panViewport({ from: 40, to: 80 }, -10_000, flashback)
    expect(view.from).toBe(-0.5)
    expect(visibleIndexRange(view, 60)?.first).toBe(0)
  })

  it("kéo hết về phải dừng ở ô cuối của trục, không vượt totalSlots", () => {
    const view = panViewport({ from: 40, to: 80 }, 10_000, flashback)
    expect(view.to).toBe(89.5)
  })

  it("zoom ra tối đa chỉ vừa khít toàn trục", () => {
    expect(zoomViewport({ from: 10, to: 30 }, 100, 20, flashback)).toEqual({ from: -0.5, to: 89.5 })
  })
})

describe("viewport: nạp thêm lịch sử và nến mới", () => {
  it("dịch đúng số nến vừa chèn vào đầu để hình đứng yên", () => {
    expect(shiftForPrepend({ from: 2.5, to: 102.5 }, 300)).toEqual({ from: 302.5, to: 402.5 })
    expect(shiftForPrepend({ from: 1, to: 9 }, 0)).toEqual({ from: 1, to: 9 })
  })

  it("đếm số nến chèn vào đầu theo nến đầu cũ; 0 khi đổi mã hoặc khung", () => {
    const times = [10, 20, 30, 40, 50, 60]
    expect(prependedCount(40, times)).toBe(3)
    expect(prependedCount(10, times)).toBe(0)
    expect(prependedCount(35, times)).toBe(0)
    expect(prependedCount(null, times)).toBe(0)
  })

  it("nến mới ở cuối: đang xem tới nến cuối thì đi theo, đã kéo đi xa thì giữ nguyên", () => {
    expect(followAppend({ from: 80, to: 100.5 }, 100, 101)).toEqual({ from: 81, to: 101.5 })
    expect(followAppend({ from: 10, to: 50 }, 100, 101)).toEqual({ from: 10, to: 50 })
  })
})

describe("visibleIndexRange", () => {
  it("gồm cả nến lộ một phần, kẹp trong dữ liệu", () => {
    expect(visibleIndexRange({ from: 2.6, to: 5.4 }, 100)).toEqual({ first: 3, last: 5 })
    expect(visibleIndexRange({ from: 2.4, to: 5.6 }, 100)).toEqual({ first: 2, last: 6 })
    expect(visibleIndexRange({ from: -10, to: 200 }, 50)).toEqual({ first: 0, last: 49 })
    expect(visibleIndexRange({ from: 60, to: 80 }, 50)).toBeNull()
  })
})
