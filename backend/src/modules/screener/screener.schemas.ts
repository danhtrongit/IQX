import { z } from 'zod';

import { ruleIssues } from './screener.definition.js';
import { METRIC_STATUSES } from './screener.metrics.js';
import {
  fundamentalMetric,
  SCREENER_API_UNITS,
  SCREENER_DEFINITION_SCHEMA_VERSION,
  SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION,
  SCREENER_METRIC_IDS,
  SCREENER_PERIODS,
  SCREENER_READINESS,
} from './screener.registry.js';

/** Hard cap on symbols evaluated per run (bounded upstream fetch volume). */
export const SCREENER_MAX_UNIVERSE = 500;
/** Concurrent per-symbol provider fetches. */
export const SCREENER_FETCH_CONCURRENCY = 4;
/** Hard cap on rules per definition. */
export const SCREENER_MAX_RULES = 42;
/** Hard cap on display-only reference columns per definition. */
export const SCREENER_MAX_COLUMNS = 12;

export const SCREENER_MARKETS = ['ALL', 'HOSE', 'HNX', 'UPCOM'] as const;
export type ScreenerMarket = (typeof SCREENER_MARKETS)[number];

/** Scope value meaning "no restriction" for market and sector (frontend SCOPE_ALL = "all"). */
const SCOPE_ALL = 'all';

const metricIdSchema = z.enum(SCREENER_METRIC_IDS);
const periodSchema = z.enum(SCREENER_PERIODS);
const operatorSchema = z.enum(['>', '<']);
const apiUnitSchema = z.enum(SCREENER_API_UNITS);
const statusSchema = z.enum(METRIC_STATUSES);

const marketSchema = z
  .string()
  .refine(
    (market) =>
      market.toLowerCase() === SCOPE_ALL ||
      (SCREENER_MARKETS as readonly string[]).includes(market.toUpperCase()) ||
      market.toUpperCase() === 'HSX',
    { message: 'Sàn phải là all, HOSE, HNX hoặc UPCOM' },
  );

const ruleSchema = z
  .object({
    id: z.string().min(1).max(64),
    metric_id: metricIdSchema,
    /** Period of THIS condition; must be one of the metric's `allowed_periods`. */
    period: periodSchema,
    operator: operatorSchema,
    value: z.number(),
    api_unit: apiUnitSchema,
  })
  .strict();

const columnSchema = z.object({ metric_id: metricIdSchema, period: periodSchema }).strict();

const scopeSchema = z.object({ market: marketSchema, sector: z.string().max(200) }).strict();

/**
 * Filter definition 3.0 (filter.schema.json): a period per rule, no filter-wide period, and no
 * client-supplied date/as_of (the server resolves "latest published" at its own cutoff).
 */
export const screenerDefinitionSchema = z
  .object({
    schema_version: z.literal(SCREENER_DEFINITION_SCHEMA_VERSION),
    name: z.string().min(1).max(120),
    logic: z.literal('AND'),
    data_mode: z.literal('latest_disclosed').default('latest_disclosed'),
    rules: z.array(ruleSchema).max(SCREENER_MAX_RULES),
    /** Reference columns shown beside the conditions; they never decide pass/fail. */
    columns: z.array(columnSchema).max(SCREENER_MAX_COLUMNS).optional(),
    scope: scopeSchema,
  })
  .strict()
  .superRefine((definition, context) => {
    for (const issue of ruleIssues(definition.rules, definition.columns ?? []))
      context.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
        params: { code: issue.code },
      });
  });

export type ScreenerDefinition = z.infer<typeof screenerDefinitionSchema>;

/**
 * Legacy definition 2.0 (one filter-wide `scope.period`). Still accepted by the run endpoint and
 * mapped onto every rule; new saves must use 3.0.
 */
export const legacyScreenerDefinitionSchema = z
  .object({
    schema_version: z.literal(SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION),
    name: z.string().min(1).max(120),
    logic: z.literal('AND'),
    rules: z
      .array(
        z
          .object({
            id: z.string(),
            metric_id: metricIdSchema,
            operator: operatorSchema,
            value: z.number(),
            api_unit: apiUnitSchema,
          })
          .strict(),
      )
      .max(SCREENER_MAX_RULES),
    scope: scopeSchema.extend({ period: z.enum(['TTM', 'annual', 'quarter']) }),
  })
  .strict()
  .superRefine((definition, context) => {
    definition.rules.forEach((rule, index) => {
      const metric = fundamentalMetric(rule.metric_id);
      if (rule.api_unit !== metric.api_unit)
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'api_unit'],
          message: `Đơn vị của ${rule.metric_id} phải là ${metric.api_unit}`,
        });
      if (!metric.operators.includes(rule.operator))
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'operator'],
          message: `Toán tử không hợp lệ cho ${rule.metric_id}`,
        });
    });
  });

export type LegacyScreenerDefinitionInput = z.infer<typeof legacyScreenerDefinitionSchema>;

export const screenerRunInputSchema = z.union([
  screenerDefinitionSchema,
  legacyScreenerDefinitionSchema,
]);
export type ScreenerRunInput = z.infer<typeof screenerRunInputSchema>;

/** Normalized scope: market upper-cased (HSX → HOSE), "all"/"" sector → null. */
export function normalizeScreenerScope(scope: { market: string; sector: string }): {
  market: ScreenerMarket;
  sector: string | null;
} {
  const upper = scope.market.toUpperCase();
  const market = (upper === 'HSX' ? 'HOSE' : upper) as ScreenerMarket;
  const sector = scope.sector.trim();
  return {
    market,
    sector: sector === '' || sector.toLowerCase() === SCOPE_ALL ? null : sector,
  };
}

