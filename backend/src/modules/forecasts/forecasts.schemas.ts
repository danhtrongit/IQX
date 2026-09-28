import { z } from 'zod';
export const forecastHorizonSchema = z.enum(['3', '5', '10']);
export const forecastRankingSchema = z.object({
  horizon: forecastHorizonSchema.default('5'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const forecastSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((value) => value.toUpperCase());
export type ForecastHorizon = z.infer<typeof forecastHorizonSchema>;
export type ForecastRanking = z.output<typeof forecastRankingSchema>;
