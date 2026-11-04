import { z } from 'zod';

import { accessModeSchema, chapterIdSchema } from './content/v4/schema.js';

/**
 * HTTP contract of the Academy configs (supplement v4.1 §1.4, §8.3):
 *   - `api/v2/admin/academy-configs`: admin only, list / create / save / delete / preview / change log;
 *   - `api/v2/team/academy-config`: a team lead reads his own group's config, read only (§1.3).
 * The chapter numbers in every response are the learner's `display_no` (§2), computed by the server.
 */

export const ACADEMY_CONFIG_ERROR_CODES = [
  'ACADEMY_CONFIG_NOT_FOUND', // 404
  'ACADEMY_LEADER_NOT_FOUND', // 404 POST for a user without a team lead profile
  'ACADEMY_CONFIG_EXISTS', // 409 the lead already has an own config
  'ACADEMY_CONFIG_DEFAULT_PROTECTED', // 409 the default config cannot be deleted
  'ACADEMY_CONFIG_INVALID', // 422 empty or unknown chapter ids
] as const;

/* ---------------------------------------------------------------------------------------------- requests */

const configFields = {
  mode: accessModeSchema,
  /** Fixed chapter ids (`ch01`..`ch12`); at least one; any order, stored in catalog order. */
  chapter_ids: z.array(chapterIdSchema).min(1).max(24),
};

/** PUT admin/academy-configs/:id and POST admin/academy-configs/preview. */
export const academyConfigWriteSchema = z.strictObject(configFields);
export type AcademyConfigWrite = z.infer<typeof academyConfigWriteSchema>;

/** POST admin/academy-configs: an own config for one team lead. */
export const academyConfigCreateSchema = z.strictObject({ leader_id: z.uuid(), ...configFields });
export type AcademyConfigCreate = z.infer<typeof academyConfigCreateSchema>;

export const academyConfigIdParamSchema = z.uuid();

export const academyConfigLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AcademyConfigLogsQuery = z.output<typeof academyConfigLogsQuerySchema>;

/* --------------------------------------------------------------------------------------------- responses */

/** A chapter of the 12-chapter catalog, as the edit screen lists it (original order and numbers). */
export const academyCatalogChapterSchema = z.object({
  chapter_id: z.string(),
  /** Position in the original catalog (1..12), shown next to the tick box. */
  no: z.number().int(),
  title: z.string(),
  lesson_count: z.number().int(),
  /** The chapter carries the optional Phòng tập thực chiến (it goes with the chapter). */
  has_practice: z.boolean(),
  /** The chapter teaches Dashboard metrics: dropping it leaves their "Học" button without a lesson (spec §4). */
  has_dashboard_metrics: z.boolean(),
});

/** A chapter of a learner's program: the number is the renumbered one. */
export const academyProgramChapterSchema = z.object({
  chapter_id: z.string(),
  display_no: z.number().int(),
  title: z.string(),
  lesson_count: z.number().int(),
  has_practice: z.boolean(),
});

const actorSchema = z.object({ id: z.string(), username: z.string(), full_name: z.string() });

export const academyConfigItemSchema = z.object({
  /** Config row id; null for a team lead that has no own config (he uses the default). */
  id: z.string().nullable(),
  owner_type: z.enum(['default', 'leader']),
  leader: z
    .object({
      user_id: z.string(),
      username: z.string(),
      full_name: z.string(),
      status: z.enum(['active', 'revoked']),
    })
    .nullable(),
  /** "Mặc định" or the lead's name. */
  name: z.string(),
  /** A lead without an own config: `mode` and `chapter_ids` below are the default's ("Theo mặc định"). */
  inherits_default: z.boolean(),
  mode: accessModeSchema,
  /** Fixed ids in catalog order. */
  chapter_ids: z.array(z.string()),
  chapter_count: z.number().int(),
  chapter_total: z.number().int(),
  /** N: required lessons of the chapters ("106 bài học"). */
  required_total: z.number().int(),
  /** Users the config applies to now (the lead himself and live members; admins use the built-in view). */
  user_count: z.number().int(),
  updated_at: z.string().nullable(),
  updated_by: actorSchema.nullable(),
});
export type AcademyConfigItem = z.infer<typeof academyConfigItemSchema>;

export const academyConfigListResponseSchema = z.object({
  catalog_version: z.string(),
  catalog_chapters: z.array(academyCatalogChapterSchema),
  /** The default config first, then the team leads. */
  items: z.array(academyConfigItemSchema),
});
export type AcademyConfigListResponse = z.infer<typeof academyConfigListResponseSchema>;

export const academyConfigPreviewResponseSchema = z.object({
  mode: accessModeSchema,
  chapter_count: z.number().int(),
  chapter_total: z.number().int(),
  required_total: z.number().int(),
  /** Exactly what the group's learners see, renumbered ("Chương 2 · Thương hiệu cá nhân"). */
  chapters: z.array(academyProgramChapterSchema),
  warnings: z.array(
    z.object({
      code: z.literal('DASHBOARD_METRIC_CHAPTER_REMOVED'),
      chapter_id: z.string(),
      title: z.string(),
      message: z.string(),
    }),
  ),
});
export type AcademyConfigPreview = z.infer<typeof academyConfigPreviewResponseSchema>;

const configDataSchema = z.object({ mode: accessModeSchema, chapter_ids: z.array(z.string()) });

export const academyConfigLogsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      action: z.enum(['create', 'update', 'delete']),
      changed_at: z.string(),
      changed_by: actorSchema.nullable(),
      before: configDataSchema.nullable(),
      after: configDataSchema.nullable(),
    }),
  ),
});
export type AcademyConfigLogsResponse = z.infer<typeof academyConfigLogsResponseSchema>;

/** GET team/academy-config: the lead's own group, read only (spec §1.3). */
export const teamAcademyConfigResponseSchema = z.object({
  /** false: the group has no own config and learns with the default. */
  has_own_config: z.boolean(),
  read_only: z.literal(true),
  mode: accessModeSchema,
  chapter_count: z.number().int(),
  chapter_total: z.number().int(),
  required_total: z.number().int(),
  chapters: z.array(academyProgramChapterSchema),
  updated_at: z.string().nullable(),
});
export type TeamAcademyConfigResponse = z.infer<typeof teamAcademyConfigResponseSchema>;
