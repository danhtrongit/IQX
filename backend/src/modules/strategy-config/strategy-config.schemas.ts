import { z } from 'zod';

import {
  CONDITION_INDICATOR_IDS,
  CURRENT_INDICATOR_IDS,
  RULE_VERSION,
  SCHEMA_VERSION,
} from '../quant/v2/types.js';

const compareOpSchema = z.enum([
  '>',
  '<',
  'cross_up',
  'cross_down',
  'reenter_lower',
  'reenter_upper',
  'break_upper',
  'break_lower',
  'cross_up_middle',
  'cross_down_middle',
  'break_high',
  'break_low',
]);
const membershipOpSchema = z.enum(['∈', '∉']);

const operandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('series'),
    key: z.string().min(1).max(64),
    offset: z.number().int().optional(),
    offset_param: z.string().min(1).max(64).optional(),
  }),
  z.strictObject({ kind: z.literal('param'), key: z.string().min(1).max(64) }),
  z.strictObject({ kind: z.literal('constant'), value: z.number() }),
]);

const compareRuleSchema = z.strictObject({
  id: z.string().min(1).max(32),
  kind: z.enum(['compare', 'cross']),
  enabled: z.boolean().optional(),
  lhs: operandSchema,
  op: compareOpSchema,
  rhs: operandSchema,
  allowed_ops: z.array(compareOpSchema).min(1).max(8),
});

const membershipRuleSchema = z.strictObject({
  id: z.string().min(1).max(32),
  kind: z.literal('membership'),
  enabled: z.boolean().optional(),
  lhs: operandSchema,
  op: membershipOpSchema,
  rhs: z.strictObject({
    kind: z.literal('interval').optional(),
    lower: operandSchema,
    upper: operandSchema,
    bounds: z.literal('open').optional(),
  }),
  allowed_ops: z.array(membershipOpSchema).min(1).max(2),
});

const ruleSchema = z.union([compareRuleSchema, membershipRuleSchema]);

/** Volume side (`legacy_params`): params are display units (`api_scale = 1`). */
const paramsSideSchema = z.strictObject({
  enabled: z.boolean(),
  params: z.record(z.string().min(1).max(64), z.number()),
  rules: z.array(ruleSchema).max(16),
});

/**
 * One condition row (SPEC V3 §1.4): stable `id`, own switch and own values (numbers, enum
 * codes). Field keys, ranges, options and fast < slow are checked by the shared validator so
 * the 422 carries the per-row Vietnamese message and path.
 */
const conditionRowSchema = z
  .object({ id: z.string().min(1).max(64), enabled: z.boolean() })
  .catchall(z.union([z.number(), z.string().max(32), z.boolean()]));

/** Tab of a row-based indicator: no side-level params. */
const rowSideSchema = z.strictObject({
  enabled: z.boolean(),
  rules: z.array(conditionRowSchema).max(8),
});

const sideConfigSchema = z.union([rowSideSchema, paramsSideSchema]);

/**
 * Rows for the 15 row-based indicators, params + rules for Volume; which one an indicator must
 * use is checked on the `indicators` record.
 */
export const indicatorConfigSchema = z.strictObject({
  master_enabled: z.boolean(),
  buy: sideConfigSchema,
  sell: sideConfigSchema,
});

const ROW_INDICATOR_IDS: ReadonlySet<string> = new Set(CONDITION_INDICATOR_IDS);
const PARAMS_INDICATOR_IDS: ReadonlySet<string> = new Set(
  CURRENT_INDICATOR_IDS.filter((id) => !ROW_INDICATOR_IDS.has(id)),
);
const OUTDATED_FORMAT_MESSAGE =
  'Định dạng điều kiện cũ không còn được hỗ trợ. Tải lại để dùng mẫu điều kiện mới.';

/**
 * Each current indicator must use its own model (SPEC V3 §6.1.5: the old side-level params of
 * the 15 row-based indicators are rejected, never mapped). Unknown ids are left to the service
 * (422 CONFIG_INVALID "Chỉ báo không được hỗ trợ").
 */
