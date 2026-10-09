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
/** Registry contract with per-metric `default_period` / `allowed_periods` / `readiness`. */
export const SCREENER_REGISTRY_VERSION = 'iqx-fund-registry-2.1';
/** Filter definition schema: every rule carries its own `period` (2.0 had one filter-wide period). */
export const SCREENER_DEFINITION_SCHEMA_VERSION = '3.0';
export const SCREENER_LEGACY_DEFINITION_SCHEMA_VERSION = '2.0';

/**
 * Period of one condition (Strategy spec §7.3-§7.4):
 *  - `quarter`: latest discrete quarter (flows; YoY against the same quarter one year earlier), or
 *    the balance at the latest quarter end for balance-sheet metrics;
 *  - `ttm`: four consecutive discrete quarters ending at the latest quarter (YoY against the four
 *    quarters one year earlier);
 *  - `year`: latest full fiscal year (YoY against the previous fiscal year), or its year-end balance;
 *  - `three_year`: fixed three-fiscal-year window (CAGR / stability metrics).
 */
export const SCREENER_PERIODS = ['quarter', 'ttm', 'year', 'three_year'] as const;
export type ScreenerPeriod = (typeof SCREENER_PERIODS)[number];

/**
 * `ready`: the repo computes it end to end. `definition_pending`: no approved definition yet.
 * `data_unavailable`: definition exists but the data source cannot supply its inputs.
 * Anything but `ready` never runs (no invented formula, no zero).
 */
export const SCREENER_READINESS = ['ready', 'definition_pending', 'data_unavailable'] as const;
export type ScreenerReadiness = (typeof SCREENER_READINESS)[number];

/** Balance-sheet metrics: `quarter` / `year` mean "balance at the latest quarter / fiscal year end". */
export const BALANCE_SHEET_METRICS: ReadonlySet<ScreenerMetricId> = new Set<ScreenerMetricId>([
  'debt_equity',
  'current_ratio',
]);

const PERIOD_LABELS: Readonly<Record<ScreenerPeriod, string>> = {
  quarter: 'Quý gần nhất',
  ttm: 'Bốn quý gần nhất',
  year: 'Năm tài chính gần nhất',
  three_year: 'Ba năm tài chính gần nhất',
};
const BALANCE_PERIOD_LABELS: Readonly<Partial<Record<ScreenerPeriod, string>>> = {
  quarter: 'Số dư cuối quý gần nhất',
  year: 'Số dư cuối năm tài chính gần nhất',
};

export function screenerPeriodLabel(metricId: ScreenerMetricId, period: ScreenerPeriod): string {
  return (
    (BALANCE_SHEET_METRICS.has(metricId) ? BALANCE_PERIOD_LABELS[period] : undefined) ??
    PERIOD_LABELS[period]
  );
}

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
  /** Descriptive period text of the original registry (kept for display only). */
  period: z.string().min(1),
  default_period: z.enum(SCREENER_PERIODS),
  allowed_periods: z.array(z.enum(SCREENER_PERIODS)).min(1),
  readiness: z.enum(SCREENER_READINESS),
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
  for (const metric of parsed) {
    if (!metric.allowed_periods.includes(metric.default_period))
      throw new Error(`fundamental-registry.json: ${metric.id} default_period is not allowed`);
  }
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
