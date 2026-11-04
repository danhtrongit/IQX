import { z } from 'zod';

import {
  marketIssues,
  type MarketScope,
  ruleIssues,
  SCREENER_BASKETS,
  SCREENER_EXCHANGES,
  SCREENER_STATEMENT_GROUPS,
} from './screener.definition.js';
import { METRIC_STATUSES } from './screener.metrics.js';
import {
  fundamentalMetric,
  SCREENER_API_UNITS,
  SCREENER_DEFINITION_SCHEMA_VERSION,
  SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION,
  SCREENER_METRIC_IDS,
  SCREENER_PERIODS,
  SCREENER_READINESS,
  SCREENER_V3_DEFINITION_SCHEMA_VERSION,
} from './screener.registry.js';
import { SCREENER_SORT_KEY_PATTERN } from './screener.sort.js';
import { TECHNICAL_INDICATOR_IDS, technicalIssues } from './screener.technical.js';

/**
 * Hard cap on symbols whose FUNDAMENTALS are computed in one run (bounded VCI fetch volume). Since
 * Bộ lọc 4.0 it applies to step 2 only: Thị trường and Kỹ thuật run over the whole universe from the
 * stored daily bars first, and only the survivors (up to this many, A→Z) get financial reports.
 */
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

const nullableNumber = z.number().nullable();
const rangeSchema = z.object({ min: nullableNumber, max: nullableNumber }).strict();
const choiceList = <T extends z.ZodType>(item: T) => z.array(item).nullable().optional();

/**
 * Thị trường of definition 4.0 (spec §6.1). `exchanges`, `baskets` and `statement_groups` may be an
 * empty array or null (no filter); `statement_groups` ∈ thuong | nh | ck | bh. `market_cap` and
 * `avg_value.min` are tỷ đồng, `close_price` nghìn đồng: display units, never ratios.
 * `needs_review` / `legacy_sector` mark a stored 3.0 filter whose ICB sector must be chosen again.
 */
export const marketScopeSchema = z
  .object({
    exchanges: choiceList(z.enum([...SCREENER_EXCHANGES, 'HSX'])),
    baskets: choiceList(z.enum(SCREENER_BASKETS)),
    statement_groups: choiceList(z.enum(SCREENER_STATEMENT_GROUPS)),
    market_cap: rangeSchema,
    avg_value: z.object({ sessions: z.number(), min: nullableNumber }).strict(),
    close_price: rangeSchema,
    needs_review: z.literal('sector').optional(),
    legacy_sector: z.string().max(200).optional(),
  })
  .strict();

export const technicalRowSchema = z
  .object({ id: z.string().min(1).max(64), enabled: z.boolean() })
  .catchall(z.union([z.number(), z.string()]));

const opSchema = z.string().max(16);

/**
 * One technical indicator: the Bot's own stored rows (`id`, `enabled`, values) for the 15 row-based
 * indicators, or Volume's `sessions` / `factor` / two operators. Row counts, ids and values are
 * validated with the Bot's rules in `technicalIssues`.
 */
export const technicalItemSchema = z.union([
  z
    .object({
      indicator: z.literal('volume'),
      sessions: z.number(),
      factor: z.number(),
      ops: z.array(opSchema).length(2),
    })
    .strict(),
  z
    .object({
      indicator: z.enum(TECHNICAL_INDICATOR_IDS.filter((id) => id !== 'volume') as [string, ...string[]]),
      rules: z.array(technicalRowSchema).max(8),
    })
    .strict(),
]);

/** Hard cap on technical indicators per definition (the natural maximum is the 16 offered). */
export const SCREENER_MAX_TECHNICAL = TECHNICAL_INDICATOR_IDS.length;

/**
 * Filter definition 4.0 (filter.schema.v4.json): Thị trường `market`, fundamental `rules` (a period
 * per rule), Kỹ thuật `technical` and display-only `columns`; no `scope.market` / `scope.sector`, and
 * no client-supplied date/as_of (the server resolves "latest published" and the session T).
 */
