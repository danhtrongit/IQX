/**
 * Phần thuần của thẻ nến trong ván Flashback (Candle Dojo §9): danh sách thẻ, hình học khung, xếp nhãn và chỗ đặt thẻ bật lên.
 */
import { describe, expect, it } from "vitest"

import type { ChartFrame } from "@/lib/iqline/scene/model"

import {
  BOX_PAD,
  LABEL_HEIGHT,
  appendSnapshotCard,
  cardBox,
  cardRange,
  flightVector,
  labelWidth,
  layoutLabels,
  metCardsOf,
  placePopup,
  popupWidthFor,
  withAlpha,
  type CardBox,
  type CardProjection,
  type MetCard,
} from "./flashback-cards-model"
import { frameToCardProjection } from "./flashback-iqline-adapter"

/** Biểu đồ giả: nến `i` có tâm ở x = 10 (i - 50) (rộng 10), giá y = 400 - giá. Khung giá 0..400 theo y, 0..600 theo x. */
const PROJECTION: CardProjection = {
  xOfIndex: (index) => (index - 50) * 10,
  yOfPrice: (price) => 400 - price,
  barPx: 10,
  plot: { left: 0, top: 0, right: 600, bottom: 400 },
}

/** 70 nến: 60 phiên xem và 10 phiên chơi; nến `i` cao `100 + i`, thấp `50 + i`. */
const BARS = Array.from({ length: 70 }, (_, index) => ({ high: 100 + index, low: 50 + index }))

const card = (cardId: string, n: number, playIdx: number): MetCard => ({ cardId, n, playIdx })

describe("thẻ đã gặp theo thứ tự gặp", () => {
  it("sắp theo phiên tăng dần, bỏ thẻ không có trong danh mục, phiên sai và trùng phiên", () => {
    const cards = metCardsOf([
      { card_id: "doji", card_n: 1, play_idx: 5 },
      { card_id: "nhan_chim_tang", card_n: 2, play_idx: 2 },
      { card_id: "khong_co", card_n: 1, play_idx: 3 },
      { card_id: "bua", card_n: 1, play_idx: 0 },
      { card_id: "bua", card_n: 0, play_idx: 4 },
      { card_id: "marubozu_tang", card_n: 1, play_idx: 5 },
    ])
    expect(cards).toEqual([card("nhan_chim_tang", 2, 2), card("marubozu_tang", 1, 5)])
    expect(metCardsOf(undefined)).toEqual([])
  })

  it("thẻ vừa gặp được thêm vào danh sách của ảnh chụp, không nhân đôi khi gặp lại cùng phiên", () => {
    const once = appendSnapshotCard([{ card_id: "doji", card_n: 1, play_idx: 1 }], { id: "bua", n: 1 }, 3)
    expect(once.map((item) => item.play_idx)).toEqual([1, 3])
    const twice = appendSnapshotCard(once, { id: "doji", n: 1 }, 3)
    expect(twice).toEqual([
      { card_id: "doji", card_n: 1, play_idx: 1 },
      { card_id: "doji", card_n: 1, play_idx: 3 },
    ])
    expect(appendSnapshotCard(undefined, { id: "doji", n: 1 }, 1)).toHaveLength(1)
  })
})

