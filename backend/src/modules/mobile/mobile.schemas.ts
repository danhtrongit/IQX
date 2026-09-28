import { z } from 'zod';

const platform = z.enum(['ios', 'android']);
export const productQuerySchema = z.object({ platform });
export const purchaseSchema = z.object({
  platform,
  product_id: z.string().trim().min(1).max(200),
  transaction_id: z.string().trim().min(1).max(300),
  receipt: z.string().min(1).max(100_000),
});
export const restoreSchema = z.object({ platform });
export const storeNotificationSchema = z.record(z.string().max(100), z.unknown());
export const deviceSchema = z.object({
  device_id: z.string().trim().min(1).max(200),
  platform,
  push_token: z.string().trim().max(4096).optional(),
  app_version: z.string().trim().max(100).optional(),
  locale: z.string().trim().max(35).optional(),
  timezone: z.string().trim().max(100).optional(),
});
export const preferencesSchema = z.object({
  notifications_enabled: z.boolean().optional(),
  marketing_enabled: z.boolean().optional(),
  locale: z.string().trim().max(35).optional(),
  timezone: z.string().trim().max(100).optional(),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type RestoreInput = z.infer<typeof restoreSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type StoreNotificationInput = z.infer<typeof storeNotificationSchema>;
