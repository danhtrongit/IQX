import { INDUSTRIES, type Industry } from '../financials/financials.industry.js';
import {
  BALANCE_SHEET_METRICS,
  fundamentalMetric,
  SCREENER_DEFINITION_SCHEMA_VERSION,
  SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION,
  SCREENER_V3_DEFINITION_SCHEMA_VERSION,
  type ScreenerApiUnit,
  type ScreenerMetricId,
  type ScreenerPeriod,
} from './screener.registry.js';

/**
 * Filter definition 4.0 (Thị trường `market` + Kỹ thuật `technical` beside the fundamental `rules`)
 * and the mapping of the stored 3.0 definition (`scope.market` + ICB `scope.sector`, every rule has
 * its own `period`) and of the legacy 2.0 definition (one filter-wide `scope.period`). Pure; shared
 * by the screener run, the saved filters module and the Bot apply check. Stored older versions are
 * never rewritten: they are mapped on read.
 */

export const SCREENER_EXCHANGES = ['HOSE', 'HNX', 'UPCOM'] as const;
export type ScreenerExchange = (typeof SCREENER_EXCHANGES)[number];
/** Baskets of "Rổ chỉ số" (stored index codes, upper-case). */
export const SCREENER_BASKETS = ['VN30', 'VN100', 'VNMIDCAP', 'VNSMALLCAP', 'HNX30'] as const;
export type ScreenerBasket = (typeof SCREENER_BASKETS)[number];
/** Financial-statement templates behind "Ngành": thường, ngân hàng, chứng khoán, bảo hiểm. */
export const SCREENER_STATEMENT_GROUPS = INDUSTRIES;
export type StatementGroup = Industry;

/** Trading sessions averaged by "Giá trị giao dịch bình quân" (default, bounds). */
export const AVG_VALUE_DEFAULT_SESSIONS = 20;
export const AVG_VALUE_MIN_SESSIONS = 5;
export const AVG_VALUE_MAX_SESSIONS = 100;

export type NumberRange = { min: number | null; max: number | null };

/** Thị trường: the scope of the filter (spec §2). Empty array / null bound = not filtered. */
export type MarketScope = {
  exchanges: ScreenerExchange[];
  baskets: ScreenerBasket[];
  statement_groups: StatementGroup[];
  /** tỷ đồng: `close[T] × shares`. */
  market_cap: NumberRange;
  /** `sessions` most recent sessions incl. T; `min` in tỷ đồng. */
  avg_value: { sessions: number; min: number | null };
  /** nghìn đồng: `close[T]`. */
  close_price: NumberRange;
  /** A stored 3.0 filter with an ICB sector: blocks the run until the user chooses a statement group again. */
  needs_review?: 'sector';
  /** The old ICB name, kept as evidence while `needs_review` is set. */
  legacy_sector?: string;
};

/** One stored condition row of a row-based indicator: the Bot's own row (`id`, `enabled`, values). */
export type TechnicalRow = {
  id: string;
  enabled: boolean;
  [field: string]: number | string | boolean;
};

export type RowsTechnicalItem = { indicator: string; rules: TechnicalRow[] };
/** Volume has no rows: the Bot's two fixed rules with their operators (`>`/`<`). */
export type VolumeTechnicalItem = {
  indicator: 'volume';
  sessions: number;
  factor: number;
  ops: [string, string];
};
export type TechnicalItem = RowsTechnicalItem | VolumeTechnicalItem;

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

/** Stored definition 3.0 (read-only: mapped to 4.0 on read). */
export type ScreenerDefinitionV3 = {
  schema_version: typeof SCREENER_V3_DEFINITION_SCHEMA_VERSION;
  name: string;
  logic: 'AND';
  data_mode: 'latest_disclosed';
  rules: DefinitionRule[];
  /** Display-only reference columns; never part of the pass/fail decision. */
  columns?: DefinitionColumn[];
  scope: { market: string; sector: string };
};

export type ScreenerDefinitionV4 = {
  schema_version: typeof SCREENER_DEFINITION_SCHEMA_VERSION;
  name: string;
  logic: 'AND';
  data_mode: 'latest_disclosed';
  market: MarketScope;
  rules: DefinitionRule[];
  technical: TechnicalItem[];
  /** Display-only reference columns; never part of the pass/fail decision. */
  columns?: DefinitionColumn[];
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
  definition: ScreenerDefinitionV4;
  /** Present only when the input was a legacy 2.0 definition. */
  legacy: LegacyDefinitionReview | null;
  /** Present when a 3.0 filter had an ICB sector: the run is blocked until the user chooses again. */
  sector_review: { sector: string } | null;
};

export function isLegacyDefinition(value: unknown): value is LegacyScreenerDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { schema_version?: unknown }).schema_version ===
      SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION
  );
}

export function isV3Definition(value: unknown): value is ScreenerDefinitionV3 {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { schema_version?: unknown }).schema_version === SCREENER_V3_DEFINITION_SCHEMA_VERSION
  );
}

