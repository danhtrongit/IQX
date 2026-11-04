/**
 * Lớp dữ liệu của mục "Kho dữ liệu Flashback" trong màn quản trị Flashback (spec v2.2 §6).
 *
 * Mục này cho quản trị viên xem phiên bản kho đang dùng, danh sách mã và lý do bị loại, theo dõi
 * nút "Làm mới kho", đọc lịch sử phiên bản kèm nhật ký và đổi các tham số của §5. Kho chỉ chứa
 * lịch sử giá của rổ mã. Mã và điểm cắt của từng ván không đi qua đây: chúng chỉ lộ qua thao tác
 * "Xem mã" có ghi nhật ký của Flashback.
 *
 * Cấu trúc trên dây lấy từ contract sinh (`ApiResponseFor`), rồi đổi sang tên dùng trong giao
 * diện. Nhật ký của một phiên bản là JSON tự do (`Record<string, unknown>`), nên được đọc phòng
 * thủ: khoá nào thiếu hoặc sai kiểu thì bỏ qua thay vì làm hỏng cả bảng.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

export type DatasetStatusResponse = ApiResponseFor<"GET /api/v2/admin/flashback/dataset">
export type DatasetSymbolsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/dataset/symbols">
export type DatasetVersionsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/dataset/versions">
export type DatasetConfigResponse = ApiResponseFor<"PUT /api/v2/admin/flashback/dataset/config">

type VersionRow = DatasetVersionsResponse["versions"][number]
type SymbolRow = DatasetSymbolsResponse["symbols"][number]
type ConfigRow = DatasetConfigResponse["config"]
type ConfigBody = ApiRequestFor<"PUT /api/v2/admin/flashback/dataset/config">["body"]

export type DatasetVersionStatus = VersionRow["status"]
export type DatasetTrigger = VersionRow["trigger"]
export type DatasetPhase = NonNullable<DatasetStatusResponse["building"]>["progress"]["phase"]
export type DatasetPriceSource = ConfigRow["price_sources"][number]
export type DatasetWarningLevel = DatasetStatusResponse["warnings"][number]["level"]

/** Nhật ký một lần tạo kho (spec §2.2 bước 5), đã đọc về kiểu chặt. */
export type DatasetLog = {
  /** Nhật ký nguyên bản, để quản trị viên đọc khi cần. */
  raw: Record<string, unknown>
  outcome: "active" | "failed" | null
  error: string | null
  basket: { index: string; count: number; source: string } | null
  calendar: { sessions: number; first: string | null; last: string | null; source: string } | null
  symbolsOk: number | null
  symbolsExcluded: number | null
  excluded: { symbol: string; reason: string }[]
  /** Số mã theo cơ sở tính giá trị giao dịch: khớp thật, một phần, hay ước tính từ giá x khối lượng. */
  valueBasis: { matched: number; mixed: number; approx: number } | null
  sources: { source: string; count: number }[]
  /** Số điểm cắt hợp lệ của phòng mặc định tại lúc tạo kho. */
  cuts: { viewBars: number; playBars: number; symbolsWithCut: number; totalCuts: number } | null
}

export type DatasetVersion = {
  version: number
  status: DatasetVersionStatus
  createdAt: string
  activatedAt: string | null
  finishedAt: string | null
  symbolsCount: number
  excludedCount: number
  firstDate: string | null
  lastDate: string | null
  source: string
  trigger: DatasetTrigger
  requestedBy: string | null
  durationMs: number | null
  log: DatasetLog
}

/** Lần tạo kho đang chạy: tiến độ do máy chủ báo, `stale` khi tác vụ nền không còn tín hiệu. */
export type DatasetBuilding = {
  version: number
  startedAt: string
  heartbeatAt: string
  stale: boolean
  trigger: DatasetTrigger
  progress: { phase: DatasetPhase; total: number; done: number; ok: number; excluded: number }
}

export type DatasetWarning = {
  code: string
  level: DatasetWarningLevel
  message: string
  at: string | null
}

/** Tham số kho (spec §5) ở đơn vị của máy chủ: tỷ lệ là số thập phân, tiền là đồng. */
export type DatasetConfig = {
  basket: string
  warmupSessions: number
  minMonthsAgo: number
  maxGapSessions: number
  maxZeroVolumeRatio: number
  minLiquidityVnd: number
  minDailyVolatility: number
  minSymbols: number
  priceSources: DatasetPriceSource[]
  refreshMonths: number[]
  refreshDelayDays: number
  rebalanceDates: string[]
}

export type DatasetSchedule = { due: boolean; reason: string; anchor: string | null }

export type DatasetStatus = {
  active: DatasetVersion | null
  building: DatasetBuilding | null
  latestFailed: DatasetVersion | null
  config: DatasetConfig
  configDefaults: DatasetConfig
  /** Khoá tham số sai giá trị đã bị thay bằng mặc định. */
  configInvalid: string[]
  warnings: DatasetWarning[]
  schedule: DatasetSchedule
}

export type DatasetSymbolStatus = SymbolRow["status"]

