/**
 * Ngữ cảnh vẽ của một ô và các hàm dùng chung. Mọi số trong lệnh vẽ là pixel thiết bị (đã nhân `dpr`), kể cả cỡ
 * chữ; toạ độ của đường kẻ là số nguyên để adapter căn nét về pixel.
 */
import type { ColorToken, DrawCommand, Scene, TextAlign } from "../types"
import type { Buffers } from "./buffers"
import type { ChartFrame, PaneFrame } from "./model"

export type PaneDraw = {
  dpr: number
  /** Bề rộng một nến theo pixel thiết bị; dưới 1 thì gộp theo cột pixel. */
  barPx: number
  merged: boolean
  /** Dải nến thật còn thấy trong viewport. */
  first: number
  last: number
  left: number
  right: number
  top: number
  bottom: number
  /** Toạ độ ngang của tâm nến `index`. */
  xOf(index: number): number
  yOf(price: number): number
  bufs: Buffers
}

/** Null khi không có nến nào thấy được (viewport chỉ có ô trống). */
export function createPaneDraw(frame: ChartFrame, pane: PaneFrame, bufs: Buffers): PaneDraw | null {
  const { dpr } = frame.view.geometry
  const { viewport } = frame.view
  const barPx = frame.barPx * dpr
  const left = frame.plot.left * dpr
  const visible = frame.visible
  if (!visible) return null
  return {
    dpr,
    barPx,
    merged: barPx < 1,
    first: visible.first,
    last: visible.last,
    left,
    right: frame.plot.right * dpr,
    top: pane.box.top * dpr,
    bottom: (pane.box.top + pane.box.height) * dpr,
    xOf: (index) => left + (index - viewport.from) * barPx,
    yOf: (price) => pane.scale.yOf(price) * dpr,
    bufs,
  }
}

/** Nét 1 CSS pixel của lưới và đường kẻ: nguyên số pixel thiết bị. */
export function hairline(dpr: number): number {
  return Math.max(1, Math.floor(dpr))
}

export function dashOf(dpr: number, on = 4, off = 4): readonly number[] {
  return [Math.max(1, Math.round(on * dpr)), Math.max(1, Math.round(off * dpr))]
}

export const AXIS_FONT_SIZE = 11

export function textCommand(
  token: ColorToken,
  text: string,
  x: number,
  y: number,
  align: TextAlign,
  dpr: number,
  options: { size?: number; weight?: 400 | 500 | 600; tabular?: boolean } = {},
): DrawCommand {
  return { op: "text", token, text, x, y, align, size: (options.size ?? AXIS_FONT_SIZE) * dpr, weight: options.weight, tabular: options.tabular ?? true }
}

export function clipCommand(d: Pick<PaneDraw, "left" | "right" | "top" | "bottom">): DrawCommand {
  return { op: "clip", x: d.left, y: d.top, width: d.right - d.left, height: d.bottom - d.top }
}

/** Chỉ thêm lệnh rects khi có hình để vẽ. */
export function pushRects(scene: Scene, token: ColorToken, data: Float64Array, count: number, alpha?: number): void {
  if (count > 0) scene.push({ op: "rects", token, alpha, data, count })
}
