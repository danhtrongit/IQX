/** Hỗ trợ cho test chỉ báo: nến cố định từ bộ mẫu backend và so sánh số có sai số. */
import type { Bar, IndicatorContext, IndicatorParams, Interval } from "../types"
import golden from "./__fixtures__/backend-golden.json"
import { getIndicator } from "./index"

export type GoldenCase = (typeof golden.cases)[number]
export const GOLDEN = golden

/** Nến của bộ mẫu (240 nến, có phiên kịch trần/sàn, phiên khối lượng 0 và nhiều phiên đóng cửa bằng nhau). */
export function goldenBars(count: number = golden.bars.length): Bar[] {
  return golden.bars.slice(0, count).map(({ open, high, low, close, volume }) => ({ open, high, low, close, volume }))
}

/** Sai số tuyệt đối khi giá trị nhỏ, tương đối khi giá trị lớn: |a - b| <= tolerance * max(1, |b|). */
export function isClose(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b))
}

type Values = readonly (number | null)[]

/** Chỉ số các phần tử của hai chuỗi không khớp: một bên `null` một bên có số, hoặc cùng có số nhưng lệch quá sai số. */
export function mismatches(actual: Values, expected: Values, tolerance: number): number[] {
  const out: number[] = []
  const length = Math.max(actual.length, expected.length)
  for (let index = 0; index < length; index += 1) {
    const a = actual[index] ?? null
    const b = expected[index] ?? null
    if (a === null && b === null) continue
    if (a === null || b === null || !isClose(a, b, tolerance)) out.push(index)
  }
  return out
}

/** Đầu vào chỉ báo của một case mẫu: tham số backend rút gọn về các khoá mà chỉ báo frontend có (backend thêm `baseline` cho ATR...). */
export function inputOf(testCase: GoldenCase): { id: string; params: IndicatorParams } {
  const keys = new Set((getIndicator(testCase.id)?.params ?? []).map((spec) => spec.key))
  return { id: testCase.id, params: Object.fromEntries(Object.entries(testCase.params).filter(([key]) => keys.has(key))) }
}

/** Unix giây của 00:00 giờ Việt Nam ngày `year-month-day`. */
export const ictMidnight = (year: number, month: number, day: number): number => Date.UTC(year, month - 1, day) / 1000 - 7 * 3600

/**
 * Thời gian cho `count` nến: khung ngày là các ngày thứ hai đến thứ sáu từ 2026-01-05; khung phút theo phiên 09:00-11:30 và 13:00-14:45,
 * cũng bỏ cuối tuần. Dùng cho test VWAP, Pivot Points và mọi nơi cần `IndicatorContext`.
 */
export function timesFor(count: number, interval: Interval = "D"): number[] {
  const out: number[] = []
  const step = interval === "D" ? 86_400 : interval === "W" ? 7 * 86_400 : interval === "M" ? 30 * 86_400 : Number(interval) * 60
  for (let day = 0; out.length < count; day += 1) {
    const midnight = ictMidnight(2026, 1, 5) + day * 86_400
    const weekday = new Date((midnight + 7 * 3600) * 1000).getUTCDay()
    if (interval !== "W" && interval !== "M" && (weekday === 0 || weekday === 6)) continue
    if (interval === "D") {
      out.push(midnight + 9 * 3600)
    } else if (interval === "W" || interval === "M") {
      out.push(ictMidnight(2026, 1, 5) + out.length * step + 9 * 3600)
    } else {
      for (const [from, to] of [[9 * 3600, 11.5 * 3600], [13 * 3600, 14.75 * 3600]]) {
        for (let second = from; second < to && out.length < count; second += step) out.push(midnight + second)
      }
    }
  }
  return out
}

export const contextFor = (count: number, interval: Interval = "D"): IndicatorContext => ({ times: timesFor(count, interval), interval })
