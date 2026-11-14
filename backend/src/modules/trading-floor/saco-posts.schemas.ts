/**
 * Hình dữ liệu của API "SACO nhận định" (khớp hợp đồng Khu giao dịch): thời gian là epoch mili-giây,
 * mã định danh là uuid dạng chuỗi, JSON dùng camelCase.
 */

import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

export const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

// ------------------------------------------------------------------ request

export const uuidParamSchema = z.string().uuid();

/** Độ dài thật của câu tiêu điểm do service kiểm tra để trả đúng mã lỗi; ở đây chỉ chặn thân quá lớn. */
export const draftBodySchema = z.strictObject({
  headline: z.string().max(2000),
  // Nhỏ hơn giới hạn thân JSON 1 MB của máy chủ.
  bodyHtml: z.string().max(900_000),
  baseRevision: z.number().int().min(0).max(2_000_000_000),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

export const heartBodySchema = z.strictObject({ on: z.boolean() });
export const commentBodySchema = z.strictObject({ text: z.string().max(5000) });
export const manageListQuerySchema = z.object({
  status: z.enum(['published', 'hidden']).optional(),
});

// ----------------------------------------------------------------- response

export const postStatusSchema = z.enum(['draft', 'published', 'hidden']);

export const postCardSchema = z.object({
  id: z.string(),
  sacoId: z.string(),
  sacoName: z.string(),
  headline: z.string(),
  publishedAt: z.number(),
  hearts: z.number(),
  comments: z.number(),
  hearted: z.boolean(),
});
export type PostCard = z.infer<typeof postCardSchema>;

export const postDetailSchema = postCardSchema.extend({
  bodyHtml: z.string(),
  sacoOnDuty: z.boolean(),
  sacoActive: z.boolean(),
  canModerate: z.boolean(),
  isAuthor: z.boolean(),
});
export type PostDetail = z.infer<typeof postDetailSchema>;

export const postCommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  authorName: z.string(),
  isAuthor: z.boolean(),
  mine: z.boolean(),
  text: z.string(),
  at: z.number(),
  reported: z.boolean(),
});
export type PostComment = z.infer<typeof postCommentSchema>;

export const todayResponseSchema = z.object({ date: z.string(), items: z.array(postCardSchema) });
export const heartResponseSchema = z.object({ hearts: z.number(), hearted: z.boolean() });
export const commentsResponseSchema = z.object({
  total: z.number(),
  items: z.array(postCommentSchema),
});
export const okSchema = z.object({ ok: z.literal(true) });

export const myPostSchema = z.object({
  id: z.string(),
  headline: z.string(),
  status: postStatusSchema,
  savedAt: z.number(),
  publishedAt: z.number().nullable(),
  hearts: z.number(),
  comments: z.number(),
  newComments: z.number(),
});
export type MyPost = z.infer<typeof myPostSchema>;

export const myPostDetailSchema = myPostSchema.extend({
  bodyHtml: z.string(),
  revision: z.number(),
});
export type MyPostDetail = z.infer<typeof myPostDetailSchema>;

export const myPostsResponseSchema = z.object({ items: z.array(myPostSchema) });
export const saveDraftResponseSchema = z.object({ revision: z.number(), savedAt: z.number() });
export const imageResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

export const manageActorRoleSchema = z.enum(['saco', 'admin', 'team_lead']);
export const managePostSchema = z.object({
  id: z.string(),
  sacoId: z.string(),
  sacoName: z.string(),
  leadName: z.string(),
  headline: z.string(),
  status: postStatusSchema,
  publishedAt: z.number().nullable(),
  hearts: z.number(),
  comments: z.number(),
  reports: z.number(),
});
export type ManagePost = z.infer<typeof managePostSchema>;
export const managePostsResponseSchema = z.object({ items: z.array(managePostSchema) });

export const managePostDetailSchema = myPostDetailSchema.extend({
  sacoId: z.string(),
  sacoName: z.string(),
  leadName: z.string(),
  log: z.array(
    z.object({
      action: z.enum(['publish', 'hide', 'unhide']),
      actorName: z.string(),
      actorRole: manageActorRoleSchema,
      at: z.number(),
    }),
  ),
});
export type ManagePostDetail = z.infer<typeof managePostDetailSchema>;

export const commentReportSchema = z.object({
  commentId: z.string(),
  postId: z.string(),
  headline: z.string(),
  sacoName: z.string(),
  authorName: z.string(),
  text: z.string(),
  at: z.number(),
  reports: z.number(),
});
export type CommentReport = z.infer<typeof commentReportSchema>;
export const commentReportsResponseSchema = z.object({ items: z.array(commentReportSchema) });

export const postStateSchema = z.object({
  id: z.string(),
  status: z.enum(['published', 'hidden']),
});
