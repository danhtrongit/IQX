/**
 * Bản thử IQLine (Giai đoạn 0): chỉ để đo, không phải code chính thức.
 *
 * Giữ đúng ba ý của thiết kế: dựng cảnh thuần sinh lệnh vẽ theo tên token, adapter mỏng đẩy lệnh ra Canvas,
 * và bốn lớp canvas vẽ lại độc lập. Toạ độ tính sẵn theo pixel thiết bị để nến không nhoè.
 */
export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number }

export type SpikeSeries = { values: (number | null)[]; token: string; histogram?: boolean }
export type SpikeBand = { upper: (number | null)[]; lower: (number | null)[]; token: string }
export type SpikePane = { key: string; kind: "price" | "volume" | "indicator"; height: number; series: SpikeSeries[]; bands: SpikeBand[]; range?: [number, number] }
export type Drawing = { a: { i: number; price: number }; b: { i: number; price: number }; token: string }
export type Viewport = { from: number; to: number }

export type Command =
  | { op: "rects"; token: string; data: Float64Array; count: number }
  | { op: "lines"; token: string; width: number; data: Float64Array; count: number }
  | { op: "polyline"; token: string; width: number; data: Float64Array; count: number }
  | { op: "polygon"; token: string; alpha: number; data: Float64Array; count: number }
  | { op: "text"; token: string; text: string; x: number; y: number; align: "left" | "right" | "center" }
  | { op: "clip"; x: number; y: number; width: number; height: number }
  | { op: "unclip" }

export type Scene = Command[]
export type Geometry = { width: number; height: number; dpr: number; axisRight: number; axisBottom: number }

export const PAD = 0.06
const GAP = 10

/** Bộ đệm tăng dần: dùng lại giữa các khung hình để không tạo rác khi kéo. */
class Buffers {
  private pool = new Map<string, Float64Array>()
  get(key: string, size: number): Float64Array {
    const current = this.pool.get(key)
    if (current && current.length >= size) return current
    const next = new Float64Array(Math.max(size, (current?.length ?? 0) * 2, 1024))
    this.pool.set(key, next)
    return next
  }
}

export type PaneBox = SpikePane & { top: number; plotHeight: number }

export function layoutPanes(panes: readonly SpikePane[], geometry: Geometry): PaneBox[] {
  const fixed = panes.filter((pane) => pane.kind !== "price").reduce((sum, pane) => sum + pane.height + GAP, 0)
  const priceHeight = Math.max(240, geometry.height - geometry.axisBottom - fixed - 4)
  let top = 4
  return panes.map((pane) => {
    const plotHeight = pane.kind === "price" ? priceHeight : pane.height
    const box = { ...pane, top, plotHeight }
    top += plotHeight + GAP
    return box
  })
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit < 1.5 ? 1 : unit < 3 ? 2 : unit < 7 ? 5 : 10) * power
}

export class SceneBuilder {
  private buffers = new Buffers()
  bars: readonly Bar[] = []
  panes: PaneBox[] = []
  drawings: readonly Drawing[] = []
  /** Thang giá của ô giá ở khung hình gần nhất, dùng cho hình vẽ và crosshair. */
  priceY: (price: number) => number = () => 0

  x(index: number, viewport: Viewport, geometry: Geometry): number {
    const plot = geometry.width - geometry.axisRight
    return ((index - viewport.from) / (viewport.to - viewport.from)) * plot
  }

