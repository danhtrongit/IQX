import type { DecimalValue } from "./types"

export function toFiniteNumber(value: DecimalValue | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export function formatVnd(value: DecimalValue | null | undefined): string {
  const number = toFiniteNumber(value)
  if (number === null) return "—"
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(number)} ₫`
}

export function formatNumber(value: DecimalValue | null | undefined, digits = 0): string {
  const number = toFiniteNumber(value)
  if (number === null) return "—"
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(number)
}

export function formatPercent(
  value: DecimalValue | null | undefined,
  options: { input?: "ratio" | "percent"; signed?: boolean } = {},
): string {
  const number = toFiniteNumber(value)
  if (number === null) return "—"
  const normalized = options.input === "percent" ? number / 100 : number
  return new Intl.NumberFormat("vi-VN", {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: options.signed ? "exceptZero" : "auto",
  }).format(normalized)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+07:00`)
    : new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value
  return timestamp.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value
  return timestamp.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  })
}

const FILTER_LABELS: Record<string, string> = {
  khoi_ngoai_gom: "Khối ngoại gom",
  ngoai: "Khối ngoại gom",
  tu_doanh_gom: "Tự doanh gom",
  tudoanh: "Tự doanh gom",
  kl_dot_bien: "Khối lượng đột biến",
  kl: "Khối lượng đột biến",
  vuot_dinh_20: "Vượt đỉnh 20 phiên",
  dinh: "Vượt đỉnh 20 phiên",
  tang_manh_kl: "Tăng mạnh kèm khối lượng",
  tang: "Tăng mạnh kèm khối lượng",
}

export function formatFilter(filterId: string): string {
  return FILTER_LABELS[filterId] ?? filterId
}

const REASON_LABELS: Record<string, string> = {
  insufficient_supporting_layers: "Chưa đủ 3/5 lớp Ủng hộ",
  missing_layers: "Thiếu dữ liệu năm lớp",
  missing_veto_severity: "Thiếu mức độ Tin tức/Nội bộ để kiểm tra phủ quyết",
  veto_news_very_negative: "Tin tức ở mức rất xấu",
  veto_insider_very_negative: "Nội bộ ở mức rất xấu",
  veto_very_negative: "Tin tức hoặc Nội bộ ở mức rất xấu",
  invalid_or_missing_l1_amplitude: "Biên độ L1 thiếu hoặc không hợp lệ",
  existing_open_position: "Mã đã có vị thế mở",
  blocked_at_batch_start: "Mã đã bị chặn từ đầu phiên",
  rebuy_same_session: "Không mua lại mã vừa bán trong cùng phiên",
  insufficient_cash_or_lot: "Không đủ tiền cho một lô hợp lệ",
  max_symbol_weight: "Vượt trần 30% NAV cho một mã",
  symbol_weight_limit: "Vượt trần 30% NAV cho một mã",
  buy_limit_reached: "Đã đủ hai giao dịch mua mới trong phiên",
  no_eligible_candidate: "Không có ứng viên đạt đủ điều kiện",
  no_candidate: "Không có ứng viên đạt đủ điều kiện",
  below_support_gate: "Chưa đủ 3/5 lớp Ủng hộ",
  already_open: "Mã đã có vị thế mở",
  blocked_at_start: "Mã đã bị chặn từ đầu phiên",
  already_traded_in_run: "Không mua lại mã đã giao dịch trong cùng phiên",
  insufficient_cash: "Tiền mặt không đủ cho lệnh mua",
  below_board_lot: "Không đủ ngân sách cho một lô hợp lệ",
  missing_official_close: "Thiếu giá đóng cửa chính thức",
  missing_security_status: "Thiếu trạng thái giao dịch của mã",
  filter_data_incomplete: "Dữ liệu Săn mã chưa đầy đủ",
  valuation_incomplete: "NAV chưa được định giá đầy đủ",
  source_error: "Nguồn dữ liệu đang lỗi",
  reconciliation_failed: "Đối soát sổ sách chưa hoàn tất",
  bought: "Đã mua mô phỏng theo bộ quy tắc tiêu chuẩn IQX",
  hold_within_thresholds: "Giá đóng cửa vẫn nằm giữa mốc cắt lỗ và chốt lời",
  stop_loss: "Giá đóng cửa chạm hoặc xuống dưới cắt lỗ",
  take_profit: "Giá đóng cửa chạm hoặc vượt chốt lời",
}

export function formatReason(code: string | null, detail: string | null): string {
  if (detail) return detail
  if (!code) return "Chưa có mô tả"
  return REASON_LABELS[code] ?? code
}
