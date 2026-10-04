/**
 * Kiểu dữ liệu của tab Bộ lọc (bot-v2) — khớp `.pi/botv2/CONTRACTS.md` §5 và
 * `backend/src/modules/screener/registry/filter.schema.json`.
 *
 * Giá trị trên dây (API) của chỉ tiêu có `api_unit: "ratio"` là tỉ lệ
 * (15% = 0.15); UI luôn nhập/hiển thị theo đơn vị hiển thị (`unit`). Việc đổi
 * đơn vị chỉ nằm trong `units.ts`.
 */

/** Đơn vị trên dây của chỉ tiêu cơ bản (enum của filter.schema.json). */
export type ApiUnit = "ratio" | "lần" | "ngày" | "năm"

export type FilterOperator = ">" | "<"

export type FilterPeriod = "TTM" | "annual" | "quarter"

/** Giá trị scope "Tất cả" cho thị trường và ngành. */
export const SCOPE_ALL = "all"

export type ScreenerMetric = {
  id: string
  name: string
  lesson_id: string
  /** Đơn vị hiển thị: "%", "điểm %", "lần", "ngày", "năm". */
  unit: string
  api_unit: ApiUnit
  period: string
  applicability: string
  operators: FilterOperator[]
  learned: boolean
  supported: boolean
  unsupported_reason: string | null
}

export type FilterRule = {
  id: string
  metric_id: string
  operator: FilterOperator
  /** Ngưỡng theo đơn vị API (tỉ lệ cho `ratio`). */
  value: number
  api_unit: ApiUnit
}

export type FilterScope = {
  market: string
  sector: string
  period: FilterPeriod
}

export type FilterDefinition = {
  schema_version: "2.0"
  name: string
  logic: "AND"
  rules: FilterRule[]
  scope: FilterScope
}

/**
 * Trạng thái một giá trị chỉ tiêu (DATA-CONTRACT §3). Chỉ `valid` và
 * `lower_bound` mang số; các trạng thái còn lại không bao giờ hiển thị là 0.
 */
export type MetricStatus =
  | "valid"
  | "missing"
  | "not_applicable"
  | "undefined_denominator"
  | "non_positive_base"
  | "lower_bound"

export type MetricValue = {
  value: number | null
  status: MetricStatus | string
  unit: string
  period: string
  available_at: string | null
  source_revision: string | null
  reason?: string | null
}

export type ScreenerResultRow = {
  symbol: string
  name: string | null
  sector: string | null
  passed: boolean
  metrics: Record<string, MetricValue>
}

export type ScreenerRunResult = {
  as_of: string
  scope: FilterScope
  period: FilterPeriod
  results: ScreenerResultRow[]
  counts: { universe: number; passed: number; missing: number }
  /** Nguồn dữ liệu nếu server trả kèm (trường bổ sung, có thể vắng). */
  data_source?: string | null
}

export type SavedFilter = {
  id: string
  name: string
  current_version: number
  /** Định nghĩa của phiên bản hiện tại (có ở `GET /filters/:id`). */
  definition: FilterDefinition | null
  created_at: string | null
  updated_at: string | null
}

export type SavedList = {
  id: string
  name: string
  filter_id: string | null
  filter_version: number | null
  tickers: string[]
  as_of: string
  data_source: string
  scope: FilterScope | null
  created_at: string | null
}

export type CreateListBody = {
  name: string
  filter_id?: string
  filter_version?: number
  tickers: string[]
  as_of: string
  data_source: string
  scope: FilterScope
}

/** Một dòng điều kiện đang soạn: ngưỡng giữ nguyên chuỗi người dùng gõ (đơn vị hiển thị). */
export type DraftRule = {
  id: string
  metric_id: string
  operator: FilterOperator
  displayValue: string
}