const indicatorsRecordSchema = (key: z.ZodType<string>) =>
  z.record(key, indicatorConfigSchema).superRefine((indicators, ctx) => {
    for (const [id, value] of Object.entries(indicators)) {
      const rows = !('params' in value.buy) && !('params' in value.sell);
      const params = 'params' in value.buy && 'params' in value.sell;
      if ((ROW_INDICATOR_IDS.has(id) && !rows) || (PARAMS_INDICATOR_IDS.has(id) && !params)) {
        ctx.addIssue({ code: 'custom', path: [id], message: OUTDATED_FORMAT_MESSAGE });
      }
    }
  });

const indicatorIdSchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

/** The current contract: `iqx-rules-4.0`, exactly the 16 indicators of the Bot registry. */
export const sharedConfigSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  revision: z.number().int().min(1),
  rule_version: z.literal(RULE_VERSION),
  indicators: indicatorsRecordSchema(z.string()),
});

const legacySideReviewSchema = z.object({
  status: z.enum(['ok', 'legacy_needs_review']),
  /** Removed indicators that were master ON with this side ON. */
  indicators: z.array(z.string()),
});

/**
 * Present when the stored revision is outdated (`iqx-rules-3.0`, `iqx-rules-2.0` or unreadable).
 * `config` is then the SPEC V3 reset of it (defaults + the user's switches, `reset: true`) and
 * both sides are `legacy_needs_review`: nothing is traded on it until the user saves again.
 */
export const legacyConfigReviewSchema = z.object({
  from_rule_version: z.string(),
  legacy: z.boolean(),
  /** true when the conditions were reset to the SPEC V3 defaults. */
  reset: z.boolean(),
  removed_indicators: z.array(z.string()),
  defaulted_indicators: z.array(z.string()),
  buy: legacySideReviewSchema,
  sell: legacySideReviewSchema,
  needs_review: z.boolean(),
});

/** Only the listed indicators are replaced; every other saved indicator is kept as is. */
export const sharedConfigPatchSchema = z.strictObject({
  expected_revision: z.number().int().min(0),
  idempotency_key: z.string().min(8).max(128),
  indicators: indicatorsRecordSchema(indicatorIdSchema).refine(
    (indicators) => Object.keys(indicators).length > 0,
    { message: 'Cần ít nhất một chỉ báo.' },
  ),
});
export type SharedConfigPatchInput = z.infer<typeof sharedConfigPatchSchema>;

export const revisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type RevisionsQuery = z.infer<typeof revisionsQuerySchema>;

const effectiveStatusSchema = z.enum(['pending', 'effective', 'calendar_unavailable']);
const sessionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The revision the Bot (and Backtest) actually use today: the latest saved revision whose
 * effective session has started. `config` is always the current shape; `outdated`/`legacy`
 * describe an outdated stored document, exactly like the top-level fields.
 */
export const effectiveSharedConfigSchema = z.object({
  revision: z.number().int().min(1),
  effective_session: sessionDateSchema,
  config_hash: z.string(),
  config: sharedConfigSchema,
  outdated: z.boolean(),
  legacy: legacyConfigReviewSchema.nullable(),
});
export type EffectiveSharedConfigView = z.infer<typeof effectiveSharedConfigSchema>;

export const sharedConfigStateSchema = z.object({
  /** 0 = never saved; `config` is then the registry default. */
  saved_revision: z.number().int().min(0),
  effective_revision: z.number().int().min(1).nullable(),
  effective_session: sessionDateSchema.nullable(),
  status: effectiveStatusSchema,
  /** The latest SAVED config (what the form edits), not necessarily the one in force. */
  config: sharedConfigSchema,
  config_hash: z.string(),
  registry_version: z.string(),
  granted_indicators: z.array(z.string()),
  /**
   * true when the latest saved revision is outdated (SPEC V3 §6.1): `config` is then the new
   * defaults with the user's switches, and saving it resumes a Bot paused by the upgrade.
   */
  outdated: z.boolean(),
  /** null/absent unless the latest saved revision is outdated. */
  legacy: legacyConfigReviewSchema.nullable().optional(),
  /**
   * Full config in force today, present whenever `effective_revision` is not null (it equals
   * `config` when no newer revision is pending); null before any revision became effective.
   */
  effective: effectiveSharedConfigSchema.nullable().optional(),
});
export type SharedConfigState = z.infer<typeof sharedConfigStateSchema>;

