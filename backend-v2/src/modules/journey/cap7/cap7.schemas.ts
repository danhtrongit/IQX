import { z } from 'zod';

const dateTime = z.union([z.date(), z.iso.datetime({ offset: true })]);
const nullableFinite = z.number().finite().nullable();

export const cap7PortfolioSnapshotSchema = z.object({
  nav_vnd: z.number().finite().nonnegative(),
  cash_vnd: nullableFinite,
  cash_weight_pct: nullableFinite,
  positions: z.array(
    z.object({
      symbol: z.string(),
      market_value_vnd: nullableFinite,
      weight_pct: nullableFinite,
      sector: z.string().nullable(),
    }),
  ),
  sectors: z.array(
    z.object({
      sector: z.string(),
      market_value_vnd: z.number().finite().nonnegative(),
      weight_pct: nullableFinite,
    }),
  ),
  held_symbol_count: z.number().int().nonnegative(),
  known_sector_count: z.number().int().nonnegative(),
  max_symbol: z.string().nullable(),
  max_symbol_weight_pct: nullableFinite,
  max_sector: z.string().nullable(),
  max_sector_weight_pct: nullableFinite,
  unpriced_symbols: z.array(z.string()),
  unknown_sector_symbols: z.array(z.string()),
  data_complete: z.boolean(),
  can_doi_ok: z.boolean(),
});

export const cap7ProgressSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  entered_at: dateTime,
  can_doi_ok: z.boolean(),
  so_ma_dang_giu: z.number().int().nonnegative(),
  so_nganh_dang_giu: z.number().int().nonnegative(),
  ma_ty_trong_cao_nhat: z.string().nullable(),
  ty_trong_ma_cao_nhat_pct: nullableFinite,
  nganh_ty_trong_cao_nhat: z.string().nullable(),
  ty_trong_nganh_cao_nhat_pct: nullableFinite,
  ma_chua_co_gia: z.array(z.string()),
  ma_chua_ro_nganh: z.array(z.string()),
  du_lieu_day_du: z.boolean(),
  nguong_ty_trong_ma_pct: z.number(),
  nguong_ty_trong_nganh_pct: z.number(),
  toi_thieu_ma: z.number().int(),
  toi_thieu_nganh: z.number().int(),
  graduated_at: dateTime.nullable(),
  time_to_graduate_hours: z.number().finite().nonnegative().nullable(),
});

export const cap7V2ProgressResponseSchema = z.object({
  data: cap7ProgressSchema.nullable(),
  meta: z.object({}),
});
export const cap7V2PortfolioResponseSchema = z.object({
  data: cap7PortfolioSnapshotSchema,
  meta: z.object({}),
});

export type Cap7ProgressResponse = z.infer<typeof cap7V2ProgressResponseSchema>;
export type Cap7PortfolioResponse = z.infer<typeof cap7V2PortfolioResponseSchema>;
