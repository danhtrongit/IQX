/**
 * Bài học dạy chỉ báo kỹ thuật và id chỉ báo của IQLine tương ứng (docs/iqline-design.md §9, bảng "Bài học"; trùng cột
 * `lesson_id` của `flashback.indicators.ts` ở backend). Chỉ có 16 bài; bài khác, bài thi và phòng tập không có chỉ báo.
 *
 * Bảng này không nhập sổ đăng ký chỉ báo để Học viện không kéo thêm mã vào gói của mình. Test đối chiếu từng id với
 * `definitions.ts` và với `lesson_key` (`technical:<id>`) của danh mục.
 */
const LESSON_INDICATORS: ReadonlyMap<string, string> = new Map([
  ["ch04-l04", "volume"],
  ["ch04-l05", "ma"],
  ["ch04-l06", "rsi"],
  ["ch04-l07", "macd"],
  ["ch04-l08", "bollinger"],
  ["ch06-l01", "ema"],
  ["ch06-l02", "ma_cross"],
  ["ch06-l03", "dmi"],
  ["ch06-l04", "donchian"],
  ["ch07-l01", "stochastic"],
  ["ch07-l02", "cci"],
  ["ch07-l03", "roc"],
  ["ch07-l04", "williams_r"],
  ["ch07-l05", "obv"],
  ["ch07-l06", "mfi"],
  ["ch07-l07", "cmf"],
])

/** Id chỉ báo của bài học, hoặc `null` khi bài không dạy chỉ báo nào. */
export function indicatorOfLesson(lessonId: string | null | undefined): string | null {
  return (lessonId ? LESSON_INDICATORS.get(lessonId) : undefined) ?? null
}

/** Các cặp (id bài, id chỉ báo), cho test và công cụ đối chiếu. */
export function lessonIndicatorEntries(): [string, string][] {
  return [...LESSON_INDICATORS]
}
