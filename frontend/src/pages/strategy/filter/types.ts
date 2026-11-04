/**
 * Types of the Bộ lọc tab, taken from the generated API contract. Filter definition 4.0 is
 * Thị trường (`market`), the fundamental `rules` (a period on every rule) and Kỹ thuật
 * (`technical`, the Bot's own condition rows). Values of `api_unit: "ratio"` travel as ratios
 * (15% = 0.15); the UI types and shows display units, converted only in `units.ts`. Thị trường
 * values travel in the unit they are shown in (tỷ đồng, nghìn đồng).
 */
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

type RunBody = ApiRequestFor<"POST /api/v2/strategy/screener/run">["body"]

export type FilterDefinition = Extract<RunBody, { schema_version: "4.0" }>
export type FilterRule = FilterDefinition["rules"][number]
export type FilterColumn = NonNullable<FilterDefinition["columns"]>[number]
export type MarketScope = FilterDefinition["market"]
export type TechnicalItem = NonNullable<FilterDefinition["technical"]>[number]
export type RowsTechnicalItem = Extract<TechnicalItem, { rules: unknown }>
export type VolumeTechnicalItem = Extract<TechnicalItem, { indicator: "volume" }>
/** The part of a definition that decides a run: a stored or returned definition has all of it. */
export type CriteriaDefinition = Pick<FilterDefinition, "market" | "rules" | "technical">

export type ScreenerMetric = ApiResponseFor<"GET /api/v2/strategy/screener/metrics">[number]
export type MetricId = ScreenerMetric["id"]
export type FilterPeriod = ScreenerMetric["default_period"]
export type ApiUnit = ScreenerMetric["api_unit"]
export type FilterOperator = FilterRule["operator"]

export type RunResult = ApiResponseFor<"POST /api/v2/strategy/screener/run">
export type ResultPage = ApiResponseFor<"GET /api/v2/strategy/screener/results/{resultId}">
export type ResultRow = ResultPage["results"][number]
export type MetricResult = ResultRow["metrics"][string]
export type TechnicalCell = ResultRow["technical"][string]
export type ResultMarket = ResultRow["market"]
/** The financial-statement group of a company: thuong | nh | ck | bh. */
export type StatementGroup = ResultRow["group"]
/** The one status enum of a cell: ok | missing | not_applicable | insufficient_base | definition_pending | data_unavailable. */
export type CellStatus = MetricResult["status"]
export type ResultHeader = Omit<ResultPage, "results" | "total" | "offset" | "limit" | "result_id">
export type TechnicalQuality = ResultHeader["data_quality"]["technical"][number]

export type SavedFilter = ApiResponseFor<"GET /api/v2/strategy/filters">["items"][number]
export type SavedList = ApiResponseFor<"GET /api/v2/strategy/lists">["items"][number]
export type ResultSnapshotSummary = ApiResponseFor<"GET /api/v2/strategy/result-snapshots">["items"][number]
export type ResultSnapshot = ApiResponseFor<"GET /api/v2/strategy/result-snapshots/{snapshotId}">

/** `all` = every row that passed in the whole stored result; `subset` = exactly these symbols. */
export type Selection = { mode: "all" } | { mode: "subset"; symbols: string[] }

/** How the stored result is ordered: a column key (`symbol`, `price`, `metric:roe`, `tech:rsi.level`…) and a direction. */
export type SortState = { key: string; order: "asc" | "desc" }

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
