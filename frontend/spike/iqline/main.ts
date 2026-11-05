import "@/index.css"

import { computeIndicator } from "@/pages/demo-trading/flashback/flashback-indicators"

import { Layer, layoutPanes, readPalette, SceneBuilder, type Bar, type Drawing, type Geometry, type SpikePane, type TextMode, type Viewport } from "./engine"

const TOKENS = ["background", "foreground", "border", "muted-foreground", "price-up", "price-down", "chart-1", "chart-2", "chart-5", "chart-6", "chart-8"]

type Stats = { p50: number; p95: number; max: number; mean: number; n: number }

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0, mean: samples.reduce((sum, v) => sum + v, 0) / samples.length, n: samples.length }
}

async function loadBars(names: string[], limit: number): Promise<Bar[]> {
  const all: Bar[] = []
  for (const name of names) {
    const response = await fetch(`./data/${name}.json`)
    all.push(...((await response.json()) as Bar[]))
  }
  return limit ? all.slice(-limit) : all
}

/** 5 chỉ báo của mục tiêu §14: MA, EMA, Bollinger trên ô giá, RSI và MACD ô riêng. */
function buildPanes(bars: readonly Bar[], mobile: boolean): { panes: SpikePane[]; computeMs: number } {
  const start = performance.now()
  const ma = computeIndicator("ma", { period: 20 }, bars)
  const ema = computeIndicator("ema", { period: 50 }, bars)
  const bollinger = computeIndicator("bollinger", { period: 20, mult: 2 }, bars)
  const rsi = computeIndicator("rsi", { period: 14 }, bars)
  const macd = computeIndicator("macd", { fast: 12, slow: 26, signal: 9 }, bars)
  const computeMs = performance.now() - start
  const band = (key: string) => bollinger.series.find((series) => series.key === key)!.values
  const height = mobile ? { volume: 64, indicator: 84 } : { volume: 80, indicator: 100 }
  return {
    computeMs,
    panes: [
      {
        key: "price",
        kind: "price",
        height: 0,
        bands: [{ upper: band("u"), lower: band("l"), token: "chart-6" }],
        series: [
          { values: ma.series[0].values, token: "chart-1" },
          { values: ema.series[0].values, token: "chart-8" },
          { values: band("u"), token: "chart-6" },
          { values: band("l"), token: "chart-6" },
          { values: band("m"), token: "chart-1" },
        ],
      },
      { key: "volume", kind: "volume", height: height.volume, bands: [], series: [] },
      { key: "rsi", kind: "indicator", height: height.indicator, bands: [], range: [0, 100], series: [{ values: rsi.series[0].values, token: "chart-1" }] },
      {
        key: "macd",
        kind: "indicator",
        height: height.indicator,
        bands: [],
        series: macd.series.map((series) => (series.histogram ? { values: series.values, token: "chart-5", histogram: true } : { values: series.values, token: series.key === "s" ? "chart-2" : "chart-1" })),
      },
    ],
  }
}

function sampleDrawings(barCount: number, bars: readonly Bar[], count: number): Drawing[] {
  return Array.from({ length: count }, (_, index) => {
    const a = Math.floor((barCount * index) / count)
    const b = Math.min(barCount - 1, a + 40)
    return { a: { i: a, price: bars[a].close }, b: { i: b, price: bars[b].close }, token: index % 2 ? "chart-2" : "chart-6" }
  })
}

const params = new URLSearchParams(location.search)
const host = document.getElementById("chart")!
if (params.get("theme") === "light") document.documentElement.classList.remove("dark")

const layers = { base: new Layer(host), data: new Layer(host), drawings: new Layer(host), top: new Layer(host) }
const builder = new SceneBuilder()
let palette = readPalette(TOKENS, document.documentElement)
let textMode: TextMode = "tabular"
let viewport: Viewport = { from: 0, to: 1 }
let pointer: { x: number; y: number } | null = null
let geometry: Geometry
let panes: SpikePane[] = []
let lastComputeMs = 0
const formatX = (bar: Bar) => new Date((bar.time + 7 * 3600) * 1000).toISOString().slice(5, 10)

function measureGeometry(): Geometry {
  const rect = host.getBoundingClientRect()
  return { width: rect.width, height: rect.height, dpr: devicePixelRatio, axisRight: 56, axisBottom: 22 }
}

function resize() {
  geometry = measureGeometry()
  for (const layer of Object.values(layers)) layer.resize(geometry)
  builder.panes = layoutPanes(panes, geometry)
}

function renderViewport() {
  layers.base.paint(builder.base(viewport, geometry, formatX), palette, geometry, textMode)
  layers.data.paint(builder.data(viewport, geometry), palette, geometry, textMode)
  layers.drawings.paint(builder.drawingLayer(viewport, geometry), palette, geometry, textMode)
  renderTop()
}

