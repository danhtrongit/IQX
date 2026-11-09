/**
 * Nhãn tiếng Việt, gom nhóm theo bậc, kiểm tra khoảng ngày tra cứu và câu báo lỗi cho khối
 * "Mẫu nến" (Candle Dojo spec v1.3 §7). Giá trị lạ từ máy chủ được hiện nguyên văn thay vì đoán.
 */
import { ApiError, errorMessage } from "@/lib/api"
import { CD_TIER_INFO, type CdTier } from "@/lib/candle-dojo/cards"

import type {
  PatternCardCount,
  PatternLookupParams,
  PatternRun,
  PatternRunTrigger,
  PatternStatus,
} from "./flashback-patterns-api"
import type { StatusTone } from "./labels"

/** Trạng thái hiển thị của lần tính: `stale` là lần chạy mất tín hiệu sống nên có thể đã dừng. */
export type PatternRunState = "none" | "running" | "stale" | "done" | "failed"

export const PATTERN_RUN_STATE: Record<PatternRunState, { label: string; tone: StatusTone }> = {
  none: { label: "Chưa tính lần nào", tone: "neutral" },
  running: { label: "Đang tính", tone: "info" },
  stale: { label: "Bị gián đoạn", tone: "warning" },
  done: { label: "Đã xong", tone: "success" },
  failed: { label: "Thất bại", tone: "danger" },
}

export const PATTERN_TRIGGER_LABEL: Record<PatternRunTrigger, string> = {
  build: "Tự động khi tạo kho",
  backfill: "Chạy bù cho kho đã có",
  admin: "Quản trị viên bấm Tính lại mẫu nến",
  detector: "Đổi bộ nhận diện",
}

/** Tiêu đề cảnh báo theo mã do máy chủ gửi. */
export const PATTERN_WARNING_TITLE: Record<string, string> = {
  pattern_missing: "Kho chưa có mẫu nến",
  pattern_detector_outdated: "Bộ nhận diện đã đổi",
  pattern_failed: "Tính mẫu nến thất bại",
  pattern_symbols_failed: "Có mã tính mẫu lỗi",
  pattern_raw_missing: "Thiếu giá gốc cho 4 thẻ Việt Nam",
}

/**
 * Trạng thái của lần tính mới nhất. Máy chủ chỉ đặt `running` khi lần chạy còn tín hiệu sống; một
 * lần ghi `running` mà không còn tín hiệu là đã bị gián đoạn (máy chủ khởi động lại giữa chừng).
 */
export function patternRunState(status: PatternStatus): PatternRunState {
  if (status.running) return "running"
  const latest = status.latest
  if (!latest) return "none"
  if (latest.status === "running") return "stale"
  return latest.status
}

/** Phần trăm tiến độ của một lần chạy, từ 0 đến 100. */
export function patternRunPercent(run: Pick<PatternRun, "symbolsDone" | "symbolsTotal">): number {
  if (run.symbolsTotal <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((run.symbolsDone / run.symbolsTotal) * 100)))
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const SYMBOL = /^[A-Z0-9]{1,16}$/

/** `2025-03-01` thành `01/03/2025`; rỗng thì `—`. */
export function formatPatternDate(value: string | null | undefined): string {
  if (!value) return "—"
  const match = ISO_DATE.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

/** Ngày `YYYY-MM-DD` có thật (không phải 2025-02-30). */
function isRealDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return parsed.toISOString().slice(0, 10) === value
}

export type PatternLookupDraft = {
  /** `one`: một mã; `all`: mọi mã. */
  scope: "one" | "all"
  symbol: string
  from: string
  to: string
}

export type PatternLookupValidation =
  | { ok: true; params: PatternLookupParams }
  | { ok: false; error: string }

/** Kiểm tra ô nhập của tra cứu trước khi gọi máy chủ; lỗi nói rõ ô nào sai. */
export function validatePatternLookup(draft: PatternLookupDraft): PatternLookupValidation {
  const symbol = draft.symbol.trim().toUpperCase()
  if (draft.scope === "one") {
    if (symbol === "") return { ok: false, error: "Nhập mã cổ phiếu hoặc chọn Tất cả mã." }
    if (!SYMBOL.test(symbol)) {
      return { ok: false, error: "Mã chỉ gồm chữ và số, tối đa 16 ký tự." }
    }
  }
  if (draft.from === "") return { ok: false, error: "Chọn ngày bắt đầu." }
  if (draft.to === "") return { ok: false, error: "Chọn ngày kết thúc." }
  if (!isRealDate(draft.from)) return { ok: false, error: "Ngày bắt đầu không hợp lệ." }
  if (!isRealDate(draft.to)) return { ok: false, error: "Ngày kết thúc không hợp lệ." }
  if (draft.from > draft.to) return { ok: false, error: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." }
  return {
    ok: true,
    params: { symbol: draft.scope === "all" ? null : symbol, from: draft.from, to: draft.to },
  }
}

function isTier(value: number): value is CdTier {
  return value in CD_TIER_INFO
}

/** Bậc của thẻ: nhãn và màu theo `CD_TIER_INFO`; bậc lạ hiện `Bậc n` không có màu. */
export function patternTierInfo(tier: number): { label: string; color: string | null } {
  return isTier(tier) ? { label: CD_TIER_INFO[tier].label, color: CD_TIER_INFO[tier].color } : { label: `Bậc ${tier}`, color: null }
}

export type PatternTierGroup<T extends PatternCardCount> = {
  tier: number
  cards: T[]
  total: number
}

/**
 * Gom thẻ theo bậc tăng dần. Trong mỗi bậc thẻ nhiều lần nhất lên trước, thẻ 0 lần xuống cuối,
 * cùng số lần thì theo tên.
 */
export function groupPatternCardsByTier<T extends PatternCardCount>(cards: readonly T[]): PatternTierGroup<T>[] {
  const byTier = new Map<number, T[]>()
  for (const card of cards) {
    const list = byTier.get(card.tier)
    if (list) list.push(card)
    else byTier.set(card.tier, [card])
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, list]) => {
      const sorted = [...list].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      return { tier, cards: sorted, total: sorted.reduce((sum, card) => sum + card.count, 0) }
    })
}

/** Câu báo lỗi của "Tính lại mẫu nến" theo mã lỗi hoặc mã HTTP của máy chủ. */
export function describeRecomputeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "PATTERN_RUN_RUNNING") {
      return "Đang có một lần tính mẫu nến chạy. Hãy chờ cho tới khi xong rồi bấm lại."
    }
    if (error.code === "PATTERN_NO_ACTIVE_DATASET") {
      return "Chưa có kho dữ liệu đang dùng nên chưa tính được mẫu nến. Hãy làm mới kho trước."
    }
    if (error.status === 409) return "Máy chủ đang bận tính mẫu nến. Hãy chờ cho tới khi xong rồi bấm lại."
    if (error.status === 403) return "Chỉ quản trị viên được tính lại mẫu nến."
    if (error.status === 429) return "Bạn thao tác quá nhanh. Hãy thử lại sau ít giây."
    if (error.status >= 500) return "Máy chủ chưa nhận được yêu cầu tính lại mẫu nến. Hãy thử lại sau ít phút."
  }
  return errorMessage(error)
}
