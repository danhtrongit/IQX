import { describe, expect, it } from "vitest"

import {
  alongLine,
  aroundPoint,
  boxesOverlap,
  inZone,
  labelBox,
  placeLabels,
  polylineSegments,
  segmentHitsBox,
  stackRowLabels,
  type PlacementScene,
} from "./placement"
import { thinAxisLabels, wrapText, type AxisLabel } from "./text"

const bounds = { l: 0, t: 0, r: 300, b: 200 }

describe("đặt nhãn tránh đè", () => {
  it("measures one- and multi-line label boxes from the first baseline", () => {
    const one = labelBox("Mua", 10, 100, 50, "middle")
    expect(one.l).toBeLessThan(100)
    expect(one.r).toBeGreaterThan(100)
    const two = labelBox(["Vùng mua", "đến +5%"], 10, 100, 50, "start")
    expect(two.l).toBeLessThan(100)
    expect(two.b - two.t).toBeGreaterThan(one.b - one.t + 10)
  })

  it("detects a segment crossing a box and ignores one passing by", () => {
    const box = { l: 10, t: 10, r: 50, b: 20 }
    expect(segmentHitsBox({ x1: 0, y1: 0, x2: 60, y2: 30 }, box)).toBe(true)
    expect(segmentHitsBox({ x1: 0, y1: 30, x2: 60, y2: 30 }, box)).toBe(false)
    expect(segmentHitsBox({ x1: 0, y1: 0, x2: 5, y2: 40 }, box)).toBe(false)
  })

  it("moves a label off the series it would sit on", () => {
    // A horizontal price line at y = 100 runs through the preferred spot to the right of the point.
    const scene: PlacementScene = { bounds, segments: polylineSegments([[0, 104], [300, 104]], 60), obstacles: [] }
    const [placed] = placeLabels([{ key: "a", text: "Mua", size: 11, candidates: aroundPoint(150, 104, 8, 11, "right") }], scene)
    expect(scene.segments.some((segment) => segmentHitsBox(segment, placed.box))).toBe(false)
  })

  it("keeps two labels apart, inside the plot, and lets one give way when both want the same spot", () => {
    const scene: PlacementScene = { bounds, segments: [], obstacles: [] }
    const placed = placeLabels(
      [
        { key: "level", owner: "level", text: "Điểm mua · 50.000", size: 10.5, candidates: alongLine(100, 0, 300, 10.5, "start") },
        { key: "zone", text: "Vùng mua · từ điểm mua đến +5%", size: 10.5, candidates: inZone(80, 100, 0, 300, 10.5) },
      ],
      scene,
    )
    expect(placed.map((label) => label.key)).toEqual(["level", "zone"])
    expect(boxesOverlap(placed[0].box, placed[1].box)).toBe(false)
    for (const label of placed) {
      expect(label.box.l).toBeGreaterThanOrEqual(bounds.l - 2)
      expect(label.box.r).toBeLessThanOrEqual(bounds.r + 2)
    }
  })

  it("keeps a label beside its own line but away from other lines", () => {
    const scene: PlacementScene = {
      bounds,
      segments: [
        { x1: 0, y1: 100, x2: 300, y2: 100, weight: 25, owner: "own" },
        { x1: 0, y1: 92, x2: 300, y2: 92, weight: 25, owner: "other" },
      ],
      obstacles: [],
    }
    const [placed] = placeLabels([{ key: "own", owner: "own", text: "0%", size: 10.5, candidates: alongLine(100, 0, 300, 10.5, "end") }], scene)
    expect(placed.box.t).toBeGreaterThan(100)
    expect(placed.x).toBeGreaterThan(250)
  })

  it("uses a candidate's own lines when it offers a wrapped variant", () => {
    const narrow: PlacementScene = { bounds: { l: 0, t: 0, r: 120, b: 200 }, segments: [], obstacles: [] }
    const [placed] = placeLabels(
      [
        {
          key: "long",
          text: "Cao hơn trung bình 50 phiên",
          size: 11,
          candidates: [
            { x: 60, y: 40, anchor: "middle" },
            { x: 60, y: 40, anchor: "middle", lines: ["Cao hơn trung", "bình 50 phiên"] },
          ],
        },
      ],
      narrow,
    )
    expect(placed.lines).toEqual(["Cao hơn trung", "bình 50 phiên"])
  })

  it("stacks shade labels in rows only when they cannot slide apart within their span", () => {
    const rows = stackRowLabels(
      [
        { text: "Phân phối", size: 10.5, center: 190, min: 160, max: 210 },
        { text: "Giảm giá", size: 10.5, center: 236, min: 210, max: 270 },
      ],
      300,
    )
    expect(rows.map((row) => row.row)).toEqual([0, 0])
    expect(rows[1].x).toBeGreaterThan(236)
    const crowded = stackRowLabels(
      [
        { text: "Phân phối", size: 10.5, center: 150, min: 140, max: 160 },
        { text: "Giảm giá", size: 10.5, center: 152, min: 145, max: 158 },
      ],
      300,
    )
    expect(crowded.map((row) => row.row)).toEqual([0, 1])
  })
})

