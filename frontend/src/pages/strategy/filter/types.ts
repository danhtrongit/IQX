/**
 * Types of the Bộ lọc tab, taken from the generated API contract. Filter definition 3.0 carries a
 * period on every rule (there is no filter-wide period). Values of `api_unit: "ratio"` travel as
 * ratios (15% = 0.15); the UI types and shows display units, converted only in `units.ts`.
 */
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

type RunBody = ApiRequestFor<"POST /api/v2/strategy/screener/run">["body"]

export type FilterDefinition = Extract<RunBody, { schema_version: "3.0" }>
export type FilterRule = FilterDefinition["rules"][number]
export type FilterColumn = NonNullable<FilterDefinition["columns"]>[number]
export type FilterScope = FilterDefinition["scope"]

export type ScreenerMetric = ApiResponseFor<"GET /api/v2/strategy/screener/metrics">[number]
export type MetricId = ScreenerMetric["id"]
export type FilterPeriod = ScreenerMetric["default_period"]
export type ApiUnit = ScreenerMetric["api_unit"]
export type FilterOperator = FilterRule["operator"]

export type RunResult = ApiResponseFor<"POST /api/v2/strategy/screener/run">
export type ResultPage = ApiResponseFor<"GET /api/v2/strategy/screener/results/{resultId}">
export type ResultRow = ResultPage["results"][number]
export type MetricResult = ResultRow["metrics"][string]
/** The one status enum of a cell: ok | missing | not_applicable | insufficient_base | definition_pending | data_unavailable. */
export type CellStatus = MetricResult["status"]
export type ResultHeader = Omit<ResultPage, "results" | "total" | "offset" | "limit" | "result_id">

export type SavedFilter = ApiResponseFor<"GET /api/v2/strategy/filters">["items"][number]
export type SavedList = ApiResponseFor<"GET /api/v2/strategy/lists">["items"][number]
export type ResultSnapshotSummary = ApiResponseFor<"GET /api/v2/strategy/result-snapshots">["items"][number]
export type ResultSnapshot = ApiResponseFor<"GET /api/v2/strategy/result-snapshots/{snapshotId}">

/** `all` = every row that passed in the whole stored result; `subset` = exactly these symbols. */
export type Selection = { mode: "all" } | { mode: "subset"; symbols: string[] }

/** "Tất cả" for market and sector. */
export const SCOPE_ALL = "all"

/** A condition being edited: the threshold stays the text the user typed (display unit). */
export type DraftRule = {
  id: string
  metric_id: MetricId
  /** `null` when a stored 2.0 filter used a period this metric no longer supports: the user must choose. */
  period: FilterPeriod | null
  operator: FilterOperator
  displayValue: string
  /** Why the period must be chosen again (legacy filter that needs review). */
  review?: string | null
}
