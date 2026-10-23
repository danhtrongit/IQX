/**
 * Hình học của một tấm biểu đồ chỉ tiêu (spec §9): thang giá trị, vị trí
 * nhãn trục ngang và hình cột. Không có React, không có I/O.
 */

/** Thang giá trị của một trục: khoảng vẽ và các mốc lấy theo bước "đẹp". */
export type ValueScale = { lo: number; hi: number; ticks: number[] }

export function niceScale(min: number, max: number, count = 4): ValueScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] }
  let low = min
  let high = max
  if (low === high) {
    low -= 1
    high += 1
  }
  const raw = (high - low) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const error = raw / magnitude
  const step = (error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1) * magnitude
  const lo = Math.floor(low / step) * step
  const hi = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let value = lo; value <= hi + step / 2; value += step) ticks.push(Number(value.toFixed(10)))
  return { lo, hi, ticks }
}

/**
 * Vị trí được ghi nhãn trên trục ngang: nhãn kỳ gần nhất luôn còn, các nhãn
 * khác bỏ bớt khi khoảng cách dưới `minLabelWidth` (spec §5.4).
 */
export function axisIndexes(count: number, innerWidth: number, minLabelWidth = 46): number[] {
  if (count <= 0) return []
  const step = Math.max(1, Math.ceil((count * minLabelWidth) / Math.max(innerWidth, 1)))
  const indexes: number[] = []
  for (let index = count - 1; index >= 0; index -= step) indexes.unshift(index)
  return indexes
}

/**
 * Hình một cột: đầu ngoài (trên khi dương, dưới khi âm) bo tròn, đầu trong
 * vuông. `rounded` bật cho cột đứng riêng và cho đoạn trên cùng của cột chồng.
 */
export function barPath(
  x: number,
  top: number,
  width: number,
  height: number,
  up: boolean,
  rounded: boolean,
): string {
  if (!rounded) return `M${x},${top}h${width}v${height}h${-width}Z`
  const radius = Math.min(4, width / 2, height)
  if (up) {
    return `M${x},${top + height}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + width - radius}Q${x + width},${top} ${x + width},${top + radius}V${top + height}Z`
  }
  return `M${x},${top}V${top + height - radius}Q${x},${top + height} ${x + radius},${top + height}H${x + width - radius}Q${x + width},${top + height} ${x + width},${top + height - radius}V${top}Z`
}

/** Đường gấp khúc qua các giá trị số; kỳ trống làm đường đứt đoạn (spec §10). */
export function linePath(
  values: readonly (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = ""
  let begun = false
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      begun = false
      return
    }
    path += `${begun ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`
    begun = true
  })
  return path
}