export const screenerDefinitionSchema = z
  .object({
    schema_version: z.literal(SCREENER_DEFINITION_SCHEMA_VERSION),
    name: z.string().min(1).max(120),
    logic: z.literal('AND'),
    data_mode: z.literal('latest_disclosed').default('latest_disclosed'),
    market: marketScopeSchema,
    rules: z.array(ruleSchema).max(SCREENER_MAX_RULES),
    technical: z.array(technicalItemSchema).max(SCREENER_MAX_TECHNICAL).default([]),
    /** Reference columns shown beside the conditions; they never decide pass/fail. */
    columns: z.array(columnSchema).max(SCREENER_MAX_COLUMNS).optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    const issues = [
      ...marketIssues(definition.market as unknown as MarketScope),
      ...ruleIssues(definition.rules, definition.columns ?? []),
      ...technicalIssues(definition.technical as never),
    ];
    for (const issue of issues)
      context.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
        params: { code: issue.code },
      });
  });

export type ScreenerDefinition = z.infer<typeof screenerDefinitionSchema>;

/**
 * Stored definition 3.0 (a period per rule; `scope.market` + ICB `scope.sector`). Still accepted by
 * the run endpoint and mapped to 4.0; new saves must use 4.0.
 */
export const screenerV3DefinitionSchema = z
  .object({
    schema_version: z.literal(SCREENER_V3_DEFINITION_SCHEMA_VERSION),
    name: z.string().min(1).max(120),
    logic: z.literal('AND'),
    data_mode: z.literal('latest_disclosed').default('latest_disclosed'),
    rules: z.array(ruleSchema).max(SCREENER_MAX_RULES),
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

export type ScreenerV3DefinitionInput = z.infer<typeof screenerV3DefinitionSchema>;

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
  screenerV3DefinitionSchema,
  legacyScreenerDefinitionSchema,
]);
export type ScreenerRunInput = z.infer<typeof screenerRunInputSchema>;

