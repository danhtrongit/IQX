import { z } from 'zod';

const alertName = z.string().trim().min(1).max(120);
const idempotencyKey = z.string().min(8).max(128);
const symbol = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());
const uniqueSymbols = (max: number) =>
  z
    .array(symbol)
    .min(1)
    .max(max)
    .transform((values) => [...new Set(values)]);
const side = z.enum(['buy', 'sell']);
const sides = z
  .array(side)
  .min(1)
  .max(2)
  .transform((values) => [...new Set(values)]);

export const MAX_ALERT_SYMBOLS = 500;

const sharedConfigSource = z.strictObject({
  kind: z.literal('shared_config'),
  /** A saved (server-confirmed) shared-config revision of the caller. */
  revision: z.number().int().min(1),
});
const backtestRunSource = z.strictObject({
  kind: z.literal('backtest_run'),
  /** A succeeded backtest run of the caller: its own pinned config, not the current form. */
  run_id: z.uuid(),
});

/** Where the conditions are pinned from. */
export const alertSourceInputSchema = z.discriminatedUnion('kind', [
  sharedConfigSource,
  backtestRunSource,
]);
export type AlertSourceInput = z.infer<typeof alertSourceInputSchema>;

export const alertSourceUpdateSchema = z.discriminatedUnion('kind', [
  sharedConfigSource,
  backtestRunSource,
  /** Keep the pinned conditions (renaming never moves to a newer config). */
  z.strictObject({ kind: z.literal('keep') }),
]);

/** Watched scope: one or several tickers, or a saved list (optionally a subset of its tickers). */
export const alertScopeInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('symbols'), symbols: uniqueSymbols(MAX_ALERT_SYMBOLS) }),
  z.strictObject({
    kind: z.literal('saved_list'),
    list_id: z.uuid(),
    symbols: uniqueSymbols(MAX_ALERT_SYMBOLS).optional(),
  }),
]);
export type AlertScopeInput = z.infer<typeof alertScopeInputSchema>;

export const strategyAlertCreateSchema = z.strictObject({
  name: alertName,
  source: alertSourceInputSchema,
  scope: alertScopeInputSchema,
  /** Only sides that have a valid, non-empty condition set in the pinned snapshot. */
  sides,
  enabled: z.boolean().default(true),
  idempotency_key: idempotencyKey.optional(),
});
export type StrategyAlertCreateInput = z.infer<typeof strategyAlertCreateSchema>;

/**
 * `name` and `enabled` never create a version. Any of `source` / `scope` / `sides` that changes the
 * definition creates `alert_definition_version + 1`; unchanged input is a no-op.
 */
export const strategyAlertUpdateSchema = z
  .strictObject({
    name: alertName.optional(),
    enabled: z.boolean().optional(),
    source: alertSourceUpdateSchema.optional(),
    scope: alertScopeInputSchema.optional(),
    sides: sides.optional(),
    /** Optimistic concurrency for definition edits. */
    expected_version: z.number().int().min(1).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.enabled !== undefined ||
      value.source !== undefined ||
      value.scope !== undefined ||
      value.sides !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  );
export type StrategyAlertUpdateInput = z.infer<typeof strategyAlertUpdateSchema>;

export const strategyAlertIdSchema = z.uuid();

export const strategyAlertSourcePreviewSchema = z.strictObject({ source: alertSourceInputSchema });
export type StrategyAlertSourcePreviewInput = z.infer<typeof strategyAlertSourcePreviewSchema>;

export const strategyAlertEventsQuerySchema = z.object({
  side: side.optional(),
  alert_id: z.uuid().optional(),
  symbol: symbol.optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type StrategyAlertEventsQuery = z.infer<typeof strategyAlertEventsQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Responses (OpenAPI documentation; the service builds these shapes).

const timestamp = z.string();

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('shared_config'),
    revision: z.number().int(),
    saved_at: z.string(),
    stored_config_hash: z.string(),
  }),
  z.object({
    kind: z.literal('backtest_run'),
    run_id: z.uuid(),
    shared_revision: z.number().int(),
    symbol: z.string(),
    start: z.string(),
    end: z.string(),
    run_created_at: z.string(),
  }),
]);

const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('symbols') }),
  z.object({
    kind: z.literal('saved_list'),
    list_id: z.uuid(),
    /** Lists are immutable snapshots: their version is always 1. */
    list_version: z.literal(1),
    list_name: z.string(),
    list_as_of: z.string(),
    list_ticker_count: z.number().int(),
  }),
]);

const sideDetailSchema = z.object({
  /** The pinned snapshot has a non-empty condition set for this side. */
  valid: z.boolean(),
  watched: z.boolean(),
  indicator_ids: z.array(z.string()),
});

