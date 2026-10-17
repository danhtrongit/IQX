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
} from "./series-panels-labels"

const bounds = { l: 0, t: 0, r: 300, b: 200 }

describe("series_panels label placement", () => {
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