export const screenerMetricSchema = z.object({
  id: metricIdSchema,
  name: z.string(),
  lesson_id: z.string(),
  unit: z.string(),
  api_unit: apiUnitSchema,
  /** Descriptive period text of the original registry (display only). */
  period: z.string(),
  default_period: periodSchema,
  /** Periods a condition on this metric may choose, with display labels. */
  allowed_periods: z.array(z.object({ id: periodSchema, label: z.string() })).min(1),
  readiness: z.enum(SCREENER_READINESS),
  applicability: z.enum(['all', 'non_financial']),
  operators: z.array(operatorSchema),
  learned: z.boolean(),
  /** readiness === 'ready': only these metrics can run. */
  supported: z.boolean(),
  unsupported_reason: z.string().nullable(),
});

export const screenerMetricsResponseSchema = z.array(screenerMetricSchema);

export type ScreenerMetricView = z.infer<typeof screenerMetricSchema>;

/** The single documented status enum of a cell; `lower_bound` is a flag of an `ok` value. */
export const screenerMetricResultSchema = z.object({
  metric_id: metricIdSchema,
  period_mode: periodSchema,
  status: statusSchema,
  value: z.number().nullable(),
  unit: apiUnitSchema,
  lower_bound: z.boolean().optional(),
  reason: z.string().optional(),
  reason_code: z.string().optional(),
  actual_period_label: z.string().nullable(),
  comparison_period_label: z.string().nullable(),
  published_at: z.string().nullable(),
  available_at: z.string().nullable(),
  source_revision: z.string().nullable(),
  components: z.array(
    z.object({
      label: z.string(),
      published_at: z.string().nullable(),
      updated_at: z.string().nullable(),
    }),
  ),
});

export const screenerRowSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  sector: z.string().nullable(),
  exchange: z.string().nullable(),
  /** All required conditions are `ok` and satisfied; reference columns never affect it. */
  passed: z.boolean(),
  /** Cells keyed by metric id: the rule metrics and the reference columns. */
  metrics: z.record(z.string(), screenerMetricResultSchema),
});

const qualityCountSchema = z.object({
  metric_id: metricIdSchema,
  period_mode: periodSchema,
  role: z.enum(['condition', 'reference']),
  /** Number of companies per cell status. */
  by_status: z.record(z.string(), z.number().int()),
  /** Number of non-ok companies per `reason_code`. */
  by_reason: z.record(z.string(), z.number().int()),
});

export const screenerRunHeaderSchema = z.object({
  result_id: z.uuid(),
  schema_version: z.literal(SCREENER_DEFINITION_SCHEMA_VERSION),
  data_mode: z.literal('latest_disclosed'),
  /** One cutoff for the whole result: every page of this result shares it. */
  as_of: z.string(),
  definition: screenerDefinitionSchema,
  /** Present when a legacy 2.0 definition was mapped; `needs_review` blocks the run. */
  legacy_review: z
    .object({
      stored_schema_version: z.literal('2.0'),
      legacy_period: z.enum(['TTM', 'annual', 'quarter']),
      needs_review: z.boolean(),
      rules: z.array(
        z.object({
          rule_id: z.string(),
          metric_id: metricIdSchema,
          legacy_period: z.enum(['TTM', 'annual', 'quarter']),
          mapped_period: periodSchema,
          status: z.enum(['ok', 'needs_review']),
          reason: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  data_source: z.string(),
  calculation_version: z.string(),
  registry_version: z.string(),
  universe_truncated: z.boolean(),
  provenance_notes: z.object({
    period_dates: z.literal('not_provided_by_source'),
    report_scope: z.literal('not_provided_by_source'),
    availability_rule: z.string(),
  }),
  counts: z.object({
    universe: z.number().int(),
    passed: z.number().int(),
    /** Companies whose conditions are all `ok` but not all satisfied. */
    failed_threshold: z.number().int(),
    /** Companies with at least one required condition that is not `ok`. */
    with_required_exceptions: z.number().int(),
    /** Companies with at least one `missing` cell (any role). */
    missing: z.number().int(),
  }),
  data_quality: z.object({
    metrics: z.array(qualityCountSchema),
  }),
});

export const screenerRunDataSchema = screenerRunHeaderSchema.extend({
  /** Every evaluated company (all pages of the result). */
  results: z.array(screenerRowSchema),
});

export type ScreenerRunData = z.infer<typeof screenerRunDataSchema>;
export type ScreenerRunHeader = z.infer<typeof screenerRunHeaderSchema>;
export type ScreenerRow = z.infer<typeof screenerRowSchema>;

export const screenerRunResponseSchema = screenerRunDataSchema;

export const screenerResultIdSchema = z.uuid();

export const screenerResultQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** Only the companies that passed every required condition. */
  passed_only: z
    .preprocess((value) => value === 'true' || value === true, z.boolean())
    .default(false),
});
export type ScreenerResultQuery = z.infer<typeof screenerResultQuerySchema>;

export const screenerResultPageSchema = screenerRunHeaderSchema.extend({
  /** Rows of this page; `total` counts the whole result (after `passed_only`). */
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  results: z.array(screenerRowSchema),
});
export type ScreenerResultPage = z.infer<typeof screenerResultPageSchema>;
