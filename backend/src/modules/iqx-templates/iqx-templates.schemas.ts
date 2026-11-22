import { z } from 'zod';

/**
 * Bộ lọc IQX / Chiến lược IQX (spec Tab IQX §4, §5). A template is a set of values for the existing
 * Bộ lọc 4.0 form or Bot condition form; its `content` is validated with those forms' own
 * validators (`iqx-templates.validation.ts`), never with a parallel schema.
 */
export const IQX_TEMPLATE_KINDS = ['filter', 'strategy'] as const;
export type IqxTemplateKind = (typeof IQX_TEMPLATE_KINDS)[number];

/** Field limits of the admin info frame (§5.3). */
export const IQX_FIELD_LIMITS = { name: 40, idea: 140, origin: 120, when_wrong: 200 } as const;
/** Giữ tối đa of a Chiến lược IQX (§5.4). */
export const IQX_MAX_HOLDING = { min: 3, max: 250 } as const;
/** Largest stored draft (bytes of JSON): a draft is a form state, never a bulk payload. */
export const IQX_DRAFT_MAX_BYTES = 200_000;

const kindSchema = z.enum(IQX_TEMPLATE_KINDS);
const reasonSchema = z.string().trim().min(1, 'Nhập lý do thay đổi.').max(500);
const timestamp = z.string();

export const iqxTemplateIdSchema = z.uuid();
export const iqxKindQuerySchema = z.strictObject({ kind: kindSchema });
export type IqxKindQuery = z.infer<typeof iqxKindQuerySchema>;

/**
 * What an admin is composing: the info fields as typed and the form's definition. Only the name
 * is required to save a draft; everything is re-checked in full at publish.
 */
export const iqxDraftSchema = z
  .looseObject({
    name: z.string().trim().min(1, 'Nhập tên.').max(200),
    idea: z.string().max(2000).optional(),
    origin: z.string().max(2000).optional(),
    when_wrong: z.string().max(2000).optional(),
    pair_slug: z.string().max(64).nullable().optional(),
    definition: z.unknown().optional(),
  })
  .refine((value) => JSON.stringify(value).length <= IQX_DRAFT_MAX_BYTES, {
    message: 'Bản nháp quá lớn.',
  });
export type IqxDraft = z.infer<typeof iqxDraftSchema>;

/** Body of a publish: the full content, checked like §5.3 / §5.4 (422 IQX_TEMPLATE_INVALID). */
export const iqxContentInputSchema = z.looseObject({
  name: z.string(),
  idea: z.string(),
  origin: z.string(),
  when_wrong: z.string(),
  pair_slug: z.string().nullable().optional(),
  definition: z.unknown(),
});

export const iqxCreateBodySchema = z.strictObject({ kind: kindSchema, draft: iqxDraftSchema });
export type IqxCreateBody = z.infer<typeof iqxCreateBodySchema>;

export const iqxDraftBodySchema = z.strictObject({
  draft: iqxDraftSchema,
  /** `draft_updated_at` the admin loaded (null when the item had no draft): a newer one is a 409. */
  draft_updated_at: z.string().nullable(),
});
export type IqxDraftBody = z.infer<typeof iqxDraftBodySchema>;

export const iqxPublishBodySchema = z.strictObject({
  content: iqxContentInputSchema,
  reason: reasonSchema,
  /** `current_version` the admin loaded (null for a never published item). */
  expected_version: z.number().int().min(1).nullable(),
  draft_updated_at: z.string().nullable().optional(),
});
export type IqxPublishBody = z.infer<typeof iqxPublishBodySchema>;

export const iqxReasonBodySchema = z.strictObject({ reason: reasonSchema });
export type IqxReasonBody = z.infer<typeof iqxReasonBodySchema>;

export const iqxOrderBodySchema = z.strictObject({
  kind: kindSchema,
  ids: z.array(z.uuid()).min(1).max(200),
});
export type IqxOrderBody = z.infer<typeof iqxOrderBodySchema>;

export const iqxRestoreBodySchema = z.strictObject({ version: z.number().int().min(1) });
export type IqxRestoreBody = z.infer<typeof iqxRestoreBodySchema>;

export const iqxUsedBodySchema = z.strictObject({ version: z.number().int().min(1) });
export type IqxUsedBody = z.infer<typeof iqxUsedBodySchema>;

// ---------------------------------------------------------------------------
// Responses (OpenAPI; the services build exactly these shapes).

/** Bot condition record of a Chiến lược IQX (Chỉ báo v3 §1.4): only the indicators it uses. */
const indicatorsRecordSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export const iqxUniverseSchema = z.object({ type: z.enum(['vn30', 'vn100']) });

export const iqxStrategyDefinitionSchema = z.object({
  universe: iqxUniverseSchema,
  indicators: indicatorsRecordSchema,
  max_holding: z.number().int(),
});

const contentBase = {
  name: z.string(),
  idea: z.string(),
  origin: z.string(),
  when_wrong: z.string(),
};

