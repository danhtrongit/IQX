/**
 * Vẽ một `IndicatorPlot` trong ô của nó: đường (line, dash, dots, area), histogram, ngưỡng, vạch 0, dải giữa
 * hai ngưỡng, cột ngang Volume Profile và các điểm đánh dấu.
 *
 * Quy ước vùng tô của chuỗi `style: "area"`: hai chuỗi `area` liên tiếp tô vùng giữa chúng (dải Bollinger,
 * kênh Donchian); chuỗi `area` lẻ loi tô xuống vạch 0 (ô có vạch 0) hoặc đáy ô. Vùng tô bỏ khi nến hẹp dưới 1px.
 */
import type { ColorToken, DrawCommand, IndicatorSeries, Scene } from "../types"
import { decimalsForStep, formatVi } from "../core/ticks"
import { DOWN_TOKEN, UP_TOKEN } from "./colors"
import { dashOf, hairline, pushRects, textCommand, type PaneDraw } from "./draw"
import type { ChartFrame, PaneFrame, PreparedIndicator } from "./model"

const BAND_ALPHA = 0.1
const LEVEL_BAND_ALPHA = 0.07
const PROFILE_ALPHA = 0.35
const HISTOGRAM_ALPHA = 0.6
/** Số điểm đánh dấu tối đa mỗi chỉ báo trong một khung hình. */
const MAX_MARKERS = 400

function isValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function lineWidth(series: IndicatorSeries, dpr: number, merged: boolean): number {
  if (series.width !== undefined) return Math.max(1, Math.round(series.width * dpr))
  return merged ? Math.max(1, Math.round(dpr * 0.75)) : Math.max(1, Math.round(dpr * 1.25))
}

function emitLine(scene: Scene, d: PaneDraw, key: string, values: readonly (number | null)[], series: IndicatorSeries): void {
  const count = d.last - d.first + 1
  const width = lineWidth(series, d.dpr, d.merged)
  const dash = series.style === "dash" ? dashOf(d.dpr, 4, 3) : undefined
  const size = d.merged ? (Math.ceil(d.barPx * count) + 2) * 6 + 8 : count * 2 + 8
  const data = d.bufs.get(key, size)
  let used = 0
  let start = 0
  const flushSegment = () => {
    if (used - start >= 4) scene.push({ op: "polyline", token: series.color, width, dash, data: data.subarray(start, used), count: used - start })
    else used = start
    start = used
  }

  if (!d.merged) {
    for (let index = d.first; index <= d.last; index += 1) {
      const value = values[index]
      if (!isValue(value)) {
        flushSegment()
        continue
      }
      data[used++] = d.xOf(index)
      data[used++] = d.yOf(value)
    }
    flushSegment()
    return
  }

  // Mỗi cột pixel giữ giá trị vào, cao nhất, thấp nhất và ra để đường vẫn đúng hình; cột không có biên độ thấy
  // được chỉ cần một đỉnh vì phần lớn chi phí raster nằm ở số đỉnh.
  let column = -1
  let hi = 0
  let lo = 0
  let last = 0
  const flushColumn = () => {
    if (column < 0) return
    const top = d.yOf(hi)
    const bottom = d.yOf(lo)
    if (bottom - top >= 1) {
      data[used++] = column
      data[used++] = top
      data[used++] = column
      data[used++] = bottom
    }
    data[used++] = column
    data[used++] = d.yOf(last)
  }
  for (let index = d.first; index <= d.last; index += 1) {
    const value = values[index]
    if (!isValue(value)) continue
    const next = Math.floor(d.xOf(index))
    if (next !== column) {
      flushColumn()
      column = next
      hi = value
      lo = value
    } else {
      if (value > hi) hi = value
      if (value < lo) lo = value
    }
    last = value
  }
  flushColumn()
  flushSegment()
}

function emitDots(scene: Scene, d: PaneDraw, key: string, values: readonly (number | null)[], token: ColorToken): void {
  const side = Math.max(2, Math.round(d.dpr * 1.5))
  const data = d.bufs.get(key, (d.last - d.first + 1) * 4 + 4)
  let used = 0
  let lastColumn = Number.NaN
  for (let index = d.first; index <= d.last; index += 1) {
    const value = values[index]
    if (!isValue(value)) continue
    const x = Math.round(d.xOf(index))
    if (x === lastColumn) continue
    lastColumn = x
    data[used++] = x - (side >> 1)
    data[used++] = Math.round(d.yOf(value)) - (side >> 1)
    data[used++] = side
    data[used++] = side
  }
  pushRects(scene, token, data, used)
}

