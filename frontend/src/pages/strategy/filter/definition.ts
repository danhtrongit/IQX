/**
 * Conversion between what is being edited (Thị trường, fundamental conditions in display units with a
 * period each, Kỹ thuật cards) and the filter definition 4.0 sent to the API. Logic is always AND,
 * one metric appears once, every period is one of the metric's `allowed_periods`, and nothing is
 * replaced silently: a missing threshold, a wrong number or a pending ICB sector stops the run.
 */
import type { TechnicalRegistry } from "@/pages/demo-trading/bot/config/types"

import { canonicalMarket, draftFromMarket, marketFirstError, marketFromDraft, marketSummary, sectorReviewError, type MarketDraft } from "./market"
import { metricName } from "./metric-names"
import { draftsFromItems, enabledItems, enabledRowTotal, technicalFirstError, technicalFromDrafts, technicalSummary, type TechnicalDraft } from "./technical"
import type { CriteriaDefinition, DraftRule, FilterColumn, FilterDefinition, FilterPeriod, RowsTechnicalItem, SavedFilter, ScreenerMetric } from "./types"
import { displayInputText, formatDisplayNumber, parseDisplayInput, toApiValue, toDisplayValue } from "./units"

/** Name used when a filter that was never named is run (the schema requires a non-empty name). */
export const UNSAVED_FILTER_NAME = "Bộ lọc chưa lưu"

/** Reference columns beside the conditions never decide pass/fail; capped to keep the table readable. */
export const MAX_REFERENCE_COLUMNS = 6

export type BuildResult = { ok: true; definition: FilterDefinition } | { ok: false; error: string }

/** Everything the user edits besides the name. */
export type FilterDraft = {
  rules: readonly DraftRule[]
  market: MarketDraft
  technical: readonly TechnicalDraft[]
}

/** A metric can be used in a condition when its lesson is passed AND the repo can compute it. */
export function isMetricUsable(metric: ScreenerMetric): boolean {
  return metric.learned && metric.supported && metric.readiness === "ready"
}

export function periodLabel(metric: ScreenerMetric, period: FilterPeriod | null | undefined): string {
  if (!period) return "Chưa chọn kỳ"
  return metric.allowed_periods.find((item) => item.id === period)?.label ?? period
}

/**
 * Display columns for usable metrics that are not conditions, each at its default period. Only a filter
 * with a fundamental condition has them: without one the run needs no fundamental data at all, so it
 * covers the whole market instead of the capped step 2 (spec §9).
 */
export function referenceColumns(metrics: readonly ScreenerMetric[], rules: readonly Pick<DraftRule, "metric_id">[]): FilterColumn[] {
  if (rules.length === 0) return []
  const used = new Set(rules.map((rule) => rule.metric_id))
  return metrics
    .filter((metric) => isMetricUsable(metric) && !used.has(metric.id))
    .slice(0, MAX_REFERENCE_COLUMNS)
    .map((metric) => ({ metric_id: metric.id, period: metric.default_period }))
}

export function buildDefinition(
  draft: FilterDraft,
  name: string,
  metrics: readonly ScreenerMetric[],
  registry: TechnicalRegistry | undefined,
): BuildResult {
  if (draft.market.reviewSector !== null) return { ok: false, error: sectorReviewError(draft.market.reviewSector) }
  const marketError = marketFirstError(draft.market)
  if (marketError) return { ok: false, error: marketError }

  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const rules: FilterDefinition["rules"] = []
  for (const rule of draft.rules) {
    const metric = byId.get(rule.metric_id)
    if (!metric) return { ok: false, error: `Chỉ tiêu ${rule.metric_id} không còn trong danh mục.` }
    const label = metricName(metric)
    if (!metric.learned) return { ok: false, error: `Chưa mở chỉ tiêu “${label}”: hoàn thành bài học tương ứng trong Học viện.` }
    if (!isMetricUsable(metric)) return { ok: false, error: `Chỉ tiêu “${label}” chưa dùng được: ${metric.unsupported_reason ?? "chưa có định nghĩa hoặc nguồn dữ liệu"}.` }
    if (!rule.period) return { ok: false, error: `Chọn kỳ tính cho “${label}”: kỳ đã lưu không còn được hỗ trợ.` }
    if (!metric.allowed_periods.some((item) => item.id === rule.period)) {
      return { ok: false, error: `Kỳ đã chọn không được hỗ trợ cho “${label}”.` }
    }
    const display = parseDisplayInput(rule.displayValue)
    if (display === null) return { ok: false, error: `Nhập ngưỡng cho “${label}”.` }
    rules.push({
      id: rule.id,
      metric_id: metric.id,
      period: rule.period,
      operator: rule.operator,
      value: toApiValue(display, metric.api_unit),
      api_unit: metric.api_unit,
    })
  }

  if (draft.technical.length > 0 && !registry) {
    return { ok: false, error: "Chưa tải được định nghĩa các chỉ báo kỹ thuật. Hãy thử lại sau ít giây." }
  }
  const technicalError = technicalFirstError(draft.technical, registry)
  if (technicalError) return { ok: false, error: technicalError }
  const technical = registry ? technicalFromDrafts(draft.technical, registry) : []

  const trimmed = name.trim()
  const columns = referenceColumns(metrics, draft.rules)
  return {
    ok: true,
    definition: {
      schema_version: "4.0",
      name: (trimmed || UNSAVED_FILTER_NAME).slice(0, 120),
      logic: "AND",
      data_mode: "latest_disclosed",
      market: marketFromDraft(draft.market),
      rules,
      technical,
      ...(columns.length > 0 ? { columns } : {}),
    },
  }
}

