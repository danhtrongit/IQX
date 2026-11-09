/**
 * Dựng cảnh từ `ChartFrame` theo bốn lớp (docs/iqline-design.md §7). Hàm thuần theo nghĩa không chạm DOM và
 * cùng đầu vào cho cùng danh sách lệnh; `SceneBuilder` chỉ giữ các bộ đệm số để dùng lại giữa các khung hình.
 *
 * | Lớp      | Nội dung                                             | Gọi khi                              |
 * |----------|------------------------------------------------------|--------------------------------------|
 * | base     | lưới, nhãn trục, vạch ngăn ngày, mặt nạ tương lai    | đổi viewport, kích thước, giao diện  |
 * | data     | nến, khối lượng, chỉ báo, đánh dấu, đường tham chiếu | đổi dữ liệu hoặc viewport            |
 * | drawings | do `drawings/` dựng, dùng `ChartFrame.price.coords`  | (không thuộc file này)               |
 * | top      | crosshair và nhãn giá, nhãn thời gian                | mỗi lần di chuột                     |
 *
 * Lệnh của một lần gọi dùng chung bộ đệm với lần gọi sau của cùng `SceneBuilder`: adapter phải vẽ xong cảnh
 * trước khi dựng lại.
 */
import { NARROW_WIDTH } from "../core/layout"
import { dayBreaks } from "../core/time-scale"
import {
  formatCompact,
  formatPercentAxis,
  formatPriceDefault,
  formatTimeLabel,
  formatVi,
  decimalsForStep,
  marketTimeTicks,
  priceTicks,
  sessionTicks,
} from "../core/ticks"
import { offscaleLabels } from "../core/price-scale"
import type { ColorToken, DrawCommand, Layer, Scene } from "../types"
import { Buffers } from "./buffers"
import { drawMainSeries } from "./candles"
import { MAIN_SERIES_TOKEN, UP_TOKEN, DOWN_TOKEN } from "./colors"
import { clipCommand, createPaneDraw, dashOf, hairline, pushRects, textCommand, type PaneDraw } from "./draw"
import { drawMarks, drawSessionMarkers } from "./marks"
import type { ChartFrame, PaneFrame } from "./model"
import { drawIndicatorPlot } from "./plots"

export type Pointer = { x: number; y: number }

export const VOLUME_ALPHA = 0.55
/** Khối lượng của Flashback: phần lịch sử mờ hơn phần đang chơi (Flashback v2.3, cùng độ mờ với biểu đồ SVG cũ). */
export const FLASHBACK_VOLUME_ALPHA = { history: 0.45, play: 0.7 } as const

/** Đang nhìn hết mọi ô của trục (khung mặc định của Flashback). */
function showsEveryAxisSlot(viewport: { from: number; to: number }, slots: number): boolean {
  return Math.abs(viewport.from + 0.5) < 1e-6 && Math.abs(viewport.to - (slots - 0.5)) < 1e-6
}
/** Ô cách đáy ô giá ít hơn mức này (CSS pixel) thì nhãn lưới nhường chỗ cho nhãn giá khác. */
const LABEL_CLEARANCE = 14
const OFFSCALE_IDS: ReadonlySet<string> = new Set(["ma", "ema", "ma_cross", "wma", "hma", "vwma", "vwap"])
const PRICE_TAG_HEIGHT = 20

const px = (value: number, dpr: number) => Math.round(value * dpr)

export function formatPaneValue(frame: ChartFrame, pane: PaneFrame, price: number, step = 0): string {
  const { box, scale } = pane
  if (box.kind === "volume") return formatCompact(price)
  if (box.kind === "indicator") return formatVi(price, step > 0 ? decimalsForStep(step) : Math.abs(price) >= 100 || Number.isInteger(price) ? 0 : 2)
  if (scale.mode === "percent") return formatPercentAxis(scale.axisValue(price), step || 0.1)
  return frame.view.formatPrice ? frame.view.formatPrice(price) : formatPriceDefault(price, step || Math.max(0.01, (scale.high - scale.low) / 100))
}

/**
 * Nến dưới con trỏ, hoặc null nếu không có gì để hiện. `flashback`: ô tương lai và ngoài trục không có
 * crosshair (không đọc được gì ở đó). `market`: ô trống sau nến cuối vẫn có crosshair và nhãn thời gian ngoại suy.
 */