  /** Nền: lưới và trục. */
  base(viewport: Viewport, geometry: Geometry, formatX: (bar: Bar) => string): Scene {
    const { dpr } = geometry
    const scene: Scene = []
    const plot = geometry.width - geometry.axisRight
    const from = Math.max(0, Math.floor(viewport.from))
    const to = Math.min(this.bars.length - 1, Math.ceil(viewport.to))
    const step = Math.max(1, Math.ceil((to - from) / Math.max(2, Math.floor(plot / 110))))
    const lines = this.buffers.get("grid", 4096)
    let count = 0
    const push = (x1: number, y1: number, x2: number, y2: number) => {
      lines[count++] = x1 * dpr
      lines[count++] = y1 * dpr
      lines[count++] = x2 * dpr
      lines[count++] = y2 * dpr
    }
    const bottom = geometry.height - geometry.axisBottom
    for (let i = from - (from % step) + step; i <= to; i += step) {
      const x = Math.round(this.x(i, viewport, geometry) * dpr) / dpr
      push(x, 0, x, bottom)
      scene.push({ op: "text", token: "muted-foreground", text: formatX(this.bars[i]), x: x * dpr, y: (bottom + 15) * dpr, align: "center" })
    }
    for (const pane of this.panes) {
      const [min, max] = this.paneRange(pane, viewport)
      const tick = niceStep(max - min, Math.max(2, Math.floor(pane.plotHeight / 60)))
      for (let value = Math.ceil(min / tick) * tick; value <= max; value += tick) {
        const y = Math.round((pane.top + (1 - (value - min) / (max - min)) * pane.plotHeight) * dpr) / dpr
        push(0, y, plot, y)
        scene.push({ op: "text", token: "muted-foreground", text: formatPrice(value, tick), x: (plot + 6) * dpr, y: (y + 4) * dpr, align: "left" })
      }
    }
    scene.unshift({ op: "lines", token: "border", width: Math.max(1, Math.floor(dpr)), data: lines, count })
    return scene
  }

