import { STATUS_LABEL } from "./units"

/** Machine-readable cause of a non-ok cell (the server's `reason_code`) in the user's words. */
const REASON_LABEL: Record<string, string> = {
  missing_input: "Thiếu dữ liệu đầu vào",
  non_positive_base: "Kỳ gốc không dương",
  non_positive_point: "Có mốc năm không dương",
  non_positive_denominator: "Mẫu số không dương",
  invalid_price: "Giá không hợp lệ",
  no_interest_expense: "Không phát sinh chi phí lãi vay",
  financial_sector: "Không áp dụng cho ngân hàng, bảo hiểm, chứng khoán",
  insufficient_history: "Chưa đủ lịch sử báo cáo liên tục",
  provider_error: "Nguồn dữ liệu tài chính tạm thời không khả dụng",
  price_unavailable: "Chưa có giá giao dịch hợp lệ",
  shares_unavailable: "Chưa có số cổ phiếu lưu hành",
  no_report: "Chưa có báo cáo của kỳ cần dùng",
  // Kỹ thuật (Bộ lọc 4.0 §3.4): the row is NO_SIGNAL, it neither passes nor fails.
  insufficient_price_history: "Chưa đủ lịch sử giá",
  no_session_bar: "Không có giá của phiên đã đóng cửa",
}

/** What a technical NO_SIGNAL means, in full (detail dialog); never a pass. */
const REASON_EXPLANATION: Record<string, string> = {
  insufficient_price_history: "Chưa đủ số phiên giao dịch để tính chỉ báo ở điều kiện này. Không được coi là đạt.",
  no_session_bar: "Mã không có giá của phiên đã đóng cửa này (ví dụ tạm ngừng giao dịch) nên chưa tính được điều kiện. Không được coi là đạt.",
}

export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? (code in STATUS_LABEL ? STATUS_LABEL[code as keyof typeof STATUS_LABEL] : code)
}

export function reasonExplanation(code: string | undefined): string | null {
  return code ? (REASON_EXPLANATION[code] ?? null) : null
}