/** Vùng tô giữa hai chuỗi, hoặc giữa một chuỗi và `baseline` (pixel thiết bị) khi `lower` là null. */
function emitFill(
  scene: Scene,
  d: PaneDraw,
  key: string,
  upper: readonly (number | null)[],
  lower: readonly (number | null)[] | null,
  baseline: number,
  token: ColorToken,
): void {
  const count = d.last - d.first + 1
  const data = d.bufs.get(key, count * 4 + 8)
  let used = 0
  let firstX = Number.NaN
  let lastX = Number.NaN
  for (let index = d.first; index <= d.last; index += 1) {
    const value = upper[index]
    if (!isValue(value)) continue
    const x = d.xOf(index)
    if (Number.isNaN(firstX)) firstX = x
    lastX = x
    data[used++] = x
    data[used++] = d.yOf(value)
  }
  if (lower) {
    for (let index = d.last; index >= d.first; index -= 1) {
      const value = lower[index]
      if (!isValue(value)) continue
      data[used++] = d.xOf(index)
      data[used++] = d.yOf(value)
    }
  } else if (used >= 4) {
    data[used++] = lastX
    data[used++] = baseline
    data[used++] = firstX
    data[used++] = baseline
  }
  if (used >= 6) scene.push({ op: "polygon", token, alpha: BAND_ALPHA, data, count: used })
}

function levelText(level: { value: number; label: string }): string {
  if (level.label && level.label.length <= 6) return level.label
  return formatVi(level.value, Number.isInteger(level.value) ? 0 : decimalsForStep(0.01))
}

/**
 * Vẽ một chỉ báo. `after` nhận các nhãn chữ ở mép phải: chúng nằm ngoài vùng cắt của ô nên được vẽ sau `unclip`.
 */
export function drawIndicatorPlot(scene: Scene, after: DrawCommand[], frame: ChartFrame, pane: PaneFrame, d: PaneDraw, indicator: PreparedIndicator): void {
  const { plot, key: indicatorKey } = indicator
  const visibleLines = !indicator.hidden
  const hair = hairline(d.dpr)
  const k = (name: string) => `${indicatorKey}.${name}`
  const yOf = d.yOf
  const sample = plot.series[0]?.color ?? "chart-5"

  // Dải giữa hai ngưỡng (RSI 30-70): một màu mờ, không gradient.
  if (plot.levelBand) {
    const top = Math.round(yOf(plot.levelBand.upper))
    const bottom = Math.round(yOf(plot.levelBand.lower))
    const data = d.bufs.get(k("band"), 4)
    data[0] = d.left
    data[1] = Math.min(top, bottom)
    data[2] = d.right - d.left
    data[3] = Math.max(0, Math.abs(bottom - top))
    pushRects(scene, sample, data, 4, LEVEL_BAND_ALPHA)
  }

  const levelValues = new Set<number>()
  if (plot.levels?.length) {
    const lines = d.bufs.get(k("levels"), plot.levels.length * 4)
    let used = 0
    for (const level of plot.levels) {
      levelValues.add(level.value)
      const y = Math.round(yOf(level.value))
      lines[used++] = d.left
      lines[used++] = y
      lines[used++] = d.right
      lines[used++] = y
      if (y >= d.top && y <= d.bottom) after.push(textCommand(frame.labelToken, levelText(level), d.right + 6 * d.dpr, y + 4 * d.dpr, "left", d.dpr, { size: 10 }))
    }
    scene.push({ op: "lines", token: "chart-5", width: hair, dash: dashOf(d.dpr, 3, 3), data: lines, count: used })
  }
  if (plot.zero && !levelValues.has(0)) {
    const lines = d.bufs.get(k("zero"), 4)
    const y = Math.round(yOf(0))
    lines[0] = d.left
    lines[1] = y
    lines[2] = d.right
    lines[3] = y
    scene.push({ op: "lines", token: "border", width: hair, data: lines, count: 4 })
  }

  if (!visibleLines) return

  if (plot.profile && pane.box.kind === "price") drawProfile(scene, d, k("profile"), plot.profile.rows)

  // Histogram: cột từ vạch 0 (MACD).
  if (plot.histogram) {
    const { values, upToken, downToken } = plot.histogram
    const count = d.last - d.first + 1
    const up = d.bufs.get(k("hist.up"), count * 4 + 4)
    const down = d.bufs.get(k("hist.down"), count * 4 + 4)
    let u = 0
    let n = 0
    const zero = yOf(0)
    const width = Math.max(1, Math.floor(d.barPx * 0.7))
    let column = -1
    let extreme = 0
    const flush = () => {
      if (column < 0) return
      const y = yOf(extreme)
      const top = Math.round(Math.min(y, zero))
      const height = Math.max(1, Math.round(Math.abs(y - zero)))
      if (extreme >= 0) {
        up[u++] = column; up[u++] = top; up[u++] = width; up[u++] = height
      } else {
        down[n++] = column; down[n++] = top; down[n++] = width; down[n++] = height
      }
    }
    for (let index = d.first; index <= d.last; index += 1) {
      const value = values[index]
      if (!isValue(value)) continue
      const next = d.merged ? Math.floor(d.xOf(index)) : Math.round(d.xOf(index)) - (width >> 1)
      if (next !== column) {
        flush()
        column = next
        extreme = value
      } else if (Math.abs(value) > Math.abs(extreme)) {
        extreme = value
      }
    }
    flush()
    pushRects(scene, upToken, up, u, HISTOGRAM_ALPHA)
    pushRects(scene, downToken, down, n, HISTOGRAM_ALPHA)
  }

  // Vùng tô của chuỗi `area`.
  if (!d.merged) {
    const areas = plot.series.filter((series) => series.style === "area")
    const baseline = plot.zero ? yOf(0) : d.bottom
    for (let index = 0; index < areas.length; index += 2) {
      const upper = areas[index]
      const lower = areas[index + 1] ?? null
      emitFill(scene, d, k(`fill${index}`), upper.values, lower ? lower.values : null, baseline, upper.color)
    }
  }

  plot.series.forEach((series, order) => {
    if (series.style === "dots") emitDots(scene, d, k(`dots${order}`), series.values, series.color)
    else emitLine(scene, d, k(`line${order}`), series.values, series)
  })

  drawMarkers(scene, d, frame, indicator)
}

