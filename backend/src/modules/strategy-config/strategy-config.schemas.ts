import { z } from 'zod';

const compareOpSchema = z.enum(['>', '<']);
const membershipOpSchema = z.enum(['∈', '∉']);

const operandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('series'),
    key: z.string().min(1).max(64),
    offset: z.number().int().optional(),
  }),
  z.strictObject({ kind: z.literal('param'), key: z.string().min(1).max(64) }),
  z.strictObject({ kind: z.literal('constant'), value: z.number() }),
]);

const compareRuleSchema = z.strictObject({
  id: z.string().min(1).max(32),
  kind: z.enum(['compare', 'cross']),
  lhs: operandSchema,
  op: compareOpSchema,
  rhs: operandSchema,
  allowed_ops: z.array(compareOpSchema).min(1).max(2),
});

const membershipRuleSchema = z.strictObject({
  id: z.string().min(1).max(32),
  kind: z.literal('membership'),
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

/** One side of an indicator; params are display units (`api_scale = 1`). */
const sideConfigSchema = z.strictObject({
  enabled: z.boolean(),
  params: z.record(z.string().min(1).max(64), z.number()),
  rules: z.array(ruleSchema).max(16),
});

export const indicatorConfigSchema = z.strictObject({
  master_enabled: z.boolean(),
  buy: sideConfigSchema,
  sell: sideConfigSchema,
});

const indicatorIdSchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

export const sharedConfigSchema = z.object({
  schema_version: z.literal('2.0'),
  revision: z.number().int().min(1),
  rule_version: z.literal('iqx-rules-2.0'),
  indicators: z.record(z.string(), indicatorConfigSchema),
});

/** Only the listed indicators are replaced; every other saved indicator is kept as is. */
export const sharedConfigPatchSchema = z.strictObject({
  expected_revision: z.number().int().min(0),
  idempotency_key: z.string().min(8).max(128),
  indicators: z
    .record(indicatorIdSchema, indicatorConfigSchema)
    .refine((indicators) => Object.keys(indicators).length > 0, {
      message: 'Cần ít nhất một chỉ báo.',
    }),
});
export type SharedConfigPatchInput = z.infer<typeof sharedConfigPatchSchema>;

export const revisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type RevisionsQuery = z.infer<typeof revisionsQuerySchema>;

const effectiveStatusSchema = z.enum(['pending', 'effective', 'calendar_unavailable']);
const sessionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sharedConfigStateSchema = z.object({
  /** 0 = never saved; `config` is then the registry default. */
  saved_revision: z.number().int().min(0),
  effective_revision: z.number().int().min(1).nullable(),
  effective_session: sessionDateSchema.nullable(),
  status: effectiveStatusSchema,
  config: sharedConfigSchema,
  config_hash: z.string(),
  registry_version: z.string(),
  granted_indicators: z.array(z.string()),
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
});
export const sharedConfigRevisionListSchema = z.array(sharedConfigRevisionSchema);
export type SharedConfigRevisionSummary = z.infer<typeof sharedConfigRevisionSchema>;

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
});

const registrySideSchema = z.object({
  enabled: z.boolean(),
  params: z.record(z.string(), z.number()),
  rules: z.array(ruleSchema),
  field_overrides: z.record(z.string(), registryFieldSchema.partial()).optional(),
});

export const technicalRegistryResponseSchema = z.object({
  calculation_version: z.string(),
  rule_version: z.string(),
  indicators: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      chapter: z.number().int(),
      lesson_id: z.string(),
      family: z.enum(['state', 'event']),
      formula: z.string(),
      availability: z.enum(['ohlcv', 'needs_history_context']),
      fields: z.array(registryFieldSchema),
      buy: registrySideSchema,
      sell: registrySideSchema,
      learned: z.boolean(),
    }),
  ),
});
export type TechnicalRegistryResponse = z.infer<typeof technicalRegistryResponseSchema>;
