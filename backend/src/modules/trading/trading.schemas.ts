import { z } from 'zod';

export const journeyPlanSchema = z.object({
  ly_do_doi_thuong: z.string().nullable().optional(),
  lyDo: z.enum(['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia']).nullable().optional(),
  trangThai_luc_dat: z
    .enum(['ung_ho', 'trung_tinh', 'can_chu_y', 'nguoc_chieu'])
    .nullable()
    .optional(),
  vung_mua: z.number().int().positive().nullable().optional(),
  co_bam_doc_chi_tiet: z.boolean().default(false),
  snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  phuong_phap_sl_tp: z.enum(['ho_tro_khang_cu', 'bien_do_dao_dong']).nullable().optional(),
  cat_lo: z.number().int().positive().nullable().optional(),
  chot_loi: z.number().int().positive().nullable().optional(),
  nhoi_lenh_alert_id: z.string().uuid().nullable().optional(),
  khau_vi: z.enum(['than_trong', 'can_bang', 'tan_cong']).nullable().optional(),
  muc_tu_tin: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .nullable()
    .optional(),
  cach_khoi_luong: z
    .enum(['khau_vi_tu_tin', 'chia_deu', 'linh_hoat', 'ky_luat'])
    .nullable()
    .optional(),
  doc_5_lop: z
    .record(z.string(), z.enum(['ok', 'neu', 'bad']))
    .nullable()
    .optional(),
  conflict_level: z.enum(['nhe', 'ngai', 'nghiem', 'chua_ro']).nullable().optional(),
});

export const placeOrderSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .regex(/^[A-Za-z0-9]+$/)
      .transform((v) => v.toUpperCase()),
    side: z.enum(['buy', 'sell']),
    order_type: z.enum(['market', 'limit']),
    quantity: z.number().int().positive().max(1_000_000),
    limit_price_vnd: z.number().int().positive().max(10_000_000).nullable().optional(),
    journey_plan: journeyPlanSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.order_type === 'limit' && value.limit_price_vnd == null) {
      context.addIssue({
        code: 'custom',
        path: ['limit_price_vnd'],
        message: 'Lệnh limit yêu cầu giá limit',
      });
    }
    if (value.side === 'sell' && value.journey_plan != null) {
      context.addIssue({
        code: 'custom',
        path: ['journey_plan'],
        message: 'journey_plan chỉ dùng cho lệnh MUA',
      });
    }
  });

export const orderListQuerySchema = z.object({
  status: z.enum(['pending', 'filled', 'cancelled', 'expired', 'rejected']).optional(),
  symbol: z
    .string()
    .trim()
    .max(10)
    .transform((value) => value.toUpperCase())
    .optional(),
  side: z.enum(['buy', 'sell']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const leaderboardQuerySchema = paginationQuerySchema.extend({
  sort_by: z.enum(['nav', 'profit', 'return_pct']).default('nav'),
});

export const uuidParamSchema = z.string().uuid();

export type PlaceOrderBody = z.output<typeof placeOrderSchema>;
export type OrderListQuery = z.output<typeof orderListQuerySchema>;
export type PaginationQuery = z.output<typeof paginationQuerySchema>;
export type LeaderboardQuery = z.output<typeof leaderboardQuerySchema>;