function renderTop() {
  layers.top.paint(builder.crosshair(pointer, viewport, geometry), palette, geometry, textMode)
}

function flushAll() {
  for (const layer of Object.values(layers)) layer.flush()
}

let frame = 0
function schedule(full: boolean) {
  needsFull ||= full
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (needsFull) renderViewport()
    else renderTop()
    needsFull = false
  })
}
let needsFull = false

function clampViewport(next: Viewport): Viewport {
  const span = Math.max(10, Math.min(builder.bars.length + 20, next.to - next.from))
  const to = Math.min(builder.bars.length + 20, Math.max(span * 0.1, next.to))
  return { from: to - span, to }
}

let dragX: number | null = null
host.addEventListener("pointerdown", (event) => {
  dragX = event.clientX
  host.setPointerCapture(event.pointerId)
})
host.addEventListener("pointerup", () => (dragX = null))
host.addEventListener("pointermove", (event) => {
  if (!panes.length) return
  pointer = { x: event.offsetX, y: event.offsetY }
  if (dragX === null) return schedule(false)
  const span = viewport.to - viewport.from
  const delta = ((event.clientX - dragX) / (geometry.width - geometry.axisRight)) * span
  dragX = event.clientX
  viewport = clampViewport({ from: viewport.from - delta, to: viewport.to - delta })
  schedule(true)
})
host.addEventListener("wheel", (event) => {
  event.preventDefault()
  const span = viewport.to - viewport.from
  const factor = Math.exp(event.deltaY * 0.002)
  const anchor = viewport.from + (event.offsetX / (geometry.width - geometry.axisRight)) * span
  viewport = clampViewport({ from: anchor - (anchor - viewport.from) * factor, to: anchor + (viewport.to - anchor) * factor })
  schedule(true)
}, { passive: false })
new ResizeObserver(() => {
  if (!panes.length) return
  resize()
  schedule(true)
}).observe(host)

type LoadOptions = { names: string[]; limit?: number; visible?: number; drawings?: number; mobile?: boolean }

async function load(options: LoadOptions) {
  const bars = await loadBars(options.names, options.limit ?? 0)
  builder.bars = bars
  await document.fonts.ready
  await document.fonts.load('11px "Be Vietnam Pro"', "0123456789")
  const start = performance.now()
  const built = buildPanes(bars, options.mobile ?? false)
  panes = built.panes
  lastComputeMs = built.computeMs
  builder.drawings = sampleDrawings(bars.length, bars, options.drawings ?? 20)
  resize()
  const visible = options.visible ?? bars.length
  viewport = { from: bars.length - visible, to: bars.length }
  renderViewport()
  flushAll()
  return { bars: bars.length, computeMs: built.computeMs, firstFrameMs: performance.now() - start - built.computeMs, width: geometry.width, height: geometry.height, dpr: geometry.dpr }
}

/** Đo đồng bộ từng khung hình: dựng cảnh, gọi lệnh vẽ, rồi ép raster. */
function bench(options: { kind: "pan" | "zoom" | "crosshair"; frames?: number; visible?: number; flush?: boolean }) {
  const frames = options.frames ?? 120
  const flushing = options.flush ?? false
  if (options.visible) viewport = { from: builder.bars.length - options.visible, to: builder.bars.length }
  const base = { ...viewport }
  const scene: number[] = []
  const paint: number[] = []
  const flush: number[] = []
  const total: number[] = []
  for (let index = 0; index < frames; index++) {
    const phase = index / frames
    const span = base.to - base.from
    if (options.kind === "pan") {
      const room = Math.max(0, base.from)
      const shift = room * 0.5 * (1 - Math.cos(phase * Math.PI * 2)) * 0.5
      viewport = { from: base.from - shift, to: base.to - shift }
    } else if (options.kind === "zoom") {
      const factor = 1 + 0.4 * Math.sin(phase * Math.PI * 2)
      viewport = { from: base.to - span * factor, to: base.to }
    } else {
      pointer = { x: geometry.width * (0.1 + 0.7 * phase), y: geometry.height * (0.1 + 0.6 * phase) }
    }
    const t0 = performance.now()
    if (options.kind === "crosshair") {
      const top = builder.crosshair(pointer, viewport, geometry)
      const t1 = performance.now()
      layers.top.paint(top, palette, geometry, textMode)
      const t2 = performance.now()
      if (flushing) layers.top.flush()
      const t3 = performance.now()
      scene.push(t1 - t0); paint.push(t2 - t1); flush.push(t3 - t2); total.push(t3 - t0)
    } else {
      const baseScene = builder.base(viewport, geometry, formatX)
      const dataScene = builder.data(viewport, geometry)
      const drawingScene = builder.drawingLayer(viewport, geometry)
      const topScene = builder.crosshair(pointer, viewport, geometry)
      const t1 = performance.now()
      layers.base.paint(baseScene, palette, geometry, textMode)
      layers.data.paint(dataScene, palette, geometry, textMode)
      layers.drawings.paint(drawingScene, palette, geometry, textMode)
      layers.top.paint(topScene, palette, geometry, textMode)
      const t2 = performance.now()
      if (flushing) flushAll()
      const t3 = performance.now()
      scene.push(t1 - t0); paint.push(t2 - t1); flush.push(t3 - t2); total.push(t3 - t0)
    }
  }
  viewport = base
  return { scene: stats(scene), paint: stats(paint), flush: stats(flush), total: stats(total) }
}

