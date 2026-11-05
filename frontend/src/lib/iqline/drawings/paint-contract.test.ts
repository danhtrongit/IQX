/**
 * Hợp đồng giữa `drawings/` và `paintScene`: `count` là số phần tử dùng được trong `data` (số thực), nên hình vẽ và lớp AI đi qua bộ vẽ
 * thật phải ra nét thật. Lỗi này từng làm 14 công cụ vẽ không hiện gì trên canvas dù mọi test lệnh vẽ đều qua.
 */
import { describe, expect, it } from "vitest"

import { makeCoords } from "./__fixtures__/coords"
import { ALL_TOOLS, TOOL_SPECS, aiOverlayCommands, drawingCommands } from "./index"
import { paintScene } from "../render/paint"
import { DEFAULT_FONT_FAMILY, TextPainter } from "../render/text"
import { COLOR_TOKENS } from "../render/palette"
import { fakeContext, named } from "../render/test-support"
import type { AiOverlay, Anchor, Drawing, DrawingTool, Scene } from "../types"

const COORDS = makeCoords({ mode: "session", viewport: { from: -0.5, to: 49.5 }, plot: { left: 0, top: 0, right: 500, bottom: 300 }, price: { low: 0, high: 300 } })
const PALETTE = Object.fromEntries(COLOR_TOKENS.map((token) => [token, "#123456"])) as Record<(typeof COLOR_TOKENS)[number], string>

const SAMPLE: Record<DrawingTool, [number, number][]> = {
  trend: [[5, 100], [30, 200]],
  ray: [[5, 100], [30, 200]],
  extended: [[5, 100], [30, 200]],
  horizontal: [[10, 150]],
  "horizontal-ray": [[10, 150]],
  vertical: [[10, 150]],
  channel: [[5, 100], [30, 150], [15, 200]],
  "fib-retracement": [[5, 100], [30, 200]],
  "fib-extension": [[5, 100], [20, 200], [30, 150]],
  rectangle: [[5, 100], [30, 200]],
  "elliott-5": [[2, 100], [8, 160], [12, 130], [22, 220], [28, 180], [40, 260]],
  "elliott-abc": [[2, 100], [10, 220], [18, 160], [30, 250]],
  note: [[10, 150]],
  measure: [[5, 100], [30, 200]],
}

function paint(scene: Scene) {
  const context = fakeContext()
  paintScene(context, scene, { palette: PALETTE, fontFamily: DEFAULT_FONT_FAMILY, defaultSize: 11, text: new TextPainter() })
  return context
}

const shape = (tool: DrawingTool): Drawing => ({ id: "a", tool, anchors: SAMPLE[tool].map(([session, price]): Anchor => ({ session, price })), style: { ...TOOL_SPECS[tool].defaultStyle }, text: "Ghi chú" })

describe("hình vẽ qua bộ vẽ thật", () => {
  for (const tool of ALL_TOOLS) {
    it(`${tool}: ra nét hoặc mảng màu hoặc chữ`, () => {
      const context = paint(drawingCommands([shape(tool)], COORDS))
      const painted = named(context, "stroke").length + named(context, "fill").length + named(context, "fillRect").length + named(context, "fillText").length
      expect(painted, tool).toBeGreaterThan(0)
    })
  }

  it("đường xu hướng đi đúng hai đầu đoạn", () => {
    const context = paint(drawingCommands([shape("trend")], COORDS))
    expect(named(context, "moveTo")).toHaveLength(1)
    expect(named(context, "lineTo")).toHaveLength(1)
  })
})

describe("lớp AI qua bộ vẽ thật", () => {
  const overlays: AiOverlay[] = [
    { id: "p", kind: "path", points: [{ session: 5, price: 100 }, { session: 20, price: 180 }, { session: 30, price: 150 }], label: "Dự báo" },
    { id: "l", kind: "level", price: 120, label: "Kháng cự" },
    { id: "z", kind: "zone", from: { session: 10, price: 90 }, to: { session: 25, price: 140 } },
    { id: "m", kind: "marker", anchor: { session: 12, price: 100 }, label: "Đáy" },
  ]
  it("đường gãy, mức, vùng và điểm đều ra nét", () => {
    const context = paint(aiOverlayCommands(overlays, COORDS))
    expect(named(context, "stroke").length).toBeGreaterThanOrEqual(3)
    expect(named(context, "fillRect")).toHaveLength(1)
    expect(named(context, "arc")).toHaveLength(1)
    expect(named(context, "lineTo").length).toBeGreaterThanOrEqual(3)
  })
})
