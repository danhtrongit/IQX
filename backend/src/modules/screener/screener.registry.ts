import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Bộ lọc fundamental registry (bot-v2, calculation_version iqx-fund-2.0).
 * `registry/fundamental-registry.json` is a read-only versioned asset copied into dist by
 * scripts/copy-assets.ts. The id tuple below is the request-schema enum; the loader asserts
 * that it matches the registry file exactly (same ids, same order).
 */
export const SCREENER_METRIC_IDS = [
  'revenue_yoy',
  'profit_yoy',
  'eps_yoy',
  'gross_margin',
  'net_margin',
  'roe',
  'roa',
  'roic',
  'debt_equity',
  'net_debt_ebitda',
  'current_ratio',
  'interest_coverage',
  'cfo_margin',
  'cfo_profit',
  'fcf_margin',
  'fcf_yoy',
  'capex_revenue',
  'accrual',
  'pe',
  'pb',
  'ps',
  'ev_ebitda',
  'peg',
  'fcf_yield',
  'revenue_cagr3',
  'profit_cagr3',
  'eps_cagr3',
  'asset_turnover',
  'ccc',
  'working_cap_turnover',
  'revenue_growth_stability',
  'eps_growth_stability',
  'net_margin_stability',
  'roic_stability',
  'fcf_positive_streak',
  'profit_positive_streak',
  'dividend_yield',
  'payout_ratio',
  'dividend_cagr3',
  'share_count_yoy',
  'buyback_yield',
  'shareholder_yield',
] as const;

export type ScreenerMetricId = (typeof SCREENER_METRIC_IDS)[number];

export const SCREENER_API_UNITS = ['ratio', 'lần', 'ngày', 'năm'] as const;
export type ScreenerApiUnit = (typeof SCREENER_API_UNITS)[number];

export const SCREENER_CALCULATION_VERSION = 'iqx-fund-2.0';

const workedFixtureSchema = z.object({
  type: z.literal('scalar'),
  label: z.string(),
  inputs: z.array(z.tuple([z.string(), z.number()])).min(2),
  formula: z.string(),
  expected: z.number(),
  unit: z.string(),
  tolerance: z.number().positive(),
  synthetic: z.boolean(),
});

const fundamentalMetricSchema = z.object({
  id: z.enum(SCREENER_METRIC_IDS),
  name: z.string().min(1),
  lesson_id: z.string().regex(/^ch\d{2}-l\d{2}$/),
  chapter: z.number().int(),
  unit: z.string().min(1),
  api_unit: z.enum(SCREENER_API_UNITS),
  kind: z.string().min(1),
  calculation_version: z.literal(SCREENER_CALCULATION_VERSION),
  formula: z.string().min(1),
  period: z.string().min(1),
  applicability: z.enum(['all', 'non_financial']),
  operators: z.array(z.enum(['>', '<'])).min(1),
  null_policy: z.string().min(1),
  worked_fixture: workedFixtureSchema,
  notes: z.string(),
});

export type FundamentalMetric = z.infer<typeof fundamentalMetricSchema>;

let registryCache: readonly FundamentalMetric[] | undefined;

/** Loads and validates the 42-entry fundamental registry once per process. */
export function loadFundamentalRegistry(): readonly FundamentalMetric[] {
  if (registryCache) return registryCache;
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    'registry',
    'fundamental-registry.json',
  );
  const parsed = z.array(fundamentalMetricSchema).parse(JSON.parse(readFileSync(file, 'utf8')));
  const ids = parsed.map((metric) => metric.id);
  if (
    ids.length !== SCREENER_METRIC_IDS.length ||
    ids.some((id, index) => id !== SCREENER_METRIC_IDS[index])
  )
    throw new Error('fundamental-registry.json does not match SCREENER_METRIC_IDS');
  registryCache = Object.freeze(parsed);
  return registryCache;
}

export function fundamentalMetric(id: ScreenerMetricId): FundamentalMetric {
  const metric = loadFundamentalRegistry().find((item) => item.id === id);
  if (!metric) throw new Error(`Unknown fundamental metric: ${id}`);
  return metric;
}
