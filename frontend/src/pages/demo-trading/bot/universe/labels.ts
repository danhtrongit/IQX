import { formatDate } from "../format"
import type { UniverseEffective, UniverseRequest } from "../types"

/** Why the server refused a symbol (422 `UNIVERSE_SYMBOLS_INVALID` `details[].reason`). */
const INVALID_REASON: Record<string, string> = {
  not_in_list: "Không thuộc danh mục đã lưu",
  unknown_symbol: "Mã không tồn tại",
  not_tradable: "Không giao dịch được (Bot chỉ mua cổ phiếu đang niêm yết trên HOSE)",
}

export function invalidReasonLabel(reason: string): string {
  return INVALID_REASON[reason] ?? "Không hợp lệ cho nguồn mua của Bot"
}

export function sourceName(source: Pick<UniverseEffective | UniverseRequest, "kind" | "name">): string {
  return source.kind === "vn30" ? "VN30" : source.name
}

export function symbolCount(source: { symbol_count: number | null }, fallback?: number): number | null {
  return source.symbol_count ?? fallback ?? null
}

/** Session from which a request counts; never invented when the calendar is missing. */
export function pendingSessionText(request: Pick<UniverseRequest, "effective_session" | "status">): string {
  if (request.status === "calendar_unavailable" || !request.effective_session) return "chưa xác định phiên hiệu lực"
  return `từ phiên ${formatDate(request.effective_session)}`
}

export const CHANGE_NOTE = "Không bán cổ phiếu đang giữ. Thay đổi có hiệu lực từ phiên giao dịch tiếp theo."

/**
 * Bot SPEC 6.2 / Strategy SPEC 8.4: the Bot buys only from a list the server can tie to a stored
 * Bộ lọc result (`result_snapshot_id`). A list whose tickers the client declared is shown but
 * cannot be applied; the server answers 422 `LIST_NOT_VERIFIED` if it is tried anyway.
 */
export function isListBotVerified(list: { result_snapshot_id?: string | null }): boolean {
  return typeof list.result_snapshot_id === "string" && list.result_snapshot_id !== ""
}

/** Short note shown next to a disabled "Áp dụng cho Bot". */
export const LIST_NOT_VERIFIED_NOTE = "Chưa áp dụng được cho Bot: danh mục này không lưu từ kết quả Bộ lọc. Hãy lưu lại danh mục từ Bộ lọc."

/** Message for 422 `LIST_NOT_VERIFIED`. */
export const LIST_NOT_VERIFIED_MESSAGE = "Danh mục này không được lưu từ kết quả Bộ lọc nên chưa áp dụng được cho Bot. Hãy lưu lại danh mục từ Bộ lọc rồi thử lại."