export const sharedConfigSaveResultSchema = z.object({
  revision: z.number().int().min(1),
  config: sharedConfigSchema,
  config_hash: z.string(),
  effective_session: sessionDateSchema.nullable(),
  status: effectiveStatusSchema,
});
export type SharedConfigSaveResult = z.infer<typeof sharedConfigSaveResultSchema>;

export const sharedConfigRevisionSchema = z.object({
  revision: z.number().int().min(1),
  saved_at: z.string(),
  config_hash: z.string(),
  effective_session: sessionDateSchema.nullable(),
  status: effectiveStatusSchema,
  /** true for a revision that is not in the current format or carries removed indicators. */
  legacy: z.boolean(),
  /** true for an outdated revision (`iqx-rules-3.0`, `iqx-rules-2.0`); still listed. */
  outdated: z.boolean(),
});
export const sharedConfigRevisionListSchema = z.array(sharedConfigRevisionSchema);
export type SharedConfigRevisionSummary = z.infer<typeof sharedConfigRevisionSchema>;

/** Volume param field (`legacy_params`). */
const registryFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['integer', 'number']),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  unit: z.string(),
  api_scale: z.number(),
  wire_unit: z.string(),
  options: z.array(z.number()).optional(),
});

const registryCrossFieldSchema = z.object({
  left: z.string(),
  op: compareOpSchema,
  right: z.string(),
});

const registrySideSchema = z.object({
  enabled: z.boolean(),
  params: z.record(z.string(), z.number()),
  rules: z.array(ruleSchema),
  field_overrides: z.record(z.string(), registryFieldSchema.partial()).optional(),
});

/** Numeric input of a row; `options` restricts it to a fixed list (SMA presets). */
const rowNumberFieldSchema = z.object({
  key: z.string(),
  /** Field label; also the subject of the validation messages. */
  label: z.string(),
  type: z.enum(['integer', 'number']),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  options: z.array(z.number()).optional(),
});

/** Select input of a row: stable `value` codes with their Vietnamese `label`. */
const rowEnumFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.literal('enum'),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
});

const rowValuesSchema = z.record(z.string(), z.union([z.number(), z.string()]));

/**
 * One condition row (SPEC V3 §3). `sentence` is the row text with `{field}` placeholders in
 * `fields` order (e.g. `"RSI {period} {op} {threshold}"`); `constraints` are `left < right`
 * (fast < slow); `buy`/`sell` are the default values and `default_enabled` the default switch.
 */
const registryRowSchema = z.object({
  id: z.string(),
  sentence: z.string(),
  fields: z.array(z.union([rowNumberFieldSchema, rowEnumFieldSchema])),
  constraints: z.array(z.object({ left: z.string(), op: z.literal('<'), right: z.string() })),
  default_enabled: z.boolean(),
  buy: rowValuesSchema,
  sell: rowValuesSchema,
});

const registryIndicatorBase = {
  id: z.string(),
  name: z.string(),
  chapter: z.number().int(),
  lesson_id: z.string().nullable(),
  family: z.enum(['state', 'event']),
  formula: z.string(),
  availability: z.enum(['ohlcv', 'needs_history_context']),
  learned: z.boolean(),
};

/** The 15 row-based indicators: every tab is the list of `rows`, in this order. */
const registryRowsIndicatorSchema = z.object({
  ...registryIndicatorBase,
  model: z.literal('rows'),
  rows: z.array(registryRowSchema),
});

/** Volume: side-level params and rule templates, unchanged by SPEC V3. */
const registryParamsIndicatorSchema = z.object({
  ...registryIndicatorBase,
  model: z.literal('legacy_params'),
  fields: z.array(registryFieldSchema),
  /** `cross_fields` are enforced on save, e.g. `fast < slow`; empty when none apply. */
  validation: z.object({ cross_fields: z.array(registryCrossFieldSchema) }),
  buy: registrySideSchema,
  sell: registrySideSchema,
});

export const technicalRegistryResponseSchema = z.object({
  calculation_version: z.string(),
  rule_version: z.string(),
  indicators: z.array(
    z.discriminatedUnion('model', [registryRowsIndicatorSchema, registryParamsIndicatorSchema]),
  ),
});
export type TechnicalRegistryResponse = z.infer<typeof technicalRegistryResponseSchema>;
