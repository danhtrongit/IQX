/**
 * Đọc token màu cho Canvas (docs/iqline-design.md §7). Canvas không hiểu `var(--x)` và `oklch()` có thể trả về
 * dạng không phải rgb, nên mỗi token được đọc qua `getComputedStyle` rồi đổi sang `rgb()` bằng một canvas 1x1,
 * cùng cách với `toRgbColor` ở `pages/charts/chart/tradingview.ts`. Chỉ đọc khi đổi giao diện, không đọc trong
 * vòng vẽ.
 */
import type { ColorToken } from "../types"

export const COLOR_TOKENS: readonly ColorToken[] = [
  "background",
  "foreground",
  "border",
  "muted-foreground",
  "academy-label",
  "price-up",
  "price-down",
  "price-ref",
  "price-ceiling",
  "price-floor",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
]

export type Palette = Record<ColorToken, string>

const FALLBACK = "#888888"

let probe: CanvasRenderingContext2D | null | undefined

function probeContext(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe
  if (typeof document === "undefined") return (probe = null)
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  try {
    probe = canvas.getContext("2d", { willReadFrequently: true })
  } catch {
    probe = null
  }
  return probe
}

/** Màu CSS bất kỳ (hex, oklch, color-mix...) sang `rgb()` hoặc `rgba()`; `fallback` khi không đổi được. */
export function toRgbColor(value: string, fallback = FALLBACK): string {
  const context = probeContext()
  if (!context || !value) return fallback
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = "#000000"
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  if (![r, g, b, a].every((channel) => typeof channel === "number")) return fallback
  return a < 255 ? `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})` : `rgb(${r}, ${g}, ${b})`
}

export function readPalette(host: Element): Palette {
  const style = getComputedStyle(host)
  const palette = {} as Palette
  for (const token of COLOR_TOKENS) palette[token] = toRgbColor(style.getPropertyValue(`--${token}`).trim(), FALLBACK)
  return palette
}

const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

/**
 * Báo mỗi khi giao diện đổi (class hoặc thuộc tính theme trên `<html>`). Dùng chung một MutationObserver cho
 * mọi biểu đồ; trả về hàm huỷ.
 */
export function observeTheme(listener: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => undefined
  listeners.add(listener)
  if (!observer) {
    observer = new MutationObserver(() => {
      for (const item of listeners) item()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}
