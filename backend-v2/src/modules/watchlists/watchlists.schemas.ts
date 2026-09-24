import { z } from 'zod';

export const MAX_WATCHLIST_ITEMS = 50;

export const watchlistSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Mã chứng khoán không hợp lệ')
  .transform((value) => value.toUpperCase());

export const addWatchlistItemSchema = z.object({
  symbol: watchlistSymbolSchema,
});

export const reorderWatchlistSchema = z.object({
  symbols: z
    .array(watchlistSymbolSchema)
    .max(MAX_WATCHLIST_ITEMS)
    .superRefine((symbols, context) => {
      if (new Set(symbols).size !== symbols.length) {
        context.addIssue({ code: 'custom', message: 'Danh sách mã không được trùng lặp' });
      }
    }),
});

export type AddWatchlistItemInput = z.infer<typeof addWatchlistItemSchema>;
export type ReorderWatchlistInput = z.infer<typeof reorderWatchlistSchema>;

export type WatchlistProvenance = {
  huntFilter?: string | null;
  huntSignal?: string | null;
  huntAt?: string | Date | null;
};
