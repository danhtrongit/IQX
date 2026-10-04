/**
 * Chuyển qua lại giữa điều kiện đang soạn (đơn vị hiển thị) và định nghĩa bộ lọc
 * gửi API (filter.schema.json, đơn vị API). Logic luôn là AND.
 */
import type { DraftRule, FilterDefinition, FilterScope, ScreenerMetric } from "./types"
import { displayInputText, parseDisplayInput, toApiValue } from "./units"

/** Tên dùng khi chạy một bộ lọc chưa được đặt tên (schema yêu cầu `name` khác rỗng). */
export const UNSAVED_FILTER_NAME = "Bộ lọc chưa lưu"

export type BuildResult =
  | { ok: true; definition: FilterDefinition }
  | { ok: false; error: string }

/** Chỉ tiêu được phép thêm vào điều kiện: đã học và có nguồn dữ liệu. */
export function isMetricAddable(metric: ScreenerMetric): boolean {
  return metric.learned && metric.supported
}

export function buildDefinition(
  drafts: DraftRule[],
  scope: FilterScope,
  name: string,
  metrics: ScreenerMetric[],
): BuildResult {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const rules: FilterDefinition["rules"] = []
  for (const draft of drafts) {
    const metric = byId.get(draft.metric_id)
    if (!metric) return { ok: false, error: `Chỉ tiêu ${draft.metric_id} không còn trong registry.` }
    if (!metric.learned) return { ok: false, error: `Chưa học chỉ tiêu “${metric.name}”.` }
    if (!metric.supported) return { ok: false, error: `Chỉ tiêu “${metric.name}” chưa có nguồn dữ liệu.` }
    const display = parseDisplayInput(draft.displayValue)
    if (display === null) return { ok: false, error: `Nhập ngưỡng cho “${metric.name}”.` }
    rules.push({
      id: draft.id,
      metric_id: metric.id,
      operator: draft.operator,
      value: toApiValue(display, metric.api_unit),
      api_unit: metric.api_unit,
    })
  }
  const trimmed = name.trim()
  return {
    ok: true,
    definition: {
      schema_version: "2.0",
      name: (trimmed || UNSAVED_FILTER_NAME).slice(0, 120),
      logic: "AND",
      rules,
      scope: { market: scope.market, sector: scope.sector, period: scope.period },
    },
  }
}

/** Nạp định nghĩa đã lưu thành điều kiện đang soạn (đổi ngưỡng về đơn vị hiển thị). */
export function draftsFromDefinition(definition: FilterDefinition): DraftRule[] {
  return definition.rules.map((rule) => ({
    id: rule.id,
    metric_id: rule.metric_id,
    operator: rule.operator === "<" ? "<" : ">",
    displayValue: displayInputText(rule.value, rule.api_unit),
  }))
}

/** So sánh hai định nghĩa theo nội dung (bỏ qua tên) — để biết danh sách có gắn được với bộ lọc đã lưu. */
export function sameDefinitionContent(a: FilterDefinition, b: FilterDefinition): boolean {
  const content = (definition: FilterDefinition) =>
    JSON.stringify({
      rules: definition.rules.map((rule) => [rule.metric_id, rule.operator, rule.value, rule.api_unit]),
      scope: [definition.scope.market, definition.scope.sector, definition.scope.period],
    })
  return content(a) === content(b)
}

export function newRuleId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Nhãn bắt buộc của danh sách đã lưu: danh sách tĩnh chọn hồi cứu, không phải universe lịch sử. */
export function staticListLabel(asOf: string): string {
  return `Danh sách tĩnh tại ngày ${asOf} — không phải danh mục lịch sử`
}
