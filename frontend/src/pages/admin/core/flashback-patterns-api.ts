/**
 * Lớp dữ liệu của khối "Mẫu nến" trong mục "Kho dữ liệu Flashback" (Candle Dojo spec v1.3 §7).
 *
 * Mẫu nến của mọi phiên của mọi mã trong kho được tính sẵn một lần. Khối này cho quản trị viên xem
 * trạng thái lần tính, bấm "Tính lại mẫu nến", tra số lần theo từng thẻ trong một khoảng ngày và
 * đọc tổng quan 47 thẻ trên cả kho.
 *
 * Cấu trúc trên dây lấy từ contract sinh (`ApiResponseFor`), rồi đổi sang tên dùng trong giao
 * diện. Nhật ký một lần tính là JSON tự do nên được đọc phòng thủ: khoá thiếu hoặc sai kiểu thì
 * bỏ qua thay vì làm hỏng cả khối.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type PatternStatusResponse = ApiResponseFor<"GET /api/v2/admin/flashback/dataset/patterns/status">
export type PatternLookupResponse = ApiResponseFor<"GET /api/v2/admin/flashback/dataset/patterns/lookup">
export type PatternOverviewResponse = ApiResponseFor<"GET /api/v2/admin/flashback/dataset/patterns/overview">

type RunRow = NonNullable<PatternStatusResponse["latest"]>

export type PatternRunStatus = RunRow["status"]
export type PatternRunTrigger = RunRow["trigger"]
export type PatternWarningLevel = PatternStatusResponse["warnings"][number]["level"]

/** Một lần tính mẫu nến của một phiên bản kho. */
export type PatternRun = {
  id: number
  version: number
  detectorVersion: number
  trigger: PatternRunTrigger
  status: PatternRunStatus
  requestedBy: string | null
  startedAt: string
  finishedAt: string | null
  symbolsDone: number
  symbolsTotal: number
  patternsCount: number
  failedCount: number
  durationMs: number | null
  /** Lý do thất bại do máy chủ ghi trong nhật ký, nếu có. */
  error: string | null
  /** Mã tính lỗi (vẫn dùng cho ván nhưng không có thẻ). */
  failedSymbols: string[]
}

export type PatternWarning = {
  code: string
  level: PatternWarningLevel
  message: string
  at: string | null
}

export type PatternStatus = {
  /** Phiên bản kho đang dùng; `null` khi chưa có kho. */
  version: number | null
  /** Phiên bản bộ nhận diện của mã nguồn đang chạy. */
  detectorVersion: number
  /** Lần tính đang chạy và còn tín hiệu sống (khoá nút "Tính lại mẫu nến"). */
  running: PatternRun | null
  /** Lần tính mới nhất, mọi trạng thái. */
  latest: PatternRun | null
  /** Lần tính xong mới nhất: bộ mẫu mà ván chơi đang tra. */
  used: PatternRun | null
  /** Bộ mẫu đang dùng khác bộ nhận diện của mã nguồn, hoặc chưa có bộ nào. */
  outdated: boolean
  /** Giá gốc đang có cho 4 thẻ Việt Nam. */
  raw: { symbols: number; sessions: number }
  warnings: PatternWarning[]
}

/** Một thẻ trong bảng số lần, ở tra cứu và ở tổng quan. */
export type PatternCardCount = {
  cardId: string
  name: string
  tier: number
  count: number
}

export type PatternLookupParams = {
  /** Mã viết hoa, hoặc `null` cho mọi mã. */
  symbol: string | null
  /** Ngày `YYYY-MM-DD`, gồm cả hai đầu. */
  from: string
  to: string
}

export type PatternLookup = {
  version: number | null
  /** `null` khi phiên bản kho chưa có lần tính nào xong. */
  detectorVersion: number | null
  symbol: string | null
  from: string
  to: string
  cards: PatternCardCount[]
  total: number
}

export type PatternOverviewCard = PatternCardCount & {
  /** Số nến của mẫu. */
  candles: number
  /** Một trong 4 thẻ Việt Nam: cần giá gốc, 0 lần thường do thiếu giá gốc. */
  vn: boolean
  zero: boolean
}

export type PatternOverview = {
  version: number | null
  detectorVersion: number | null
  total: number
  zeroCount: number
  cards: PatternOverviewCard[]
}

export type PatternRecomputeResult = { version: number; detectorVersion: number }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Lý do thất bại trong nhật ký lần tính; không có thì `null`. */
export function readPatternRunError(log: Record<string, unknown> | null | undefined): string | null {
  const error = log?.error
  return typeof error === "string" && error.trim() !== "" ? error : null
}