/** No Thị trường filter at all (every list empty, every bound open, the default N = 20). */
export function emptyMarketScope(): MarketScope {
  return {
    exchanges: [],
    baskets: [],
    statement_groups: [],
    market_cap: { min: null, max: null },
    avg_value: { sessions: AVG_VALUE_DEFAULT_SESSIONS, min: null },
    close_price: { min: null, max: null },
  };
}

const sortedUnique = <T extends string>(values: readonly T[] | null | undefined): T[] =>
  [...new Set(values ?? [])].sort();

const orNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Canonical Thị trường block: arrays sorted and unique (`HSX` is `HOSE`), null/missing arrays empty,
 * every bound a number or null, the review flag only when set. Same selection, same bytes.
 */
export function canonicalMarket(
  market: Partial<MarketScope> | null | undefined,
  options: { keepReview?: boolean } = {},
): MarketScope {
  const input = market ?? {};
  const out: MarketScope = {
    exchanges: sortedUnique(
      (input.exchanges ?? []).map((value) =>
        (String(value).toUpperCase() === 'HSX' ? 'HOSE' : String(value).toUpperCase()) as ScreenerExchange,
      ),
    ),
    baskets: sortedUnique((input.baskets ?? []).map((value) => String(value).toUpperCase() as ScreenerBasket)),
    statement_groups: sortedUnique(input.statement_groups),
    market_cap: { min: orNull(input.market_cap?.min), max: orNull(input.market_cap?.max) },
    avg_value: {
      sessions: orNull(input.avg_value?.sessions) ?? AVG_VALUE_DEFAULT_SESSIONS,
      min: orNull(input.avg_value?.min),
    },
    close_price: { min: orNull(input.close_price?.min), max: orNull(input.close_price?.max) },
  };
  if (options.keepReview !== false && input.needs_review === 'sector') {
    out.needs_review = 'sector';
    out.legacy_sector = typeof input.legacy_sector === 'string' ? input.legacy_sector : '';
  }
  return out;
}

/** Spec §6.2: 3.0 `scope` → 4.0 `market`; an ICB sector is evidence plus a review flag, never a guess. */
export function marketFromV3Scope(scope: { market: string; sector: string }): {
  market: MarketScope;
  sector_review: { sector: string } | null;
} {
  const market = emptyMarketScope();
  const exchange = (scope.market ?? '').trim().toUpperCase();
  if (exchange !== '' && exchange !== 'ALL') {
    const mapped = exchange === 'HSX' ? 'HOSE' : exchange;
    if ((SCREENER_EXCHANGES as readonly string[]).includes(mapped))
      market.exchanges = [mapped as ScreenerExchange];
  }
  const sector = (scope.sector ?? '').trim();
  if (sector === '' || sector.toLowerCase() === 'all') return { market, sector_review: null };
  market.needs_review = 'sector';
  market.legacy_sector = sector;
  return { market, sector_review: { sector } };
}

function fromV3(input: ScreenerDefinitionV3): NormalizedDefinition {
  const { market, sector_review } = marketFromV3Scope(input.scope);
  const definition: ScreenerDefinitionV4 = {
    schema_version: SCREENER_DEFINITION_SCHEMA_VERSION,
    name: input.name,
    logic: input.logic,
    data_mode: 'latest_disclosed',
    market,
    rules: input.rules,
    technical: [],
    ...(input.columns ? { columns: input.columns } : {}),
  };
  return { definition, legacy: null, sector_review };
}

/**
 * A 4.0 definition in canonical form: the selection lists sorted and unique, empty bounds `null`,
 * `technical` present. Two submissions of the same selection are the same bytes, so the saved
 * filter's `definition_hash` only changes when something real changes.
 */
export function canonicalizeV4(input: ScreenerDefinitionV4): ScreenerDefinitionV4 {
  return {
    ...input,
    data_mode: 'latest_disclosed',
    market: canonicalMarket(input.market),
    technical: input.technical ?? [],
  };
}

function fromV4(input: ScreenerDefinitionV4): NormalizedDefinition {
  const definition = canonicalizeV4(input);
  const { market } = definition;
  return {
    definition,
    legacy: null,
    sector_review: market.needs_review === 'sector' ? { sector: market.legacy_sector ?? '' } : null,
  };
}

function fromLegacy(input: LegacyScreenerDefinition): NormalizedDefinition {
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
  const v3: ScreenerDefinitionV3 = {
    schema_version: SCREENER_V3_DEFINITION_SCHEMA_VERSION,
    name: input.name,
    logic: input.logic,
    data_mode: 'latest_disclosed',
    rules,
    scope: { market: input.scope.market, sector: input.scope.sector },
  };
  return { ...fromV3(v3), legacy: review };
}

/**
 * Any stored or submitted definition → 4.0. 2.0 goes through the period mapping to 3.0, then 3.0
 * through the scope mapping; 4.0 passes through in canonical form.
 */
