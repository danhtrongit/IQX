import { z } from 'zod';
export const patternSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((value) => value.toUpperCase());
export const patternKindSchema = z.enum(['candles', 'charts']);
export type PatternKind = z.infer<typeof patternKindSchema>;