export function indexAtPointer(frame: ChartFrame, pointer: Pointer): number | null {
  if (pointer.x < frame.plot.left || pointer.x > frame.plot.right) return null
  const index = Math.round(frame.price.coords.indexOfX(pointer.x))
  const { data } = frame
  if (data.mode === "flashback") return index >= 0 && index < data.count ? index : null
  return data.count > 0 ? index : null
}

export class SceneBuilder {
  private bufs = new Buffers()

  base(frame: ChartFrame): Scene {
    const { geometry, viewport } = frame.view
    const { dpr } = geometry
    const { data } = frame
    const scene: Scene = []
    const hair = hairline(dpr)
    const left = px(frame.plot.left, dpr)
    const right = px(frame.plot.right, dpr)
    const edgeX = (edge: number) => (edge - viewport.from) * frame.barPx * dpr + left

    // Mặt nạ tương lai: phần chưa mở của Flashback được tôi tối và đánh dấu "?".
    if (data.mode === "flashback" && data.count < data.slots) {
      const x0 = Math.max(left, Math.round(edgeX(data.count - 0.5)))
      const x1 = Math.min(right, Math.round(edgeX(data.slots - 0.5)))
      if (x1 > x0) {
        const rects = this.bufs.get("base.future", frame.panes.length * 4)
        let n = 0
        for (const pane of frame.panes) {
          rects[n++] = x0
          rects[n++] = px(pane.box.top, dpr)
          rects[n++] = x1 - x0
          rects[n++] = px(pane.box.height, dpr)
        }
        scene.push({ op: "rects", token: "border", alpha: 0.4, data: rects, count: n })
        scene.push(textCommand("border", "?", (x0 + x1) / 2, px(frame.price.box.top + frame.price.box.height / 2 + 12, dpr), "center", dpr, { size: 34, weight: 600, tabular: false }))
      }
    }

    // Nhãn trục phải theo vạch giá của từng ô (không vẽ lưới ngang).
    const paneTicks = frame.panes.map((pane) => priceTicks(pane.scale, Math.max(2, Math.floor(pane.box.height / 60))))
    const grid = this.bufs.get("base.grid", 4 * (paneTicks.reduce((sum, ticks) => sum + ticks.length, 0) + frame.panes.length))
    let gridCount = 0
    const labels: DrawCommand[] = []
    // Nhãn lưới nhường chỗ cho nhãn giá đóng cửa và nhãn trần, sàn, tham chiếu (v2.3 §3).
    const avoid: number[] = []
    if (data.count > 0) avoid.push(frame.price.scale.yOf(data.raw[data.count - 1].close))
    for (const level of [data.priceLevels.reference, data.priceLevels.ceiling, data.priceLevels.floor]) if (level != null) avoid.push(frame.price.scale.yOf(level))

    frame.panes.forEach((pane, paneIndex) => {
      for (const tick of paneTicks[paneIndex]) {
        // Không vẽ lưới ngang (chỉ giữ nhãn trục phải) để biểu đồ gọn.
        const y = px(tick.y, dpr)
        if (pane.box.kind === "price" && avoid.some((other) => Math.abs(other - tick.y) < LABEL_CLEARANCE)) continue
        const text = pane.box.kind === "price" && pane.scale.mode === "percent" ? formatPercentAxis(tick.value, tick.step) : formatPaneValue(frame, pane, tick.price, tick.step)
        labels.push(textCommand(frame.labelToken, text, right + 6 * dpr, y + 4 * dpr, "left", dpr))
      }
    })

    // Vạch ngăn ô.
    for (const pane of frame.panes.slice(1)) {
      const y = px(pane.box.legendTop - 5, dpr)
      grid[gridCount++] = left
      grid[gridCount++] = y
      grid[gridCount++] = right
      grid[gridCount++] = y
    }

    // Nhãn trục ngang và lưới dọc (chỉ `market`).
    const baseline = px(geometry.height - geometry.axisBottom + 15, dpr)
    const timeLabels: DrawCommand[] = []
    let verticals = this.bufs.get("base.vertical", 4)
    let verticalCount = 0
    const plotWidth = frame.plot.width
    if (data.timeScale.kind === "market") {
      const ticks = marketTimeTicks(data.timeScale, viewport, plotWidth)
      verticals = this.bufs.get("base.vertical", 4 * ticks.length * frame.panes.length + 4)
      for (const tick of ticks) {
        const x = Math.round(frame.price.coords.xOfIndex(tick.index) * dpr)
        timeLabels.push(textCommand(frame.labelToken, tick.label, x, baseline, "center", dpr))
        for (const pane of frame.panes) {
          verticals[verticalCount++] = x
          verticals[verticalCount++] = px(pane.box.top, dpr)
          verticals[verticalCount++] = x
          verticals[verticalCount++] = px(pane.box.top + pane.box.height, dpr)
        }
      }
    } else if (frame.view.axisLabels && showsEveryAxisSlot(viewport, data.slots)) {
      // Khung mặc định: nhãn cố định của trang ("Lịch sử 60 phiên", "Phiên 1", ...) như Flashback v2.3.
      for (const tick of frame.view.axisLabels(frame.view.geometry.width < NARROW_WIDTH)) {
        if (tick.index < 0 || tick.index >= data.slots) continue
        const align = tick.anchor === "start" ? "left" : tick.anchor === "end" ? "right" : "center"
        timeLabels.push(textCommand(frame.labelToken, tick.label, Math.round(frame.price.coords.xOfIndex(tick.index) * dpr), baseline, align, dpr))
      }
    } else if (frame.view.formatX) {
      for (const tick of sessionTicks(viewport, data.slots, plotWidth, frame.view.formatX)) {
        timeLabels.push(textCommand(frame.labelToken, tick.label, Math.round(frame.price.coords.xOfIndex(tick.index) * dpr), baseline, "center", dpr))
      }
    }

    scene.push({ op: "lines", token: "border", width: hair, data: grid, count: gridCount })
    if (verticalCount > 0) scene.push({ op: "lines", token: "border", width: hair, data: verticals, count: verticalCount })

    // Vạch ngăn khi nhảy ngày (khung trong ngày) và vạch đứt giữa phần xem và phần chơi (Flashback).
    const dashed: number[] = []
    if (data.timeScale.kind === "market" && data.interval && frame.visible) {
      const breaks = dayBreaks(data.timeScale.times, data.interval, frame.visible.first, frame.visible.last)
      for (const item of breaks.slice(0, 200)) {
        const x = Math.round(edgeX(item.index - 0.5))
        for (const pane of frame.panes) dashed.push(x, px(pane.box.top, dpr), x, px(pane.box.top + pane.box.height, dpr))
      }
    }
    if (data.divider !== null) {
      const x = Math.round(edgeX(data.divider - 0.5))
      if (x >= left && x <= right) dashed.push(x, px(frame.price.box.top, dpr), x, px(frame.panes[frame.panes.length - 1].box.top + frame.panes[frame.panes.length - 1].box.height, dpr))
    }
    if (dashed.length > 0) scene.push({ op: "lines", token: "border", width: hair, dash: dashOf(dpr, 4, 4), data: Float64Array.from(dashed), count: dashed.length })

    scene.push(...labels, ...timeLabels)
    return scene
  }

