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
}

export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? (code in STATUS_LABEL ? STATUS_LABEL[code as keyof typeof STATUS_LABEL] : code)
}

