/**
 * Blocks, groups, order and display names of the Dashboard phân tích cơ bản (Bộ lọc 4.0 §2.5). The
 * library of the Cơ bản tab, the condition cards, the result column titles and the criteria
 * summaries all use these names, never the lesson names of `GET /strategy/screener/metrics`.
 * First level block titles follow Học viện v4.1 §6.2 ("Chỉ tiêu chung", "Chỉ tiêu doanh nghiệp sản xuất"),
 * which replaced the chapter-like titles of Dashboard v2 §8. The 9 metrics that are not on the Dashboard
 * keep the API name and sit in the last block "Khác".
 */
import { matchesQuery } from "../shared/library-utils"
import type { ScreenerMetric } from "./types"

type GroupSpec = { title: string; items: ReadonlyArray<readonly [id: string, name: string]> }
type BlockSpec = { title: string; groups: readonly GroupSpec[] }

const DASHBOARD: readonly BlockSpec[] = [
  {
    title: "Chỉ tiêu chung",
    groups: [
      {
        title: "Tăng trưởng",
        items: [
          ["revenue_yoy", "Tăng trưởng doanh thu"],
          ["profit_yoy", "Tăng trưởng LNST"],
          ["eps_yoy", "Tăng trưởng EPS"],
          ["revenue_cagr3", "Revenue CAGR 3Y"],
          ["profit_cagr3", "Net Profit CAGR 3Y"],
          ["eps_cagr3", "EPS CAGR 3Y"],
        ],
      },
      {
        title: "Ổn định",
        items: [
          ["profit_positive_streak", "Profit Positive Streak"],
          ["revenue_growth_stability", "Revenue Growth Stability"],
          ["net_margin_stability", "Margin Stability"],
          ["eps_growth_stability", "EPS Stability"],
        ],
      },
      {
        title: "Hiệu quả",
        items: [
          ["roe", "ROE"],
          ["roa", "ROA"],
          ["net_margin", "Biên lợi nhuận ròng"],
        ],
      },
      {
        title: "Định giá",
        items: [
          ["pe", "P/E"],
          ["pb", "P/B"],
          ["ps", "P/S"],
          ["peg", "PEG"],
        ],
      },
    ],
  },
  {
    title: "Chỉ tiêu doanh nghiệp sản xuất",
    groups: [
      {
        title: "Hiệu quả và biên lợi nhuận",
        items: [
          ["gross_margin", "Biên lợi nhuận gộp"],
          ["roic", "ROIC"],
          ["roic_stability", "ROIC Stability"],
          ["asset_turnover", "Asset Turnover"],
          ["ccc", "Cash Conversion Cycle"],
        ],
      },
      {
        title: "Nợ và khả năng thanh toán",
        items: [
          ["debt_equity", "D/E"],
          ["current_ratio", "Current Ratio"],
          ["interest_coverage", "Interest Coverage"],
          ["net_debt_ebitda", "Net Debt / EBITDA"],
        ],
      },
      {
        title: "Dòng tiền",
        items: [
          ["cfo_margin", "CFO Margin"],
          ["cfo_profit", "CFO / LNST"],
          ["capex_revenue", "Capex / Revenue"],
          ["fcf_margin", "FCF Margin"],
          ["fcf_positive_streak", "FCF Positive Streak"],
        ],
      },
      {
        title: "Định giá",
        items: [
          ["ev_ebitda", "EV / EBITDA"],
          ["fcf_yield", "FCF Yield"],
        ],
      },
    ],
  },
]

/** Title of the last block: the metrics the Dashboard does not have. */
export const OTHER_BLOCK_TITLE = "Khác"

const DASHBOARD_NAME = new Map<string, string>(DASHBOARD.flatMap((block) => block.groups.flatMap((group) => group.items.map(([id, name]) => [id, name] as const))))

/** The name shown for a metric everywhere: the Dashboard's, or the API's for a metric the Dashboard lacks. */
export function metricName(metric: Pick<ScreenerMetric, "id" | "name">): string {
  return DASHBOARD_NAME.get(metric.id) ?? metric.name
}

export type LibraryGroup = { title: string | null; metrics: ScreenerMetric[] }
export type LibraryBlock = { title: string; groups: LibraryGroup[] }

/**
 * The Cơ bản tab of the library: the metrics the account can use, in the Dashboard's order (a metric
 * that is not open is not listed; the catalog dialog names it), and the ones the Dashboard lacks in
 * "Khác". Blocks and groups with nothing left after the search are dropped.
 */
export function libraryBlocks(metrics: readonly ScreenerMetric[], query: string): LibraryBlock[] {
  const open = metrics.filter((metric) => metric.learned)
  const byId = new Map(open.map((metric) => [metric.id as string, metric]))
  const matches = (metric: ScreenerMetric) => matchesQuery(metricName(metric), query)
  const blocks: LibraryBlock[] = DASHBOARD.map((block) => ({
    title: block.title,
    groups: block.groups.map((group) => ({
      title: group.title,
      metrics: group.items.flatMap(([id]) => {
        const metric = byId.get(id)
        return metric && matches(metric) ? [metric] : []
      }),
    })),
  }))
  const other = open.filter((metric) => !DASHBOARD_NAME.has(metric.id) && matches(metric))
  const result = blocks
    .map((block) => ({ ...block, groups: block.groups.filter((group) => group.metrics.length > 0) }))
    .filter((block) => block.groups.length > 0)
  if (other.length > 0) result.push({ title: OTHER_BLOCK_TITLE, groups: [{ title: null, metrics: other }] })
  return result
}
