/**
 * Volume Profile theo vùng nhìn thấy (docs/iqline-design.md §9, chỉ ở `market`).
 *
 * Chia khối lượng từng nến đều theo biên độ giá của nến đó (nến cao 10 đồng, khối lượng 1.000, vùng giá 2 đồng trong
 * nến nhận 200), nên đây chỉ là ước lượng: dữ liệu nến không cho biết khối lượng khớp ở từng mức giá. Backend không có
 * công thức này nên không có đối chiếu, chỉ có test riêng.
 *
 * Vẽ thành cột ngang trên ô giá. Mỗi hàng có `up` và `down` (khối lượng của các nến tăng, nến giảm) đã chia cho tổng
 * khối lượng của hàng lớn nhất, nên `up + down` của hàng lớn nhất bằng 1 và mọi hàng nằm trong 0..1.
 */
import type { Bar, IndicatorPlot } from "../types"
import { registerIndicator, getIndicator, validateParamSpecs, resolveParamSpecs } from "./registry"

export type ProfileRange = { from: number; to: number }
export type ProfileRow = { low: number; high: number; up: number; down: number }

export const VOLUME_PROFILE_ID = "volume_profile"
export const DEFAULT_PROFILE_ROWS = 24
const MIN_ROWS = 4
const MAX_ROWS = 200

const finite = (value: number): boolean => Number.isFinite(value)

/**
 * Tính profile cho các nến có chỉ số nằm trong viewport: nến `i` được tính khi `from <= i <= to` (toạ độ viewport là
 * chỉ số nến, có thể lẻ). `rows` là số hàng chia đều từ giá thấp nhất tới giá cao nhất trong vùng.
 */
export function computeVolumeProfile(bars: readonly Bar[], range: ProfileRange, rows: number = DEFAULT_PROFILE_ROWS): IndicatorPlot {
  const plot: IndicatorPlot = { kind: "over", series: [], profile: { rows: [] } }
  const count = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(rows)))
  const start = Math.max(0, Math.ceil(range.from))
  const end = Math.min(bars.length - 1, Math.floor(range.to))
  if (!(end >= start)) return plot

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let index = start; index <= end; index += 1) {
    const bar = bars[index]
    if (!finite(bar.high) || !finite(bar.low)) continue
    if (bar.low < min) min = bar.low
    if (bar.high > max) max = bar.high
  }
  if (!finite(min) || !finite(max)) return plot

  // Giá không đổi trong cả vùng (kịch trần nhiều phiên): một hàng duy nhất chứa toàn bộ khối lượng.
  const flat = !(max > min)
  const size = flat ? 1 : count
  const height = flat ? 0 : (max - min) / size
  const up = new Float64Array(size)
  const down = new Float64Array(size)
  const rowOf = (price: number): number => (flat ? 0 : Math.min(size - 1, Math.max(0, Math.floor((price - min) / height))))

  for (let index = start; index <= end; index += 1) {
    const bar = bars[index]
    if (!finite(bar.volume) || bar.volume <= 0 || !finite(bar.high) || !finite(bar.low)) continue
    const target = bar.close >= bar.open ? up : down
    if (flat || !(bar.high > bar.low)) {
      target[rowOf(bar.close)] += bar.volume
      continue
    }
    const first = rowOf(bar.low)
    const last = rowOf(bar.high)
    // Hai lượt: đo phần chồng lấn của từng hàng, rồi chia theo tổng để khối lượng nến được bảo toàn đúng.
    let overlapSum = 0
    for (let row = first; row <= last; row += 1) {
      const rowLow = min + row * height
      overlapSum += Math.max(0, Math.min(bar.high, rowLow + height) - Math.max(bar.low, rowLow))
    }
    if (!(overlapSum > 0)) {
      target[rowOf(bar.close)] += bar.volume
      continue
    }
    for (let row = first; row <= last; row += 1) {
      const rowLow = min + row * height
      const overlap = Math.max(0, Math.min(bar.high, rowLow + height) - Math.max(bar.low, rowLow))
      target[row] += (bar.volume * overlap) / overlapSum
    }
  }

  let peak = 0
  for (let row = 0; row < size; row += 1) peak = Math.max(peak, up[row] + down[row])
  const out: ProfileRow[] = []
  for (let row = 0; row < size; row += 1) {
    out.push({
      low: flat ? min : min + row * height,
      high: flat ? max : row === size - 1 ? max : min + (row + 1) * height,
      up: peak > 0 ? up[row] / peak : 0,
      down: peak > 0 ? down[row] / peak : 0,
    })
  }
  return { kind: "over", series: [], profile: { rows: out } }
}

const PARAMS = [{ key: "rows", label: "Số hàng", min: MIN_ROWS, max: MAX_ROWS, step: 1, default: DEFAULT_PROFILE_ROWS }] as const

/**
 * Đăng ký Volume Profile như một chỉ báo thường. `compute` tính trên TOÀN BỘ nến được truyền vào; người vẽ truyền
 * đúng nến trong viewport, hoặc gọi thẳng `computeVolumeProfile` với viewport.
 */
export function registerVolumeProfile(): void {
  if (getIndicator(VOLUME_PROFILE_ID)) return
  registerIndicator({
    id: VOLUME_PROFILE_ID,
    name: "Volume Profile",
    kind: "over",
    flashback: false,
    params: PARAMS,
    compute(bars, params) {
      if (validateParamSpecs("Volume Profile", PARAMS, params)) return { kind: "over", series: [] }
      const resolved = resolveParamSpecs(PARAMS, params)
      const rows = typeof resolved.rows === "number" ? resolved.rows : DEFAULT_PROFILE_ROWS
      return computeVolumeProfile(bars, { from: 0, to: bars.length - 1 }, rows)
    },
  })
}
