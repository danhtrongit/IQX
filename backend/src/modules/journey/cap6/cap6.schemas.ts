import { z } from 'zod';
import { CONFLICT_LEVELS } from './cap6.types.js';
export const conflictBodySchema = z.object({
  order_id: z.string().uuid(),
  conflict_level: z.enum(CONFLICT_LEVELS),
});
export const skipBodySchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  conflict_level: z.enum(CONFLICT_LEVELS),
});
export const symbolParamSchema = z.object({ symbol: z.string().trim().min(1).max(20) });
export const orderParamSchema = z.object({ order_id: z.string().uuid() });
export type ConflictBody = z.infer<typeof conflictBodySchema>;
export type SkipBody = z.infer<typeof skipBodySchema>;
