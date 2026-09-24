import { z } from 'zod';

export const reportTypeSchema = z.enum(['daily', 'midday', 'premarket']);
export const sessionDateSchema = z.iso.date();
export const reportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());
export const marketReportOutputSchema = z
  .object({
    headline: z.string().trim().min(1).max(80),
    tagline: jsonObjectSchema,
    paragraphs: jsonObjectSchema,
    // An empty list is meaningful when the input contains no supportable
    // scenario.  The report generator must not invent one just to satisfy
    // the envelope contract.
    scenarios: z.array(z.unknown()),
    watchlist: z.array(z.unknown()).nullable().optional(),
    unexplained: z.string().nullable().optional(),
    meta: jsonObjectSchema.nullable().optional(),
  })
  .strict();

export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
