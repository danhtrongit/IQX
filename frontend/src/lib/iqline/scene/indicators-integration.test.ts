/** Nối `indicators/` với `scene/`: mọi chỉ báo trong sổ đăng ký phải dựng được cảnh hợp lệ theo luật màu §7. */
import { describe, expect, it } from "vitest"

import { DEFAULT_PALETTE, computeIndicator, listIndicators } from "../indicators"
import { indicatorPalette } from "./colors"
import { build, makeBars, makeTimedBars, marketInput, ops, tokens } from "./test-support"
import type { SceneIndicator } from "./model"
import type { DrawCommand } from "../types"

function allFinite(scene: readonly DrawCommand[]): boolean {
  return scene.every((command) => {
    if (!("data" in command)) return true
    for (let index = 0; index < command.count; index += 1) if (!Number.isFinite(command.data[index])) return false
    return true
  })
}

const bars = makeTimedBars(400)
const definitions = listIndicators()

describe("mọi chỉ báo đăng ký đều dựng được cảnh", () => {
  it("có đủ 40 chỉ báo để kiểm tra", () => {
    expect(definitions).toHaveLength(40)
  })

  it.each(definitions.map((definition) => [definition.id, definition] as const))("%s: cảnh hữu hạn, clip cân bằng, ô đúng loại", (id, definition) => {
    const plot = computeIndicator({ id, params: {} }, bars, indicatorPalette(), { times: bars.map((bar) => bar.time), interval: "5" })
    expect(plot).not.toBeNull()
    const indicators: SceneIndicator[] = [{ key: id, id, name: definition.name, plot: plot! }]
    const out = build(marketInput({ bars, indicators }))
    const scene = out.scene()
    expect(allFinite(scene)).toBe(true)
    expect(allFinite(out.base())).toBe(true)
    expect(ops(scene, "clip")).toHaveLength(ops(scene, "unclip").length)
    const expectedPanes = 2 + (plot!.kind === "pane" ? 1 : 0)
    expect(out.frame.panes).toHaveLength(expectedPanes)
    expect(out.frame.panes.find((pane) => pane.indicators.length > 0)?.box.kind).toBe(plot!.kind === "over" ? "price" : plot!.kind === "vol" ? "volume" : "indicator")
    // Trục giá không bị đường chỉ báo kéo giãn.
    expect(out.frame.price.range).toEqual(build(marketInput({ bars })).frame.price.range)
  })

  it("có trần hoặc sàn: dù tính bằng bảng màu 5 màu, không cảnh nào còn chart-6, 7, 8", () => {
    const mid = bars[399].close
    const indicators = definitions
      .filter((definition) => definition.kind === "over")
      .map<SceneIndicator>((definition) => ({ key: definition.id, id: definition.id, name: definition.name, plot: computeIndicator({ id: definition.id, params: {} }, bars, DEFAULT_PALETTE, { times: bars.map((bar) => bar.time), interval: "5" })! }))
    const scene = build(marketInput({ bars, indicators, priceLevels: { ceiling: mid + 3, floor: mid - 3 } })).scene()
    const used = new Set(tokens(scene))
    for (const forbidden of ["chart-6", "chart-7", "chart-8"]) expect(used.has(forbidden)).toBe(false)
  })

  it("16 chỉ báo của Flashback dựng được với warmup được cắt", () => {
    const flashbackBars = makeBars(180)
    for (const definition of listIndicators({ flashback: true })) {
      const plot = computeIndicator({ id: definition.id, params: {} }, flashbackBars, indicatorPalette())
      expect(plot).not.toBeNull()
      const out = build(
        { mode: "flashback", chartType: "candles", bars: flashbackBars, warmup: 60, totalSlots: 150, indicators: [{ key: definition.id, id: definition.id, name: definition.name, plot: plot! }] },
        { viewport: { from: -0.5, to: 149.5 } },
      )
      expect(allFinite(out.scene())).toBe(true)
      expect(out.data.count).toBe(120)
      for (const indicator of out.data.indicators) for (const series of indicator.plot.series) expect(series.values).toHaveLength(120)
    }
  })
})
