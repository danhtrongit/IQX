import { z } from 'zod';

import {
  MAX_COMMENT_CHARS,
  MAX_CONDITION_CHARS,
  MAX_CONDITION_LINES,
  MAX_DISPLAY_NAME_CHARS,
} from './bulletin.constants.js';

export const tradeDateSchema = z.iso.date();
export const variantSchema = z.enum(['desktop', 'mobile']);
export const slotParamSchema = z.coerce.number().int().min(1).max(3);

const level = z.number().finite().positive().max(1_000_000).nullable();

/** Nhận định và mức hỗ trợ/kháng cự/kịch bản: quản trị viên nhập, server kiểm giới hạn (§3.4). */
export const bulletinContentSchema = z.object({
  trend: z.string().max(MAX_COMMENT_CHARS),
  momentum: z.string().max(MAX_COMMENT_CHARS),
  liquidity: z.string().max(MAX_COMMENT_CHARS),
  levels: z.object({
    r1: level,
    r2: level,
    s1: level,
    s2: level,
    pa: level,
    pt: level,
    na: level,
    nt: level,
  }),
});
export type BulletinContentInput = z.infer<typeof bulletinContentSchema>;

export const previewBodySchema = z.object({
  variant: variantSchema,
  /** Nội dung đang gõ (chưa lưu); bỏ trống thì dùng nội dung đã lưu. */
  content: bulletinContentSchema.optional(),
});
export type PreviewBody = z.infer<typeof previewBodySchema>;

export const pushSlotBodySchema = z.object({
  result_id: z.uuid(),
  filter_id: z.uuid(),
  filter_version: z.number().int().min(1),
  /** Mã đã chọn. Giới hạn 10 mã và "không rỗng khi có mã đạt" kiểm ở service để báo đúng câu của spec. */
  picks: z.array(z.string().trim().min(1).max(12)).max(200),
  display_name: z.string().trim().min(1).max(MAX_DISPLAY_NAME_CHARS),
  /** Điều kiện in trong bản tin: tóm tắt tiêu chí của Bộ lọc, do giao diện Bộ lọc dựng (`criteriaSummary`). */
  conditions: z.array(z.string().trim().min(1).max(MAX_CONDITION_CHARS)).max(MAX_CONDITION_LINES),
});
export type PushSlotBody = z.infer<typeof pushSlotBodySchema>;

export const bulletinByDateQuerySchema = z.object({ date: tradeDateSchema.optional() });
export type BulletinByDateQuery = z.infer<typeof bulletinByDateQuerySchema>;

export const archiveQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type ArchiveQuery = z.infer<typeof archiveQuerySchema>;

export const trackingQuerySchema = z.object({ slot: slotParamSchema.optional() });
export type TrackingQuery = z.infer<typeof trackingQuerySchema>;

export const fileQuerySchema = z.object({ download: z.enum(['0', '1']).optional() });
export type FileQuery = z.infer<typeof fileQuerySchema>;
