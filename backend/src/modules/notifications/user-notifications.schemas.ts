/** Hợp đồng API thông báo (update 22-11 §8.5, PLAN §6.3). */
import { z } from 'zod';

import { NOTIFICATION_TYPES } from './user-notifications.text.js';

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const notificationSettingsInputSchema = z
  .object({
    enabled: z.boolean(),
    types: z.object({ bulletin: z.boolean(), bot_trades: z.boolean() }).strict(),
    channels: z
      .object({
        /** `Trên web` luôn bật; nhận `true` cho đối xứng, giá trị khác bị từ chối. */
        web: z.literal(true).optional(),
        email: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>;

export const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  types: z.object({ bulletin: z.boolean(), bot_trades: z.boolean() }),
  channels: z.object({ web: z.literal(true), email: z.boolean() }),
  /** Tài khoản có email đã xác thực (nút Email mở khoá). */
  email_available: z.boolean(),
  /** `null` khi chưa từng lưu (đang dùng mặc định). */
  updated_at: z.string().nullable(),
});
export type NotificationSettingsView = z.infer<typeof notificationSettingsSchema>;

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationItemSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  trade_date: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  unread_count: z.number().int(),
});

export const unreadCountSchema = z.object({ unread_count: z.number().int() });

export const markReadInputSchema = z.union([
  z.object({ id: z.uuid() }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type MarkReadInput = z.infer<typeof markReadInputSchema>;

export const unsubscribeInputSchema = z.object({ token: z.string().min(1).max(200) }).strict();
export type UnsubscribeInput = z.infer<typeof unsubscribeInputSchema>;

export const unsubscribeResultSchema = z.object({
  type: notificationTypeSchema,
  status: z.enum(['unsubscribed', 'already_used']),
});
export type UnsubscribeResult = z.infer<typeof unsubscribeResultSchema>;