export type DatasetSymbol = {
  symbol: string
  barsCount: number
  firstDate: string | null
  lastDate: string | null
  status: DatasetSymbolStatus
  reason: string | null
  priceSource: string | null
  valueBasis: string | null
  badCount: number
}

export type DatasetSymbols = {
  /** Phiên bản của danh sách; `null` khi chưa có phiên bản nào. */
  version: number | null
  status: string | null
  symbols: DatasetSymbol[]
}

export type DatasetRefreshResult = { mode: "queued" | "inline"; jobId: string | null }

/** Các khoá tham số đổi được từ giao diện, ở đơn vị của máy chủ. */
export type DatasetConfigPatch = Partial<
  Pick<
    DatasetConfig,
    | "warmupSessions"
    | "minMonthsAgo"
    | "maxGapSessions"
    | "maxZeroVolumeRatio"
    | "minLiquidityVnd"
    | "minDailyVolatility"
    | "minSymbols"
    | "refreshDelayDays"
    | "priceSources"
  >
>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null)

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

/** Đọc nhật ký tạo kho; khoá thiếu hoặc sai kiểu cho giá trị rỗng. */
export function readDatasetLog(raw: Record<string, unknown>): DatasetLog {
  const outcome = raw.outcome === "active" || raw.outcome === "failed" ? raw.outcome : null

  const basketRaw = asRecord(raw.basket)
  const basket =
    basketRaw && asString(basketRaw.index) !== null && asNumber(basketRaw.count) !== null
      ? {
          index: asString(basketRaw.index) ?? "",
          count: asNumber(basketRaw.count) ?? 0,
          source: asString(basketRaw.source) ?? "",
        }
      : null

  const calendarRaw = asRecord(raw.calendar)
  const calendar =
    calendarRaw && asNumber(calendarRaw.sessions) !== null
      ? {
          sessions: asNumber(calendarRaw.sessions) ?? 0,
          first: asString(calendarRaw.first),
          last: asString(calendarRaw.last),
          source: asString(calendarRaw.source) ?? "",
        }
      : null

  const symbolsRaw = asRecord(raw.symbols)

  const excluded = Array.isArray(raw.excluded)
    ? raw.excluded.flatMap((item) => {
        const row = asRecord(item)
        const symbol = row ? asString(row.symbol) : null
        return symbol ? [{ symbol, reason: asString(row?.reason) ?? "" }] : []
      })
    : []

  const basisRaw = asRecord(raw.value_basis)
  const valueBasis = basisRaw
    ? {
        matched: asNumber(basisRaw.matched) ?? 0,
        mixed: asNumber(basisRaw.mixed) ?? 0,
        approx: asNumber(basisRaw.approx) ?? 0,
      }
    : null

  const sourcesRaw = asRecord(raw.sources)
  const sources = sourcesRaw
    ? Object.entries(sourcesRaw).flatMap(([source, count]) =>
        asNumber(count) === null ? [] : [{ source, count: asNumber(count) ?? 0 }],
      )
    : []

  const cutsRaw = asRecord(raw.cuts)
  const cuts =
    cutsRaw && asNumber(cutsRaw.total_cuts) !== null
      ? {
          viewBars: asNumber(cutsRaw.view_bars) ?? 0,
          playBars: asNumber(cutsRaw.play_bars) ?? 0,
          symbolsWithCut: asNumber(cutsRaw.symbols_with_cut) ?? 0,
          totalCuts: asNumber(cutsRaw.total_cuts) ?? 0,
        }
      : null

  return {
    raw,
    outcome,
    error: asString(raw.error),
    basket,
    calendar,
    symbolsOk: symbolsRaw ? asNumber(symbolsRaw.ok) : null,
    symbolsExcluded: symbolsRaw ? asNumber(symbolsRaw.excluded) : null,
    excluded,
    valueBasis,
    sources,
    cuts,
  }
}

export function adaptDatasetVersion(row: VersionRow): DatasetVersion {
  return {
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    finishedAt: row.finished_at,
    symbolsCount: row.symbols_count,
    excludedCount: row.excluded_count,
    firstDate: row.first_date,
    lastDate: row.last_date,
    source: row.source,
    trigger: row.trigger,
    requestedBy: row.requested_by,
    durationMs: row.duration_ms,
    log: readDatasetLog(row.log ?? {}),
  }
}

export function adaptDatasetConfig(row: ConfigRow): DatasetConfig {
  return {
    basket: row.basket,
    warmupSessions: row.warmup_sessions,
    minMonthsAgo: row.min_months_ago,
    maxGapSessions: row.max_gap_sessions,
    maxZeroVolumeRatio: row.max_zero_volume_ratio,
    minLiquidityVnd: row.min_liquidity_vnd,
    minDailyVolatility: row.min_daily_volatility,
    minSymbols: row.min_symbols,
    priceSources: row.price_sources,
    refreshMonths: row.refresh_months,
    refreshDelayDays: row.refresh_delay_days,
    rebalanceDates: row.rebalance_dates,
  }
}