/** Fundamental rules of a stored definition as editable conditions; legacy rules needing review keep no period. */
export function draftsFromFilter(filter: SavedFilter): DraftRule[] {
  const review = new Map((filter.legacy_review?.rules ?? []).map((rule) => [rule.rule_id, rule]))
  return filter.definition.rules.map((rule) => {
    const flagged = review.get(rule.id)
    const needsReview = flagged?.status === "needs_review"
    return {
      id: rule.id,
      metric_id: rule.metric_id,
      period: needsReview ? null : rule.period,
      operator: rule.operator,
      displayValue: displayInputText(rule.value, rule.api_unit),
      review: needsReview ? (flagged?.reason ?? "Kỳ của bộ lọc cũ không còn được hỗ trợ; hãy chọn lại kỳ tính.") : null,
    }
  })
}

/** Thị trường and Kỹ thuật of a stored filter; the ICB sector of a 3.0 filter comes back as `reviewSector`. */
export function marketAndTechnicalFromFilter(filter: SavedFilter): { market: MarketDraft; technical: TechnicalDraft[] } {
  const market = draftFromMarket(filter.definition.market)
  if (market.reviewSector === null && filter.sector_review) market.reviewSector = filter.sector_review.sector
  return { market, technical: draftsFromItems(filter.definition.technical) }
}

const sortedKeys = (record: Readonly<Record<string, unknown>>, omit: readonly string[] = []) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !omit.includes(key)).sort(([a], [b]) => a.localeCompare(b)))

/**
 * The criteria that decide a run (spec §6.3): Thị trường with sorted lists and plain numbers, the
 * fundamental conditions, and the SWITCHED-ON technical rows (a switched-off row stays in the
 * definition but is not a criterion). The name, the columns, the ids of fundamental conditions and
 * the review flag never are.
 */
export function criteriaSignature(definition: CriteriaDefinition): string {
  return JSON.stringify({
    market: canonicalMarket(definition.market),
    rules: definition.rules.map((rule) => [rule.metric_id, rule.period, rule.operator, rule.value, rule.api_unit]).sort(),
    technical: enabledItems(definition.technical).map((item) =>
      item.indicator === "volume" ? sortedKeys(item) : { indicator: item.indicator, rules: (item as RowsTechnicalItem).rules.map((rule) => sortedKeys(rule, ["enabled"])) },
    ),
  })
}

export function newRuleId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** `N điều kiện`: the fundamental conditions plus the switched-on technical rows (Khối lượng counts two). */
export function conditionCount(rules: readonly unknown[], technical: readonly TechnicalDraft[]): number {
  return rules.length + enabledRowTotal(technical)
}

/**
 * `HOSE · VN30 · Vốn hóa từ 1.000 tỷ · Tăng trưởng LNST (Quý gần nhất) > 15 % · RSI (2 dòng)`: Thị trường,
 * then each fundamental condition, then each indicator with its switched-on rows, for saved items and confirmations.
 */
export function criteriaSummary(definition: CriteriaDefinition, metrics: readonly ScreenerMetric[], registry?: Pick<TechnicalRegistry, "indicators">): string {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const conditions = definition.rules.map((rule) => {
    const metric = byId.get(rule.metric_id)
    const unit = metric && (metric.unit === "%" || metric.unit === "điểm %") ? "%" : (metric?.unit ?? "")
    const label = metric ? periodLabel(metric, rule.period) : rule.period
    return `${metric ? metricName(metric) : rule.metric_id} (${label}) ${rule.operator} ${formatDisplayNumber(toDisplayValue(rule.value, rule.api_unit))}${unit ? ` ${unit}` : ""}`
  })
  const parts = [...marketSummary(definition.market), ...conditions, ...technicalSummary(definition.technical, registry)]
  return parts.length > 0 ? parts.join(" · ") : "Chưa áp tiêu chí: toàn bộ doanh nghiệp trong phạm vi"
}

export function metricChapter(metric: Pick<ScreenerMetric, "lesson_id">): number {
  const match = /^ch(\d+)-/.exec(metric.lesson_id ?? "")
  return match ? Number(match[1]) : 0
}

/** First level groups of the metrics (spec Học viện v4.1 §6.2): by industry, never the name of a Học viện chapter. */
const METRIC_GROUPS: Readonly<Record<number, string>> = {
  8: "Chỉ tiêu chung",
  9: "Chỉ tiêu doanh nghiệp sản xuất",
  10: "Chỉ tiêu ngân hàng",
  11: "Chỉ tiêu chứng khoán",
  12: "Chỉ tiêu bảo hiểm",
}

/** The group a metric is listed under: the industry group of the lesson that teaches it. */
export function metricGroupTitle(metric: Pick<ScreenerMetric, "lesson_id">): string {
  return METRIC_GROUPS[metricChapter(metric)] ?? "Chỉ tiêu khác"
}
