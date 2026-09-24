import { z } from 'zod';

export const languageSchema = z.enum(['vi', 'en']).default('vi');
export const dashboardAnalyzeSchema = z.object({
  language: languageSchema,
  include_payload: z.boolean().default(false),
});
export const industryAnalyzeSchema = z.object({
  icb_code: z.coerce.number().int().min(1).max(999999),
  language: languageSchema,
  include_payload: z.boolean().default(false),
});
export const industryBatchAnalyzeSchema = z.object({
  icb_codes: z.array(z.coerce.number().int().min(1).max(999999)).min(1).max(20),
  language: languageSchema,
  include_payload: z.boolean().default(false),
});
export const insightAnalyzeSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/)
    .transform((value) => value.toUpperCase()),
  language: languageSchema,
  include_payload: z.boolean().default(false),
});
export const insightPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((value) => value.toUpperCase());
export const languageQuerySchema = z.object({ language: languageSchema });
export const bctcQuerySchema = z.object({
  term_type: z.coerce
    .number()
    .int()
    .refine((value) => value === 1 || value === 2, 'term_type must be 1 (annual) or 2 (quarterly)')
    .default(1),
  language: languageSchema,
});
export const symbolQuerySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/)
    .transform((value) => value.toUpperCase()),
});
export const insightResponseSchema = z.record(z.string(), z.unknown());
export type DashboardAnalyze = z.output<typeof dashboardAnalyzeSchema>;
export type IndustryAnalyze = z.output<typeof industryAnalyzeSchema>;
export type IndustryBatchAnalyze = z.output<typeof industryBatchAnalyzeSchema>;
export type InsightAnalyze = z.output<typeof insightAnalyzeSchema>;
export type BctcQuery = z.output<typeof bctcQuerySchema>;
