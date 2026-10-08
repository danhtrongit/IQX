/**
 * Conversion between the conditions being edited (display units, a period on each row) and the
 * filter definition 3.0 sent to the API. Logic is always AND, one metric appears once, and every
 * period must be one of the metric's `allowed_periods`: a period is never replaced silently.
 */
import type { DraftRule, FilterColumn, FilterDefinition, FilterPeriod, FilterScope, SavedFilter, ScreenerMetric } from "./types"
import { displayInputText, formatDisplayNumber, parseDisplayInput, toApiValue, toDisplayValue } from "./units"

/** Name used when a filter that was never named is run (the schema requires a non-empty name). */
export const UNSAVED_FILTER_NAME = "Bộ lọc chưa lưu"

/** Reference columns beside the conditions never decide pass/fail; capped to keep the table readable. */
export const MAX_REFERENCE_COLUMNS = 6

export type BuildResult = { ok: true; definition: FilterDefinition } | { ok: false; error: string }

/** A metric can be used in a condition when its lesson is passed AND the repo can compute it. */
export function isMetricUsable(metric: ScreenerMetric): boolean {
  return metric.learned && metric.supported && metric.readiness === "ready"
}

export function periodLabel(metric: ScreenerMetric, period: FilterPeriod | null | undefined): string {
  if (!period) return "Chưa chọn kỳ"
  return metric.allowed_periods.find((item) => item.id === period)?.label ?? period
}

/** Display columns for usable metrics that are not conditions, each at its default period. */
export function referenceColumns(metrics: readonly ScreenerMetric[], rules: readonly Pick<DraftRule, "metric_id">[]): FilterColumn[] {
  const used = new Set(rules.map((rule) => rule.metric_id))
  return metrics
    .filter((metric) => isMetricUsable(metric) && !used.has(metric.id))
    .slice(0, MAX_REFERENCE_COLUMNS)
    .map((metric) => ({ metric_id: metric.id, period: metric.default_period }))
}

export function buildDefinition(drafts: readonly DraftRule[], scope: FilterScope, name: string, metrics: readonly ScreenerMetric[]): BuildResult {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const rules: FilterDefinition["rules"] = []
  for (const draft of drafts) {
    const metric = byId.get(draft.metric_id)
    if (!metric) return { ok: false, error: `Chỉ tiêu ${draft.metric_id} không còn trong danh mục.` }
    if (!metric.learned) return { ok: false, error: `Chưa mở chỉ tiêu “${metric.name}”: hoàn thành bài học tương ứng trong Học viện.` }
    if (!isMetricUsable(metric)) return { ok: false, error: `Chỉ tiêu “${metric.name}” chưa dùng được: ${metric.unsupported_reason ?? "chưa có định nghĩa hoặc nguồn dữ liệu"}.` }
    if (!draft.period) return { ok: false, error: `Chọn kỳ tính cho “${metric.name}”: kỳ đã lưu không còn được hỗ trợ.` }
    if (!metric.allowed_periods.some((item) => item.id === draft.period)) {
      return { ok: false, error: `Kỳ đã chọn không được hỗ trợ cho “${metric.name}”.` }
    }
    const display = parseDisplayInput(draft.displayValue)
    if (display === null) return { ok: false, error: `Nhập ngưỡng cho “${metric.name}”.` }
    rules.push({
      id: draft.id,
      metric_id: metric.id,
      period: draft.period,
      operator: draft.operator,
      value: toApiValue(display, metric.api_unit),
      api_unit: metric.api_unit,
    })
  }
  const trimmed = name.trim()
  const columns = referenceColumns(metrics, drafts)
  return {
    ok: true,
    definition: {
      schema_version: "3.0",
      name: (trimmed || UNSAVED_FILTER_NAME).slice(0, 120),
      logic: "AND",
      data_mode: "latest_disclosed",
      rules,
      ...(columns.length > 0 ? { columns } : {}),
      scope,
    },
  }
}

/** Rules of a stored definition as editable conditions; legacy rules needing review keep no period. */
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

/** The criteria that decide a run: the display name, columns and ids never do. */
export function criteriaSignature(definition: Pick<FilterDefinition, "rules" | "scope">): string {
  return JSON.stringify({
    rules: definition.rules.map((rule) => [rule.metric_id, rule.period, rule.operator, rule.value, rule.api_unit]).sort(),
    scope: [definition.scope.market.toLowerCase(), definition.scope.sector],
  })
}

export function newRuleId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** `Tăng trưởng LNST YoY: Quý gần nhất > 15 %` per condition, for saved items and confirmations. */
export function criteriaSummary(definition: Pick<FilterDefinition, "rules" | "scope">, metrics: readonly ScreenerMetric[]): string {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const scope = [
    definition.scope.market.toLowerCase() === "all" ? null : definition.scope.market,
    definition.scope.sector.toLowerCase() === "all" || definition.scope.sector === "" ? null : definition.scope.sector,
  ].filter(Boolean)
  const parts = definition.rules.map((rule) => {
    const metric = byId.get(rule.metric_id)
    const unit = metric && (metric.unit === "%" || metric.unit === "điểm %") ? "%" : (metric?.unit ?? "")
    const label = metric ? periodLabel(metric, rule.period) : rule.period
    return `${metric?.name ?? rule.metric_id} (${label}) ${rule.operator} ${formatDisplayNumber(toDisplayValue(rule.value, rule.api_unit))}${unit ? ` ${unit}` : ""}`
  })
  const conditions = parts.length > 0 ? parts.join(" · ") : "Chưa áp tiêu chí: toàn bộ doanh nghiệp trong phạm vi"
  return scope.length > 0 ? `${scope.join(" · ")} · ${conditions}` : conditions
}

export function metricChapter(metric: Pick<ScreenerMetric, "lesson_id">): number {
  const match = /^ch(\d+)-/.exec(metric.lesson_id)
  return match ? Number(match[1]) : 0
}
