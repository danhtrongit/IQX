/**
 * Quy tắc của "Đẩy vào bản tin" (spec §4), thuần hàm để kiểm thử: năm điều kiện chặn theo đúng thứ tự
 * và câu báo của spec, danh sách chọn tối đa 10 mã, tên hiển thị và dòng điều kiện in trong bản tin.
 * Máy chủ kiểm lại tất cả; ở đây chỉ để báo sớm và đúng câu.
 */
import { formatBulletinDate, formatBulletinDayMonth } from "@/pages/market-workspace/market/bulletin-format"

import type { PushCandidate, PushContext, PushSlot, PushSlotState } from "./bulletin-push-api"

export const MAX_BULLETIN_PICKS = 10
export const DISPLAY_NAME_MAX = 60
const CONDITION_LINE_MAX = 160
const CONDITION_LINES_MAX = 16
const NO_CRITERIA_LINE = "Chưa áp tiêu chí: toàn bộ doanh nghiệp trong phạm vi"

export const PUSH_MESSAGES = {
  notSaved: "Lưu bộ lọc trước khi đẩy vào bản tin. Bản tin dùng bộ lọc đã lưu để ghi nguồn.",
  editedAfterSave: "Điều kiện đã sửa sau lần lưu. Bấm Lưu bộ lọc (lưu thành phiên bản mới), chạy lại rồi đẩy.",
  changedAfterRun: "Điều kiện đã đổi sau lần chạy. Bấm Chạy bộ lọc trước khi đẩy.",
  noDraft: "Chưa có bản tin nháp để đẩy vào. Bản nháp được tạo tự động khi dữ liệu phiên đã chốt.",
} as const

export type PushGate = {
  /** Bộ lọc đã lưu đang nạp (chữ ký tiêu chí của phiên bản đã lưu); null khi chưa lưu. */
  loaded: { signature: string } | null
  /** Chữ ký tiêu chí đang soạn; null khi chưa dựng được. */
  draftSignature: string | null
  /** Chữ ký tiêu chí của lần chạy đang hiện. */
  runSignature: string
}

/** Điều kiện 1 đến 3: chỉ cần trạng thái trên màn hình, không phải hỏi máy chủ. */
export function savedFilterBlockReason(gate: PushGate): string | null {
  if (!gate.loaded) return PUSH_MESSAGES.notSaved
  if (gate.draftSignature === null || gate.draftSignature !== gate.loaded.signature) return PUSH_MESSAGES.editedAfterSave
  if (gate.draftSignature !== gate.runSignature) return PUSH_MESSAGES.changedAfterRun
  return null
}

/** Điều kiện 4 và 5: cần bản tin đang chờ từ máy chủ. `runDate` là ngày phiên của kết quả (yyyy-mm-dd). */
export function bulletinBlockReason(runDate: string, context: Pick<PushContext, "trade_date" | "locked">): string | null {
  if (context.trade_date === null) return PUSH_MESSAGES.noDraft
  if (runDate !== context.trade_date) {
    return `Kết quả là của phiên ${formatBulletinDayMonth(runDate)}, khác phiên bản tin ${formatBulletinDayMonth(context.trade_date)}. Chạy lại bộ lọc.`
  }
  if (context.locked) return `Bản tin phiên ${formatBulletinDate(context.trade_date)} đã Public, danh sách mã đã khoá.`
  return null
}

/** Ngày phiên (yyyy-mm-dd) của kết quả từ mốc `as_of` của lần chạy. */
export function runSessionDate(asOf: string): string {
  return asOf.slice(0, 10)
}

/** Mã có đủ số liệu phiên mới chọn được (máy chủ từ chối mã thiếu nến phiên). */
export function isPickable(candidate: PushCandidate): boolean {
  return candidate.close !== null && candidate.value_bn !== null
}

/**
 * Mã tick sẵn: phần đã chọn trong bảng kết quả (tối đa 10, theo thứ tự GTGD). Bảng không chọn riêng mã nào
 * nghĩa là lấy toàn bộ mã đạt, nên tick sẵn 10 mã GTGD lớn nhất như bản tin sẽ in.
 */
export function initialPicks(candidates: readonly PushCandidate[], tableSelection: ReadonlySet<string>): Set<string> {
  const pickable = candidates.filter(isPickable)
  const wanted = tableSelection.size > 0 ? pickable.filter((candidate) => tableSelection.has(candidate.symbol)) : pickable
  return new Set(wanted.slice(0, MAX_BULLETIN_PICKS).map((candidate) => candidate.symbol))
}

/** Bấm một ô chọn: đã đủ 10 mã thì không chọn thêm (chỉ bỏ chọn được). */
export function togglePick(selected: ReadonlySet<string>, symbol: string, checked: boolean): Set<string> {
  const next = new Set(selected)
  if (!checked) {
    next.delete(symbol)
    return next
  }
  if (next.size < MAX_BULLETIN_PICKS) next.add(symbol)
  return next
}

/** Các dòng điều kiện in trong bản tin, cắt theo giới hạn của máy chủ. */
export function conditionLines(parts: readonly string[]): string[] {
  const lines = parts.map((part) => part.trim()).filter((part) => part !== "")
  const source = lines.length > 0 ? lines : [NO_CRITERIA_LINE]
  return source.slice(0, CONDITION_LINES_MAX).map((line) => line.slice(0, CONDITION_LINE_MAX))
}

/** Tên hiển thị gợi ý cho một ô: tên đã dùng gần nhất của ô đó, chưa có thì tên bộ lọc. */
export function defaultDisplayName(slot: PushSlotState | undefined, filterName: string): string {
  return (slot?.default_name ?? filterName).slice(0, DISPLAY_NAME_MAX)
}

/** Ô đầu tiên chưa đẩy, không còn ô trống thì ô 1. */
export function defaultSlot(context: Pick<PushContext, "slots">): PushSlot {
  const open = context.slots.find((slot) => slot.pushed === null)
  return ((open ?? context.slots[0])?.slot ?? 1) as PushSlot
}

/** Dòng trạng thái của một ô trong lựa chọn ô. */
export function slotStatusText(slot: PushSlotState): string {
  if (!slot.pushed) return "Chưa đẩy"
  return slot.pushed.passed_count === 0 ? "Đã đẩy, không có mã đạt" : `Đã đẩy ${slot.pushed.picks} mã (thay khi đẩy lại)`
}

/** Thông báo sau khi đẩy thành công. */
export function pushedMessage(count: number, slot: PushSlot, tradeDate: string): string {
  return `Đã đẩy ${count} mã vào Bộ lọc ${slot} của bản tin phiên ${formatBulletinDate(tradeDate)}.`
}
