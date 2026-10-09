/**
 * Unit codec and cell rendering of the Bộ lọc.
 *
 * - Metrics with `api_unit: "ratio"` (display unit "%" or "điểm %") travel as ratios: typing 15
 *   sends 0.15 and back. "lần", "ngày", "năm" keep their value.
 * - A cell is never turned into 0: only `status: "ok"` carries a number; every other status of the
 *   server enum shows "—" with its own label.
 * - Comparison and ordering use the unrounded value; rounding is for display only.
 */
import type { ApiUnit, CellStatus, MetricResult } from "./types"

const SIGNIFICANT_DIGITS = 12

function clean(value: number): number {
  if (value === 0) return 0
  return Number(value.toPrecision(SIGNIFICANT_DIGITS))
}

function isRatio(apiUnit: ApiUnit | string): boolean {
  return apiUnit === "ratio"
}

export function toApiValue(display: number, apiUnit: ApiUnit | string): number {
  return isRatio(apiUnit) ? clean(display / 100) : display
}

export function toDisplayValue(api: number, apiUnit: ApiUnit | string): number {
  return isRatio(apiUnit) ? clean(api * 100) : api
}

/** Accepts a comma or a dot as the decimal mark and a leading sign. Empty or not finite is `null`. */
export function parseDisplayInput(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".")
  if (normalized === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const displayFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

export function formatDisplayNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : displayFormat.format(value)
}

/** Text put in the threshold input when a saved filter is loaded (decimal comma). */
export function displayInputText(api: number, apiUnit: ApiUnit | string): string {
  return String(toDisplayValue(api, apiUnit)).replace(".", ",")
}

/** What a non-ok status means to the user. Never a pass, never 0. */
export const STATUS_LABEL: Record<Exclude<CellStatus, "ok">, string> = {
  missing: "Chưa đủ dữ liệu",
  not_applicable: "Không áp dụng",
  insufficient_base: "Không tính được",
  definition_pending: "Chờ định nghĩa",
  data_unavailable: "Chưa có nguồn dữ liệu",
}

export const STATUS_EXPLANATION: Record<Exclude<CellStatus, "ok">, string> = {
  missing: "Thiếu báo cáo hoặc một thành phần của kỳ cần dùng. Không được coi là đạt.",
  not_applicable: "Chỉ tiêu không áp dụng cho loại doanh nghiệp này. Không được coi là đạt.",
  insufficient_base: "Kỳ gốc hoặc mẫu số không dương nên không có tỷ số thông thường. Không được coi là đạt.",
  definition_pending: "Chỉ tiêu chưa có định nghĩa được duyệt nên chưa chạy được.",
  data_unavailable: "Chỉ tiêu đã có định nghĩa nhưng nguồn dữ liệu chưa cung cấp đủ đầu vào.",
}

export type CellView = {
  /** Text in the cell: the formatted number or "—". */
  text: string
  /** Line under the value: the real period of the figure, or the status label. */
  caption: string
  ok: boolean
  /** `≥ x`: the whole available history is positive, so the true value is at least this. */
  lowerBound: boolean
  /** Tooltip: the server's reason or the lower-bound note. */
  title: string | null
}

export function cellView(cell: MetricResult | undefined, apiUnit: ApiUnit | string): CellView {
  if (!cell) return { text: "—", caption: STATUS_LABEL.missing, ok: false, lowerBound: false, title: null }
  const hasNumber = typeof cell.value === "number" && Number.isFinite(cell.value)
  if (cell.status === "ok" && hasNumber) {
    const lowerBound = cell.lower_bound === true
    const shown = formatDisplayNumber(toDisplayValue(cell.value as number, apiUnit))
    return {
      text: lowerBound ? `≥ ${shown}` : shown,
      caption: cell.actual_period_label ?? "Chưa có nhãn kỳ",
      ok: true,
      lowerBound,
      title: lowerBound ? "Toàn bộ lịch sử có sẵn đều dương: giá trị thật tối thiểu bằng số này." : null,
    }
  }
  const status = cell.status === "ok" ? "missing" : cell.status
  return { text: "—", caption: STATUS_LABEL[status], ok: false, lowerBound: false, title: cell.reason ?? null }
}
