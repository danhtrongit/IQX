/**
 * Dashboard phân tích · lớp dữ liệu (spec §11).
 *
 * Mọi thứ đến từ máy chủ: thiết lập theo tài khoản (`/dashboard/settings`),
 * danh mục 33 chỉ tiêu (`/dashboard/catalog`), số liệu theo khuôn
 * (`/fundamental/{mã}`) và chuỗi định giá theo ngày (`/valuation/{mã}`).
 *
 * API trả đủ 20 quý và 10 năm, client tự cắt theo số kỳ đã chọn nên đổi số
 * kỳ không phải gọi lại. Cả hai chế độ Quý và Năm luôn nằm trong cùng một
 * câu trả lời, nên chuyển chế độ cũng không phải gọi lại.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

export type DashboardSettings = ApiResponseFor<"GET /api/v2/dashboard/settings">
export type DashboardCatalog = ApiResponseFor<"GET /api/v2/dashboard/catalog">
export type DashboardFundamental = ApiResponseFor<"GET /api/v2/fundamental/{symbol}">
export type DashboardValuation = ApiResponseFor<"GET /api/v2/valuation/{symbol}">
export type SaveSettingsBody = ApiRequestFor<"PUT /api/v2/dashboard/settings">["body"]

/** Tên chỉ tiêu: khoá của một biểu đồ trong thiết lập và trong số liệu. */
export type ChartName = DashboardCatalog[number]["items"][number]["name"]
export type CatalogGroup = DashboardCatalog[number]
export type CatalogItem = DashboardCatalog[number]["items"][number]

/** Chế độ kỳ chung cho cả dashboard. */
export type PeriodMode = DashboardSettings["per"]
/** Số kỳ riêng của từng biểu đồ, theo từng chế độ. */
export type PeriodCounts = DashboardSettings["nks"]

export type SeriesPoint = { name: string; v: (number | null)[] }
export type SubSeries = { unit: string; type: "grouped" | "stacked"; series: SeriesPoint[] }
export type ChartSeries = { labels: string[]; main: SeriesPoint[]; sub?: SubSeries }

export type FundamentalEntry = DashboardFundamental["charts"][string]
/** Chỉ tiêu không áp dụng cho mã ngân hàng (spec §7). */
export type NotApplicableEntry = Extract<FundamentalEntry, { na: 1 }>
export type ChartDataEntry = Exclude<FundamentalEntry, { na: 1 }>
export type ChartKind = ChartDataEntry["kind"]
export type ChartStatus = ChartDataEntry["status"]

export type ValuationEntry = DashboardValuation["charts"][string]
export type ValuationChart = Exclude<ValuationEntry, { na: 1 }>

/** Chỉ tiêu không áp dụng cho mã ngân hàng (spec §7). */
export function isNotApplicable(entry: FundamentalEntry | undefined): entry is NotApplicableEntry {
  return !!entry && "na" in entry
}

export function fetchDashboardSettings(signal?: AbortSignal): Promise<DashboardSettings> {
  return requestOperation("GET /api/v2/dashboard/settings", {}, { signal })
}

export function fetchDashboardCatalog(signal?: AbortSignal): Promise<DashboardCatalog> {
  return requestOperation("GET /api/v2/dashboard/catalog", {}, { signal })
}

export function saveDashboardSettings(body: SaveSettingsBody, signal?: AbortSignal) {
  return requestOperation("PUT /api/v2/dashboard/settings", { body }, { signal })
}

/** Số liệu các biểu đồ được hỏi, đủ 20 quý và 10 năm để client tự cắt. */
export function fetchFundamental(
  symbol: string,
  charts: readonly string[],
  per: PeriodMode,
  signal?: AbortSignal,
): Promise<DashboardFundamental> {
  return requestOperation(
    "GET /api/v2/fundamental/{symbol}",
    { path: { symbol }, query: { charts: charts.join(","), per } },
    { signal },
  )
}

export type InstrumentDetail = ApiResponseFor<"GET /api/v2/instruments/{symbol}">

/** Thông tin một mã trong danh sách mã: ngành cấp 1 và 2 cho nhãn loại doanh nghiệp. */
export function fetchInstrument(symbol: string, signal?: AbortSignal): Promise<InstrumentDetail> {
  return requestOperation("GET /api/v2/instruments/{symbol}", { path: { symbol } }, { signal })
}

/** Chuỗi định giá theo ngày (khuôn F). `from` là ngày bắt đầu, tối đa 10 năm. */
export function fetchValuation(
  symbol: string,
  from: string,
  charts: readonly string[],
  signal?: AbortSignal,
): Promise<DashboardValuation> {
  return requestOperation(
    "GET /api/v2/valuation/{symbol}",
    { path: { symbol }, query: { from, charts: charts.join(",") } },
    { signal },
  )
}
