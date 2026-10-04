import { z } from 'zod';

import {
  loadFundamentalRegistry,
  SCREENER_API_UNITS,
  SCREENER_METRIC_IDS,
} from './screener.registry.js';

/** Hard cap on symbols evaluated per run (bounded upstream fetch volume). */
export const SCREENER_MAX_UNIVERSE = 500;
/** Concurrent per-symbol provider fetches. */
export const SCREENER_FETCH_CONCURRENCY = 4;
/** Hard cap on rules per definition. */
export const SCREENER_MAX_RULES = 42;

export const SCREENER_MARKETS = ['ALL', 'HOSE', 'HNX', 'UPCOM'] as const;
export type ScreenerMarket = (typeof SCREENER_MARKETS)[number];

/** Scope value meaning "no restriction" for market and sector (frontend SCOPE_ALL = "all"). */
const SCOPE_ALL = 'all';

const metricIdSchema = z.enum(SCREENER_METRIC_IDS);
const statusSchema = z.enum(['ok', 'missing', 'not_applicable', 'insufficient_base']);

/** filter.schema.json (schema_version 2.0) translated to zod, plus registry unit checks. */
export const screenerDefinitionSchema = z
  .object({
    schema_version: z.literal('2.0'),
    name: z.string().min(1).max(120),
    logic: z.literal('AND'),
    rules: z
      .array(
        z
          .object({
            id: z.string(),
            metric_id: metricIdSchema,
            operator: z.enum(['>', '<']),
            value: z.number(),
            api_unit: z.enum(SCREENER_API_UNITS),
          })
          .strict(),
      )
      .max(SCREENER_MAX_RULES),
    scope: z
      .object({
        market: z
          .string()
          .refine(
            (market) =>
              market.toLowerCase() === SCOPE_ALL ||
              (SCREENER_MARKETS as readonly string[]).includes(market.toUpperCase()) ||
              market.toUpperCase() === 'HSX',
            { message: 'Sàn phải là all, HOSE, HNX hoặc UPCOM' },
          ),
        sector: z.string().max(200),
        period: z.enum(['TTM', 'annual', 'quarter']),
      })
      .strict(),
  })
  .strict()
  .superRefine((definition, context) => {
    const registry = new Map(loadFundamentalRegistry().map((metric) => [metric.id, metric]));
    definition.rules.forEach((rule, index) => {
      const metric = registry.get(rule.metric_id);
      if (metric && rule.api_unit !== metric.api_unit)
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'api_unit'],
          message: `Đơn vị của ${rule.metric_id} phải là ${metric.api_unit}`,
        });
      if (metric && !metric.operators.includes(rule.operator))
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'operator'],
          message: `Toán tử không hợp lệ cho ${rule.metric_id}`,
        });
    });
  });

export type ScreenerDefinition = z.infer<typeof screenerDefinitionSchema>;

/** Normalized scope: market upper-cased (HSX → HOSE), "all"/"" sector → null. */
export function normalizeScreenerScope(scope: ScreenerDefinition['scope']): {
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
  api_unit: z.enum(SCREENER_API_UNITS),
  period: z.string(),
  applicability: z.enum(['all', 'non_financial']),
  operators: z.array(z.enum(['>', '<'])),
  learned: z.boolean(),
  supported: z.boolean(),
  unsupported_reason: z.string().nullable(),
});

export const screenerMetricsResponseSchema = z.array(screenerMetricSchema);

export type ScreenerMetricView = z.infer<typeof screenerMetricSchema>;

export const screenerMetricResultSchema = z.object({
  value: z.number().nullable(),
  status: statusSchema,
  unit: z.enum(SCREENER_API_UNITS),
  period: z.string().nullable(),
  available_at: z.string().nullable(),
  source_revision: z.string().nullable(),
  reason: z.string().optional(),
  lower_bound: z.boolean().optional(),
});

export const screenerRunDataSchema = z.object({
  as_of: z.string(),
  scope: z.object({
    market: z.string(),
    sector: z.string(),
    period: z.enum(['TTM', 'annual', 'quarter']),
  }),
  period: z.enum(['TTM', 'annual', 'quarter']),
  data_source: z.string(),
  calculation_version: z.string(),
  universe_truncated: z.boolean(),
  results: z.array(
    z.object({
      symbol: z.string(),
      name: z.string().nullable(),
      sector: z.string().nullable(),
      exchange: z.string().nullable(),
      passed: z.boolean(),
      metrics: z.record(z.string(), screenerMetricResultSchema),
    }),
  ),
  counts: z.object({
    universe: z.number().int(),
    passed: z.number().int(),
    missing: z.number().int(),
  }),
});

export type ScreenerRunData = z.infer<typeof screenerRunDataSchema>;

export const screenerRunResponseSchema = screenerRunDataSchema;