  data(frame: ChartFrame): Scene {
    const scene: Scene = []
    const { data } = frame
    if (data.count === 0) return scene

    for (const pane of frame.panes) {
      const d = createPaneDraw(frame, pane, this.bufs)
      if (!d) continue
      const after: DrawCommand[] = []
      scene.push(clipCommand(d))
      if (pane.box.kind === "price") this.pricePane(scene, after, frame, pane, d)
      else if (pane.box.kind === "volume") this.volumePane(scene, after, frame, pane, d)
      else for (const indicator of pane.indicators) drawIndicatorPlot(scene, after, frame, pane, d, indicator)
      scene.push({ op: "unclip" })
      scene.push(...after)
    }
    return scene
  }

  private pricePane(scene: Scene, after: DrawCommand[], frame: ChartFrame, pane: PaneFrame, d: PaneDraw): void {
    const { data } = frame
    const dpr = d.dpr
    const hair = hairline(dpr)

    // Giá tham chiếu, trần, sàn: nét đứt theo màu của sàn giao dịch.
    const levels: [ColorToken, number | undefined][] = [
      ["price-ref", data.priceLevels.reference],
      ["price-ceiling", data.priceLevels.ceiling],
      ["price-floor", data.priceLevels.floor],
    ]
    for (const [token, value] of levels) {
      if (value == null) continue
      const y = Math.round(d.yOf(value))
      if (y < d.top || y > d.bottom) continue
      const line = this.bufs.get(`level.${token}`, 4)
      line[0] = d.left
      line[1] = y
      line[2] = d.right
      line[3] = y
      scene.push({ op: "lines", token, width: hair, dash: dashOf(dpr, 6, 4), data: line, count: 4 })
      after.push(textCommand(token, formatPaneValue(frame, pane, value), d.right + 6 * dpr, y + 4 * dpr, "left", dpr, { weight: 600 }))
    }

    drawMainSeries(scene, d, data.bars, data.chartType)

    for (const indicator of pane.indicators) if (!indicator.hidden) drawIndicatorPlot(scene, after, frame, pane, d, indicator)

    // Giá đóng cửa của nến cuối: vạch đứt và nhãn ở trục phải.
    const last = data.raw[data.count - 1]
    const lastY = d.yOf(last.close)
    const clampedY = Math.min(Math.max(lastY, d.top + (PRICE_TAG_HEIGHT / 2) * dpr), d.bottom - (PRICE_TAG_HEIGHT / 2) * dpr)
    if (lastY >= d.top && lastY <= d.bottom) {
      const line = this.bufs.get("level.last", 4)
      const y = Math.round(lastY)
      line[0] = d.left
      line[1] = y
      line[2] = d.right
      line[3] = y
      scene.push({ op: "lines", token: MAIN_SERIES_TOKEN, width: hair, dash: dashOf(dpr, 2, 3), data: line, count: 4 })
    }
    const tag = this.bufs.get("tag.last", 4)
    tag[0] = d.right + 2 * dpr
    tag[1] = Math.round(clampedY - (PRICE_TAG_HEIGHT / 2) * dpr)
    tag[2] = (frame.view.geometry.axisRight - 4) * dpr
    tag[3] = PRICE_TAG_HEIGHT * dpr
    const tagCommands: DrawCommand[] = [
      { op: "rects", token: MAIN_SERIES_TOKEN, data: tag, count: 4 },
      textCommand("background", formatPaneValue(frame, pane, last.close), d.right + 6 * dpr, Math.round(clampedY + 4 * dpr), "left", dpr, { weight: 600 }),
    ]

    // Nhãn MA ngoài khung ở mép phải (v2.3 §3), tính theo nến đang hiện cuối cùng.
    const current = frame.visible ? Math.min(frame.visible.last, data.count - 1) : data.count - 1
    const lines = pane.indicators
      .filter((indicator) => !indicator.hidden && indicator.id !== undefined && OFFSCALE_IDS.has(indicator.id))
      .flatMap((indicator) => indicator.plot.series.map((series) => ({ key: `${indicator.key}-${series.key}`, name: series.label, value: series.values[current] ?? null, color: series.color })))
    const format = (value: number) => formatPaneValue(frame, pane, value)
    for (const label of offscaleLabels(lines, pane.range, { top: pane.box.top, height: pane.box.height }, format)) {
      after.push(textCommand(label.color, label.text, d.right - 4 * dpr, px(label.y + 4, dpr), "right", dpr, { size: 10.5, weight: 600 }))
    }

    drawMarks(scene, frame, d)
    drawSessionMarkers(scene, frame, d)
    after.push(...tagCommands)
  }