/** Danh sách mã tính lỗi trong nhật ký lần tính; phần tử sai kiểu bị bỏ. */
export function readPatternFailedSymbols(log: Record<string, unknown> | null | undefined): string[] {
  const failed = log?.failed
  if (!Array.isArray(failed)) return []
  return failed.flatMap((item) => {
    const row = asRecord(item)
    return row && typeof row.symbol === "string" ? [row.symbol] : []
  })
}

export function adaptPatternRun(row: RunRow): PatternRun {
  return {
    id: row.id,
    version: row.version,
    detectorVersion: row.detector_version,
    trigger: row.trigger,
    status: row.status,
    requestedBy: row.requested_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    symbolsDone: row.symbols_done,
    symbolsTotal: row.symbols_total,
    patternsCount: row.patterns_count,
    failedCount: row.failed_count,
    durationMs: row.duration_ms,
    error: readPatternRunError(row.log),
    failedSymbols: readPatternFailedSymbols(row.log),
  }
}

export function adaptPatternStatus(response: PatternStatusResponse): PatternStatus {
  return {
    version: response.version,
    detectorVersion: response.detector_version,
    running: response.running ? adaptPatternRun(response.running) : null,
    latest: response.latest ? adaptPatternRun(response.latest) : null,
    used: response.used ? adaptPatternRun(response.used) : null,
    outdated: response.outdated,
    raw: response.raw,
    warnings: response.warnings.map((warning) => ({
      code: warning.code,
      level: warning.level,
      message: warning.message,
      at: warning.at,
    })),
  }
}

export function adaptPatternLookup(response: PatternLookupResponse): PatternLookup {
  return {
    version: response.version,
    detectorVersion: response.detector_version,
    symbol: response.symbol,
    from: response.from,
    to: response.to,
    cards: response.rows.map((row) => ({ cardId: row.card_id, name: row.name, tier: row.tier, count: row.count })),
    total: response.total,
  }
}

export function adaptPatternOverview(response: PatternOverviewResponse): PatternOverview {
  return {
    version: response.version,
    detectorVersion: response.detector_version,
    total: response.total,
    zeroCount: response.zero_count,
    cards: response.cards.map((card) => ({
      cardId: card.card_id,
      name: card.name,
      tier: card.tier,
      count: card.count,
      candles: card.candles,
      vn: card.vn,
      zero: card.zero,
    })),
  }
}

/**
 * Trạng thái tính mẫu của phiên bản kho đang dùng: lần chạy, bộ nhận diện, giá gốc và cảnh báo.
 * Dấu hiệu "đang chạy" là `running`: máy chủ chỉ báo khi lần chạy còn tín hiệu sống.
 */
export async function fetchPatternStatus(signal?: AbortSignal): Promise<PatternStatus> {
  const response = await requestOperation("GET /api/v2/admin/flashback/dataset/patterns/status", {}, { signal })
  return adaptPatternStatus(response)
}

/** Số lần theo từng thẻ của một mã (hoặc mọi mã) trong một khoảng ngày (spec v1.3 §6). */
export async function fetchPatternLookup(params: PatternLookupParams, signal?: AbortSignal): Promise<PatternLookup> {
  const response = await requestOperation(
    "GET /api/v2/admin/flashback/dataset/patterns/lookup",
    { query: { ...(params.symbol ? { symbol: params.symbol } : {}), from: params.from, to: params.to } },
    { signal },
  )
  return adaptPatternLookup(response)
}

/** Số lần gặp của từng thẻ trên cả kho; thẻ có 0 lần được máy chủ đánh dấu. */
export async function fetchPatternOverview(signal?: AbortSignal): Promise<PatternOverview> {
  const response = await requestOperation("GET /api/v2/admin/flashback/dataset/patterns/overview", {}, { signal })
  return adaptPatternOverview(response)
}

/**
 * Bấm "Tính lại mẫu nến": máy chủ chạy ở nền trong tiến trình API và từ chối (409) khi đang có một
 * lần tính khác hoặc chưa có kho đang dùng. Máy chủ ghi nhật ký kiểm tra cho thao tác này.
 */
export async function recomputePatterns(): Promise<PatternRecomputeResult> {
  const response = await requestOperation("POST /api/v2/admin/flashback/dataset/patterns/recompute", {})
  return { version: response.version, detectorVersion: response.detector_version }
}
