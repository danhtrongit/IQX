/**
 * Lớp AI (docs/iqline-design.md §2, §7): mẫu hình AI vẽ đè lên ô giá, chỉ bằng màu `chart-7` (màu dành riêng cho AI), nét
 * phẳng, không tương tác và không lưu. Hàm thuần: cùng đầu vào cho cùng danh sách lệnh vẽ, cùng quy ước `dpr` với `commands.ts`
 * (toạ độ vào là CSS pixel của `PaneCoords`, lệnh ra là pixel thiết bị).
 */
import type { AiOverlay, DrawCommand, PaneCoords } from "../types"
import { defaultFormatPrice } from "./fib"
import { resolveAnchors } from "./geometry"

export const AI_OVERLAY_TOKEN = "chart-7" as const
const LINE_WIDTH = 1.7
const ZONE_ALPHA = 0.1
const DASH: readonly number[] = [6, 4]

export type AiOverlayOptions = { dpr?: number; formatPrice?: (price: number) => string }

function lines(width: number, segments: readonly (readonly [number, number, number, number])[], dpr: number, dash?: readonly number[]): DrawCommand {
  const data = new Float64Array(segments.length * 4)
  segments.forEach((segment, index) => {
    for (let k = 0; k < 4; k++) data[index * 4 + k] = segment[k] * dpr
  })
  return { op: "lines", token: AI_OVERLAY_TOKEN, width: width * dpr, dash: dash?.map((value) => value * dpr), data, count: data.length }
}

function label(text: string | undefined, x: number, y: number, align: "left" | "right" | "center", dpr: number): DrawCommand[] {
  return text ? [{ op: "text", token: AI_OVERLAY_TOKEN, text, x: x * dpr, y: y * dpr, align, size: 11 * dpr, weight: 600, tabular: false }] : []
}

/** Lệnh vẽ cho lớp "drawings", dưới hình của người dùng. Điểm neo không đổi được toạ độ thì bỏ qua phần tử đó. */
export function aiOverlayCommands(overlays: readonly AiOverlay[], coords: PaneCoords, options: AiOverlayOptions = {}): DrawCommand[] {
  if (overlays.length === 0) return []
  const dpr = options.dpr ?? 1
  const format = options.formatPrice ?? defaultFormatPrice
  const { plot } = coords
  const body: DrawCommand[] = []

  for (const overlay of overlays) {
    switch (overlay.kind) {
      case "level": {
        const y = coords.yOfPrice(overlay.price)
        if (!Number.isFinite(y)) break
        body.push(lines(LINE_WIDTH, [[plot.left, y, plot.right, y]], dpr, DASH))
        body.push(...label(overlay.label ? `${overlay.label} ${format(overlay.price)}` : format(overlay.price), plot.right - 6, y - 4, "right", dpr))
        break
      }
      case "path": {
        const points = resolveAnchors(overlay.points, coords)
        if (!points || points.length < 2) break
        const data = new Float64Array(points.length * 2)
        points.forEach((point, index) => {
          data[index * 2] = point.x * dpr
          data[index * 2 + 1] = point.y * dpr
        })
        body.push({ op: "polyline", token: AI_OVERLAY_TOKEN, width: LINE_WIDTH * dpr, dash: overlay.dashed ? DASH.map((value) => value * dpr) : undefined, data, count: data.length })
        const last = points[points.length - 1]
        body.push(...label(overlay.label, last.x + 6, last.y - 6, "left", dpr))
        break
      }
      case "zone": {
        const points = resolveAnchors([overlay.from, overlay.to], coords)
        if (!points) break
        const [a, b] = points
        const left = Math.min(a.x, b.x)
        const right = Math.max(a.x, b.x)
        const top = Math.min(a.y, b.y)
        const bottom = Math.max(a.y, b.y)
        if (right - left <= 0 || bottom - top <= 0) break
        body.push({ op: "rects", token: AI_OVERLAY_TOKEN, alpha: ZONE_ALPHA, data: Float64Array.of(left * dpr, top * dpr, (right - left) * dpr, (bottom - top) * dpr), count: 4 })
        body.push(lines(1, [[left, top, right, top], [right, top, right, bottom], [right, bottom, left, bottom], [left, bottom, left, top]], dpr))
        body.push(...label(overlay.label, left + 6, top + 14, "left", dpr))
        break
      }
      case "marker": {
        const points = resolveAnchors([overlay.anchor], coords)
        if (!points) break
        const [point] = points
        body.push({ op: "circle", token: AI_OVERLAY_TOKEN, x: point.x * dpr, y: point.y * dpr, radius: 4 * dpr, fill: true })
        body.push(...label(overlay.label, point.x + 8, point.y + 4, "left", dpr))
        break
      }
    }
  }
  if (body.length === 0) return []
  return [{ op: "clip", x: plot.left * dpr, y: plot.top * dpr, width: (plot.right - plot.left) * dpr, height: (plot.bottom - plot.top) * dpr }, ...body, { op: "unclip" }]
}
