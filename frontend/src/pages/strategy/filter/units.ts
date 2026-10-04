/**
 * Codec đơn vị của Bộ lọc (DATA-CONTRACT §3).
 *
 * - Chỉ tiêu có `api_unit: "ratio"` (unit hiển thị "%" hoặc "điểm %") đi trên
 *   dây dưới dạng tỉ lệ: người dùng gõ 15 → API nhận 0.15, và ngược lại.
 * - "lần", "ngày", "năm" giữ nguyên giá trị.
 *
 * Phép nhân/chia 100 được làm tròn về 12 chữ số có nghĩa để khử nhiễu dấu phẩy
 * động (vd. 0.155 × 100 = 15.500000000000002 → 15.5).
 */
import type { ApiUnit, MetricStatus, MetricValue } from "./types"

const SIGNIFICANT_DIGITS = 12

function clean(value: number): number {
  if (value === 0) return 0
  return Number(value.toPrecision(SIGNIFICANT_DIGITS))
}

function isRatio(apiUnit: ApiUnit | string): boolean {
  return apiUnit === "ratio"
}

/** Giá trị đơn vị hiển thị → đơn vị API. */
export function toApiValue(display: number, apiUnit: ApiUnit | string): number {
  return isRatio(apiUnit) ? clean(display / 100) : display
}

/** Giá trị đơn vị API → đơn vị hiển thị. */
export function toDisplayValue(api: number, apiUnit: ApiUnit | string): number {
  return isRatio(apiUnit) ? clean(api * 100) : api
}

/**
 * Đọc ô nhập ngưỡng: chấp nhận dấu phẩy hoặc chấm thập phân, dấu âm.
 * Rỗng hoặc không phải số hữu hạn → `null` (điều kiện chưa hoàn chỉnh, không ép 0).
 */
export function parseDisplayInput(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".")
  if (normalized === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const displayFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

/** Số theo đơn vị hiển thị, định dạng vi-VN (15,5). Không có số → "—". */
export function formatDisplayNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : displayFormat.format(value)
}

/** Giá trị đưa vào ô nhập khi nạp lại bộ lọc đã lưu (dấu phẩy thập phân). */
export function displayInputText(api: number, apiUnit: ApiUnit | string): string {
  return String(toDisplayValue(api, apiUnit)).replace(".", ",")
}

export type MetricCell = {
  /** Chữ hiển thị trong ô: số đã định dạng hoặc "—". */
  text: string
  /** Nhãn trạng thái khi giá trị không phải số xác định. */
  badge: string | null
  title: string | null
}

const STATUS_BADGE: Record<Exclude<MetricStatus, "valid">, string> = {
  missing: "Thiếu dữ liệu",
  not_applicable: "Không áp dụng",
  undefined_denominator: "Không đủ cơ sở",
  non_positive_base: "Không đủ cơ sở",
  lower_bound: "Cận dưới",
}

/**
 * Ô kết quả của một chỉ tiêu. Trạng thái khác `valid` không bao giờ thành 0:
 * `lower_bound` hiển thị "≥ x" kèm nhãn; còn lại hiển thị "—" kèm nhãn.
 */
export function metricCell(cell: MetricValue | undefined, apiUnit: ApiUnit | string): MetricCell {
  if (!cell) return { text: "—", badge: STATUS_BADGE.missing, title: null }
  const reason = cell.reason ?? null
  const hasNumber = typeof cell.value === "number" && Number.isFinite(cell.value)
  if (cell.status === "valid" && hasNumber) {
    return { text: formatDisplayNumber(toDisplayValue(cell.value as number, apiUnit)), badge: null, title: reason }
  }
  if (cell.status === "lower_bound" && hasNumber) {
    return {
      text: `≥ ${formatDisplayNumber(toDisplayValue(cell.value as number, apiUnit))}`,
      badge: STATUS_BADGE.lower_bound,
      title: reason ?? "Chỉ biết cận dưới của giá trị",
    }
  }
  const badge =
    Object.hasOwn(STATUS_BADGE, cell.status) && cell.status !== "lower_bound"
      ? STATUS_BADGE[cell.status as Exclude<MetricStatus, "valid">]
      : STATUS_BADGE.missing
  return { text: "—", badge, title: reason }
}
