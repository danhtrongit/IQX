import { z } from 'zod';

export const financialSymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9._-]{1,20}$/, 'Mã chứng khoán không hợp lệ');
export const financialQuerySchema = z.object({
  term_type: z.coerce.number().int().min(1).max(2).default(1),
});
export type FinancialQuery = z.infer<typeof financialQuerySchema>;

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
export const financialResponseSchema = z.object({
  data: z.record(z.string(), jsonValue),
  meta: z.object({
    source: z.string(),
    source_url: z.string(),
    term_type: z.union([z.literal(1), z.literal(2)]),
  }),
});
