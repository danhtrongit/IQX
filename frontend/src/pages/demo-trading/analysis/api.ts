/**
 * Dashboard phân tích · lớp dữ liệu (spec Dashboard v2 §11).
 *
 * Mọi thứ đến từ máy chủ: ngành của mã (`/dashboard/industry/{mã}`), thiết lập
 * theo tài khoản và theo ngành (`/dashboard/settings`), danh mục 62 chỉ tiêu
 * chia theo ngành (`/dashboard/catalog`), số liệu theo khuôn
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
export type DashboardIndustry = ApiResponseFor<"GET /api/v2/dashboard/industry/{symbol}">
export type DashboardFundamental = ApiResponseFor<"GET /api/v2/fundamental/{symbol}">
export type DashboardValuation = ApiResponseFor<"GET /api/v2/valuation/{symbol}">
export type SaveSettingsBody = ApiRequestFor<"PUT /api/v2/dashboard/settings/{nganh}">["body"]
export type SavedSettings = ApiResponseFor<"PUT /api/v2/dashboard/settings/{nganh}">

/** Ngành của mã theo mẫu báo cáo tài chính (spec §1.3). */
export type Industry = DashboardIndustry["nganh"]
export const INDUSTRIES: readonly Industry[] = ["thuong", "nh", "ck", "bh"]

/** Nhãn ngành hiện cạnh mã (spec §1.2). */
export const INDUSTRY_LABEL: Record<Industry, string> = {
  thuong: "Doanh nghiệp sản xuất",
  nh: "Ngân hàng",
  ck: "Chứng khoán",
  bh: "Bảo hiểm",
}

/** Thiết lập của một ngành. */
export type IndustrySettings = DashboardSettings[Industry]

/** Một ngành trong danh mục: chương, nhóm, số chỉ tiêu và bộ mặc định (spec §3, §6.3). */
export type CatalogIndustry = DashboardCatalog["industries"][number]
export type CatalogChapter = CatalogIndustry["chapters"][number]
export type CatalogGroup = CatalogChapter["groups"][number]
export type CatalogItem = CatalogGroup["items"][number]

/** Tên chỉ tiêu: khoá của một biểu đồ trong thiết lập và trong số liệu. */
export type ChartName = CatalogItem["name"]

/** Chế độ kỳ chung cho cả dashboard. */
export type PeriodMode = IndustrySettings["per"]
/** Số kỳ riêng của từng biểu đồ, theo từng chế độ. */
export type PeriodCounts = IndustrySettings["nks"]

export type SeriesPoint = { name: string; v: (number | null)[] }
export type SubSeries = { unit: string; type: "grouped" | "stacked"; series: SeriesPoint[] }
export type ChartSeries = { labels: string[]; main: SeriesPoint[]; sub?: SubSeries }

/** Một biểu đồ của câu trả lời số liệu: chỉ có một dạng, mọi chỉ tiêu trong danh mục của ngành đều vẽ được. */
export type ChartDataEntry = DashboardFundamental["charts"][string]
export type ChartKind = ChartDataEntry["kind"]
export type ChartStatus = ChartDataEntry["status"]

export type ValuationChart = DashboardValuation["charts"][string]

export function fetchDashboardSettings(signal?: AbortSignal): Promise<DashboardSettings> {
  return requestOperation("GET /api/v2/dashboard/settings", {}, { signal })
}

export function fetchDashboardCatalog(signal?: AbortSignal): Promise<DashboardCatalog> {
  return requestOperation("GET /api/v2/dashboard/catalog", {}, { signal })
}

/** Ngành của một mã, từ mẫu báo cáo tài chính của doanh nghiệp. */
export function fetchDashboardIndustry(symbol: string, signal?: AbortSignal): Promise<DashboardIndustry> {
  return requestOperation("GET /api/v2/dashboard/industry/{symbol}", { path: { symbol } }, { signal })
}

/** Lưu thiết lập của MỘT ngành (spec §6.2); các ngành khác giữ nguyên. */
export function saveDashboardSettings(nganh: Industry, body: SaveSettingsBody, signal?: AbortSignal) {
  return requestOperation("PUT /api/v2/dashboard/settings/{nganh}", { path: { nganh }, body }, { signal })
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
