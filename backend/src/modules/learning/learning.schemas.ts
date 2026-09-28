import { z } from 'zod';

const slug = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const uuid = z.string().uuid();
const queryBoolean = z.preprocess((value) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean());

export const courseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().max(60).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  is_premium: queryBoolean.optional(),
  is_published: queryBoolean.optional(),
  search: z.string().max(200).optional(),
});

export const courseCreateSchema = z.object({
  slug,
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  category: z.string().trim().min(1).max(60),
  is_premium: z.boolean().default(false),
  is_published: z.boolean().default(false),
});

export const courseUpdateSchema = z.object({
  slug: slug.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  is_premium: z.boolean().optional(),
  is_published: z.boolean().optional(),
});

export const episodeCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().nullable().optional(),
    content_type: z.enum(['pdf', 'video', 'text']),
    markdown_body: z
      .string()
      .max(200 * 1024)
      .nullable()
      .optional(),
    sort_order: z.number().int().min(1).optional(),
  })
  .refine((value) => value.content_type !== 'text' || Boolean(value.markdown_body), {
    message: 'Nội dung text yêu cầu markdown_body',
    path: ['markdown_body'],
  })
  .refine((value) => value.content_type === 'text' || !value.markdown_body, {
    message: 'Chỉ nội dung text mới có markdown_body',
    path: ['markdown_body'],
  });

export const episodeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  markdown_body: z
    .string()
    .max(200 * 1024)
    .nullable()
    .optional(),
  sort_order: z.number().int().min(1).optional(),
  is_published: z.boolean().optional(),
});

export const progressUpdateSchema = z.object({
  completed: z.boolean().optional(),
  last_position_seconds: z.number().int().min(0).nullable().optional(),
});

export const progressQuerySchema = z.object({ course_id: uuid });
export const reorderSchema = z.object({
  items: z
    .array(z.object({ episode_id: uuid, sort_order: z.number().int().min(1) }))
    .min(1)
    .refine((items) => new Set(items.map((item) => item.episode_id)).size === items.length, {
      message: 'episode_id không được trùng lặp',
    })
    .refine((items) => new Set(items.map((item) => item.sort_order)).size === items.length, {
      message: 'sort_order không được trùng lặp',
    }),
});

export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
export type CourseCreate = z.infer<typeof courseCreateSchema>;
export type CourseUpdate = z.infer<typeof courseUpdateSchema>;
export type EpisodeCreate = z.infer<typeof episodeCreateSchema>;
export type EpisodeUpdate = z.infer<typeof episodeUpdateSchema>;
export type ProgressUpdate = z.infer<typeof progressUpdateSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