  private volumePane(scene: Scene, after: DrawCommand[], frame: ChartFrame, pane: PaneFrame, d: PaneDraw): void {
    const { data } = frame
    const count = d.last - d.first + 1
    const up = this.bufs.get("vol.up", count * 4 + 4)
    const down = this.bufs.get("vol.down", count * 4 + 4)
    // Flashback: cột của phần lịch sử (trước `divider`) mờ hơn cột phần chơi; mỗi nhóm một độ mờ, token vẫn là price-up/price-down.
    const dimBefore = d.dimBefore
    const upHistory = dimBefore > 0 ? this.bufs.get("vol.upHistory", count * 4 + 4) : up
    const downHistory = dimBefore > 0 ? this.bufs.get("vol.downHistory", count * 4 + 4) : down
    let u = 0
    let n = 0
    let uh = 0
    let nh = 0
    const baseline = d.yOf(0)
    const width = Math.max(1, Math.floor(d.barPx * 0.7))
    let column = -1
    let peak = 0
    let rising = true
    let history = false
    const flush = () => {
      if (column < 0 || peak <= 0) return
      const top = Math.round(d.yOf(peak))
      const height = Math.max(1, Math.round(baseline) - top)
      if (rising && history) {
        upHistory[uh++] = column; upHistory[uh++] = top; upHistory[uh++] = width; upHistory[uh++] = height
      } else if (rising) {
        up[u++] = column; up[u++] = top; up[u++] = width; up[u++] = height
      } else if (history) {
        downHistory[nh++] = column; downHistory[nh++] = top; downHistory[nh++] = width; downHistory[nh++] = height
      } else {
        down[n++] = column; down[n++] = top; down[n++] = width; down[n++] = height
      }
    }
    for (let index = d.first; index <= d.last; index += 1) {
      const bar = data.raw[index]
      const next = d.merged ? Math.floor(d.xOf(index)) : Math.round(d.xOf(index)) - (width >> 1)
      if (next !== column) {
        flush()
        column = next
        peak = 0
      }
      if (bar.volume >= peak) {
        peak = bar.volume
        rising = bar.close >= bar.open
        history = index < dimBefore
      }
    }
    flush()
    if (dimBefore > 0) {
      pushRects(scene, UP_TOKEN, upHistory, uh, FLASHBACK_VOLUME_ALPHA.history)
      pushRects(scene, DOWN_TOKEN, downHistory, nh, FLASHBACK_VOLUME_ALPHA.history)
      pushRects(scene, UP_TOKEN, up, u, FLASHBACK_VOLUME_ALPHA.play)
      pushRects(scene, DOWN_TOKEN, down, n, FLASHBACK_VOLUME_ALPHA.play)
    } else {
      pushRects(scene, UP_TOKEN, up, u, VOLUME_ALPHA)
      pushRects(scene, DOWN_TOKEN, down, n, VOLUME_ALPHA)
    }
    for (const indicator of pane.indicators) if (!indicator.hidden) drawIndicatorPlot(scene, after, frame, pane, d, indicator)
  }

