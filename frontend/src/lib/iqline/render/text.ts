/**
 * Chữ trên Canvas. Be Vietnam Pro không có chữ số đều và `tabular-nums` không có tác dụng trên Canvas (báo cáo
 * Giai đoạn 0), nên mỗi chữ số được căn vào ô rộng bằng chữ số rộng nhất của font.
 */
import type { DrawCommand } from "../types"

export const DEFAULT_FONT_FAMILY = '"Be Vietnam Pro", sans-serif'
const WEIGHTS = [400, 500, 600] as const
/** Mẫu chữ để trình duyệt tải đủ tập con latin và vietnamese của font. */
const SAMPLE = "0123456789.,+-%KMB:/ Phiênđộ↑↓?"

/** Tải đủ các độ đậm cần dùng rồi mới đo và vẽ, nếu không số đo rơi vào font dự phòng. */
export function ensureFonts(family: string = DEFAULT_FONT_FAMILY): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve()
  return Promise.all(WEIGHTS.map((weight) => document.fonts.load(`${weight} 11px ${family}`, SAMPLE)))
    .then(() => undefined)
    .catch(() => undefined)
}

export function fontOf(size: number, weight: number, family: string): string {
  return `${weight} ${size}px ${family}`
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

type Text = Extract<DrawCommand, { op: "text" }>

/** Bộ vẽ chữ có nhớ bề rộng glyph; một bộ cho mỗi biểu đồ. Xoá nhớ khi đổi font. */
export class TextPainter {
  private glyphs = new Map<string, number>()
  private cells = new Map<string, number>()

  reset(): void {
    this.glyphs.clear()
    this.cells.clear()
  }

  private glyphWidth(context: CanvasRenderingContext2D, font: string, glyph: string): number {
    const key = `${font}|${glyph}`
    let width = this.glyphs.get(key)
    if (width === undefined) {
      width = context.measureText(glyph).width
      this.glyphs.set(key, width)
    }
    return width
  }

  /** Bề rộng chữ số lớn nhất của font. */
  cell(context: CanvasRenderingContext2D, font: string): number {
    let cell = this.cells.get(font)
    if (cell === undefined) {
      cell = 0
      for (let digit = 0; digit <= 9; digit += 1) cell = Math.max(cell, this.glyphWidth(context, font, String(digit)))
      this.cells.set(font, cell)
    }
    return cell
  }

  /** Bề rộng của chuỗi khi căn số theo ô; dùng cho test và đo nhãn. */
  measure(context: CanvasRenderingContext2D, font: string, text: string, tabular: boolean): number {
    if (!tabular) return context.measureText(text).width
    const cell = this.cell(context, font)
    let total = 0
    for (let index = 0; index < text.length; index += 1) total += isDigit(text.charCodeAt(index)) ? cell : this.glyphWidth(context, font, text[index])
    return total
  }

  draw(context: CanvasRenderingContext2D, command: Text, font: string): void {
    let hasDigit = false
    if (command.tabular) for (let index = 0; index < command.text.length; index += 1) if (isDigit(command.text.charCodeAt(index))) { hasDigit = true; break }
    if (!hasDigit) {
      context.textAlign = command.align
      context.fillText(command.text, command.x, command.y)
      return
    }
    const cell = this.cell(context, font)
    const total = this.measure(context, font, command.text, true)
    let x = command.align === "left" ? command.x : command.align === "right" ? command.x - total : command.x - total / 2
    context.textAlign = "left"
    for (let index = 0; index < command.text.length; index += 1) {
      const glyph = command.text[index]
      if (isDigit(command.text.charCodeAt(index))) {
        context.fillText(glyph, x + (cell - this.glyphWidth(context, font, glyph)) / 2, command.y)
        x += cell
      } else {
        context.fillText(glyph, x, command.y)
        x += this.glyphWidth(context, font, glyph)
      }
    }
  }
}
