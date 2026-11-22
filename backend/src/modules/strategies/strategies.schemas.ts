import { z } from 'zod';

/**
 * Chiến lược của người dùng (spec Bot và Chiến lược v2.0 §4.3–4.6, §6.2, §10.3; PLAN §6.1).
 * `content` is the D14 shape `{universe, indicators, max_holding, sell_only?}`; its rows are checked
 * by `validateStrategyContent` (strategy-rules), never by a parallel schema here.
 */

export const STRATEGY_NAME_MAX = 40;
export const STRATEGY_LIMIT = 20;

const isoDate = z.iso.date();
const timestamp = z.string();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const symbolList = z.array(z.string());

export const strategyIdSchema = z.uuid();
export const strategyVersionParamSchema = z.coerce.number().int().min(1).max(1_000_000);

/** Name as typed: trimmed, 1–40 characters (§4.4.1). */
export const strategyNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên chiến lược.')
  .max(STRATEGY_NAME_MAX, `Tên chiến lược tối đa ${STRATEGY_NAME_MAX} ký tự.`);

const universeSchema = z.union([
  z.object({ type: z.enum(['vn30', 'vn100']) }),
  z.object({
    type: z.literal('saved_list'),
    list_id: z.string(),
    list_name: z.string(),
    symbols: symbolList,
  }),
]);

/** Content as accepted on input (checked in full by the rules validator). */
export const strategyContentInputSchema = z.object({
  universe: universeSchema,
  indicators: z.record(z.string(), z.unknown()),
  max_holding: z.number(),
  sell_only: z.boolean().optional(),
});

export const strategyContentSchema = z.object({
  universe: universeSchema,
  indicators: z.record(z.string(), z.record(z.string(), z.unknown())),
  max_holding: z.number().int(),
  sell_only: z.boolean().optional(),
});

/** `apply_next` = "Lưu và áp dụng phiên tới" (§4.4.2): written to the Bot's next session in the same transaction. */
const applyFields = {
  apply_next: z.boolean().optional(),
  expected_next_session: isoDate.optional(),
  confirm_due_positions: z.array(z.string().trim().min(1).max(20)).max(200).optional(),
};

const requireNextSession = (
  value: { apply_next?: boolean | undefined; expected_next_session?: string | undefined },
  context: z.RefinementCtx,
) => {
  if (value.apply_next && !value.expected_next_session)
    context.addIssue({
      code: 'custom',
      path: ['expected_next_session'],
      message: 'Cần phiên tới đang hiển thị để áp dụng cho Bot.',
    });
};

export const strategyCreateBodySchema = z
  .strictObject({
    name: strategyNameSchema,
    content: strategyContentInputSchema,
    from_run_id: z.uuid(),
    ...applyFields,
  })
  .superRefine(requireNextSession);
export type StrategyCreateBody = z.infer<typeof strategyCreateBodySchema>;

export const strategyRenameBodySchema = z.strictObject({ name: strategyNameSchema });
export type StrategyRenameBody = z.infer<typeof strategyRenameBodySchema>;

export const strategyVersionCreateBodySchema = z
  .strictObject({
    content: strategyContentInputSchema,
    from_run_id: z.uuid(),
    expected_latest_version: z.number().int().min(1),
    ...applyFields,
  })
  .superRefine(requireNextSession);
export type StrategyVersionCreateBody = z.infer<typeof strategyVersionCreateBodySchema>;

export const strategyRestoreBodySchema = z
  .strictObject({
    expected_latest_version: z.number().int().min(1),
    ...applyFields,
  })
  .superRefine(requireNextSession);
export type StrategyRestoreBody = z.infer<typeof strategyRestoreBodySchema>;

// ---------------------------------------------------------------------------------------------
// Responses

export const onBotSchema = z.object({ last: z.boolean(), next: z.boolean() });

export const strategyListItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  latest_version: z.number().int(),
  latest_saved_at: timestamp,
  universe_label: z.string(),
  universe_count: z.number().int().nullable(),
  sell_only: z.boolean(),
  on_bot: onBotSchema,
});

export const strategyListSchema = z.object({
  items: z.array(strategyListItemSchema),
  limit: z.literal(STRATEGY_LIMIT),
});

export const strategyVersionSummarySchema = z.object({
  version: z.number().int(),
  created_at: timestamp,
  /** `bản dd/mm HH:mm` (giờ Việt Nam). */
  version_label: z.string(),
  note: z.string().nullable(),
  universe_label: z.string(),
  max_holding: z.number().int(),
  from_run_id: z.uuid().nullable(),
  on_bot: onBotSchema,
});

export const strategyVersionListSchema = z.object({
  strategy_id: z.uuid(),
  name: z.string(),
  latest_version: z.number().int(),
  items: z.array(strategyVersionSummarySchema),
});

export const strategyVersionDetailSchema = z.object({
  strategy_id: z.uuid(),
  name: z.string(),
  version: z.number().int(),
  version_label: z.string(),
  content: strategyContentSchema,
  config_hash: hashSchema,
  created_at: timestamp,
  note: z.string().nullable(),
  from_run_id: z.uuid().nullable(),
});

export const strategyViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  latest_version: z.number().int(),
  sell_only: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});

/** POST /strategies, POST …/versions, POST …/restore. `schedule` is the Bot port's answer when applied. */
export const strategySaveResultSchema = z.object({
  strategy: strategyViewSchema,
  version: strategyVersionDetailSchema,
  schedule: z.unknown().nullable(),
});

export const storeMetaSchema = z.object({
  data_store: z.literal('flashback_vn100'),
  data_as_of: isoDate.nullable(),
  earliest_start: isoDate.nullable(),
  price_unit: z.literal('VND'),
  adjusted: z.boolean(),
  sessions: z.number().int(),
  /** Default range of the form: `Đến ngày` = data_as_of, `Từ ngày` 2 years back (bounded). */
  default_start: isoDate.nullable(),
  default_end: isoDate.nullable(),
  max_range_days: z.number().int(),
});

export const universeOptionsSchema = z.object({
  vn30: z.object({ symbols: symbolList }),
  vn100: z.object({ symbols: symbolList }),
  saved_lists: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      symbols_total: z.number().int(),
      symbols_kept: symbolList,
      excluded: symbolList,
    }),
  ),
});
