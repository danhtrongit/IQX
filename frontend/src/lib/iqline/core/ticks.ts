/**
 * Vạch chia và nhãn trục. Thuần, không đo chữ: khoảng cách tối thiểu tính theo pixel do bên gọi chọn.
 */
import { ICT_OFFSET, ictDay, ictParts, civilFromDays, type Civil } from "./calendar"
import type { PriceScale } from "./price-scale"
import type { MarketTimeScale } from "./time-scale"
import type { Viewport } from "../types"

// ---------------------------------------------------------------------------------------------- số

/** Bước 1, 2, 5 nhân luỹ thừa 10 gần nhất với `span / count`. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit < 1.5 ? 1 : unit < 3 ? 2 : unit < 7 ? 5 : 10) * power
}

/** Số chữ số thập phân vừa đủ để phân biệt các vạch cách nhau `step`. */
export function decimalsForStep(step: number): number {
  if (!(step > 0) || step >= 1) return 0
  return Math.min(6, Math.ceil(-Math.log10(step) - 1e-9))
}

/** Số kiểu Việt Nam: dấu chấm ngăn nhóm nghìn, dấu phẩy thập phân. */
export function formatVi(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "-"
  const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(8, decimals)))
  const [integer, fraction] = fixed.split(".")
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const sign = value < 0 && Number(fixed) !== 0 ? "-" : ""
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`
}

export function formatPriceDefault(value: number, step: number): string {
  return formatVi(value, decimalsForStep(step))
}

export function formatPercentAxis(value: number, step: number): string {
  const text = formatVi(value, Math.max(decimalsForStep(step), 0))
  return `${value > 0 ? "+" : ""}${text}%`
}

/** Khối lượng gọn: 850K, 1,2M, 3B. */
export function formatCompact(value: number): string {
  const size = Math.abs(value)
  if (size >= 1e9) return `${formatVi(value / 1e9, size >= 1e10 ? 0 : 1)}B`
  if (size >= 1e6) return `${formatVi(value / 1e6, size >= 1e7 ? 0 : 1)}M`
  if (size >= 1e4) return `${formatVi(value / 1e3, 0)}K`
  return formatVi(value, size >= 100 || Number.isInteger(value) ? 0 : size >= 1 ? 1 : 2)
}

export type PriceTick = { price: number; y: number; /** Giá trị trên trục: giá hoặc phần trăm. */ value: number; step: number }

/** Các mức 1-2-5 của log, từ thưa đến dày. */
const LOG_TIERS: readonly (readonly number[])[] = [[1], [1, 2, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]]

/**
 * Vạch trên trục giá. Tuyến tính và phần trăm: bội của bước 1-2-5. Log: bước tuyến tính khi dải hẹp
 * (dưới 4 lần), nếu rộng hơn thì các mức 1-2-5 nhân luỹ thừa 10, dày nhất mà không quá `count`.
 */
export function priceTicks(scale: PriceScale, count: number): PriceTick[] {
  const ticks: PriceTick[] = []
  const wanted = Math.max(2, count)
  const push = (price: number, value: number, step: number) => ticks.push({ price, y: scale.yOf(price), value, step })

  if (scale.mode === "log" && scale.high / scale.low >= 4) {
    const firstPower = Math.floor(Math.log10(scale.low))
    const lastPower = Math.ceil(Math.log10(scale.high))
    let chosen: number[] = [1]
    for (const tier of LOG_TIERS) {
      const prices: number[] = []
      for (let power = firstPower; power <= lastPower; power += 1) for (const unit of tier) prices.push(unit * 10 ** power)
      const inside = prices.filter((price) => price >= scale.low && price <= scale.high)
      if (inside.length <= wanted * 1.5) chosen = inside
      else break
    }
    for (const price of chosen) push(price, price, price)
    return ticks
  }

  const lowValue = scale.axisValue(scale.low)
  const highValue = scale.axisValue(scale.high)
  const step = niceStep(highValue - lowValue, wanted)
  const start = Math.ceil(lowValue / step - 1e-9)
  for (let index = start; index * step <= highValue + 1e-9; index += 1) {
    const value = index * step
    push(scale.priceOfAxis(value), value, step)
  }
  return ticks
}

// ------------------------------------------------------------------------------------------ thời gian

export type TimeTick = { index: number; label: string }

const pad2 = (value: number) => (value < 10 ? `0${value}` : String(value))

const MONTH_LABEL = (month: number) => `Th${month}`

/**
 * Nhãn trục thời gian của `market` (giờ Việt Nam). Tick quan trọng hơn được chọn trước: đổi năm, đổi tháng,
 * đổi ngày, rồi giờ tròn, nửa giờ... Mỗi tick cách tick đã chọn ít nhất `minSpacing` pixel. Phần ngoại suy
 * sau nến cuối (và trước nến đầu) cũng có nhãn.
 */
export function marketTimeTicks(scale: MarketTimeScale, viewport: Viewport, plotWidth: number, minSpacing = 72): TimeTick[] {
  const span = viewport.to - viewport.from
  if (scale.count === 0 || !(span > 0) || plotWidth <= 0) return []
  const barPx = plotWidth / span
  const first = Math.floor(viewport.from + 0.5)
  const last = Math.ceil(viewport.to + 0.5) - 1
  const interval = scale.interval
  const intraday = interval !== "D" && interval !== "W" && interval !== "M"
  const timeAt = (index: number) => (index >= 0 && index < scale.count ? scale.times[index] : scale.timeOfIndex(index))

  // tiers[w] = các chỉ số có trọng số w, theo thứ tự tăng dần.
  const tiers = new Map<number, number[]>()
  const labelOf = new Map<number, string>()
  const add = (weight: number, index: number, label: string) => {
    let list = tiers.get(weight)
    if (!list) tiers.set(weight, (list = []))
    list.push(index)
    labelOf.set(index, label)
  }

  let previousDay = ictDay(timeAt(first - 1))
  let civil: Civil = civilFromDays(previousDay)
  for (let index = first; index <= last; index += 1) {
    const time = timeAt(index)
    const day = ictDay(time)
    const second = time + ICT_OFFSET - day * 86400
    if (day !== previousDay) {
      const next = civilFromDays(day)
      const yearChanged = next.year !== civil.year
      const monthChanged = yearChanged || next.month !== civil.month
      civil = next
      const weekday = (((day + 3) % 7) + 7) % 7
      if (yearChanged) add(70, index, String(civil.year))
      else if (monthChanged) add(60, index, intraday ? `${pad2(civil.day)}/${pad2(civil.month)}` : MONTH_LABEL(civil.month))
      else if (intraday) add(50, index, `${pad2(civil.day)}/${pad2(civil.month)}`)
      else if (interval === "D") add(weekday === 0 ? 40 : 20, index, pad2(civil.day))
      else add(40, index, `${pad2(civil.day)}/${pad2(civil.month)}`)
      previousDay = day
      continue
    }
    if (intraday) {
      const minute = Math.floor(second / 60)
      const weight = minute % 60 === 0 ? 40 : minute % 30 === 0 ? 30 : minute % 15 === 0 ? 20 : minute % 5 === 0 ? 10 : 0
      if (weight > 0) add(weight, index, `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`)
    }
  }

  const bucket = Math.max(1, minSpacing)
  const taken = new Map<number, number>()
  const accepted: number[] = []
  const fits = (x: number) => {
    const slot = Math.floor(x / bucket)
    for (let near = slot - 1; near <= slot + 1; near += 1) {
      const other = taken.get(near)
      if (other !== undefined && Math.abs(other - x) < minSpacing) return false
    }
    return true
  }
  const margin = 18
  for (const weight of [...tiers.keys()].sort((a, b) => b - a)) {
    for (const index of tiers.get(weight)!) {
      const x = (index - viewport.from) * barPx
      if (x < margin || x > plotWidth - margin || !fits(x)) continue
      taken.set(Math.floor(x / bucket), x)
      accepted.push(index)
    }
  }

  if (accepted.length < 2) {
    // Dải rất hẹp hoặc không có mốc nào: chia đều theo số nến.
    const step = Math.max(1, Math.ceil(minSpacing / barPx))
    for (let index = Math.ceil(first / step) * step; index <= last; index += step) {
      const x = (index - viewport.from) * barPx
      if (x < margin || x > plotWidth - margin || accepted.includes(index)) continue
      accepted.push(index)
      labelOf.set(index, formatTimeLabel(timeAt(index), interval))
    }
  }
  return accepted.sort((a, b) => a - b).map((index) => ({ index, label: labelOf.get(index) ?? "" }))
}

/** Nhãn đầy đủ của một thời điểm (nhãn crosshair): `05/11/2026 09:15` cho khung trong ngày, `05/11/2026` cho khung ngày. */
export function formatTimeLabel(time: number, interval: MarketTimeScale["interval"]): string {
  const parts = ictParts(time)
  const date = `${pad2(parts.date)}/${pad2(parts.month)}/${parts.year}`
  if (interval === "D" || interval === "W") return date
  if (interval === "M") return `${MONTH_LABEL(parts.month)}/${parts.year}`
  const minute = Math.floor(parts.second / 60)
  return `${date} ${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`
}

// ------------------------------------------------------------------------------------------ Flashback

export type AxisTick = { index: number; label: string; anchor: "start" | "middle" | "end" }

/**
 * Nhãn trục ngang (không có ngày thật): "Lịch sử {n} phiên", "Phiên 1", phiên giữa, "Phiên {số
 * phiên chơi}". Điện thoại bỏ nhãn giữa và rút gọn nhãn đầu.
 */
export function axisTicks(viewBars: number, playBars: number, narrow: boolean): AxisTick[] {
  const total = viewBars + playBars
  if (narrow) {
    return [
      { index: 0, label: "Lịch sử", anchor: "start" },
      { index: viewBars, label: "Phiên 1", anchor: "middle" },
      { index: total - 1, label: `Phiên ${playBars}`, anchor: "end" },
    ]
  }
  const middle = Math.round(playBars / 2)
  return [
    { index: 0, label: `Lịch sử ${viewBars} phiên`, anchor: "start" },
    { index: viewBars, label: "Phiên 1", anchor: "middle" },
    { index: viewBars + middle - 1, label: `Phiên ${middle}`, anchor: "middle" },
    { index: total - 1, label: `Phiên ${playBars}`, anchor: "end" },
  ]
}

/**
 * Vạch chia theo phiên khi đã zoom: bước nguyên 1-2-5 nhân luỹ thừa 10 sao cho các nhãn cách nhau ít nhất
 * `minSpacing` pixel. Chỉ số theo phiên (đã bỏ warmup), gồm cả ô tương lai vì nhãn chỉ suy ra từ chỉ số.
 */
export function sessionTicks(viewport: Viewport, slots: number, plotWidth: number, formatX: (session: number) => string, minSpacing = 76): TimeTick[] {
  const span = viewport.to - viewport.from
  if (slots <= 0 || !(span > 0) || plotWidth <= 0) return []
  const barPx = plotWidth / span
  const step = Math.max(1, niceStep(minSpacing / barPx, 1))
  const first = Math.max(0, Math.floor(viewport.from + 0.5))
  const last = Math.min(slots - 1, Math.ceil(viewport.to + 0.5) - 1)
  const ticks: TimeTick[] = []
  for (let index = Math.ceil(first / step) * step; index <= last; index += step) {
    const x = (index - viewport.from) * barPx
    if (x < 24 || x > plotWidth - 24) continue
    ticks.push({ index, label: formatX(index) })
  }
  return ticks
}
