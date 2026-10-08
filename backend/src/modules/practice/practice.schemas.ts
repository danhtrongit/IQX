import { z } from 'zod';

import { PRACTICE_CASE_COUNT } from './practice.constants.js';

/** Practice API contracts. No schema here carries a symbol, a company name or a calendar date. */

const ruleOpSchema = z.enum(['>', '<', '∈', '∉']);
const keySchema = z.string().min(1).max(32);

export const indicatorIdParamSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
export const runIdParamSchema = z.uuid();

const sideInputSchema = z.strictObject({
  enabled: z.boolean(),
  params: z.record(keySchema, z.number()).refine((value) => Object.keys(value).length <= 8, {
    message: 'Quá nhiều tham số.',
  }),
  /** Operator per stable registry rule id (`r1`, `r2`, ...). */
  ops: z.record(keySchema, ruleOpSchema).refine((value) => Object.keys(value).length <= 8, {
    message: 'Quá nhiều điều kiện.',
  }),
});

/** Both sides + max holding time. Ranges are validated against the registry by the service. */
export const practiceConfigSchema = z.strictObject({
  buy: sideInputSchema,
  sell: sideInputSchema,
  hold_max_sessions: z.number(),
});
export type PracticeConfigInput = z.infer<typeof practiceConfigSchema>;

export const draftBodySchema = z.strictObject({
  expected_revision: z.number().int().min(1),
  draft: practiceConfigSchema,
});
export type DraftBody = z.infer<typeof draftBodySchema>;

export const previewBodySchema = z
  .strictObject({
    buy_params: z.record(keySchema, z.number()).optional(),
    sell_params: z.record(keySchema, z.number()).optional(),
  })
  .refine((body) => body.buy_params !== undefined || body.sell_params !== undefined, {
    message: 'Cần tham số của ít nhất một phía.',
  });
export type PreviewBody = z.infer<typeof previewBodySchema>;

export const startRunBodySchema = z.strictObject({
  idempotency_key: z.string().min(8).max(128),
  /** The reserved case this start refers to; a stale tab is rejected with 409. */
  ordinal: z.number().int().min(1).max(PRACTICE_CASE_COUNT),
  case_id: z.uuid(),
  config: practiceConfigSchema,
});
export type StartRunBody = z.infer<typeof startRunBodySchema>;

export const nextBodySchema = z.strictObject({
  expected_cursor: z.number().int().min(1).max(PRACTICE_CASE_COUNT),
  idempotency_key: z.string().min(8).max(128),
});
export type NextBody = z.infer<typeof nextBodySchema>;

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(30),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

// ---------------------------------------------------------------- responses

const validationSchema = z.strictObject({
  valid: z.boolean(),
  errors: z.array(z.strictObject({ path: z.string(), message: z.string() })),
});

const profileSchema = z.looseObject({
  profile_version: z.string(),
  capital: z.number(),
  lot: z.number(),
  buy_fee_rate: z.number(),
  sell_cost_rate: z.number(),
  verified: z.boolean(),
});

const runStatusSchema = z.enum(['computing', 'succeeded', 'failed']);

const runKpiSummarySchema = z.strictObject({
  total_return: z.number().nullable(),
  buy_count: z.number().int(),
  closed_trade_count: z.number().int(),
  open_position: z.boolean(),
  comment_rule_id: z.string().nullable(),
});

const runBriefSchema = z.strictObject({
  run_id: z.uuid(),
  ordinal: z.number().int(),
  case_id: z.uuid(),
  status: runStatusSchema,
  summary: runKpiSummarySchema.nullable(),
});

const storedErrorSchema = z.strictObject({ code: z.string(), message: z.string() });

const versionsSchema = z.strictObject({
  set_version: z.string(),
  data_version: z.string(),
  profile_version: z.string(),
  calculation_version: z.string(),
  rule_version: z.string(),
  engine_version: z.string(),
  execution_version: z.string(),
  comment_version: z.string(),
});

export const indicatorsResponseSchema = z.strictObject({
  set: z.strictObject({
    set_version: z.string(),
    case_count: z.number().int(),
    test_months: z.number().int(),
    window_bars: z.number().int(),
  }),
  profile: profileSchema,
  hold: z.strictObject({ default: z.number().int(), min: z.number().int(), max: z.number().int() }),
  indicators: z.array(
    z.strictObject({
      indicator_id: z.string(),
      name: z.string(),
      lesson_key: z.string(),
      granted: z.boolean(),
      progress: z
        .strictObject({
          status: z.enum(['not_started', 'in_progress', 'completed']),
          cursor: z.number().int(),
          completed_count: z.number().int(),
          total: z.number().int(),
        })
        .nullable(),
    }),
  ),
});

const operandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('series'),
    key: z.string(),
    offset: z.number().int().optional(),
  }),
  z.strictObject({ kind: z.literal('param'), key: z.string() }),
  z.strictObject({ kind: z.literal('constant'), value: z.number() }),
]);

const formSideSchema = z.strictObject({
  fields: z.array(
    z.strictObject({
      key: z.string(),
      label: z.string(),
      type: z.enum(['integer', 'number']),
      min: z.number(),
      max: z.number(),
      step: z.number(),
      unit: z.string(),
    }),
  ),
  rules: z.array(
    z.strictObject({
      rule_id: z.string(),
      kind: z.enum(['compare', 'cross', 'membership']),
      default_op: ruleOpSchema,
      allowed_ops: z.array(ruleOpSchema),
      left_label: z.string(),
      right_label: z.string(),
      lhs: operandSchema,
      rhs: z.union([operandSchema, z.strictObject({ lower: operandSchema, upper: operandSchema })]),
    }),
  ),
});

/** Field domains, rule templates and registry defaults (no Premium registry call needed). */
export const formSchema = z.strictObject({
  indicator_id: z.string(),
  buy: formSideSchema,
  sell: formSideSchema,
  cross_fields: z.array(
    z.strictObject({ left: z.string(), op: z.enum(['>', '<']), right: z.string() }),
  ),
  defaults: practiceConfigSchema,
});

export const stateResponseSchema = z.strictObject({
  set_version: z.string(),
  indicator: z.strictObject({ id: z.string(), name: z.string() }),
  status: z.enum(['ready', 'computing', 'failed', 'completed', 'set_completed']),
  ordinal: z.number().int(),
  total: z.number().int(),
  case: z.strictObject({
    case_id: z.uuid(),
    ordinal: z.number().int(),
    window_bars: z.number().int(),
  }),
  draft: practiceConfigSchema,
  draft_revision: z.number().int(),
  validation: validationSchema,
  current_run: runBriefSchema.nullable(),
  can_start: z.boolean(),
  can_retry: z.boolean(),
  can_next: z.boolean(),
  completed_count: z.number().int(),
  runs: z.array(runBriefSchema),
  profile: profileSchema,
  form: formSchema,
});

export const draftResponseSchema = z.strictObject({
  draft: practiceConfigSchema,
  draft_revision: z.number().int(),
  validation: validationSchema,
});

const plotSpecSchema = z.strictObject({
  overlay: z.boolean(),
  lines: z.array(z.strictObject({ key: z.string(), label: z.string() })),
  histogram_key: z.string().nullable(),
  volume_key: z.string().nullable(),
  zero_line: z.boolean(),
  nonnegative: z.boolean(),
  bounds: z.tuple([z.number(), z.number()]).nullable(),
  threshold_levels: z.array(z.number()),
  reference_levels: z.array(z.number()),
});

const seriesColumnsSchema = z.record(z.string(), z.array(z.number().nullable()));

export const chartSchema = z.strictObject({
  first_session: z.number().int(),
  last_session: z.number().int(),
  last_observed_session: z.literal(0),
  bars: z.strictObject({
    open: z.array(z.number()),
    high: z.array(z.number()),
    low: z.array(z.number()),
    close: z.array(z.number()),
    volume: z.array(z.number()),
  }),
  series: z.strictObject({ buy: seriesColumnsSchema, sell: seriesColumnsSchema }),
  plot: z.strictObject({ buy: plotSpecSchema, sell: plotSpecSchema }),
});

export const previewResponseSchema = z.strictObject({
  ordinal: z.number().int(),
  case_id: z.uuid(),
  window_bars: z.number().int(),
  chart: chartSchema,
  data_notes: z.array(z.string()),
});

const ruleEvidenceSchema = z.looseObject({
  rule_id: z.string(),
  kind: z.enum(['compare', 'cross', 'membership']),
  op: ruleOpSchema,
  left_label: z.string(),
  right_label: z.string(),
  lhs: z.number().nullable(),
  rhs: z.number().nullable(),
  result: z.boolean().nullable(),
  missing: z.boolean(),
});

