import { z } from 'zod';
import { HUNT_FILTERS } from './cap5.types.js';

export const taskSchema = z.object({ task_no: z.coerce.number().int().min(1).max(2) });
export const watchlistSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  hunt_filter: z.enum(HUNT_FILTERS),
  hunt_signal: z.string().max(200).nullable().optional(),
});
export const symbolParamSchema = z.object({ symbol: z.string().trim().min(1).max(20) });
export const orderIdParamSchema = z.object({ order_id: z.string().uuid() });
export const huntFilterParamSchema = z.object({ bo_loc: z.enum(HUNT_FILTERS) });
export const sourceQuerySchema = z.object({ order_id: z.string().uuid().optional() });
export type TaskBody = z.infer<typeof taskSchema>;
export type WatchlistBody = z.infer<typeof watchlistSchema>;
export type SourceQuery = z.infer<typeof sourceQuerySchema>;