describe("đo chữ qua measureText truyền vào", () => {
  const wide = (text: string, size: number) => text.length * size * 2
  const narrow = (text: string, size: number) => text.length * size * 0.1

  it("dựng hộp nhãn theo số đo được truyền, không theo ước lượng cố định", () => {
    const a = labelBox("Mua vào", 10, 100, 50, "start", 2, narrow)
    const b = labelBox("Mua vào", 10, 100, 50, "start", 2, wide)
    expect(b.r - b.l).toBeGreaterThan((a.r - a.l) * 10)
    expect(labelBox("Mua vào", 10, 100, 50, "start", 2, wide).r - 100 - 2).toBeCloseTo(wide("Mua vào", 10), 6)
  })

  it("truyền độ đậm cho hàm đo", () => {
    const seen: (number | undefined)[] = []
    labelBox("Mua", 11, 0, 0, "start", 2, (text, size, weight) => {
      seen.push(weight)
      return text.length * size
    }, 600)
    expect(seen).toEqual([600])
  })

  it("đặt nhãn tránh chuỗi số liệu theo số đo: cùng ứng viên, chữ rộng hơn thì phải dời đi", () => {
    // Một đường ngang ở y = 104 chạy từ x = 190; nhãn bên phải điểm (150, 104) chỉ tránh được khi chữ đủ ngắn.
    const scene = (measure: (text: string, size: number) => number): PlacementScene => ({
      bounds,
      segments: [{ x1: 190, y1: 104, x2: 300, y2: 104, weight: 60 }],
      obstacles: [],
      measure,
    })
    const request = { key: "a", text: "Mua", size: 11, candidates: [{ x: 160, y: 108, anchor: "start" as const }, { x: 160, y: 140, anchor: "start" as const }] }
    const [short] = placeLabels([request], scene(narrow))
    const [long] = placeLabels([request], scene((text, size) => text.length * size * 6))
    expect(short.y).toBe(108)
    expect(long.y).toBe(140)
  })

  it("xếp nhãn nền theo hàng dựa trên số đo", () => {
    const labels = [
      { text: "Phân phối", size: 10.5, center: 150, min: 140, max: 160 },
      { text: "Giảm giá", size: 10.5, center: 152, min: 145, max: 200 },
    ]
    expect(stackRowLabels(labels, 300, 6, narrow).map((row) => row.row)).toEqual([0, 0])
    expect(stackRowLabels(labels, 300, 6, wide).map((row) => row.row)).toEqual([0, 1])
  })
})

describe("ngắt dòng và làm thưa nhãn trục", () => {
  it("ngắt nhãn dài theo bề rộng, không cắt chữ", () => {
    expect(wrapText("Mua trong giai đoạn này được hưởng quyền", 100)).toEqual(["Mua trong giai", "đoạn này được", "hưởng quyền"])
    expect(wrapText("a b c d e f g h", 1, 11, 2)).toEqual(["a", "b c d e f g h"])
    expect(wrapText("", 100)).toEqual([])
  })

  it("ngắt dòng theo số đo thật khi chữ hẹp hơn ước lượng", () => {
    const text = "Mua trong giai đoạn này được hưởng quyền"
    expect(wrapText(text, 100, 11, 3, (value, size) => value.length * size * 0.3)).toHaveLength(2)
  })

  it("làm thưa nhãn trục nhưng giữ nhãn cuối", () => {
    const labels: AxisLabel[] = [0, 1, 2, 3].map((index) => ({ index, text: "T+0123", anchor: "middle", at: 20 + index * 30 }))
    const kept = thinAxisLabels(labels)
    expect(kept[kept.length - 1]).toBe(labels[3])
    for (let k = 1; k < kept.length; k += 1) expect(kept[k].at - kept[k - 1].at).toBeGreaterThan(30)
  })

  it("không import từ pages và không chạm DOM", () => {
    for (const source of Object.values(sources)) {
      expect(source).not.toMatch(/from\s+["'][^"']*pages\//)
      expect(source).not.toMatch(/\b(document|window|HTMLElement|getComputedStyle|OffscreenCanvas)\b/)
    }
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(2)
  })
})

const sources = import.meta.glob(["./placement.ts", "./text.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>
