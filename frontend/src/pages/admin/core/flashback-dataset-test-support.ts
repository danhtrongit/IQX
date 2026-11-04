/**
 * Dữ liệu giả cho test mục "Kho dữ liệu Flashback": đúng cấu trúc trên dây (snake_case) mà
 * `/api/v2/admin/flashback/dataset*` trả về. Dùng chung cho test trang Flashback và test riêng
 * của mục kho dữ liệu.
 */

export const DATASET_CONFIG_WIRE = {
  basket: "VN100",
  warmup_sessions: 252,
  min_months_ago: 12,
  max_gap_sessions: 5,
  max_zero_volume_ratio: 0.025,
  min_liquidity_vnd: 3_000_000_000,
  min_daily_volatility: 0.01,
  min_symbols: 80,
  price_sources: ["DNSE", "VCI"],
  refresh_months: [2, 8],
  refresh_delay_days: 7,
  rebalance_dates: [] as string[],
}

export const DATASET_LOG_WIRE = {
  started_at: "2026-11-01T03:15:00.000Z",
  finished_at: "2026-11-01T03:16:10.000Z",
  duration_ms: 70_000,
  outcome: "active",
  basket: { index: "VN100", count: 100, source: "VCI:VN100" },
  calendar: { sessions: 3_400, first: "2012-03-20", last: "2026-10-30", source: "DNSE:VNINDEX" },
  symbols: { ok: 97, excluded: 3 },
  excluded: [
    { symbol: "AAA", reason: "Chưa đủ lịch sử (200/312 phiên)" },
    { symbol: "BBB", reason: "Lỗi tải dữ liệu: timeout" },
    { symbol: "CCC", reason: "Quá nhiều phiên lỗi (25%)" },
  ],
  value_basis: { matched: 97, mixed: 0, approx: 0 },
  sources: { "DNSE:x1000:adjusted": 97 },
  parameters: { min_symbols: 80, min_bars: 312, warmup_sessions: 252, max_gap_sessions: 5 },
  cuts: { view_bars: 60, play_bars: 30, symbols_with_cut: 90, total_cuts: 120_000 },
}

export type DatasetVersionWire = {
  version: number
  status: "building" | "active" | "retired" | "failed"
  created_at: string
  activated_at: string | null
  finished_at: string | null
  symbols_count: number
  excluded_count: number
  first_date: string | null
  last_date: string | null
  source: string
  trigger: "scheduled" | "manual" | "cli"
  requested_by: string | null
  duration_ms: number | null
  log: Record<string, unknown>
}

export function datasetVersionWire(over: Partial<DatasetVersionWire> = {}): DatasetVersionWire {
  return {
    version: 3,
    status: "active",
    created_at: "2026-11-01T03:15:00.000Z",
    activated_at: "2026-11-01T03:16:10.000Z",
    finished_at: "2026-11-01T03:16:10.000Z",
    symbols_count: 97,
    excluded_count: 3,
    first_date: "2012-03-20",
    last_date: "2026-10-30",
    source: "DNSE:x1000:adjusted",
    trigger: "cli",
    requested_by: null,
    duration_ms: 70_000,
    log: DATASET_LOG_WIRE,
    ...over,
  }
}

export type DatasetBuildingWire = {
  version: number
  started_at: string
  heartbeat_at: string
  stale: boolean
  trigger: "scheduled" | "manual" | "cli"
  progress: {
    phase: "basket" | "calendar" | "symbols" | "finalize" | "done"
    total: number
    done: number
    ok: number
    excluded: number
  }
}

export function datasetBuildingWire(over: Partial<DatasetBuildingWire> = {}): DatasetBuildingWire {
  return {
    version: 4,
    started_at: "2026-11-04T10:00:00.000Z",
    heartbeat_at: "2026-11-04T10:00:30.000Z",
    stale: false,
    trigger: "manual",
    progress: { phase: "symbols", total: 100, done: 40, ok: 38, excluded: 2 },
    ...over,
  }
}

