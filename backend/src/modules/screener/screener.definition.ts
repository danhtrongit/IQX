import {
  BALANCE_SHEET_METRICS,
  fundamentalMetric,
  SCREENER_DEFINITION_SCHEMA_VERSION,
  SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION,
  type ScreenerApiUnit,
  type ScreenerMetricId,
  type ScreenerPeriod,
} from './screener.registry.js';

/**
 * Filter definition 3.0 (every rule has its own `period`) and the mapping of the legacy 2.0
 * definition (one filter-wide `scope.period`). Pure; shared by the screener run and by the saved
 * filters module. Stored legacy versions are never rewritten: they are mapped on read.
 */

export type LegacyFilterPeriod = 'TTM' | 'annual' | 'quarter';

export type DefinitionRule = {
  id: string;
  metric_id: ScreenerMetricId;
  period: ScreenerPeriod;
  operator: '>' | '<';
  value: number;
  api_unit: ScreenerApiUnit;
};

export type DefinitionColumn = { metric_id: ScreenerMetricId; period: ScreenerPeriod };

export type ScreenerDefinitionV3 = {
  schema_version: typeof SCREENER_DEFINITION_SCHEMA_VERSION;
  name: string;
  logic: 'AND';
  data_mode: 'latest_disclosed';
  rules: DefinitionRule[];
  /** Display-only reference columns; never part of the pass/fail decision. */
  columns?: DefinitionColumn[];
  scope: { market: string; sector: string };
};

export type LegacyScreenerDefinition = {
  schema_version: typeof SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION;
  name: string;
  logic: 'AND';
  rules: Array<{
    id: string;
    metric_id: ScreenerMetricId;
    operator: '>' | '<';
    value: number;
    api_unit: ScreenerApiUnit;
  }>;
  scope: { market: string; sector: string; period: LegacyFilterPeriod };
};

export type DefinitionIssue = { path: Array<string | number>; code: string; message: string };

const VALUATION_METRICS: ReadonlySet<ScreenerMetricId> = new Set<ScreenerMetricId>([
  'pe',
  'pb',
  'ps',
  'ev_ebitda',
  'fcf_yield',
  'buyback_yield',
]);

/** Unit, operator, period policy and "one metric, one period" checks (no readiness here). */
export function ruleIssues(
  rules: readonly Pick<DefinitionRule, 'metric_id' | 'period' | 'operator' | 'api_unit'>[],
  columns: readonly DefinitionColumn[] = [],
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const seen = new Map<string, string>();
  rules.forEach((rule, index) => {
    const metric = fundamentalMetric(rule.metric_id);
    if (rule.api_unit !== metric.api_unit)
      issues.push({
        path: ['rules', index, 'api_unit'],
        code: 'UNIT_MISMATCH',
        message: `Đơn vị của ${rule.metric_id} phải là ${metric.api_unit}`,
      });
    if (!metric.operators.includes(rule.operator))
      issues.push({
        path: ['rules', index, 'operator'],
        code: 'OPERATOR_NOT_ALLOWED',
        message: `Toán tử không hợp lệ cho ${rule.metric_id}`,
      });
    if (!metric.allowed_periods.includes(rule.period))
      issues.push({
        path: ['rules', index, 'period'],
        code: 'PERIOD_NOT_ALLOWED',
        message: `Kỳ ${rule.period} không được hỗ trợ cho ${rule.metric_id} (cho phép: ${metric.allowed_periods.join(', ')})`,
      });
    if (seen.has(rule.metric_id))
      issues.push({
        path: ['rules', index, 'metric_id'],
        code: 'DUPLICATE_METRIC',
        message: `Mỗi chỉ tiêu chỉ được dùng một lần trong bộ điều kiện (${rule.metric_id})`,
      });
    seen.set(rule.metric_id, rule.period);
  });
  columns.forEach((column, index) => {
    const metric = fundamentalMetric(column.metric_id);
    if (!metric.allowed_periods.includes(column.period))
      issues.push({
        path: ['columns', index, 'period'],
        code: 'PERIOD_NOT_ALLOWED',
        message: `Kỳ ${column.period} không được hỗ trợ cho ${column.metric_id}`,
      });
    if (seen.has(column.metric_id))
      issues.push({
        path: ['columns', index, 'metric_id'],
        code: 'DUPLICATE_METRIC',
        message: `Chỉ tiêu ${column.metric_id} đã có trong bộ điều kiện hoặc cột tham khảo`,
      });
    seen.set(column.metric_id, column.period);
  });
  return issues;
}

/** Metrics that cannot run: no approved definition or no data source. Nothing is invented. */
export function notReadyMetrics(
  metricIds: readonly ScreenerMetricId[],
): Array<{ metric_id: ScreenerMetricId; readiness: 'definition_pending' | 'data_unavailable' }> {
  return [...new Set(metricIds)].flatMap((metric_id) => {
    const { readiness } = fundamentalMetric(metric_id);
    return readiness === 'ready' ? [] : [{ metric_id, readiness }];
  });
}