  private paneRange(pane: PaneBox, viewport: Viewport): [number, number] {
    if (pane.range) return pane.range
    const from = Math.max(0, Math.floor(viewport.from))
    const to = Math.min(this.bars.length - 1, Math.ceil(viewport.to))
    let min = Infinity
    let max = -Infinity
    if (pane.kind === "price") {
      for (let i = from; i <= to; i++) {
        const bar = this.bars[i]
        if (bar.low < min) min = bar.low
        if (bar.high > max) max = bar.high
      }
    } else if (pane.kind === "volume") {
      min = 0
      for (let i = from; i <= to; i++) if (this.bars[i].volume > max) max = this.bars[i].volume
    } else {
      for (const series of pane.series) {
        for (let i = from; i <= to; i++) {
          const value = series.values[i]
          if (value === null || value === undefined) continue
          if (value < min) min = value
          if (value > max) max = value
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [0, 1]
    const pad = pane.kind === "volume" ? 0 : (max - min) * PAD
    return [min - pad, max + pad]
  }

  /** Dữ liệu: nến, khối lượng, chỉ báo. Hẹp dưới 1px thì gộp theo cột pixel. */
  data(viewport: Viewport, geometry: Geometry): Scene {
    const { dpr } = geometry
    const scene: Scene = []
    const plotPx = Math.floor((geometry.width - geometry.axisRight) * dpr)
    const span = viewport.to - viewport.from
    const barPx = plotPx / span
    const from = Math.max(0, Math.floor(viewport.from))
    const to = Math.min(this.bars.length - 1, Math.ceil(viewport.to))
    const xOf = (i: number) => (i - viewport.from) * barPx

    for (const pane of this.panes) {
      const [min, max] = this.paneRange(pane, viewport)
      const top = pane.top * dpr
      const height = pane.plotHeight * dpr
      const k = height / (max - min)
      const yOf = (value: number) => top + (max - value) * k
      scene.push({ op: "clip", x: 0, y: top, width: plotPx, height })
      if (pane.kind === "price") {
        this.priceY = yOf
        this.candles(scene, from, to, barPx, xOf, yOf)
      } else if (pane.kind === "volume") {
        this.volume(scene, from, to, barPx, xOf, top + height, k)
      }
      for (const band of pane.bands) this.band(scene, pane.key, band, from, to, barPx, xOf, yOf)
      for (const series of pane.series) {
        if (series.histogram) this.histogram(scene, pane.key, series, from, to, barPx, xOf, yOf)
        else this.polyline(scene, `${pane.key}:${series.token}`, series, from, to, barPx, xOf, yOf, dpr)
      }
      scene.push({ op: "unclip" })
    }
    return scene
  }

  private candles(scene: Scene, from: number, to: number, barPx: number, xOf: (i: number) => number, yOf: (v: number) => number) {
    const n = to - from + 1
    const upBody = this.buffers.get("upBody", n * 4)
    const downBody = this.buffers.get("downBody", n * 4)
    const upWick = this.buffers.get("upWick", n * 4)
    const downWick = this.buffers.get("downWick", n * 4)
    let ub = 0
    let db = 0
    let uw = 0
    let dw = 0
    if (barPx >= 1) {
      const body = Math.max(1, Math.floor(barPx * 0.7))
      const wick = Math.max(1, Math.floor(barPx / 12))
      for (let i = from; i <= to; i++) {
        const bar = this.bars[i]
        const center = Math.round(xOf(i + 0.5))
        const yOpen = yOf(bar.open)
        const yClose = yOf(bar.close)
        const up = bar.close >= bar.open
        const bodyTop = Math.round(Math.min(yOpen, yClose))
        const bodyHeight = Math.max(1, Math.round(Math.abs(yOpen - yClose)))
        const wickTop = Math.round(yOf(bar.high))
        const wickHeight = Math.max(1, Math.round(yOf(bar.low)) - wickTop)
        const left = center - (body >> 1)
        const wickLeft = center - (wick >> 1)
        if (up) {
          upBody[ub++] = left; upBody[ub++] = bodyTop; upBody[ub++] = body; upBody[ub++] = bodyHeight
          upWick[uw++] = wickLeft; upWick[uw++] = wickTop; upWick[uw++] = wick; upWick[uw++] = wickHeight
        } else {
          downBody[db++] = left; downBody[db++] = bodyTop; downBody[db++] = body; downBody[db++] = bodyHeight
          downWick[dw++] = wickLeft; downWick[dw++] = wickTop; downWick[dw++] = wick; downWick[dw++] = wickHeight
        }
      }
    } else {
      // Mỗi cột pixel một vạch cao nhất đến thấp nhất, màu theo nến gộp.
      let column = -1
      let open = 0
      let high = 0
      let low = 0
      let close = 0
      const flush = () => {
        if (column < 0) return
        const top = Math.round(yOf(high))
        const height = Math.max(1, Math.round(yOf(low)) - top)
        if (close >= open) {
          upWick[uw++] = column; upWick[uw++] = top; upWick[uw++] = 1; upWick[uw++] = height
        } else {
          downWick[dw++] = column; downWick[dw++] = top; downWick[dw++] = 1; downWick[dw++] = height
        }
      }
      for (let i = from; i <= to; i++) {
        const bar = this.bars[i]
        const next = Math.floor(xOf(i))
        if (next !== column) {
          flush()
          column = next
          open = bar.open
          high = bar.high
          low = bar.low
        } else {
          if (bar.high > high) high = bar.high
          if (bar.low < low) low = bar.low
        }
        close = bar.close
      }
      flush()
    }
    scene.push({ op: "rects", token: "price-up", data: upWick, count: uw })
    scene.push({ op: "rects", token: "price-down", data: downWick, count: dw })
    scene.push({ op: "rects", token: "price-up", data: upBody, count: ub })
    scene.push({ op: "rects", token: "price-down", data: downBody, count: db })
  }

  private volume(scene: Scene, from: number, to: number, barPx: number, xOf: (i: number) => number, baseline: number, k: number) {
    const n = to - from + 1
    const up = this.buffers.get("volUp", n * 4)
    const down = this.buffers.get("volDown", n * 4)
    let u = 0
    let d = 0
    const width = Math.max(1, Math.floor(barPx * 0.7))
    let column = -1
    let peak = 0
    let rising = true
    const flush = () => {
      if (column < 0) return
      const height = Math.max(1, Math.round(peak * k))
      if (rising) {
        up[u++] = column; up[u++] = baseline - height; up[u++] = width; up[u++] = height
      } else {
        down[d++] = column; down[d++] = baseline - height; down[d++] = width; down[d++] = height
      }
    }
    for (let i = from; i <= to; i++) {
      const bar = this.bars[i]
      const next = barPx >= 1 ? Math.round(xOf(i + 0.5)) - (width >> 1) : Math.floor(xOf(i))
      if (next !== column) {
        flush()
        column = next
        peak = 0
      }
      if (bar.volume >= peak) {
        peak = bar.volume
        rising = bar.close >= bar.open
      }
    }
    flush()
    scene.push({ op: "rects", token: "price-up", data: up, count: u })
    scene.push({ op: "rects", token: "price-down", data: down, count: d })
  }

  private polyline(scene: Scene, key: string, series: SpikeSeries, from: number, to: number, barPx: number, xOf: (i: number) => number, yOf: (v: number) => number, dpr: number) {
    const n = to - from + 1
    const data = this.buffers.get(key, n * 4 + 8)
    let count = 0
    const width = barPx >= 1 ? Math.max(1, Math.round(dpr * 1.25)) : Math.max(1, Math.round(dpr * 0.75))
    const flushLine = () => {
      if (count >= 4) scene.push({ op: "polyline", token: series.token, width, data: data.slice(0, count), count })
      count = 0
    }
    if (barPx >= 1) {
      for (let i = from; i <= to; i++) {
        const value = series.values[i]
        if (value === null || value === undefined) {
          flushLine()
          continue
        }
        data[count++] = xOf(i + 0.5)
        data[count++] = yOf(value)
      }
    } else {
      // Mỗi cột pixel giữ giá trị vào, cao nhất, thấp nhất và ra để đường vẫn đúng hình.
      let column = -1
      let hi = -Infinity
      let lo = Infinity
      let last = 0
      const flush = () => {
        if (column < 0) return
        const top = yOf(hi)
        const bottom = yOf(lo)
        // Cột không có biên độ thấy được chỉ cần một đỉnh: phần lớn chi phí raster nằm ở số đỉnh.
        if (bottom - top >= 1) {
          data[count++] = column
          data[count++] = top
          data[count++] = column
          data[count++] = bottom
        }
        data[count++] = column
        data[count++] = yOf(last)
      }
      const buffer = this.buffers.get(key, Math.ceil(barPx * n + 2) * 6 + 8)
      if (buffer !== data) {
        // Bộ đệm được cấp lại đủ chỗ cho sáu số mỗi cột.
        return this.polyline(scene, key, series, from, to, barPx, xOf, yOf, dpr)
      }
      for (let i = from; i <= to; i++) {
        const value = series.values[i]
        if (value === null || value === undefined) continue
        const next = Math.floor(xOf(i))
        if (next !== column) {
          flush()
          column = next
          hi = value
          lo = value
        } else {
          if (value > hi) hi = value
          if (value < lo) lo = value
        }
        last = value
      }
      flush()
    }
    flushLine()
  }

  private histogram(scene: Scene, paneKey: string, series: SpikeSeries, from: number, to: number, barPx: number, xOf: (i: number) => number, yOf: (v: number) => number) {
    const n = to - from + 1
    const up = this.buffers.get(`${paneKey}:hu`, n * 4)
    const down = this.buffers.get(`${paneKey}:hd`, n * 4)
    let u = 0
    let d = 0
    const zero = yOf(0)
    const width = Math.max(1, Math.floor(barPx * 0.7))
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
        down[d++] = column; down[d++] = top; down[d++] = width; down[d++] = height
      }
    }
    for (let i = from; i <= to; i++) {
      const value = series.values[i]
      if (value === null || value === undefined) continue
      const next = barPx >= 1 ? Math.round(xOf(i + 0.5)) - (width >> 1) : Math.floor(xOf(i))
      if (next !== column) {
        flush()
        column = next
        extreme = value
      } else if (Math.abs(value) > Math.abs(extreme)) {
        extreme = value
      }
    }
    flush()
    scene.push({ op: "rects", token: "price-up", data: up, count: u })
    scene.push({ op: "rects", token: "price-down", data: down, count: d })
  }

  private band(scene: Scene, paneKey: string, band: SpikeBand, from: number, to: number, barPx: number, xOf: (i: number) => number, yOf: (v: number) => number) {
    const step = barPx >= 1 ? 1 : Math.max(1, Math.floor(1 / barPx))
    const size = Math.ceil((to - from + 1) / step) + 1
    const data = this.buffers.get(`${paneKey}:band`, size * 4)
    let count = 0
    for (let i = from; i <= to; i += step) {
      const value = band.upper[i]
      if (value === null || value === undefined) continue
      data[count++] = xOf(i + 0.5)
      data[count++] = yOf(value)
    }
    for (let i = to - ((to - from) % step); i >= from; i -= step) {
      const value = band.lower[i]
      if (value === null || value === undefined) continue
      data[count++] = xOf(i + 0.5)
      data[count++] = yOf(value)
    }
    if (count >= 6) scene.push({ op: "polygon", token: band.token, alpha: 0.08, data, count })
  }

  /** Hình vẽ: đoạn thẳng neo theo (chỉ số, giá) của ô giá. */
  drawingLayer(viewport: Viewport, geometry: Geometry): Scene {
    const { dpr } = geometry
    const plot = (geometry.width - geometry.axisRight) * dpr
    const barPx = plot / (viewport.to - viewport.from)
    const price = this.panes.find((pane) => pane.kind === "price")
    const scene: Scene = price ? [{ op: "clip", x: 0, y: price.top * dpr, width: plot, height: price.plotHeight * dpr }] : []
    const lines = new Map<string, number[]>()
    for (const drawing of this.drawings) {
      const list = lines.get(drawing.token) ?? []
      list.push((drawing.a.i - viewport.from) * barPx, this.priceY(drawing.a.price), (drawing.b.i - viewport.from) * barPx, this.priceY(drawing.b.price))
      lines.set(drawing.token, list)
    }
    for (const [token, list] of lines) scene.push({ op: "lines", token, width: Math.max(1, Math.round(dpr)), data: Float64Array.from(list), count: list.length })
    if (price) scene.push({ op: "unclip" })
    return scene
  }

  /** Trên cùng: crosshair và nhãn giá. */
  crosshair(pointer: { x: number; y: number } | null, viewport: Viewport, geometry: Geometry): Scene {
    if (!pointer) return []
    const { dpr } = geometry
    const plot = (geometry.width - geometry.axisRight) * dpr
    const barPx = plot / (viewport.to - viewport.from)
    const index = Math.floor(viewport.from + (pointer.x * dpr) / barPx)
    const snapped = (index + 0.5 - viewport.from) * barPx
    const bar = this.bars[Math.min(this.bars.length - 1, Math.max(0, index))]
    const y = pointer.y * dpr
    return [
      { op: "lines", token: "muted-foreground", width: Math.max(1, Math.floor(dpr)), data: Float64Array.of(Math.round(snapped), 0, Math.round(snapped), geometry.height * dpr, 0, y, plot, y), count: 8 },
      { op: "text", token: "foreground", text: bar ? `O ${bar.open} H ${bar.high} L ${bar.low} C ${bar.close}` : "", x: 8 * dpr, y: 18 * dpr, align: "left" },
    ]
  }
}

function formatPrice(value: number, tick: number): string {
  const size = Math.abs(value)
  if (size >= 1e9) return `${+(value / 1e9).toFixed(1)}B`
  if (size >= 1e6) return `${+(value / 1e6).toFixed(1)}M`
  if (size >= 1e4) return `${+(value / 1e3).toFixed(0)}K`
  return value.toFixed(tick >= 1 ? 0 : tick >= 0.1 ? 1 : 2)
}

/** Đổi token CSS (kể cả oklch) sang màu canvas, cùng cách với `toRgbColor` ở tradingview.ts. */
export function readPalette(tokens: readonly string[], host: HTMLElement): Map<string, string> {
  const probe = document.createElement("canvas")
  probe.width = 1
  probe.height = 1
  const context = probe.getContext("2d", { willReadFrequently: true })!
  const style = getComputedStyle(host)
  const palette = new Map<string, string>()
  for (const token of tokens) {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = style.getPropertyValue(`--${token}`).trim() || "#888"
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    palette.set(token, `rgb(${r}, ${g}, ${b})`)
  }
  return palette
}

export type TextMode = "native" | "tabular"

/** Bề rộng chữ số lớn nhất của font, dùng để tự căn cột khi Canvas không có tabular-nums. */
export function maxDigitWidth(context: CanvasRenderingContext2D): number {
  let width = 0
  for (let digit = 0; digit <= 9; digit++) width = Math.max(width, context.measureText(String(digit)).width)
  return width
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

function drawText(context: CanvasRenderingContext2D, command: Extract<Command, { op: "text" }>, mode: TextMode, cell: number) {
  if (mode === "native") {
    context.textAlign = command.align
    context.fillText(command.text, command.x, command.y)
    return
  }
  const { text } = command
  let total = 0
  for (let i = 0; i < text.length; i++) total += isDigit(text.charCodeAt(i)) ? cell : context.measureText(text[i]).width
  let x = command.align === "left" ? command.x : command.align === "right" ? command.x - total : command.x - total / 2
  context.textAlign = "left"
  for (let i = 0; i < text.length; i++) {
    const glyph = text[i]
    const width = context.measureText(glyph).width
    if (isDigit(text.charCodeAt(i))) {
      context.fillText(glyph, x + (cell - width) / 2, command.y)
      x += cell
    } else {
      context.fillText(glyph, x, command.y)
      x += width
    }
  }
}

export class Layer {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  constructor(host: HTMLElement) {
    this.canvas = document.createElement("canvas")
    host.appendChild(this.canvas)
    this.context = this.canvas.getContext("2d", { alpha: true })!
  }
  resize(geometry: Geometry) {
    this.canvas.width = Math.round(geometry.width * geometry.dpr)
    this.canvas.height = Math.round(geometry.height * geometry.dpr)
  }
  paint(scene: Scene, palette: Map<string, string>, geometry: Geometry, textMode: TextMode) {
    const { context } = this
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    context.font = `${11 * geometry.dpr}px "Be Vietnam Pro", sans-serif`
    context.textBaseline = "alphabetic"
    const cell = textMode === "tabular" ? maxDigitWidth(context) : 0
    for (const command of scene) {
      if (command.op === "clip") {
        context.save()
        context.beginPath()
        context.rect(command.x, command.y, command.width, command.height)
        context.clip()
        continue
      }
      if (command.op === "unclip") {
        context.restore()
        continue
      }
      const color = palette.get(command.token) ?? "#888"
      switch (command.op) {
        case "rects": {
          context.fillStyle = color
          const { data, count } = command
          for (let i = 0; i < count; i += 4) context.fillRect(data[i], data[i + 1], data[i + 2], data[i + 3])
          break
        }
        case "lines": {
          context.strokeStyle = color
          context.lineWidth = command.width
          context.beginPath()
          const { data, count } = command
          const nudge = command.width % 2 ? 0.5 : 0
          for (let i = 0; i < count; i += 4) {
            context.moveTo(data[i] + nudge, data[i + 1] + nudge)
            context.lineTo(data[i + 2] + nudge, data[i + 3] + nudge)
          }
          context.stroke()
          break
        }
        case "polyline": {
          context.strokeStyle = color
          context.lineWidth = command.width
          context.lineJoin = "bevel"
          context.beginPath()
          const { data, count } = command
          context.moveTo(data[0], data[1])
          for (let i = 2; i < count; i += 2) context.lineTo(data[i], data[i + 1])
          context.stroke()
          break
        }
        case "polygon": {
          context.fillStyle = color
          context.globalAlpha = command.alpha
          context.beginPath()
          const { data, count } = command
          context.moveTo(data[0], data[1])
          for (let i = 2; i < count; i += 2) context.lineTo(data[i], data[i + 1])
          context.closePath()
          context.fill()
          context.globalAlpha = 1
          break
        }
        case "text":
          context.fillStyle = color
          drawText(context, command, textMode, cell)
          break
      }
    }
  }
  flush() {
    // Ép trình duyệt vẽ xong để đo cả phần raster, không chỉ thời gian gọi lệnh.
    this.context.getImageData(0, 0, 1, 1)
  }
}
