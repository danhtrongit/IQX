/**
 * Bốn lớp canvas chồng nhau (docs/iqline-design.md §7). Mỗi lớp vẽ lại độc lập, mọi yêu cầu vẽ gom vào một
 * `requestAnimationFrame`. Lớp trên cùng nhận sự kiện con trỏ; ba lớp dưới không bắt sự kiện.
 *
 * | Lớp      | Nội dung                         | Vẽ lại khi                            |
 * |----------|----------------------------------|---------------------------------------|
 * | base     | lưới, trục, mặt nạ tương lai     | đổi viewport, kích thước, giao diện   |
 * | data     | nến, khối lượng, chỉ báo, đánh dấu | đổi dữ liệu hoặc viewport           |
 * | drawings | các hình đã vẽ                   | đổi hình hoặc viewport                |
 * | top      | crosshair, bản xem trước, tay nắm | mỗi lần di chuột                     |
 */
import type { Layer, Scene } from "../types"
import { paintScene } from "./paint"
import { observeTheme, readPalette, type Palette } from "./palette"
import { DEFAULT_FONT_FAMILY, TextPainter, ensureFonts } from "./text"

export const LAYERS: readonly Layer[] = ["base", "data", "drawings", "top"]
/** Giới hạn DPR để máy không GPU không phải tô quá nhiều pixel (docs/iqline-design.md §14). */
export const MAX_DPR = 2

export function resolveDpr(raw: number | undefined): number {
  const value = raw ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio)
  return Math.min(MAX_DPR, value && value > 0 ? value : 1)
}

export type CanvasStackOptions = {
  /** Dựng cảnh của một lớp khi đến lượt vẽ. Trả về null để chỉ xoá lớp. */
  build: (layer: Layer) => Scene | null
  /** Cỡ chữ mặc định tính theo CSS pixel. */
  fontSize?: number
}

export type CanvasStack = {
  readonly canvases: Readonly<Record<Layer, HTMLCanvasElement>>
  /** Lớp trên cùng, nơi gắn sự kiện con trỏ. */
  readonly interactive: HTMLCanvasElement
  /** Kích thước theo CSS pixel. Đổi kích thước xoá nội dung nên vẽ lại mọi lớp. */
  resize(width: number, height: number, dpr: number): void
  /** Yêu cầu vẽ lại; nhiều yêu cầu trong cùng một khung hình chỉ vẽ một lần. */
  invalidate(...layers: Layer[]): void
  /** Đọc lại token màu (đổi giao diện) rồi vẽ lại mọi lớp. */
  refreshPalette(): void
  destroy(): void
}

const STYLE: Record<Layer, string> = {
  base: "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;",
  data: "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;",
  drawings: "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;",
  top: "position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;",
}

export function createCanvasStack(host: HTMLElement, options: CanvasStackOptions): CanvasStack {
  const canvases = {} as Record<Layer, HTMLCanvasElement>
  const contexts = {} as Record<Layer, CanvasRenderingContext2D | null>
  for (const layer of LAYERS) {
    const canvas = document.createElement("canvas")
    canvas.style.cssText = STYLE[layer]
    canvas.dataset.iqlineLayer = layer
    host.appendChild(canvas)
    canvases[layer] = canvas
    contexts[layer] = canvas.getContext("2d", { alpha: true })
  }

  const text = new TextPainter()
  let palette: Palette | null = null
  let paletteStale = true
  let fontFamily = DEFAULT_FONT_FAMILY
  let dpr = 1
  let frame = 0
  let destroyed = false
  const dirty = new Set<Layer>()

  const readStyle = () => {
    palette = readPalette(host)
    const family = getComputedStyle(host).getPropertyValue("--font-sans").trim()
    fontFamily = family || DEFAULT_FONT_FAMILY
    text.reset()
    paletteStale = false
  }

  const flush = () => {
    frame = 0
    if (destroyed) return
    if (paletteStale || !palette) readStyle()
    for (const layer of LAYERS) {
      if (!dirty.has(layer)) continue
      const context = contexts[layer]
      if (!context || !palette) continue
      context.clearRect(0, 0, canvases[layer].width, canvases[layer].height)
      const scene = options.build(layer)
      if (scene && scene.length > 0) {
        paintScene(context, scene, { palette, fontFamily, defaultSize: (options.fontSize ?? 11) * dpr, text })
      }
    }
    dirty.clear()
  }

  const schedule = () => {
    if (frame || destroyed) return
    frame = requestAnimationFrame(flush)
  }

  const invalidate = (...layers: Layer[]) => {
    for (const layer of layers.length ? layers : LAYERS) dirty.add(layer)
    schedule()
  }

  const refreshPalette = () => {
    paletteStale = true
    invalidate()
  }

  const stopTheme = observeTheme(refreshPalette)
  // Font tải xong sau lần vẽ đầu thì số đo cũ rơi vào font dự phòng: đo lại và vẽ lại.
  void ensureFonts(DEFAULT_FONT_FAMILY).then(() => {
    if (destroyed) return
    text.reset()
    invalidate()
  })
  const onFontsDone = () => {
    text.reset()
    invalidate()
  }
  document.fonts?.addEventListener?.("loadingdone", onFontsDone)

  return {
    canvases,
    interactive: canvases.top,
    resize(width, height, nextDpr) {
      dpr = nextDpr
      for (const layer of LAYERS) {
        const canvas = canvases[layer]
        const w = Math.max(1, Math.round(width * dpr))
        const h = Math.max(1, Math.round(height * dpr))
        if (canvas.width !== w) canvas.width = w
        if (canvas.height !== h) canvas.height = h
      }
      invalidate()
    },
    invalidate,
    refreshPalette,
    destroy() {
      destroyed = true
      if (frame) cancelAnimationFrame(frame)
      stopTheme()
      document.fonts?.removeEventListener?.("loadingdone", onFontsDone)
      for (const layer of LAYERS) canvases[layer].remove()
    },
  }
}