export const screenerMetricSchema = z.object({
  id: metricIdSchema,
  name: z.string(),
  lesson_id: z.string().nullable(),
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

const nullableValue = z.number().nullable();

/** One technical condition row at session T (spec §4.2): value, sort value, status, T-1 operands. */
export const technicalCellSchema = z.object({
  /** Stable key: the row id (`rsi.level`) or `volume.r1` / `volume.r2`. */
  key: z.string(),
  indicator: z.string(),
  row_id: z.string(),
  /** Short column title, e.g. `RSI14`, `MACD / Signal`. */
  label: z.string(),
  /** `ok`: evaluated (true or false). `missing`: NO_SIGNAL, never counted as a pass. */
  status: z.enum(['ok', 'missing']),
  /** The row's verdict; null = NO_SIGNAL (`insufficient_price_history`, `no_session_bar`). */
  result: z.boolean().nullable(),
  op: z.string().nullable(),
  value: nullableValue,
  value2: nullableValue,
  value3: nullableValue,
  /** vi-VN text for the table, e.g. `0,41 / 0,28`. */
  display: z.string().nullable(),
  /** Value the column sorts by (spec §4.3). */
  sort_value: nullableValue,
  /** The operands one session earlier; null for rows that already compare two sessions. */
  previous: z
    .object({
      value: nullableValue,
      value2: nullableValue,
      value3: nullableValue,
      /** Same format as `display`, for the operands one session earlier. */
      display: z.string().nullable(),
    })
    .nullable(),
  /** For rows comparing T with T−N: N. */
  lag: z.number().int().nullable(),
  /** The row's stored values (period, threshold, op…). */
  params: z.record(z.string(), z.union([z.number(), z.string()])),
  reason: z.string().optional(),
  reason_code: z.string().optional(),
});

/** Thị trường values of one row at session T (null = no bar / no share count / fewer than N sessions). */
export const screenerMarketValuesSchema = z.object({
  /** nghìn đồng: close at T. */
  price: nullableValue,
  /** % against the previous session. */
  change_pct: nullableValue,
  /** tỷ đồng: close × shares. */
  market_cap: nullableValue,
  /** tỷ đồng: mean traded value of the last N sessions, T included. */
  avg_value: nullableValue,
});

export const screenerRowSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  /** ICB sector (display only since 4.0). */
  sector: z.string().nullable(),
  exchange: z.string().nullable(),
  /** Financial-statement group (Ngành): thuong | nh | ck | bh; null until read from the source. */
  group: z.enum(SCREENER_STATEMENT_GROUPS).nullable(),
  /** Every required condition (fundamental and technical) is `ok` and satisfied; reference columns never affect it. */
  passed: z.boolean(),
  market: screenerMarketValuesSchema,
  /** Technical cells keyed by `technical_cell.key`: one per enabled row (empty when none). */
  technical: z.record(z.string(), technicalCellSchema),
  /** Fundamental cells keyed by metric id: the rule metrics and the reference columns. */
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

export const screenerMarketQualitySchema = z.object({
  /** Active listed stocks before any filter. */
  universe: z.number().int(),
  /** Symbols inside the Thị trường scope. */
  in_scope: z.number().int(),
  /** Out of scope because a criterion in use could not be decided for them (spec §2.2). */
  excluded_missing: z.object({
    exchange: z.number().int(),
    basket: z.number().int(),
    statement_group: z.number().int(),
    close_price: z.number().int(),
    market_cap: z.number().int(),
    avg_value: z.number().int(),
  }),
  /** Chosen baskets with no stored constituents at the session. */
  baskets_unavailable: z.array(z.string()),
  /** Symbols in scope with no bar at the session. */
  without_session_bar: z.number().int(),
});

const technicalQualitySchema = z.object({
  key: z.string(),
  indicator: z.string(),
  row_id: z.string(),
  label: z.string(),
  by_status: z.record(z.string(), z.number().int()),
  by_reason: z.record(z.string(), z.number().int()),
});

export const screenerRunHeaderSchema = z.object({
  result_id: z.uuid(),
  schema_version: z.literal(SCREENER_DEFINITION_SCHEMA_VERSION),
  data_mode: z.literal('latest_disclosed'),
  /** One cutoff for the whole result: every page of this result shares it. */
  as_of: z.string(),
  /** Session T (YYYY-MM-DD) of Thị trường and Kỹ thuật; null when no stored bar was needed or available. */
  session_date: z.string().nullable(),
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
  /** Source of the fundamental data (VCI). */
  data_source: z.string(),
  /** Source of the daily bars behind Thị trường and Kỹ thuật (DNSE); null when no bar was read. */
  price_source: z.string().nullable(),
  calculation_version: z.string(),
  registry_version: z.string(),
  universe_truncated: z.boolean(),
  /**
   * Companies that reached the fundamental step (inside Thị trường and passing Kỹ thuật); null when
   * the definition has no fundamental condition or reference column. Above the cap only the first
   * `SCREENER_MAX_UNIVERSE` (A→Z) are computed and `universe_truncated` is true.
   */
  fundamental_candidates: z.number().int().nullable(),
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
    market: screenerMarketQualitySchema,
    technical: z.array(technicalQualitySchema),
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
  /**
   * Column to sort the WHOLE result by before it is cut into pages: `symbol` | `name` | `exchange` |
   * `group` | `price` | `change_pct` | `market_cap` | `avg_value` | `metric:<metric_id>` |
   * `tech:<row key>`. Default Mã A→Z. A blank or non-`ok` cell is always last; ties go by Mã A→Z.
   */
  sort: z
    .string()
    .regex(SCREENER_SORT_KEY_PATTERN, { message: 'Cột sắp xếp không hợp lệ' })
    .optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
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
