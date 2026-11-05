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

/** Độ mờ của nến phần lịch sử ở Flashback (Flashback v2.3, cùng độ mờ với biểu đồ SVG cũ); nến phần chơi đậm hẳn. */
export const HISTORY_CANDLE_ALPHA = 0.75

/** Bốn mảng của một nhóm nến cùng độ mờ: thân và bấc, tăng và giảm. */
type Sink = { upWick: Float64Array; downWick: Float64Array; upBody: Float64Array; downBody: Float64Array; uw: number; dw: number; ub: number; db: number }

function sinkOf(d: PaneDraw, prefix: string, count: number): Sink {
  // Tối đa 16 số mỗi nến ở mỗi mảng (viền rỗng: 4 cạnh); bấc tách đôi quanh thân dùng tối đa 8.
  const size = count * 16 + 16
  return {
    upWick: d.bufs.get(`${prefix}.upWick`, size),
    downWick: d.bufs.get(`${prefix}.downWick`, size),
    upBody: d.bufs.get(`${prefix}.upBody`, size),
    downBody: d.bufs.get(`${prefix}.downBody`, size),
    uw: 0,
    dw: 0,
    ub: 0,
    db: 0,
  }
}

function flushSink(scene: Scene, sink: Sink, alpha?: number): void {
  pushRects(scene, UP_TOKEN, sink.upWick, sink.uw, alpha)
  pushRects(scene, DOWN_TOKEN, sink.downWick, sink.dw, alpha)
  pushRects(scene, UP_TOKEN, sink.upBody, sink.ub, alpha)
  pushRects(scene, DOWN_TOKEN, sink.downBody, sink.db, alpha)
}

function drawBars(scene: Scene, d: PaneDraw, bars: readonly Bar[], style: "candles" | "hollow" | "ohlc"): void {
  const count = d.last - d.first + 1
  if (d.merged) {
    const sink = sinkOf(d, "cndl", count)
    emitMerged(d, bars, sink)
    flushSink(scene, sink)
    return
  }
  // Flashback: nến trước `dimBefore` là phần lịch sử, vẽ ở nhóm riêng với độ mờ riêng (token màu không đổi).
  const split = Math.min(Math.max(d.dimBefore, d.first), d.last + 1)
  if (split > d.first) {
    const history = sinkOf(d, "cndl.history", split - d.first)
    // Bấc cắt thành hai đoạn trên và dưới thân: bấc và thân cùng độ mờ không được chồng lên nhau (chồng sẽ đậm hơn).
    emitCandles(d, bars, style, d.first, split - 1, history, true)
    flushSink(scene, history, HISTORY_CANDLE_ALPHA)
  }
  if (split <= d.last) {
    const play = sinkOf(d, "cndl", d.last - split + 1)
    emitCandles(d, bars, style, split, d.last, play, false)
    flushSink(scene, play)
  }
}

function emitCandles(d: PaneDraw, bars: readonly Bar[], style: "candles" | "hollow" | "ohlc", from: number, to: number, sink: Sink, splitWicks: boolean): void {
  const { upWick, downWick, upBody, downBody } = sink
  let uw = sink.uw
  let dw = sink.dw
  let ub = sink.ub
  let db = sink.db
  const wick = Math.max(1, Math.round(d.dpr), Math.floor(d.barPx / 12))
  let body = Math.max(wick, Math.floor(d.barPx * 0.7))
  if (d.session) {
    // Flashback giữ thân đủ rộng ở khung hẹp (điện thoại, ô chỉ rộng ~3px): thân 62% ô như bản SVG cũ, làm tròn, nên 2px thay vì co về
    // 1px bằng bấc. Thân chẵn pixel thì bấc lệch nửa pixel so với tâm, không nhìn thấy được.
    body = Math.max(wick, Math.round(d.barPx * 0.62))
  } else if ((body - wick) & 1) body -= 1
  const border = Math.max(1, Math.round(d.dpr))
  const tick = Math.max(1, Math.floor(d.barPx * 0.35))
  for (let index = from; index <= to; index += 1) {
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

    const yOpen = d.yOf(bar.open)
    const yClose = d.yOf(bar.close)
    const bodyTop = Math.round(Math.min(yOpen, yClose))
    const bodyHeight = Math.max(1, Math.round(Math.abs(yOpen - yClose)))
    if (splitWicks && style === "candles") {
      const upper = bodyTop - wickTop
      const lower = wickTop + wickHeight - (bodyTop + bodyHeight)
      if (upper > 0) {
        wicks[w++] = wickLeft; wicks[w++] = wickTop; wicks[w++] = wick; wicks[w++] = upper
      }
      if (lower > 0) {
        wicks[w++] = wickLeft; wicks[w++] = bodyTop + bodyHeight; wicks[w++] = wick; wicks[w++] = lower
      }
    } else {
      wicks[w++] = wickLeft; wicks[w++] = wickTop; wicks[w++] = wick; wicks[w++] = wickHeight
    }
    if (up) uw = w
    else dw = w

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
  sink.uw = uw
  sink.dw = dw
  sink.ub = ub
  sink.db = db
}

/** Nến hẹp dưới 1px: mỗi cột pixel một vạch từ cao nhất đến thấp nhất, màu theo nến gộp. */
function emitMerged(d: PaneDraw, bars: readonly Bar[], sink: Sink): void {
  const { upWick, downWick } = sink
  let uw = 0
  let dw = 0
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
  sink.uw = uw
  sink.dw = dw
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
