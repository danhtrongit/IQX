/**
 * Đẩy một `Scene` ra Canvas 2D. Mỏng có chủ ý: mọi quyết định hình học đã nằm trong `scene/`. Toạ độ và cỡ chữ
 * trong lệnh là pixel thiết bị; đường kẻ có toạ độ nguyên nên nét lẻ được dịch nửa pixel để không nhoè.
 * Không dùng `getImageData` (ép Chrome rơi về raster phần mềm).
 */
import type { Scene } from "../types"
import type { Palette } from "./palette"
import { TextPainter, fontOf } from "./text"

export type PaintOptions = {
  palette: Palette
  fontFamily: string
  /** Cỡ chữ mặc định (pixel thiết bị) khi lệnh không ghi `size`. */
  defaultSize: number
  text: TextPainter
}

export function paintScene(context: CanvasRenderingContext2D, scene: Scene, options: PaintOptions): void {
  const { palette, text } = options
  let font = ""
  context.textBaseline = "alphabetic"
  context.lineCap = "butt"
  let depth = 0
  for (const command of scene) {
    switch (command.op) {
      case "clip":
        context.save()
        depth += 1
        context.beginPath()
        context.rect(command.x, command.y, command.width, command.height)
        context.clip()
        font = ""
        break
      case "unclip":
        if (depth > 0) {
          context.restore()
          depth -= 1
          font = ""
        }
        break
      case "rects": {
        context.fillStyle = palette[command.token]
        context.globalAlpha = command.alpha ?? 1
        const { data, count } = command
        for (let index = 0; index + 3 < count; index += 4) context.fillRect(data[index], data[index + 1], data[index + 2], data[index + 3])
        context.globalAlpha = 1
        break
      }
      case "lines": {
        context.strokeStyle = palette[command.token]
        context.globalAlpha = command.alpha ?? 1
        context.lineWidth = command.width
        context.setLineDash(command.dash ? [...command.dash] : [])
        context.beginPath()
        const { data, count } = command
        const nudge = command.width % 2 ? 0.5 : 0
        for (let index = 0; index + 3 < count; index += 4) {
          context.moveTo(data[index] + nudge, data[index + 1] + nudge)
          context.lineTo(data[index + 2] + nudge, data[index + 3] + nudge)
        }
        context.stroke()
        context.setLineDash([])
        context.globalAlpha = 1
        break
      }
      case "polyline": {
        if (command.count < 4) break
        context.strokeStyle = palette[command.token]
        context.globalAlpha = command.alpha ?? 1
        context.lineWidth = command.width
        context.lineJoin = "bevel"
        context.setLineDash(command.dash ? [...command.dash] : [])
        context.beginPath()
        const { data, count } = command
        context.moveTo(data[0], data[1])
        for (let index = 2; index + 1 < count; index += 2) context.lineTo(data[index], data[index + 1])
        context.stroke()
        context.setLineDash([])
        context.globalAlpha = 1
        break
      }
      case "polygon": {
        if (command.count < 6) break
        context.fillStyle = palette[command.token]
        context.globalAlpha = command.alpha
        context.beginPath()
        const { data, count } = command
        context.moveTo(data[0], data[1])
        for (let index = 2; index + 1 < count; index += 2) context.lineTo(data[index], data[index + 1])
        context.closePath()
        context.fill()
        context.globalAlpha = 1
        break
      }
      case "circle":
        context.beginPath()
        context.arc(command.x, command.y, command.radius, 0, Math.PI * 2)
        if (command.fill) {
          context.fillStyle = palette[command.token]
          context.fill()
        } else {
          context.strokeStyle = palette[command.token]
          context.lineWidth = command.width ?? 1
          context.stroke()
        }
        break
      case "text": {
        const next = fontOf(command.size ?? options.defaultSize, command.weight ?? 400, options.fontFamily)
        if (next !== font) {
          font = next
          context.font = font
        }
        context.fillStyle = palette[command.token]
        text.draw(context, command, font)
        break
      }
    }
  }
  // Lệnh clip không đóng (lỗi của bên dựng cảnh) không được làm hỏng khung hình sau.
  while (depth > 0) {
    context.restore()
    depth -= 1
  }
  context.globalAlpha = 1
}