const decisionEvidenceSchema = z.strictObject({
  side: z.enum(['buy', 'sell']),
  signal_session: z.number().int(),
  enabled: z.boolean(),
  result: z.boolean().nullable(),
  params: z.record(z.string(), z.number()),
  rules: z.array(ruleEvidenceSchema),
});

const tradeSchema = z.strictObject({
  ordinal: z.number().int(),
  status: z.enum(['closed', 'open']),
  qty: z.number().int(),
  buy: z.strictObject({
    signal_session: z.number().int(),
    session: z.number().int(),
    price: z.number(),
    fee: z.number(),
    total_cost: z.number(),
    evidence: decisionEvidenceSchema,
  }),
  sell: z
    .strictObject({
      signal_session: z.number().int(),
      session: z.number().int(),
      price: z.number(),
      fee: z.number(),
      net_proceeds: z.number(),
      reason: z.enum(['indicator', 'max_holding']),
      indicator_met: z.boolean(),
      time_due: z.boolean(),
      evidence: decisionEvidenceSchema,
      time_exit: z.strictObject({
        hold_max_sessions: z.number().int(),
        held_sessions_at_signal: z.number().int(),
        due: z.boolean(),
      }),
    })
    .nullable(),
  holding_sessions: z.number().int(),
  pnl_kind: z.enum(['realized', 'unrealized']),
  pnl_vnd: z.number(),
  pnl_ratio: z.number(),
  mark: z
    .strictObject({ session: z.number().int(), price: z.number(), market_value: z.number() })
    .nullable(),
});

const commentSchema = z.strictObject({
  status: z.enum(['ok', 'unavailable']),
  rule_id: z.string(),
  version: z.string(),
  text: z.string().nullable(),
  values: z.looseObject({}),
});

const resultSchema = z.strictObject({
  first_session: z.literal(1),
  last_session: z.number().int(),
  kpis: z.strictObject({
    capital_initial: z.number(),
    cash_end: z.number(),
    open_position_value: z.number().nullable(),
    nav_end: z.number().nullable(),
    total_return: z.number().nullable(),
    valuation: z.enum(['ok', 'missing']),
    buy_count: z.number().int(),
    closed_trade_count: z.number().int(),
    open_position: z.boolean(),
    insufficient_cash_buys: z.number().int(),
  }),
  trades: z.array(tradeSchema),
  events: z.array(
    z.strictObject({
      side: z.enum(['buy', 'sell']),
      session: z.number().int(),
      price: z.number(),
      trade_ordinal: z.number().int(),
      reason: z.enum(['indicator', 'max_holding']).optional(),
    }),
  ),
  pending_orders: z.array(
    z.strictObject({
      side: z.enum(['buy', 'sell']),
      signal_session: z.number().int(),
      reason: z.enum(['indicator', 'max_holding', 'buy_signal']),
      time_due: z.boolean(),
      status: z.literal('unfilled_end_of_window'),
    }),
  ),
  missed_buys: z.array(
    z.strictObject({
      signal_session: z.number().int(),
      fill_session: z.number().int(),
      price: z.number(),
      cash: z.number(),
    }),
  ),
  nav: z.array(z.number()),
  comment: commentSchema,
  data_notes: z.array(z.string()),
});

export const runViewSchema = z.strictObject({
  run_id: z.uuid(),
  indicator_id: z.string(),
  ordinal: z.number().int(),
  total: z.number().int(),
  case_id: z.uuid(),
  status: runStatusSchema,
  config: practiceConfigSchema,
  versions: versionsSchema,
  locked_at: z.string(),
  completed_at: z.string().nullable(),
  attempts: z.number().int(),
  error: storedErrorSchema.nullable(),
  /** Present only once `status = succeeded`: the full 24-month result of the locked config. */
  result: resultSchema.nullable(),
  chart: chartSchema.nullable(),
});

export const historyResponseSchema = z.strictObject({
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(
    z.strictObject({
      run_id: z.uuid(),
      ordinal: z.number().int(),
      case_id: z.uuid(),
      completed_at: z.string().nullable(),
      config: practiceConfigSchema,
      kpis: runKpiSummarySchema.nullable(),
      versions: versionsSchema,
    }),
  ),
});

export type IndicatorsResponse = z.infer<typeof indicatorsResponseSchema>;
export type StateResponse = z.infer<typeof stateResponseSchema>;
export type DraftResponse = z.infer<typeof draftResponseSchema>;
export type PreviewResponse = z.infer<typeof previewResponseSchema>;
export type RunView = z.infer<typeof runViewSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
