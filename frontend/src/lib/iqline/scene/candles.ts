/**
 * Chuỗi giá chính: nến, nến rỗng, thanh OHLC, đường, vùng (Heikin Ashi là nến trên dữ liệu đã đổi).
 * Cách vẽ giữ từ bản thử Giai đoạn 0: gom theo màu vào mảng số dùng lại, gộp theo cột pixel khi nến hẹp dưới
 * 1px, căn nến về pixel nguyên.
 */
import type { Bar, ChartType, Scene } from "../types"
import { DOWN_TOKEN, MAIN_SERIES_TOKEN, UP_TOKEN } from "./colors"
import { pushRects, type PaneDraw } from "./draw"

/** Độ mờ tô vùng của biểu đồ vùng (DESIGN.md §2.5: 12 đến 18%). */
export const AREA_ALPHA = 0.15

export function drawMainSeries(scene: Scene, d: PaneDraw, bars: readonly Bar[], chartType: ChartType): void {
  if (chartType === "line" || chartType === "area") drawLine(scene, d, bars, chartType === "area")
  else drawBars(scene, d, bars, chartType === "hollow" ? "hollow" : chartType === "ohlc" ? "ohlc" : "candles")
}

function drawBars(scene: Scene, d: PaneDraw, bars: readonly Bar[], style: "candles" | "hollow" | "ohlc"): void {
  const count = d.last - d.first + 1
  // Tối đa 16 số mỗi nến ở mỗi mảng (viền rỗng: 4 cạnh).
  const size = count * 16 + 16
  const upWick = d.bufs.get("cndl.upWick", size)
  const downWick = d.bufs.get("cndl.downWick", size)
  const upBody = d.bufs.get("cndl.upBody", size)
  const downBody = d.bufs.get("cndl.downBody", size)
  let uw = 0
  let dw = 0
  let ub = 0
  let db = 0

  if (!d.merged) {
    const wick = Math.max(1, Math.round(d.dpr), Math.floor(d.barPx / 12))
    let body = Math.max(wick, Math.floor(d.barPx * 0.7))
    if ((body - wick) & 1) body -= 1
    const border = Math.max(1, Math.round(d.dpr))
    const tick = Math.max(1, Math.floor(d.barPx * 0.35))
    for (let index = d.first; index <= d.last; index += 1) {
      const bar = bars[index]
      const center = Math.round(d.xOf(index))
      const up = bar.close >= bar.open
      const wickTop = Math.round(d.yOf(bar.high))
      const wickHeight = Math.max(1, Math.round(d.yOf(bar.low)) - wickTop)
      const wickLeft = center - (wick >> 1)
      const wicks = up ? upWick : downWick
      let w = up ? uw : dw

      if (style === "ohlc") {
        wicks[w++] = wickLeft; wicks[w++] = wickTop; wicks[w++] = wick; wicks[w++] = wickHeight
        const yOpen = Math.round(d.yOf(bar.open)) - (wick >> 1)
        const yClose = Math.round(d.yOf(bar.close)) - (wick >> 1)
        wicks[w++] = wickLeft - tick; wicks[w++] = yOpen; wicks[w++] = tick; wicks[w++] = wick
        wicks[w++] = wickLeft + wick; wicks[w++] = yClose; wicks[w++] = tick; wicks[w++] = wick
        if (up) uw = w
        else dw = w
        continue
      }

      wicks[w++] = wickLeft; wicks[w++] = wickTop; wicks[w++] = wick; wicks[w++] = wickHeight
      if (up) uw = w
      else dw = w

      const yOpen = d.yOf(bar.open)
      const yClose = d.yOf(bar.close)
      const bodyTop = Math.round(Math.min(yOpen, yClose))
      const bodyHeight = Math.max(1, Math.round(Math.abs(yOpen - yClose)))
      const left = center - (body >> 1)
      if (style === "hollow" && up) {
        if (body <= border * 2 || bodyHeight <= border * 2) {
          upBody[ub++] = left; upBody[ub++] = bodyTop; upBody[ub++] = body; upBody[ub++] = bodyHeight
        } else {
          upBody[ub++] = left; upBody[ub++] = bodyTop; upBody[ub++] = body; upBody[ub++] = border
          upBody[ub++] = left; upBody[ub++] = bodyTop + bodyHeight - border; upBody[ub++] = body; upBody[ub++] = border
          upBody[ub++] = left; upBody[ub++] = bodyTop + border; upBody[ub++] = border; upBody[ub++] = bodyHeight - border * 2
          upBody[ub++] = left + body - border; upBody[ub++] = bodyTop + border; upBody[ub++] = border; upBody[ub++] = bodyHeight - border * 2
        }
      } else if (up) {
        upBody[ub++] = left; upBody[ub++] = bodyTop; upBody[ub++] = body; upBody[ub++] = bodyHeight
      } else {
        downBody[db++] = left; downBody[db++] = bodyTop; downBody[db++] = body; downBody[db++] = bodyHeight
      }
    }
  } else {
    // Mỗi cột pixel một vạch từ cao nhất đến thấp nhất, màu theo nến gộp.
    let column = -1
    let open = 0
    let high = 0
    let low = 0
    let close = 0
    const flush = () => {
      if (column < 0) return
      const top = Math.round(d.yOf(high))
      const height = Math.max(1, Math.round(d.yOf(low)) - top)
      if (close >= open) {
        upWick[uw++] = column; upWick[uw++] = top; upWick[uw++] = 1; upWick[uw++] = height
      } else {
        downWick[dw++] = column; downWick[dw++] = top; downWick[dw++] = 1; downWick[dw++] = height
      }
    }
    for (let index = d.first; index <= d.last; index += 1) {
      const bar = bars[index]
      const next = Math.floor(d.xOf(index))
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

  pushRects(scene, UP_TOKEN, upWick, uw)
  pushRects(scene, DOWN_TOKEN, downWick, dw)
  pushRects(scene, UP_TOKEN, upBody, ub)
  pushRects(scene, DOWN_TOKEN, downBody, db)
}

function drawLine(scene: Scene, d: PaneDraw, bars: readonly Bar[], area: boolean): void {
  const count = d.last - d.first + 1
  const width = Math.max(1, Math.round(d.dpr * 1.5))
  // Gộp theo cột: mỗi cột pixel giữ giá cao nhất, thấp nhất và giá đóng cửa cuối để đường vẫn đúng hình.
  const size = d.merged ? (Math.ceil(d.barPx * count) + 2) * 6 + 8 : count * 2 + 8
  const data = d.bufs.get("line.main", size)
  let used = 0
  if (!d.merged) {
    for (let index = d.first; index <= d.last; index += 1) {
      data[used++] = d.xOf(index)
      data[used++] = d.yOf(bars[index].close)
    }
  } else {
    let column = -1
    let hi = 0
    let lo = 0
    let last = 0
    const flush = () => {
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
      const value = bars[index].close
      const next = Math.floor(d.xOf(index))
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
  if (used < 4) return

  if (area) {
    // Vùng tô một màu mờ xuống đáy ô, không gradient (DESIGN.md Zone B).
    const fill = d.bufs.get("line.area", used + 8)
    fill.set(data.subarray(0, used))
    let n = used
    fill[n++] = data[used - 2]
    fill[n++] = d.bottom
    fill[n++] = data[0]
    fill[n++] = d.bottom
    scene.push({ op: "polygon", token: MAIN_SERIES_TOKEN, alpha: AREA_ALPHA, data: fill, count: n })
  }
  scene.push({ op: "polyline", token: MAIN_SERIES_TOKEN, width, data, count: used })
}