export type LegacyPeriodMapping = {
  period: ScreenerPeriod;
  /** null = the mapped period computes exactly what the old filter-wide period computed. */
  review: 'unsupported_period' | null;
};

/**
 * Maps a legacy filter-wide period onto one metric, preserving what the old run computed:
 *  - fixed-period metrics (3Y, CCC, streaks, ...) ignored the old period: their only period;
 *  - balance metrics: old quarter/TTM read the latest quarter end, old annual the year end;
 *  - valuation metrics: old annual used fiscal-year flows, quarter/TTM used TTM flows;
 *  - otherwise the equivalent period if allowed now, else `unsupported_period` (e.g. ROE
 *    quarter): the rule keeps the legacy period as evidence and must be reviewed, never
 *    silently turned into TTM.
 */
export function mapLegacyPeriod(
  metricId: ScreenerMetricId,
  legacy: LegacyFilterPeriod,
): LegacyPeriodMapping {
  const metric = fundamentalMetric(metricId);
  if (metric.allowed_periods.length === 1) return { period: metric.default_period, review: null };
  if (BALANCE_SHEET_METRICS.has(metricId))
    return { period: legacy === 'annual' ? 'year' : 'quarter', review: null };
  if (VALUATION_METRICS.has(metricId))
    return { period: legacy === 'annual' ? 'year' : 'ttm', review: null };
  const wanted: ScreenerPeriod =
    legacy === 'annual' ? 'year' : legacy === 'TTM' ? 'ttm' : 'quarter';
  return metric.allowed_periods.includes(wanted)
    ? { period: wanted, review: null }
    : { period: wanted, review: 'unsupported_period' };
}

export type LegacyDefinitionReview = {
  stored_schema_version: typeof SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION;
  legacy_period: LegacyFilterPeriod;
  needs_review: boolean;
  rules: Array<{
    rule_id: string;
    metric_id: ScreenerMetricId;
    legacy_period: LegacyFilterPeriod;
    mapped_period: ScreenerPeriod;
    status: 'ok' | 'needs_review';
    reason: string | null;
  }>;
};

export type NormalizedDefinition = {
  definition: ScreenerDefinitionV3;
  /** Present only when the input was a legacy 2.0 definition. */
  legacy: LegacyDefinitionReview | null;
};

export function isLegacyDefinition(value: unknown): value is LegacyScreenerDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { schema_version?: unknown }).schema_version ===
      SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION
  );
}

/** Maps the filter-wide period of a 2.0 definition onto every rule; 3.0 passes through. */
export function normalizeDefinition(
  input: ScreenerDefinitionV3 | LegacyScreenerDefinition,
): NormalizedDefinition {
  if (!isLegacyDefinition(input))
    return { definition: { ...input, data_mode: 'latest_disclosed' }, legacy: null };
  const review: LegacyDefinitionReview = {
    stored_schema_version: SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION,
    legacy_period: input.scope.period,
    needs_review: false,
    rules: [],
  };
  const rules = input.rules.map((rule): DefinitionRule => {
    const mapped = mapLegacyPeriod(rule.metric_id, input.scope.period);
    review.rules.push({
      rule_id: rule.id,
      metric_id: rule.metric_id,
      legacy_period: input.scope.period,
      mapped_period: mapped.period,
      status: mapped.review ? 'needs_review' : 'ok',
      reason:
        mapped.review === null
          ? null
          : `Kỳ ${input.scope.period} của bộ lọc cũ không còn được hỗ trợ cho ${rule.metric_id}; cần chọn lại kỳ.`,
    });
    if (mapped.review) review.needs_review = true;
    return {
      id: rule.id,
      metric_id: rule.metric_id,
      period: mapped.period,
      operator: rule.operator,
      value: rule.value,
      api_unit: rule.api_unit,
    };
  });
  return {
    definition: {
      schema_version: SCREENER_DEFINITION_SCHEMA_VERSION,
      name: input.name,
      logic: input.logic,
      data_mode: 'latest_disclosed',
      rules,
      scope: { market: input.scope.market, sector: input.scope.sector },
    },
    legacy: review,
  };
}

/**
 * Tolerant reader for a stored definition (either schema version). Returns null when the stored
 * JSON is not a recognisable definition, so listing never throws on odd historical rows.
 */
export function readStoredDefinition(stored: unknown): NormalizedDefinition | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const record = stored as { schema_version?: unknown; rules?: unknown; scope?: unknown };
  if (!Array.isArray(record.rules) || typeof record.scope !== 'object' || record.scope === null)
    return null;
  try {
    if (record.schema_version === SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION)
      return normalizeDefinition(stored as LegacyScreenerDefinition);
    if (record.schema_version === SCREENER_DEFINITION_SCHEMA_VERSION)
      return normalizeDefinition(stored as ScreenerDefinitionV3);
  } catch {
    return null;
  }
  return null;
}