  /** Lớp hình vẽ do `drawings/` dựng từ `frame.price.coords`; scene lõi không có gì để vẽ ở đây. */
  drawings(): Scene {
    return []
  }

  top(frame: ChartFrame, pointer: Pointer | null): Scene {
    if (!pointer) return []
    const index = indexAtPointer(frame, pointer)
    if (index === null) return []
    const { geometry } = frame.view
    const { dpr } = geometry
    const left = px(frame.plot.left, dpr)
    const right = px(frame.plot.right, dpr)
    const centerX = px(frame.price.coords.xOfIndex(index), dpr)
    const scene: Scene = []
    const lines: number[] = []
    for (const pane of frame.panes) lines.push(centerX, px(pane.box.top, dpr), centerX, px(pane.box.top + pane.box.height, dpr))
    const under = frame.panes.find((pane) => pointer.y >= pane.box.top && pointer.y <= pane.box.top + pane.box.height)
    if (under) {
      const y = px(pointer.y, dpr)
      lines.push(left, y, right, y)
    }
    scene.push({ op: "lines", token: frame.labelToken, width: hairline(dpr), dash: dashOf(dpr, 3, 3), data: Float64Array.from(lines), count: lines.length })

    if (under) {
      const price = under.scale.priceOf(pointer.y)
      const y = px(pointer.y, dpr)
      const boxData = Float64Array.of(right, y - 9 * dpr, geometry.axisRight * dpr, 18 * dpr)
      scene.push({ op: "rects", token: "foreground", data: boxData, count: 4 })
      scene.push(textCommand("background", formatPaneValue(frame, under, price), right + 6 * dpr, y + 4 * dpr, "left", dpr, { weight: 600 }))
    }

    const { data } = frame
    const timeText = data.timeScale.kind === "market" ? formatTimeLabel(data.timeScale.timeOfIndex(index), data.timeScale.interval) : (frame.view.formatX?.(index) ?? `Phiên ${index + 1}`)
    const boxWidth = (timeText.length * 7 + 12) * dpr
    const boxLeft = Math.min(Math.max(centerX - boxWidth / 2, 0), geometry.width * dpr - boxWidth)
    const boxTop = px(geometry.height - geometry.axisBottom + 2, dpr)
    scene.push({ op: "rects", token: "foreground", data: Float64Array.of(Math.round(boxLeft), boxTop, Math.round(boxWidth), 18 * dpr), count: 4 })
    scene.push(textCommand("background", timeText, Math.round(boxLeft + boxWidth / 2), boxTop + 13 * dpr, "center", dpr, { weight: 600 }))
    return scene
  }

  /** Dựng đúng một lớp; `drawings` luôn rỗng ở đây. */
  layer(frame: ChartFrame, layer: Layer, pointer: Pointer | null = null): Scene {
    if (layer === "base") return this.base(frame)
    if (layer === "data") return this.data(frame)
    if (layer === "top") return this.top(frame, pointer)
    return this.drawings()
  }
}