export const alertStatusSchema = z.enum([
  'watching',
  'paused',
  'unchecked',
  'waiting_data',
  'config_error',
]);

const versionSchema = z.object({
  version: z.number().int(),
  source: sourceSchema,
  config_hash: z.string(),
  schema_version: z.string(),
  rule_version: z.string(),
  calculation_version: z.string(),
  scope: scopeSchema,
  symbols: z.array(z.string()),
  sides: z.array(side),
  sides_detail: z.object({ buy: sideDetailSchema, sell: sideDetailSchema }),
  definition_hash: z.string(),
  created_at: timestamp,
});

const lastCheckSchema = z.object({
  session: z.string().nullable(),
  evaluated_at: timestamp.nullable(),
  pairs_expected: z.number().int(),
  pairs_checked: z.number().int(),
  satisfied: z.number().int(),
  not_satisfied: z.number().int(),
  unknown: z.number().int(),
  blocked: z.number().int(),
});

export const strategyAlertSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  enabled: z.boolean(),
  /**
   * watching = enabled with at least one valid check; paused = disabled; unchecked = enabled, no
   * check yet; waiting_data = latest check could not evaluate some pairs; config_error =
   * a pair is blocked by a missing grant or an invalid pinned config. Independent of whether the
   * worker last ran successfully.
   */
  status: alertStatusSchema,
  /** `alert_definition_version`: bumped when conditions, scope or sides change; never by rename. */
  current_version: z.number().int(),
  observation_started_at: timestamp,
  paused_at: timestamp.nullable(),
  version: versionSchema,
  last_check: lastCheckSchema,
  created_at: timestamp,
  updated_at: timestamp,
});
export type StrategyAlertView = z.infer<typeof strategyAlertSchema>;

export const strategyAlertListSchema = z.object({ items: z.array(strategyAlertSchema) });

export const strategyAlertDetailSchema = strategyAlertSchema.extend({
  /** Every immutable version, newest first (the evidence of older events). */
  versions: z.array(versionSchema),
});
export type StrategyAlertDetailView = z.infer<typeof strategyAlertDetailSchema>;

export const strategyAlertSourcePreviewResponseSchema = z.object({
  source: sourceSchema,
  config_hash: z.string(),
  rule_version: z.string(),
  calculation_version: z.string(),
  sides_detail: z.object({ buy: sideDetailSchema, sell: sideDetailSchema }),
  /** Symbol of the backtest run (a convenient default scope), when the source is a run. */
  suggested_symbol: z.string().nullable(),
});

const ruleEvidence = z.object({
  id: z.string(),
  indicator: z.string(),
  side: side,
  op: z.string(),
  lhs: z.number().nullable(),
  rhs: z.number().nullable(),
  rhs_lower: z.number().nullable().optional(),
  rhs_upper: z.number().nullable().optional(),
  result: z.boolean().nullable(),
  missing: z.boolean(),
  previous_lhs: z.number().nullable().optional(),
  previous_rhs: z.number().nullable().optional(),
});

export const strategyAlertEventSchema = z.object({
  id: z.uuid(),
  alert_id: z.uuid(),
  alert_version: z.number().int(),
  /** Name at emission time: a later rename does not rewrite history. */
  alert_name: z.string(),
  symbol: z.string(),
  side,
  side_label: z.enum(['Mua', 'Bán']),
  signal_session: z.string(),
  event_kind: z.enum(['first_observation', 'new_signal']),
  /** "Đang thỏa ở lần kiểm tra đầu" or "Tín hiệu mới: trước đó chưa thỏa điều kiện". */
  event_kind_label: z.string(),
  /** Always "Thỏa điều kiện Mua/Bán": a condition match, never an order or a Bot trade. */
  message: z.string(),
  evaluated_at: timestamp,
  data_version: z.string(),
  config_hash: z.string(),
  rule_version: z.string(),
  calculation_version: z.string(),
  previous_valid_result: z.boolean().nullable(),
  previous_valid_session: z.string().nullable(),
  /** Values, operators and indicator params exactly as evaluated at the signal session. */
  evidence: z.object({
    session: z.string(),
    bar: z
      .object({
        date: z.string(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number(),
      })
      .nullable(),
    indicator_ids: z.array(z.string()),
    indicator_params: z.record(z.string(), z.record(z.string(), z.number())),
    rules: z.array(ruleEvidence),
  }),
  created_at: timestamp,
});
export type StrategyAlertEventView = z.infer<typeof strategyAlertEventSchema>;

export const strategyAlertEventListSchema = z.object({
  items: z.array(strategyAlertEventSchema),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
});
