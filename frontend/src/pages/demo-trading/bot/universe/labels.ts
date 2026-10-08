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
