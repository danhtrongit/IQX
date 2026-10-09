/**
 * The 16 technical indicators of the catalog `iqx-academy-outline-13ch-71lessons-v1`. The server
 * only grants these; the page never lists anything else (no ADX, ATR, price structure, market
 * group). "Hợp lưu" is an AND rule, not a 17th indicator.
 */
export const TECHNICAL_INDICATOR_IDS = [
  "rsi",
  "macd",
  "ma",
  "bollinger",
  "volume",
  "ema",
  "ma_cross",
  "dmi",
  "stochastic",
  "cci",
  "obv",
  "mfi",
  "cmf",
  "donchian",
  "roc",
  "williams_r",
] as const

export type TechnicalIndicatorId = (typeof TECHNICAL_INDICATOR_IDS)[number]

const ALLOWED: ReadonlySet<string> = new Set(TECHNICAL_INDICATOR_IDS)

export function isCatalogIndicator(id: string): boolean {
  return ALLOWED.has(id)
}

/** Chapter heading of the technical lessons in the library. */
export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  1: "Chỉ báo kỹ thuật nền tảng",
  5: "Xu hướng và động lượng nâng cao",
  7: "Khối lượng và dòng tiền",
  10: "Kênh giá và động lượng",
}

export function chapterTitle(chapter: number): string {
  return CHAPTER_TITLES[chapter] ?? `Chương ${chapter}`
}
