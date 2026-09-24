import { z } from 'zod';

export const cap2TaskSchema = z.object({ task_no: z.literal(1) });
export const cap2KehoachSchema = z.object({
  order_id: z.uuid(),
  phuong_phap_sl_tp: z.enum(['ho_tro_khang_cu', 'bien_do_dao_dong']),
  cat_lo: z.number().int().positive(),
  chot_loi: z.number().int().positive(),
});
export const cap2KetsoSchema = z
  .object({
    order_id: z.uuid(),
    cham_SL_cuoi_phien: z.boolean().default(false),
    cham_SL_cat_dung_phien_ke: z.boolean().default(false),
    cham_SL_khong_cat: z.boolean().default(false),
    giu_cham_SL_bao_nhieu_phien: z.number().int().nonnegative().nullable().optional(),
    cham_TP_giu_lam_hut: z.boolean().default(false),
    ban_som_khi_lo_nhe: z.boolean().default(false),
    nhoi_lenh_khi_lo: z.boolean().default(false),
    ghi_chu_nhin_lai: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((row) => !(row.cham_SL_cat_dung_phien_ke && row.cham_SL_khong_cat), {
    message: 'Không thể vừa cắt đúng phiên vừa ghi không cắt',
  });
export const scoreQuerySchema = z.object({ ngay: z.iso.date().optional() });
export const historyQuerySchema = z.object({
  from_date: z.iso.date().optional(),
  to_date: z.iso.date().optional(),
});
export const preBuySchema = z
  .object({
    symbol: z
      .string()
      .regex(/^[A-Za-z0-9]{1,10}$/)
      .transform((value) => value.toUpperCase()),
    idempotency_key: z.string().min(8).max(120),
    quantity: z.number().int().positive().max(1_000_000),
    order_type: z.enum(['market', 'limit']),
    limit_price_vnd: z.number().int().positive().max(10_000_000).nullable().optional(),
  })
  .superRefine((row, context) => {
    if (row.order_type === 'limit' && row.limit_price_vnd == null)
      context.addIssue({
        code: 'custom',
        path: ['limit_price_vnd'],
        message: 'Lệnh limit cần limit_price_vnd',
      });
    if (row.order_type === 'market' && row.limit_price_vnd != null)
      context.addIssue({
        code: 'custom',
        path: ['limit_price_vnd'],
        message: 'Lệnh market không nhận limit_price_vnd',
      });
  });
export const activeAlertsQuerySchema = z.object({ session_date: z.iso.date().optional() });
export const alertIdSchema = z.uuid();
export const alertActionSchema = z.object({
  action: z.enum(['cancel_buy', 'proceed_buy', 'sell_ato', 'hold', 'dismiss', 'snooze']),
  confirmation_phrase: z.string().max(40).nullable().optional(),
});

export type Cap2KehoachInput = z.infer<typeof cap2KehoachSchema>;
export type Cap2KetsoInput = z.infer<typeof cap2KetsoSchema>;
export type PreBuyInput = z.infer<typeof preBuySchema>;
export type AlertActionInput = z.infer<typeof alertActionSchema>;
