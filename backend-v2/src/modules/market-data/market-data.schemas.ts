import { z } from 'zod';

export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,10}$/);
export const sourceSchema = z.enum(['auto', 'VCI', 'VND', 'vci', 'vnd']).optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const optionalCompactDate = z
  .string()
  .regex(/^\d{8}$/)
  .optional();
const integer = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

export const symbolsQuerySchema = z.object({
  exchange: z.string().trim().optional(),
  asset_type: z.string().trim().toLowerCase().optional(),
  source: sourceSchema,
});
export const groupSchema = z.string().trim();
export const indexQuerySchema = z.object({ group: z.string().trim().toUpperCase().optional() });
export const ohlcvQuerySchema = z.object({
  start: optionalDate,
  end: optionalDate,
  interval: z.enum(['1m', '5m', '15m', '30m', '1H', '1D', '1W', '1M']).default('1D'),
  source: sourceSchema,
});
export const intradayQuerySchema = z.object({
  page_size: integer(1, 30000, 100),
  source: sourceSchema,
});
export const priceBoardSchema = z.object({
  symbols: z.array(symbolSchema).min(1).max(50),
  source: z.enum(['auto', 'VCI', 'VND']).default('auto'),
});
export const rankingQuerySchema = z.object({
  index: z.string().trim().default('VNINDEX'),
  limit: integer(1, 50, 10),
  date: optionalDate,
});
export const rankingKindSchema = z.enum([
  'gainer',
  'loser',
  'value',
  'volume',
  'deal',
  'foreign-buy',
  'foreign-sell',
]);
export const financialTypeSchema = z.enum([
  'balance_sheet',
  'income_statement',
  'cash_flow',
  'ratio',
]);
export const financialQuerySchema = z.object({
  term_type: integer(1, 2, 2),
  page_size: integer(1, 20, 8),
  period: z.enum(['Q', 'Y']).default('Q'),
});
export const foreignTradeQuerySchema = z.object({
  start: optionalDate,
  end: optionalDate,
  limit: integer(1, 1000, 100),
});
export const insiderQuerySchema = z.object({ limit: integer(1, 1000, 100) });
export const statsQuerySchema = z.object({
  resolution: z.enum(['1D', '1W', '1M', '1Q', '1Y']).default('1D'),
  fromDate: optionalCompactDate,
  toDate: optionalCompactDate,
  page: integer(0, 1000, 0),
  size: integer(1, 200, 50),
});
export const statsSummaryQuerySchema = statsQuerySchema.omit({ page: true, size: true });
export const priceChartQuerySchema = z.object({ length: integer(1, 3650, 365) });
export const eventsQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: optionalDate,
  event_type: z.enum(['dividend', 'insider', 'agm', 'others']).optional(),
});

export type SymbolsQuery = z.infer<typeof symbolsQuerySchema>;
export type OhlcvQuery = z.infer<typeof ohlcvQuerySchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
export type StatsSummaryQuery = z.infer<typeof statsSummaryQuerySchema>;
