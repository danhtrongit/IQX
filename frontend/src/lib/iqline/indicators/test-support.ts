/** Hỗ trợ cho test chỉ báo: nến cố định từ bộ mẫu backend và so sánh số có sai số. */
import type { Bar, IndicatorParams } from "../types"
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
