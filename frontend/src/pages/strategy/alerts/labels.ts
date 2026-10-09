import { fmtDate } from "../shared/format"
import type { AlertStatus, AlertVersion, StrategyAlert } from "./api"

/**
 * What the user sees for the state of an alert. "Bật" is the user's wish; the status is the
 * result of the end-of-session check, so the two are never merged into one label.
 */
export const STATUS_LABEL: Record<AlertStatus, string> = {
  watching: "Đang theo dõi",
  paused: "Tạm dừng",
  unchecked: "Chưa kiểm tra",
  waiting_data: "Chờ dữ liệu",
  config_error: "Lỗi cấu hình/quyền",
}

export const STATUS_HINT: Record<AlertStatus, string> = {
  watching: "Đã có ít nhất một lần kiểm tra cuối phiên hợp lệ.",
  paused: "Không phát tín hiệu mới cho tới khi bật lại.",
  unchecked: "Đã bật, chưa có lần kiểm tra cuối phiên nào.",
  waiting_data: "Lần kiểm tra gần nhất chưa đánh giá được một số mã vì thiếu dữ liệu.",
  config_error: "Có tổ hợp bị chặn do chưa mở chỉ báo hoặc cấu hình đã ghim không hợp lệ.",
}

export function sourceCaption(version: AlertVersion): string {
  const source = version.source
  if (source.kind === "shared_config") return `Cấu hình chung · bản ${source.revision}`
  return `Kết quả backtest ${source.symbol} · ${fmtDate(source.start)} đến ${fmtDate(source.end)} · cấu hình bản ${source.shared_revision}`
}

export function scopeTitle(version: AlertVersion): string {
  if (version.scope.kind === "saved_list") return `Danh mục: ${version.scope.list_name}`
  return version.symbols.length === 1 ? "Một mã" : `${version.symbols.length} mã`
}

/** The revision number a version pinned, when it came from the shared config. */
export function pinnedRevision(version: AlertVersion): number {
  return version.source.kind === "shared_config" ? version.source.revision : version.source.shared_revision
}

export function lastCheckText(alert: StrategyAlert): string {
  const { session, pairs_expected: expected, pairs_checked: checked } = alert.last_check
  if (!session) return "Chưa có lần kiểm tra"
  return `Đã kiểm tra ${fmtDate(session)} · ${checked}/${expected} tổ hợp`
}