function drawProfile(scene: Scene, d: PaneDraw, key: string, rows: readonly { low: number; high: number; up: number; down: number }[]): void {
  if (!rows.length) return
  const maxWidth = (d.right - d.left) * 0.3
  const up = d.bufs.get(`${key}.up`, rows.length * 4)
  const down = d.bufs.get(`${key}.down`, rows.length * 4)
  let u = 0
  let n = 0
  for (const row of rows) {
    const top = Math.round(d.yOf(row.high))
    const bottom = Math.round(d.yOf(row.low))
    const height = Math.max(1, bottom - top - 1)
    const upWidth = Math.max(0, Math.round(row.up * maxWidth))
    const downWidth = Math.max(0, Math.round(row.down * maxWidth))
    if (upWidth > 0) {
      up[u++] = d.left; up[u++] = top; up[u++] = upWidth; up[u++] = height
    }
    if (downWidth > 0) {
      down[n++] = d.left + upWidth; down[n++] = top; down[n++] = downWidth; down[n++] = height
    }
  }
  pushRects(scene, UP_TOKEN, up, u, PROFILE_ALPHA)
  pushRects(scene, DOWN_TOKEN, down, n, PROFILE_ALPHA)
}

/**
 * Điểm đánh dấu: `markers` do chỉ báo cung cấp; nếu không có mà có `cross` thì tự khoanh các điểm cắt của hai
 * đường (xanh khi cắt lên, đỏ khi cắt xuống). Đặt tại giá trị của đường đầu (hoặc chuỗi đầu tiên).
 */
function drawMarkers(scene: Scene, d: PaneDraw, frame: ChartFrame, indicator: PreparedIndicator): void {
  const { plot } = indicator
  if (d.barPx < 2) return
  const radius = 4 * d.dpr
  if (plot.markers?.length) {
    const host = plot.cross ? plot.series.find((series) => series.key === plot.cross![0]) : plot.series[0]
    if (!host) return
    let drawn = 0
    for (const marker of plot.markers) {
      if (marker.index < d.first || marker.index > d.last) continue
      const value = host.values[marker.index]
      if (!isValue(value)) continue
      if (drawn++ >= MAX_MARKERS) break
      const x = d.xOf(marker.index)
      const y = d.yOf(value)
      scene.push({ op: "circle", token: marker.token, x, y, radius, fill: true })
      if (marker.label) scene.push(textCommand(frame.labelToken, marker.label, x, y - radius - 3 * d.dpr, "center", d.dpr, { size: 10, weight: 600 }))
    }
    return
  }
  if (!plot.cross) return
  const fast = plot.series.find((series) => series.key === plot.cross![0])
  const slow = plot.series.find((series) => series.key === plot.cross![1])
  if (!fast || !slow) return
  let drawn = 0
  for (let index = Math.max(1, d.first); index <= d.last; index += 1) {
    const fastNow = fast.values[index]
    const fastBefore = fast.values[index - 1]
    const slowNow = slow.values[index]
    const slowBefore = slow.values[index - 1]
    if (!isValue(fastNow) || !isValue(fastBefore) || !isValue(slowNow) || !isValue(slowBefore)) continue
    const up = fastBefore <= slowBefore && fastNow > slowNow
    const down = fastBefore >= slowBefore && fastNow < slowNow
    if (!up && !down) continue
    if (drawn++ >= MAX_MARKERS) break
    scene.push({ op: "circle", token: up ? UP_TOKEN : DOWN_TOKEN, x: d.xOf(index), y: d.yOf(fastNow), radius, fill: false, width: 2 * d.dpr })
  }
}