describe("dải nến và khung của mẫu", () => {
  it("phiên k là nến viewBars - 1 + k; mẫu n nến kết thúc ở đó và gồm n nến liền trước", () => {
    expect(cardRange(card("nhan_chim_tang", 2, 3), 60, 70)).toEqual({ first: 61, last: 62 })
    expect(cardRange(card("doji", 1, 1), 60, 70)).toEqual({ first: 60, last: 60 })
    // Mẫu có thể bắt đầu ngay trong các phiên xem.
    expect(cardRange(card("sao_mai", 3, 1), 60, 70)).toEqual({ first: 58, last: 60 })
  })

  it("không vượt trước nến đầu tiên, và không có dải khi nến cuối của mẫu chưa có trong danh sách", () => {
    expect(cardRange(card("thap_day", 5, 1), 3, 10)).toEqual({ first: 0, last: 3 })
    expect(cardRange(card("doji", 1, 12), 60, 70)).toBeNull()
  })

  it("khung bao đúng các nến của mẫu, cao từ đỉnh cao nhất tới đáy thấp nhất, chừa 5px mỗi phía", () => {
    // Hai nến 61 và 62: nến 62 cao 162 thấp 112; nến 61 cao 161 thấp 111.
    const box = cardBox(card("nhan_chim_tang", 2, 3), BARS, 60, PROJECTION)
    expect(box).not.toBeNull()
    expect(BOX_PAD).toBe(5)
    expect(box).toMatchObject({ playIdx: 3, first: 61, last: 62, tier: 2, name: "Bullish Engulfing" })
    // Ngang: từ mép trái nến 61 tới mép phải nến 62 (tâm 110 và 120, nửa bề rộng 5).
    expect(box!.left).toBe(105)
    expect(box!.right).toBe(125)
    // Dọc: đỉnh cao nhất 162 ở y = 238, đáy thấp nhất 111 ở y = 289, mỗi phía chừa 5px.
    expect(box!.top).toBe(400 - 162 - 5)
    expect(box!.bottom).toBe(400 - 111 + 5)
  })

  it("khung của mẫu nhiều nến lấy đỉnh và đáy của cả dải, hai mẫu chồng nhau cho hai khung chồng nhau", () => {
    const wide = cardBox(card("sao_mai", 3, 4), BARS, 60, PROJECTION)!
    expect([wide.first, wide.last]).toEqual([61, 63])
    expect(wide.top).toBe(400 - 163 - 5)
    expect(wide.bottom).toBe(400 - 111 + 5)
    const inner = cardBox(card("doji", 1, 4), BARS, 60, PROJECTION)!
    // Khung đơn nằm lọt trong khung ba nến: cả hai cùng tồn tại.
    expect(inner.left).toBeGreaterThanOrEqual(wide.left)
    expect(inner.right).toBeLessThanOrEqual(wide.right)
  })

  it("khung ngoài khung giá (đã zoom đi nơi khác) thì bỏ; khung chạm mép thì căn giữa theo phần còn thấy", () => {
    const zoomed: CardProjection = { ...PROJECTION, xOfIndex: (index) => (index - 50) * 10 + 5000 }
    expect(cardBox(card("doji", 1, 1), BARS, 60, zoomed)).toBeNull()
    const edge: CardProjection = { ...PROJECTION, xOfIndex: (index) => (index - 61) * 10 }
    const box = cardBox(card("nhan_chim_tang", 2, 3), BARS, 60, edge)!
    expect(box.left).toBeLessThan(0)
    expect(box.centerX).toBeGreaterThan(0)
    expect(box.centerX).toBe((0 + box.right) / 2)
  })

  it("khung hình IQLine đổi thành phép đổi toạ độ: tâm nến, giá, bề rộng nến và khung giá của ô giá", () => {
    const frame = {
      plot: { left: 0, right: 700, width: 700 },
      barPx: 9.5,
      price: {
        box: { top: 4, height: 320 },
        coords: { xOfIndex: (index: number) => index * 9.5, yOfPrice: (price: number) => 324 - price },
      },
    } as unknown as ChartFrame
    const projection = frameToCardProjection(frame)
    expect(projection.barPx).toBe(9.5)
    expect(projection.plot).toEqual({ left: 0, top: 4, right: 700, bottom: 324 })
    expect(projection.xOfIndex(10)).toBe(95)
    expect(projection.yOfPrice(100)).toBe(224)
  })
})

function box(playIdx: number, centerX: number, top: number, name = "Bullish Engulfing"): CardBox {
  return { playIdx, cardId: "nhan_chim_tang", tier: 2, name, first: 0, last: 0, left: centerX - 10, right: centerX + 10, top, bottom: top + 60, centerX }
}

