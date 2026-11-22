import type { ClosedTrade, RunWarning } from "./api"

/** Thin a long curve for drawing only; the first and the last point (which match the KPIs) are always kept. */
export function thinPoints<T>(points: readonly T[], max = 600): T[] {
  if (points.length <= max) return [...points]
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, index) => index % step === 0)
  const last = points[points.length - 1] as T
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** `Điều kiện Bán` / `Hết thời gian giữ`, plus `(cùng đến hạn)` when both were true on the exit bar (§4.7). */
export function exitReasonText(trade: Pick<ClosedTrade, "exit_reason" | "exit_reasons">): string {
  const label = trade.exit_reason === "max_holding" ? "Hết thời gian giữ" : "Điều kiện Bán"
  const both = trade.exit_reasons?.includes("indicator") && trade.exit_reasons.includes("max_holding")
  return both ? `${label} (cùng đến hạn)` : label
}

/** Sentences of §4.8 by code; the server's own message wins when it sends one. */
export function warningText(warning: RunWarning): string {
  if (warning.message) return warning.message
  const symbols = warning.symbols ?? []
  switch (warning.code) {
    case "UNIVERSE_CURRENT_MEMBERS":
      return "Rổ dùng thành phần hiện tại cho cả quá khứ (chưa có dữ liệu thành phần rổ theo thời điểm). Kết quả có thể đẹp hơn thực tế."
    case "UNIVERSE_SNAPSHOT":
      return "Danh mục đã lưu: danh sách mã được chép vào chiến lược khi lưu và dùng cho cả quá khứ."
    case "SYMBOLS_EXCLUDED":
      return `Bỏ ${symbols.length} mã ngoài VN100: ${symbols.join(", ")}`
    case "MARKET_CONTEXT_UNAVAILABLE":
      return "Chưa có dữ liệu VN-Index trong kho cho khoảng này."
    default:
      return warning.code
  }
}
