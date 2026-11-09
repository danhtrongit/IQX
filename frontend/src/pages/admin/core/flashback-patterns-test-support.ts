/**
 * Dữ liệu giả cho test khối "Mẫu nến" của mục "Kho dữ liệu Flashback": đúng cấu trúc trên dây
 * (snake_case) mà `/api/v2/admin/flashback/dataset/patterns/*` trả về. Dùng chung cho test riêng của
 * khối và cho test trang Flashback, test mục kho dữ liệu (nơi khối được gắn vào).
 */

export type PatternRunWire = {
  id: number
  version: number
  detector_version: number
  status: "running" | "done" | "failed"
  trigger: "build" | "backfill" | "admin" | "detector"
  requested_by: string | null
  started_at: string
  finished_at: string | null
  symbols_done: number
  symbols_total: number
  patterns_count: number
  failed_count: number
  duration_ms: number | null
  log: Record<string, unknown>
}

export function patternRunWire(over: Partial<PatternRunWire> = {}): PatternRunWire {
  return {
    id: 11,
    version: 3,
    detector_version: 1,
    status: "done",
    trigger: "backfill",
    requested_by: null,
    started_at: "2026-11-05T02:00:00.000Z",
    finished_at: "2026-11-05T02:02:05.000Z",
    symbols_done: 97,
    symbols_total: 97,
    patterns_count: 482_310,
    failed_count: 0,
    duration_ms: 125_000,
    log: {},
    ...over,
  }
}

export type PatternWarningWire = {
  code: string
  level: "high" | "medium"
  message: string
  at: string | null
}

export type PatternStatusWire = {
  version: number | null
  detector_version: number
  running: PatternRunWire | null
  latest: PatternRunWire | null
  used: PatternRunWire | null
  outdated: boolean
  raw: { symbols: number; sessions: number }
  warnings: PatternWarningWire[]
}

/** Mặc định: kho phiên bản 3 đã tính xong bằng bộ nhận diện 1, không cảnh báo. */
export function patternStatusWire(over: Partial<PatternStatusWire> = {}): PatternStatusWire {
  const done = patternRunWire()
  return {
    version: 3,
    detector_version: 1,
    running: null,
    latest: done,
    used: done,
    outdated: false,
    raw: { symbols: 97, sessions: 320_000 },
    warnings: [],
    ...over,
  }
}

export type PatternLookupRowWire = { card_id: string; name: string; tier: number; count: number }

export function patternLookupWire(
  over: Partial<{
    version: number | null
    detector_version: number | null
    symbol: string | null
    from: string
    to: string
    rows: PatternLookupRowWire[]
  }> = {},
) {
  const rows = over.rows ?? [
    { card_id: "doji", name: "Doji", tier: 1, count: 14 },
    { card_id: "marubozu_tang", name: "Bullish Marubozu", tier: 1, count: 6 },
    { card_id: "nhan_chim_tang", name: "Bullish Engulfing", tier: 2, count: 5 },
    { card_id: "ba_linh", name: "Three White Soldiers", tier: 3, count: 1 },
  ]
  const tiers = new Map<number, number>()
  for (const row of rows) tiers.set(row.tier, (tiers.get(row.tier) ?? 0) + row.count)
  return {
    version: 3,
    detector_version: 1,
    symbol: "HPG",
    from: "2025-03-01",
    to: "2025-06-30",
    ...over,
    rows,
    tiers: [...tiers.entries()].map(([tier, total]) => ({ tier, total })),
    total: rows.reduce((sum, row) => sum + row.count, 0),
  }
}

export type PatternOverviewCardWire = {
  card_id: string
  name: string
  tier: number
  candles: number
  vn: boolean
  count: number
  zero: boolean
}

/** Bốn thẻ ở hai bậc: hai thẻ có số lần, một thẻ 0 lần và một thẻ Việt Nam 0 lần ở bậc 1. */
export const PATTERN_OVERVIEW_CARDS_WIRE: PatternOverviewCardWire[] = [
  { card_id: "doji", name: "Doji", tier: 1, candles: 1, vn: false, count: 12_400, zero: false },
  { card_id: "bua", name: "Hammer", tier: 1, candles: 1, vn: false, count: 0, zero: true },
  { card_id: "tran_trang", name: "Limit Up Lock", tier: 1, candles: 1, vn: true, count: 0, zero: true },
  { card_id: "nhan_chim_tang", name: "Bullish Engulfing", tier: 2, candles: 2, vn: false, count: 8_200, zero: false },
]

export function patternOverviewWire(
  cards: PatternOverviewCardWire[] = PATTERN_OVERVIEW_CARDS_WIRE,
  detectorVersion: number | null = 1,
) {
  return {
    version: 3,
    detector_version: detectorVersion,
    total: cards.reduce((sum, card) => sum + card.count, 0),
    zero_count: cards.filter((card) => card.zero).length,
    cards,
  }
}

/** Đường dẫn (không có query) của bốn route mẫu nến, theo đúng cách test gọi `api()`. */
export const PATTERN_PATHS = {
  status: "/admin/flashback/dataset/patterns/status",
  lookup: "/admin/flashback/dataset/patterns/lookup",
  overview: "/admin/flashback/dataset/patterns/overview",
  recompute: "/admin/flashback/dataset/patterns/recompute",
} as const

/**
 * Trả lời mặc định cho các route mẫu nến, để test của các mục khác (nơi khối được gắn vào) không
 * phải tự mô phỏng. Trả `undefined` khi `path` không phải route mẫu nến.
 */
export function defaultPatternRoute(path: string): unknown {
  if (path === PATTERN_PATHS.status) return patternStatusWire()
  if (path === PATTERN_PATHS.overview) return patternOverviewWire()
  if (path.startsWith(`${PATTERN_PATHS.lookup}?`)) return patternLookupWire()
  return undefined
}
