import { z } from 'zod';

const dateTime = z.union([z.date(), z.iso.datetime({ offset: true })]);

export const cap8ProgressSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  entered_at: dateTime,
  so_lenh_thoat_dung_ke_hoach: z.number().int().nonnegative(),
  muc_tieu_thoat_dung_ke_hoach: z.number().int().positive(),
  graduated_at: dateTime.nullable(),
  time_to_graduate_hours: z.number().finite().nonnegative().nullable(),
});

export const syncPlanRequestSchema = z.object({ buy_order_id: z.uuid() });
export const dynamicStopRequestSchema = z.object({
  dynamic_stop_vnd: z.coerce.number().int().positive(),
});
export const exitRecordRequestSchema = z.object({ sell_order_id: z.uuid() });
export const proposedSaleQuantitySchema = z.coerce.number().int().nonnegative().optional();
export const cap8SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .transform((value) => value.toUpperCase());

export type SyncPlanRequest = z.infer<typeof syncPlanRequestSchema>;
export type DynamicStopRequest = z.infer<typeof dynamicStopRequestSchema>;
export type ExitRecordRequest = z.infer<typeof exitRecordRequestSchema>;