export function normalizeDefinition(
  input: ScreenerDefinitionV4 | ScreenerDefinitionV3 | LegacyScreenerDefinition,
): NormalizedDefinition {
  if (isLegacyDefinition(input)) return fromLegacy(input);
  if (isV3Definition(input)) return fromV3(input);
  return fromV4(input as ScreenerDefinitionV4);
}

/**
 * Tolerant reader for a stored definition (any schema version). Returns null when the stored
 * JSON is not a recognisable definition, so listing never throws on odd historical rows.
 */
export function readStoredDefinition(stored: unknown): NormalizedDefinition | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const record = stored as {
    schema_version?: unknown;
    rules?: unknown;
    scope?: unknown;
    market?: unknown;
  };
  if (!Array.isArray(record.rules)) return null;
  try {
    if (record.schema_version === SCREENER_DEFINITION_SCHEMA_VERSION) {
      if (typeof record.market !== 'object' || record.market === null) return null;
      return normalizeDefinition(stored as ScreenerDefinitionV4);
    }
    if (typeof record.scope !== 'object' || record.scope === null) return null;
    if (record.schema_version === SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION)
      return normalizeDefinition(stored as LegacyScreenerDefinition);
    if (record.schema_version === SCREENER_V3_DEFINITION_SCHEMA_VERSION)
      return normalizeDefinition(stored as ScreenerDefinitionV3);
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Thị trường validation (spec §2.4) and the criteria used to compare / hash two definitions (§6.3).

const MARKET_PREFIX = 'Cơ bản · Thị trường: ';

/** Messages of spec §2.4, prefixed `Cơ bản · Thị trường: `. Pure; the UI shows the same texts. */
export function marketIssues(market: MarketScope): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: Array<string | number>, code: string, message: string) =>
    issues.push({ path, code, message: `${MARKET_PREFIX}${message}` });
  const range = (
    key: 'market_cap' | 'close_price',
    label: string,
    negativeMessage: string,
  ): void => {
    const { min, max } = market[key];
    if ((min !== null && min < 0) || (max !== null && max < 0))
      add(['market', key], 'NEGATIVE', negativeMessage);
    else if (min !== null && max !== null && min > max)
      add(['market', key], 'RANGE', `${label}: "từ" phải nhỏ hơn hoặc bằng "đến".`);
  };
  range('market_cap', 'Vốn hóa', 'Vốn hóa không được âm.');
  range('close_price', 'Giá', 'Giá không được âm.');
  const { sessions, min } = market.avg_value;
  if (min !== null && min < 0)
    add(['market', 'avg_value', 'min'], 'NEGATIVE', 'Giá trị giao dịch phải là số không âm.');
  if (
    !Number.isInteger(sessions) ||
    sessions < AVG_VALUE_MIN_SESSIONS ||
    sessions > AVG_VALUE_MAX_SESSIONS
  )
    add(
      ['market', 'avg_value', 'sessions'],
      'SESSIONS',
      `Số phiên phải từ ${AVG_VALUE_MIN_SESSIONS} đến ${AVG_VALUE_MAX_SESSIONS}, số nguyên.`,
    );
  return issues;
}

/** A Thị trường block that restricts nothing (the Giá/Vốn hóa/GTGD columns are still shown). */
export function marketIsOpen(market: MarketScope): boolean {
  return (
    market.exchanges.length === 0 &&
    market.baskets.length === 0 &&
    market.statement_groups.length === 0 &&
    market.market_cap.min === null &&
    market.market_cap.max === null &&
    market.close_price.min === null &&
    market.close_price.max === null &&
    market.avg_value.min === null
  );
}

/** Enabled rows only (spec §6.3): a switched-off row stays in the definition but not in the criteria. */
export function enabledTechnical(items: readonly TechnicalItem[]): TechnicalItem[] {
  const out: TechnicalItem[] = [];
  for (const item of items) {
    if (item.indicator === 'volume') {
      out.push(item);
      continue;
    }
    const rules = (item as RowsTechnicalItem).rules.filter((row) => row.enabled === true);
    if (rules.length) out.push({ indicator: item.indicator, rules });
  }
  return out.sort((a, b) => a.indicator.localeCompare(b.indicator));
}

/**
 * What two definitions are compared on (criteria signature / `criteriaHash`): Thị trường, the enabled
 * Kỹ thuật rows, the fundamental rules and reference columns. The name, the review flag and the
 * switched-off technical rows are not criteria.
 */
export function criteriaOf(definition: ScreenerDefinitionV4): {
  market: MarketScope;
  technical: TechnicalItem[];
  rules: DefinitionRule[];
  columns: DefinitionColumn[];
  data_mode: string;
} {
  return {
    market: canonicalMarket(definition.market, { keepReview: false }),
    technical: enabledTechnical(definition.technical ?? []),
    rules: definition.rules,
    columns: definition.columns ?? [],
    data_mode: definition.data_mode ?? 'latest_disclosed',
  };
}