/** Đo nhịp khung hình thật qua requestAnimationFrame khi kéo liên tục. */
function cadence(options: { frames?: number; visible?: number }): Promise<Stats & { over20: number; mainThread: Stats }> {
  const frames = options.frames ?? 240
  if (options.visible) viewport = { from: builder.bars.length - options.visible, to: builder.bars.length }
  const base = { ...viewport }
  return new Promise((resolve) => {
    const deltas: number[] = []
    const work: number[] = []
    let previous = 0
    let index = 0
    const tick = (now: number) => {
      if (previous) deltas.push(now - previous)
      previous = now
      const shift = Math.max(0, base.from) * 0.25 * (1 - Math.cos((index / frames) * Math.PI * 2))
      viewport = { from: base.from - shift, to: base.to - shift }
      const before = performance.now()
      renderViewport()
      work.push(performance.now() - before)
      if (++index < frames) requestAnimationFrame(tick)
      else {
        viewport = base
        resolve({ ...stats(deltas), over20: deltas.filter((delta) => delta > 20).length, mainThread: stats(work) })
      }
    }
    requestAnimationFrame(tick)
  })
}

/** §15: chữ số trên Canvas có bằng nhau không, so với DOM dùng tabular-nums. */
async function tabularProbe() {
  // Phải tải đủ các độ đậm, nếu không số đo rơi vào font dự phòng.
  await Promise.all([400, 500, 600, 700].map((weight) => document.fonts.load(`${weight} 11px "Be Vietnam Pro"`, "0123456789")))
  const context = layers.top.context
  const report: Record<string, unknown> = {}
  for (const weight of [400, 500, 600, 700]) {
    context.font = `${weight} 11px "Be Vietnam Pro"`
    const canvas = [..."0123456789"].map((digit) => +context.measureText(digit).width.toFixed(3))
    const span = document.createElement("span")
    span.style.cssText = `position:absolute;visibility:hidden;font:${weight} 11px "Be Vietnam Pro"`
    document.body.appendChild(span)
    const measure = (numeric: string) => {
      span.style.fontVariantNumeric = numeric
      return [..."0123456789"].map((digit) => {
        span.textContent = digit
        return +span.getBoundingClientRect().width.toFixed(3)
      })
    }
    const domTabular = measure("tabular-nums")
    const domProportional = measure("normal")
    span.remove()
    // Thử bật tabular-nums cho Canvas qua style của phần tử (một số trình duyệt có thể kế thừa).
    const canvasElement = layers.top.canvas
    canvasElement.style.fontVariantNumeric = "tabular-nums"
    canvasElement.style.fontFeatureSettings = '"tnum"'
    context.font = `${weight} 11px "Be Vietnam Pro"`
    const canvasStyled = [..."0123456789"].map((digit) => +context.measureText(digit).width.toFixed(3))
    canvasElement.style.fontVariantNumeric = ""
    canvasElement.style.fontFeatureSettings = ""
    const spread = (values: number[]) => +(Math.max(...values) - Math.min(...values)).toFixed(3)
    report[weight] = { canvas, canvasSpread: spread(canvas), canvasStyledSpread: spread(canvasStyled), domTabularSpread: spread(domTabular), domProportionalSpread: spread(domProportional), domTabular }
  }
  return { fontVariantCapsInCtx: "fontVariantCaps" in context, letterSpacingInCtx: "letterSpacing" in context, fontLoaded: document.fonts.check('11px "Be Vietnam Pro"'), report }
}

function setTextMode(mode: TextMode) {
  textMode = mode
  renderViewport()
}
function setTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark")
  palette = readPalette(TOKENS, document.documentElement)
  renderViewport()
}

declare global {
  interface Window {
    iqlineSpike: unknown
  }
}
window.iqlineSpike = { load, bench, cadence, tabularProbe, setTextMode, setTheme, computeMs: () => lastComputeMs, setPointer: (x: number, y: number) => { pointer = { x, y }; renderTop() } }