/** Definition 4.0 of a Bộ lọc IQX (same document as a saved filter, `columns` empty). */
const filterDefinitionView = z.looseObject({
  schema_version: z.string(),
  name: z.string(),
  logic: z.string(),
  data_mode: z.string().optional(),
  market: z.record(z.string(), z.unknown()),
  rules: z.array(z.record(z.string(), z.unknown())),
  technical: z.array(z.record(z.string(), z.unknown())),
  columns: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const iqxFilterContentSchema = z.object({
  ...contentBase,
  pair_slug: z.string().nullable(),
  definition: filterDefinitionView,
});
export const iqxStrategyContentSchema = z.object({
  ...contentBase,
  definition: iqxStrategyDefinitionSchema,
});

const pairSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  version: z.number().int(),
});

export const iqxPublishedFilterSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  kind: z.literal('filter'),
  version: z.number().int(),
  content: iqxFilterContentSchema,
  /** The paired Chiến lược IQX when it is published and shown; null otherwise (§5.5). */
  pair: pairSchema.nullable(),
});
export const iqxOnBotSchema = z.object({ last: z.boolean(), next: z.boolean() });

export const iqxPublishedStrategySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  kind: z.literal('strategy'),
  version: z.number().int(),
  current_version: z.number().int(),
  content: iqxStrategyContentSchema,
  pair: z.null(),
  universe: iqxUniverseSchema,
  max_holding: z.number().int(),
  /** Bot của người dùng: phiên gần nhất / phiên tới dùng chiến lược này. */
  on_bot: iqxOnBotSchema,
});
export const iqxPublishedListSchema = z.object({
  kind: kindSchema,
  items: z.array(z.union([iqxPublishedFilterSchema, iqxPublishedStrategySchema])),
});

const actorSchema = z.object({ id: z.uuid().nullable(), name: z.string() }).nullable();

export const iqxAdminListItemSchema = z.object({
  id: z.uuid(),
  kind: kindSchema,
  slug: z.string(),
  sort_order: z.number().int(),
  visibility: z.enum(['shown', 'hidden']),
  status: z.enum(['shown', 'hidden', 'unpublished']),
  current_version: z.number().int().nullable(),
  name: z.string(),
  idea: z.string(),
  has_draft: z.boolean(),
  draft_updated_at: timestamp.nullable(),
  updated_at: timestamp,
  updated_by: actorSchema,
  used_30d: z.number().int(),
  /** Chiến lược IQX only (null for Bộ lọc IQX), spec v2.0 §7.2. */
  universe: iqxUniverseSchema.nullable(),
  max_holding: z.number().int().nullable(),
  /** Bots whose next session uses this strategy. */
  bots_using: z.number().int().nullable(),
  trial_runs_30d: z.number().int().nullable(),
});
export const iqxAdminListSchema = z.object({
  kind: kindSchema,
  items: z.array(iqxAdminListItemSchema),
});

const historyEntrySchema = z.object({
  action: z.enum([
    'create',
    'draft_save',
    'publish',
    'hide',
    'show',
    'reorder',
    'delete_draft',
    'restore',
  ]),
  at: timestamp,
  by: actorSchema,
  reason: z.string().nullable(),
  version: z.number().int().nullable(),
});

export const iqxAdminDetailSchema = iqxAdminListItemSchema.extend({
  draft: z.record(z.string(), z.unknown()).nullable(),
  draft_updated_by: actorSchema,
  current: z
    .object({
      version: z.number().int(),
      content: z.record(z.string(), z.unknown()),
      published_at: timestamp,
      published_by: actorSchema,
      reason: z.string(),
    })
    .nullable(),
  versions: z.array(
    z.object({
      version: z.number().int(),
      content: z.record(z.string(), z.unknown()),
      published_at: timestamp,
      published_by: actorSchema,
      reason: z.string(),
    }),
  ),
  history: z.array(historyEntrySchema),
});

export const iqxDeletedSchema = z.object({ id: z.uuid(), deleted: z.literal(true) });
export const iqxUsedResponseSchema = z.object({ recorded: z.literal(true) });

export const iqxVersionParamSchema = z.coerce.number().int().min(1).max(1_000_000);

/** Lịch sử phiên bản of a Chiến lược IQX for users (§4.2): read-only. */
export const iqxUserVersionListSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  current_version: z.number().int(),
  hidden: z.boolean(),
  on_bot: iqxOnBotSchema,
  items: z.array(
    z.object({
      version: z.number().int(),
      published_at: timestamp,
      reason: z.string(),
      current: z.boolean(),
    }),
  ),
});

export const iqxUserVersionDetailSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  version: z.number().int(),
  current_version: z.number().int(),
  hidden: z.boolean(),
  published_at: timestamp,
  reason: z.string(),
  /** As published (v1 rows have no `definition.universe`). */
  content: z.record(z.string(), z.unknown()),
  /** Content as the rules run it (v1 rows without a basket read as VN30). */
  strategy_content: z.object({
    universe: iqxUniverseSchema,
    indicators: indicatorsRecordSchema,
    max_holding: z.number().int(),
  }),
});
