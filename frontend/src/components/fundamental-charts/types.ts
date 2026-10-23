/**
 * Mô hình dữ liệu một biểu đồ chỉ tiêu cơ bản (spec Dashboard §9, §11).
 *
 * Đây là đầu vào chung của bộ khuôn: Dashboard phân tích cắt số liệu theo
 * Quý/Năm và số kỳ rồi đưa vào đây, Học viện đưa số liệu doanh nghiệp mẫu
 * dựng sẵn trong JSON bài học (kind `fundamental`). Cùng một mô hình thì cùng
 * bố cục, màu, trục và chú giải.
 */

/** Khuôn biểu đồ (spec §9). */
export type FundamentalKind = "A" | "B" | "C" | "D" | "E1" | "E2" | "F" | "F2"

/** Một chuỗi số; kỳ không tính được là `null` (đường đứt đoạn, bảng ghi "—"). */
export type FundamentalSeries = { name: string; v: (number | null)[] }

/** Tầng cột thành phần phía dưới của khuôn A, B, C. */
export type FundamentalSub = {
  unit: string
  type: "grouped" | "stacked"
  series: FundamentalSeries[]
}

export type FundamentalChartData = {
  name: string
  kind: FundamentalKind
  /** Đơn vị của đường chính (A, B, C, F, F2) hoặc của giá trị tóm tắt (D, E1, E2). */
  unit: string
  /** Số chữ số thập phân của `unit`; bỏ trống thì suy từ đơn vị (spec §10). */
  decimals?: number
  /** Nhãn kỳ (`Q2/26`, `2025`) hoặc ngày `YYYY-MM-DD` (khuôn F). */
  labels: string[]
  main: FundamentalSeries[]
  sub?: FundamentalSub
  /** Đơn vị của chuỗi `main` ở khuôn D, E1, E2. */
  mainUnit?: string
  /** Giá trị tóm tắt máy chủ tính sẵn: CAGR %, độ lệch chuẩn, số năm dương liên tục. */
  hero?: number | null
  /** Đường tham chiếu cố định (khuôn F2: PEG = 1). */
  ref?: number
  /**
   * Ghi chú định nghĩa dưới chú giải, ví dụ Net Debt / EBITDA: "Tiền gồm đầu tư tài chính ngắn hạn"
   * (DB-06; trường `legend_note` của API). Lý do biểu đồ trống không đi qua đây.
   */
  legendNote?: string
}

/** Khuôn cố định theo năm: không có ô số kỳ (spec §5.1). */
export const FIXED_YEAR_KINDS: Readonly<Record<FundamentalKind, boolean>> = {
  A: false,
  B: false,
  C: false,
  D: true,
  E1: true,
  E2: true,
  F: false,
  F2: false,
}