export type DatasetWarningWire = {
  code: string
  level: "high" | "medium"
  message: string
  at: string | null
}

export function datasetStatusWire(
  over: Partial<{
    active: DatasetVersionWire | null
    building: DatasetBuildingWire | null
    latest_failed: DatasetVersionWire | null
    config: typeof DATASET_CONFIG_WIRE
    config_invalid: string[]
    warnings: DatasetWarningWire[]
    schedule: { due: boolean; reason: string; anchor: string | null }
  }> = {},
) {
  return {
    active: datasetVersionWire(),
    building: null,
    latest_failed: null,
    config: DATASET_CONFIG_WIRE,
    config_defaults: DATASET_CONFIG_WIRE,
    config_invalid: [],
    warnings: [],
    alerts: [],
    schedule: { due: false, reason: "up_to_date", anchor: "2026-08-10" },
    ...over,
  }
}

export type DatasetSymbolWire = {
  symbol: string
  bars_count: number
  first_date: string | null
  last_date: string | null
  status: "ok" | "excluded"
  reason: string | null
  price_source: string | null
  value_basis: string | null
  bad_count: number
}

function symbolWire(over: Partial<DatasetSymbolWire> & { symbol: string }): DatasetSymbolWire {
  return {
    bars_count: 3_000,
    first_date: "2012-03-20",
    last_date: "2026-10-30",
    status: "ok",
    reason: null,
    price_source: "DNSE:x1000:adjusted",
    value_basis: "matched",
    bad_count: 0,
    ...over,
  }
}

/** Ba mã hợp lệ và hai mã bị loại với lý do. */
export const DATASET_SYMBOLS_WIRE: DatasetSymbolWire[] = [
  symbolWire({ symbol: "FPT", bars_count: 3_391, first_date: "2012-03-20" }),
  symbolWire({ symbol: "HPG", bars_count: 3_388, first_date: "2012-03-21", bad_count: 2 }),
  symbolWire({ symbol: "VNM", bars_count: 3_390, first_date: "2012-03-20", value_basis: "approx" }),
  symbolWire({
    symbol: "AAA",
    bars_count: 200,
    first_date: "2026-01-02",
    status: "excluded",
    reason: "Chưa đủ lịch sử (200/312 phiên)",
    price_source: null,
    value_basis: null,
  }),
  symbolWire({
    symbol: "BBB",
    bars_count: 0,
    first_date: null,
    last_date: null,
    status: "excluded",
    reason: "Lỗi tải dữ liệu: timeout",
    price_source: null,
    value_basis: null,
  }),
]

export function datasetSymbolsWire(version = 3, status = "active", symbols = DATASET_SYMBOLS_WIRE) {
  return { version, status, symbols }
}

/** Bản đã thay thế và một bản thất bại, mới nhất trước. */
export function datasetVersionsWire(): { versions: DatasetVersionWire[] } {
  return {
    versions: [
      datasetVersionWire(),
      datasetVersionWire({
        version: 2,
        status: "retired",
        created_at: "2026-02-10T03:15:00.000Z",
        activated_at: "2026-02-10T03:16:00.000Z",
        symbols_count: 95,
        excluded_count: 5,
        trigger: "scheduled",
        log: { ...DATASET_LOG_WIRE, symbols: { ok: 95, excluded: 5 } },
      }),
      datasetVersionWire({
        version: 1,
        status: "failed",
        created_at: "2026-02-01T03:15:00.000Z",
        activated_at: null,
        symbols_count: 60,
        excluded_count: 40,
        trigger: "manual",
        requested_by: "admin-1",
        log: {
          outcome: "failed",
          error: "Kho mới chỉ có 60 mã hợp lệ (cần ít nhất 80)",
          symbols: { ok: 60, excluded: 40 },
          excluded: [],
        },
      }),
    ],
  }
}