describe("nhãn tên của các khung", () => {
  const plot = { left: 0, top: 0, right: 600, bottom: 400 }

  it("3 thẻ gần nhất có nhãn viên thuốc phía trên khung, thẻ cũ hơn thu thành chấm tròn ở đỉnh khung", () => {
    const boxes = [box(1, 100, 200), box(2, 200, 200), box(3, 300, 200), box(4, 400, 200), box(5, 500, 200)]
    const labels = layoutLabels(boxes, plot)
    expect(labels.map((item) => item.kind)).toEqual(["dot", "dot", "pill", "pill", "pill"])
    const dot = labels[0]
    expect(dot).toMatchObject({ kind: "dot", x: 100, radius: 4 })
    expect(dot.y).toBeLessThan(200)
    const pill = labels[4]
    expect(pill.kind === "pill" && pill.y + pill.height).toBeLessThan(200)
  })

  it("nhãn chồng nhau thì nhãn sau đẩy lên trên, hai nhãn không bao giờ đè nhau", () => {
    const labels = layoutLabels([box(1, 300, 300), box(2, 305, 300), box(3, 310, 300)], plot)
    const pills = labels.filter((item) => item.kind === "pill")
    expect(pills).toHaveLength(3)
    const ys = pills.map((item) => item.y)
    expect(ys[1]).toBeLessThan(ys[0])
    expect(ys[2]).toBeLessThan(ys[1])
    for (let a = 0; a < pills.length; a += 1) {
      for (let b = a + 1; b < pills.length; b += 1) expect(Math.abs(pills[a].y - pills[b].y)).toBeGreaterThanOrEqual(LABEL_HEIGHT)
    }
  })

  it("nhãn xa nhau theo chiều ngang thì cùng một hàng", () => {
    const [first, second] = layoutLabels([box(1, 80, 300), box(2, 500, 300)], plot)
    expect(first.y).toBe(second.y)
  })

  it("không ra ngoài khung giá: đỉnh khung sát mép trên thì nhãn kẹt ở mép trên, nhãn sát mép phải thì lùi vào", () => {
    const labels = layoutLabels([box(1, 590, 4)], plot)
    const pill = labels[0]
    expect(pill.kind).toBe("pill")
    if (pill.kind !== "pill") return
    expect(pill.y).toBeGreaterThanOrEqual(plot.top)
    expect(pill.x + pill.width).toBeLessThanOrEqual(plot.right)
    expect(pill.x).toBeGreaterThanOrEqual(plot.left)
    // Nhãn sát khung thì không cần vạch nối.
    expect(pill.connector).toBeNull()
  })

  it("nhãn cách khung thì có vạch mảnh nối xuống đỉnh khung", () => {
    const [first, second] = layoutLabels([box(1, 300, 300), box(2, 305, 300)], plot)
    if (first.kind !== "pill" || second.kind !== "pill") throw new Error("phải là nhãn")
    expect(first.connector).not.toBeNull()
    // Nhãn bị đẩy lên thì vạch dài hơn, vẫn kết thúc đúng đỉnh khung.
    expect(second.connector!.bottom).toBe(300)
    expect(second.connector!.top - second.connector!.bottom).toBeLessThan(first.connector!.top - first.connector!.bottom)
    expect(labelWidth("Doji")).toBeLessThan(labelWidth("Concealing Baby Swallow"))
  })
})

describe("chỗ đặt thẻ bật lên và đường bay vào khay", () => {
  const viewport = { width: 1280, height: 800 }
  const size = { width: 104, height: 145.6 }

  it("ngay phía trên khung của mẫu, căn giữa", () => {
    const place = placePopup({ left: 600, top: 400, width: 40, height: 60 }, size, viewport)
    expect(place.below).toBe(false)
    expect(place.left).toBe(600 + 20 - 52)
    expect(place.top).toBeLessThan(400 - size.height)
  })

  it("phía trên không đủ chỗ thì hiện phía dưới khung", () => {
    const place = placePopup({ left: 600, top: 60, width: 40, height: 60 }, size, viewport)
    expect(place.below).toBe(true)
    expect(place.top).toBeGreaterThan(120)
  })

  it("không bao giờ ra ngoài màn hình, kể cả khung sát mép phải, mép trái hay mép dưới", () => {
    const right = placePopup({ left: 1270, top: 400, width: 20, height: 20 }, size, viewport)
    expect(right.left + size.width).toBeLessThanOrEqual(viewport.width)
    const left = placePopup({ left: -50, top: 400, width: 20, height: 20 }, size, viewport)
    expect(left.left).toBeGreaterThanOrEqual(0)
    const bottom = placePopup({ left: 600, top: 10, width: 20, height: 900 }, size, viewport)
    expect(bottom.top + size.height).toBeLessThanOrEqual(viewport.height)
    expect(bottom.top).toBeGreaterThanOrEqual(0)
  })

  it("cỡ thẻ bật lên theo thiết bị: 104px máy tính, 84px điện thoại", () => {
    expect(popupWidthFor(1280)).toBe(104)
    expect(popupWidthFor(390)).toBe(84)
  })

  it("thẻ bay thẳng vào tâm ô đích và thu về đúng cỡ ô; chưa đo được ô đích thì thu về 52px", () => {
    const from = { left: 500, top: 200, width: 104, height: 145.6 }
    const to = { left: 100, top: 700, width: 52, height: 72.8 }
    const vector = flightVector(from, to)
    expect(vector.scale).toBeCloseTo(0.5, 5)
    expect(vector.dx).toBeCloseTo(100 + 26 - (500 + 52), 5)
    expect(vector.dy).toBeCloseTo(700 + 36.4 - (200 + 72.8), 5)
    expect(flightVector(from, { left: 0, top: 0, width: 0, height: 0 }).scale).toBeCloseTo(0.5, 5)
  })

  it("màu khung trong suốt theo độ đậm", () => {
    expect(withAlpha("#8B4DF0", 0.16)).toBe("rgba(139,77,240,0.16)")
  })
})
