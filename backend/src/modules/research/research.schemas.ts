import { z } from 'zod';

export const researchSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((value) => value.toUpperCase());

export const researchStatusQuerySchema = z.object({ jobId: z.string().uuid() });
export type ResearchStatusQuery = z.infer<typeof researchStatusQuerySchema>;

const thesisSchema = z.object({ id: z.string(), order: z.number().int(), title: z.string(), summary: z.string() });
const valuationSchema = z.union([
  z.object({
    mode: z.literal('range'),
    targetMedian: z.number(),
    targetMin: z.number(),
    targetMax: z.number(),
    currentPrice: z.number().nullable(),
    upsidePercent: z.number().nullable(),
  }),
  z.object({
    mode: z.literal('single'),
    targetMedian: z.number(),
    currentPrice: z.number().nullable(),
    upsidePercent: z.number().nullable(),
  }),
]);

/** `investmentView` (spec §28). */
export const investmentViewSchema = z.union([
  z.object({ status: z.literal('processing'), jobId: z.string() }),
  z.object({ status: z.literal('empty') }),
  z.object({
    status: z.literal('ready'),
    version: z.number().int(),
    theses: z.array(thesisSchema),
    valuation: valuationSchema.nullable(),
  }),
]);
export const investmentViewResponseSchema = z.object({ data: investmentViewSchema });