export function adaptDatasetStatus(response: DatasetStatusResponse): DatasetStatus {
  const building = response.building
  return {
    active: response.active ? adaptDatasetVersion(response.active) : null,
    building: building
      ? {
          version: building.version,
          startedAt: building.started_at,
          heartbeatAt: building.heartbeat_at,
          stale: building.stale,
          trigger: building.trigger,
          progress: building.progress,
        }
      : null,
    latestFailed: response.latest_failed ? adaptDatasetVersion(response.latest_failed) : null,
    config: adaptDatasetConfig(response.config),
    configDefaults: adaptDatasetConfig(response.config_defaults),
    configInvalid: response.config_invalid,
    warnings: response.warnings.map((warning) => ({
      code: warning.code,
      level: warning.level,
      message: warning.message,
      at: warning.at,
    })),
    schedule: response.schedule,
  }
}

export function adaptDatasetSymbol(row: SymbolRow): DatasetSymbol {
  return {
    symbol: row.symbol,
    barsCount: row.bars_count,
    firstDate: row.first_date,
    lastDate: row.last_date,
    status: row.status,
    reason: row.reason,
    priceSource: row.price_source,
    valueBasis: row.value_basis,
    badCount: row.bad_count,
  }
}

/** Kết quả của lần làm mới gần nhất: bản đang dùng hoặc bản thất bại, bản nào có số phiên bản lớn hơn. */
export function latestDatasetRun(status: DatasetStatus): DatasetVersion | null {
  const { active, latestFailed } = status
  if (active && latestFailed) return latestFailed.version > active.version ? latestFailed : active
  return active ?? latestFailed
}

/** Dấu hiệu đổi khi có phiên bản mới hoặc một lần dựng bắt đầu hay kết thúc. */
export function datasetSignature(status: DatasetStatus | undefined): string | null {
  if (!status) return null
  return [status.active?.version ?? 0, status.latestFailed?.version ?? 0, status.building?.version ?? 0].join(".")
}

/** Tổng quan: phiên bản đang dùng, tiến độ, tham số, cảnh báo và lịch làm mới. */
export async function fetchDatasetStatus(signal?: AbortSignal): Promise<DatasetStatus> {
  const response = await requestOperation("GET /api/v2/admin/flashback/dataset", {}, { signal })
  return adaptDatasetStatus(response)
}

/** Danh sách mã của một phiên bản; không truyền phiên bản thì máy chủ trả bản đang dùng. */
export async function fetchDatasetSymbols(version: number | null, signal?: AbortSignal): Promise<DatasetSymbols> {
  const response = await requestOperation(
    "GET /api/v2/admin/flashback/dataset/symbols",
    { query: version === null ? {} : { version } },
    { signal },
  )
  return { version: response.version, status: response.status, symbols: response.symbols.map(adaptDatasetSymbol) }
}

/** Lịch sử phiên bản kèm nhật ký, mới nhất trước. */
export async function fetchDatasetVersions(signal?: AbortSignal): Promise<DatasetVersion[]> {
  const response = await requestOperation("GET /api/v2/admin/flashback/dataset/versions", {}, { signal })
  return response.versions.map(adaptDatasetVersion)
}

/**
 * Bấm "Làm mới kho": máy chủ chạy ở nền và từ chối (409) khi đang có một lần làm mới khác. Máy chủ
 * ghi nhật ký kiểm tra cho thao tác này.
 */
export async function refreshDataset(): Promise<DatasetRefreshResult> {
  const response = await requestOperation("POST /api/v2/admin/flashback/dataset/refresh", {})
  return { mode: response.mode, jobId: response.job_id }
}

/** Đổi sang khoá và đơn vị của máy chủ; chỉ các khoá có trong `patch`. */
export function toWireConfigPatch(patch: DatasetConfigPatch): ConfigBody {
  const body: ConfigBody = {}
  if (patch.warmupSessions !== undefined) body.warmup_sessions = patch.warmupSessions
  if (patch.minMonthsAgo !== undefined) body.min_months_ago = patch.minMonthsAgo
  if (patch.maxGapSessions !== undefined) body.max_gap_sessions = patch.maxGapSessions
  if (patch.maxZeroVolumeRatio !== undefined) body.max_zero_volume_ratio = patch.maxZeroVolumeRatio
  if (patch.minLiquidityVnd !== undefined) body.min_liquidity_vnd = patch.minLiquidityVnd
  if (patch.minDailyVolatility !== undefined) body.min_daily_volatility = patch.minDailyVolatility
  if (patch.minSymbols !== undefined) body.min_symbols = patch.minSymbols
  if (patch.refreshDelayDays !== undefined) body.refresh_delay_days = patch.refreshDelayDays
  if (patch.priceSources !== undefined) body.price_sources = patch.priceSources
  return body
}

/** Đổi tham số kho (spec §5). Máy chủ kiểm tra khoảng giá trị và ghi nhật ký kiểm tra. */
export async function updateDatasetConfig(patch: DatasetConfigPatch): Promise<DatasetConfig> {
  const response = await requestOperation("PUT /api/v2/admin/flashback/dataset/config", {
    body: toWireConfigPatch(patch),
  })
  return adaptDatasetConfig(response.config)
}
