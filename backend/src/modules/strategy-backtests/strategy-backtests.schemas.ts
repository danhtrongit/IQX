import { z } from 'zod';

/** Longest requested range (inclusive days), same bound as the legacy backtest. */
const MAX_RANGE_DAYS = 3653;

const isoDate = z.iso.date();
const symbol = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());
const paramPathSchema = z.strictObject({
  indicator: z.string().regex(/^[a-z0-9_]{1,64}$/),
  side: z.enum(['buy', 'sell']),
  key: z.string().min(1).max(64),
});
const gridValuesSchema = z.array(z.number().finite()).min(1).max(100);

const researchSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('sensitivity'),
    path: paramPathSchema,
    values: gridValuesSchema,
  }),
  z.strictObject({ kind: z.literal('out_of_sample'), split_date: isoDate }),
  z.strictObject({
    kind: z.literal('walk_forward'),
    path: paramPathSchema,
    values: gridValuesSchema,
    train_bars: z.number().int().min(1).max(3500),
    test_bars: z.number().int().min(1).max(3500),
    step_bars: z.number().int().min(1).max(3500),
    criterion: z.enum(['net_return', 'cagr', 'profit_factor']),
    min_trades: z.number().int().min(0).max(1000),
  }),
]);
export type BacktestResearchInput = z.infer<typeof researchSchema>;

/**
 * CONTRACTS §4.1 frozen `system` payload. Ranges are repeated here for early
 * 4xx and OpenAPI; the engine's `validateSystemOptions` stays authoritative
 * (cross-field rules and the recursive `logic` tree).
 */
const systemSchema = z.strictObject({
  symbols: z.array(symbol).min(2).max(30).optional(),
  universe: z
    .strictObject({
      list_id: z.uuid().optional(),
      market: z.enum(['HOSE', 'HNX', 'UPCOM', 'ALL']).optional(),
    })
    .refine((value) => value.list_id !== undefined || value.market !== undefined, {
      message: 'Cần chọn danh sách hoặc sàn cho rổ cổ phiếu',
    })
    .optional(),
  ranking: z
    .strictObject({
      key: z.enum(['roc_20', 'rs_market', 'relative_volume', 'distance_52w_high']),
      direction: z.enum(['desc', 'asc']),
    })
    .optional(),
  logic: z
    .looseObject({ type: z.enum(['indicator', 'and', 'or', 'not']) })
    .optional()
    .describe('LogicNode over buy-side indicator ids (depth ≤ 4, children ≤ 16)'),
  priority: z.literal('exit_first').optional(),
  cooldown_bars: z.number().int().min(1).max(60).optional(),
  sizing: z
    .discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('pct_nav'), pct: z.number().finite().min(1).max(100) }),
      z.strictObject({
        mode: z.literal('fixed_amount'),
        amount_vnd: z.number().finite().min(1_000_000),
      }),
    ])
    .optional(),
  max_positions: z.number().int().min(1).max(30).optional(),
  exits: z
    .strictObject({
      stop_loss_pct: z.number().finite().min(0.5).max(50).optional(),
      take_profit_pct: z.number().finite().min(0.5).max(200).optional(),
      trailing_pct: z.number().finite().min(0.5).max(50).optional(),
      max_holding: z.number().int().min(1).max(250).optional(),
    })
    .optional(),
  max_symbol_weight_pct: z.number().finite().min(1).max(100).optional(),
  max_sector_weight_pct: z.number().finite().min(1).max(100).optional(),
  max_correlation: z.number().finite().min(0).max(1).optional(),
  correlation_lookback: z.number().int().min(20).max(250).optional(),
  rebalance: z.strictObject({ every_bars: z.number().int().min(5).max(250) }).optional(),
  portfolio_drawdown_stop_pct: z.number().finite().min(1).max(90).optional(),
});
export type BacktestSystemInput = z.infer<typeof systemSchema>;

export const backtestRunBodySchema = z
  .strictObject({
    idempotency_key: z.string().min(8).max(128),
    shared_revision: z.number().int().min(1),
    symbol,
    start: isoDate,
    end: isoDate,
    assumptions: z
      .strictObject({
        capital: z.number().finite().min(1_000_000).max(1_000_000_000_000).optional(),
        fee_preset: z.enum(['standard', 'none']).default('standard'),
        execution: z.enum(['next_open', 'same_close']).default('next_open'),
      })
      .prefault({}),
    research: researchSchema.optional(),
    system: systemSchema.optional(),
  })
  .superRefine((value, context) => {
    const start = Date.parse(value.start),
      end = Date.parse(value.end);
    if (start >= end)
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Ngày kết thúc phải sau ngày bắt đầu',
      });
    if ((end - start) / 86_400_000 > MAX_RANGE_DAYS)
      context.addIssue({ code: 'custom', path: ['end'], message: 'Khoảng backtest tối đa 10 năm' });
    if (
      value.research?.kind === 'out_of_sample' &&
      (value.research.split_date <= value.start || value.research.split_date > value.end)
    )
      context.addIssue({
        code: 'custom',
        path: ['research', 'split_date'],
        message: 'Ngày tách phải nằm trong khoảng backtest',
      });
  });
export type BacktestRunBody = z.infer<typeof backtestRunBodySchema>;

export const backtestRunIdSchema = z.uuid();

export const backtestListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type BacktestListQuery = z.infer<typeof backtestListQuerySchema>;

// ---------------------------------------------------------------------------
// Responses (OpenAPI only; the engine types are the runtime source of truth).

const runKindSchema = z.enum([
  'single',
  'sensitivity',
  'out_of_sample',
  'walk_forward',
  'portfolio',
]);
const runStatusSchema = z.enum(['succeeded', 'failed']);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Engine-native KPI record. Only the advanced system (portfolio) result still exposes it; the
 * single-symbol Strategy backtest returns `strategyKpisSchema` (spec §6.6, exactly six KPIs).
 */
const engineKpisSchema = z.object({
  net_return: z.number(),
  cagr: z.number(),
  max_drawdown: z.number(),
  n_trades: z.number().int(),
  n_wins: z.number().int(),
  win_rate: z.number().nullable(),
  buy_hold_return: z.number(),
  market_return: z.number().nullable(),
  profit_factor: z.number().nullable(),
});

/** Six KPIs of spec §6.6. Every `*_pct` is in percentage points (12.3 = 12.3%, never a ratio). */
export const strategyKpisSchema = z.object({
  total_return_pct: z.number(),
  annualized_return_pct: z.number().nullable(),
  max_drawdown_pct: z.number(),
  closed_trade_count: z.number().int(),
  win_rate_pct: z.number().nullable(),
  buy_hold_return_pct: z.number(),
});

const curvePointSchema = z.object({
  date: isoDate,
  value: z.number(),
  return_pct: z.number(),
  buy_hold_pct: z.number(),
  market_pct: z.number().nullable(),
  phase: z.literal('before_first_execution').optional(),
});

const closedTradeSchema = z.object({
  number: z.number().int(),
  qty: z.number(),
  entry_date: isoDate,
  entry_signal_date: isoDate,
  entry_price: z.number(),
  exit_date: isoDate,
  exit_signal_date: isoDate,
  exit_price: z.number(),
  hold: z.number().int(),
  pnl: z.number(),
  pnl_pct: z.number(),
  exit_reason: z.string(),
  concurrent_reasons: z.array(z.string()).optional(),
});

const openPositionSchema = z.object({
  qty: z.number(),
  price: z.number(),
  cost: z.number(),
  index: z.number().int(),
  date: isoDate,
  signal_date: isoDate,
  last_price: z.number(),
  market_value: z.number(),
  unrealized_pnl: z.number(),
});

const ruleEvidenceSchema = z.object({
  id: z.string(),
  indicator: z.string(),
  side: z.enum(['buy', 'sell']),
  op: z.enum(['>', '<', '∈', '∉']),
  lhs: z.number().nullable(),
  rhs: z.number().nullable(),
  rhs_lower: z.number().nullable().optional(),
  rhs_upper: z.number().nullable().optional(),
  /** true / false / null (= not evaluable: missing data, never a pass). */
  result: z.boolean().nullable(),
  missing: z.boolean(),
  previous_lhs: z.number().nullable().optional(),
  previous_rhs: z.number().nullable().optional(),
});

const conditionEvidenceSchema = z.object({
  indicator_ids: z.array(z.string()),
  rules: z.array(ruleEvidenceSchema),
});

/** Closed trade (§6.8): signal date ≠ fill date, price, fees, quantity, net cash, condition values. */
export const closedTradeViewSchema = closedTradeSchema.extend({
  entry_fee: z.number(),
  entry_total: z.number(),
  exit_gross: z.number(),
  exit_fee_tax: z.number(),
  exit_net: z.number(),
  outcome: z.enum(['win', 'loss', 'flat']),
  entry_conditions: conditionEvidenceSchema.nullable(),
  exit_conditions: conditionEvidenceSchema.nullable(),
});

const openPositionViewSchema = openPositionSchema.extend({
  unrealized_pnl_basis: z.literal('market_value_at_last_close_minus_entry_total_before_sell_costs'),
  entry_conditions: conditionEvidenceSchema.nullable(),
});

const pendingOrderViewSchema = z.object({
  action: z.enum(['buy', 'sell']),
  signal_date: z.string(),
  reason: z.literal('end_of_range'),
  note: z.string(),
  evidence: conditionEvidenceSchema.nullable(),
});

const chartSeriesSchema = z.object({
  id: z.enum(['strategy', 'buy_hold', 'market']),
  label: z.string(),
  field: z.enum(['return_pct', 'buy_hold_pct', 'market_pct']),
  available: z.boolean(),
  end_value_pct: z.number().nullable(),
  unavailable_reason: z.string().nullable(),
});

const simulationSchema = z.object({
  contract: z.literal('iqx-strategy-backtest-1.0'),
  execution: z.enum(['next_open', 'same_close']),
  execution_label: z.string(),
  fill_price: z.string(),
  caveat: z.string(),
  signal_after_open_fill: z.boolean(),
  position_policy: z.literal('single_symbol_long_only_one_position'),
  sizing: z.literal('all_available_cash_including_buy_fee_rounded_down_to_lot'),
  exits: z.literal('none: no stop, take-profit, trailing or max holding'),
  min_held_bars: z.number().int(),
  min_held_bars_status: z.literal('carried_over_from_reference_engine_pending_product_decision'),
  fee_model: z.literal('buy_fee_on_value; sell_fee_and_tax_as_one_combined_rate'),
  settlement: z.literal('not_modelled'),
  liquidity: z.literal('not_modelled'),
  slippage: z.literal('not_modelled'),
  price_adjustment: z.enum(['provider_adjusted', 'not_confirmed']),
  annualization_sessions: z.literal(252),
  buy_hold_basis: z.literal('close_ratio_before_fees_and_dividends'),
});

const runOptionsSchema = z.object({
  capital: z.number(),
  fee_buy: z.number(),
  fee_sell: z.number(),
  lot: z.number().int(),
  execution: z.enum(['next_open', 'same_close']),
  min_held_bars: z.number().int(),
  start: isoDate,
  end: isoDate,
});

const configSchema = z.looseObject({
  schema_version: z.string(),
  indicators: z.record(z.string(), z.unknown()),
});

const executionProfileSchema = z.object({
  stop_loss: z.literal('none'),
  take_profit_pct: z.null(),
  max_holding: z.null(),
  trailing: z.literal('none'),
  position_size: z.literal('all_cash'),
  lot_size: z.number().int(),
  min_held_bars: z.number().int(),
});

export const dataWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  symbols: z.array(z.string()).optional(),
  indicators: z.array(z.string()).optional(),
});

const runSnapshotSchema = z.object({
  config: configSchema,
  options: runOptionsSchema,
  actual_start: isoDate,
  actual_end: isoDate,
  bar_count: z.number().int(),
  shared_revision: z.number().int(),
  revision_saved_at: z.string(),
  config_hash: hashSchema,
  symbol: z.string(),
  requested_start: isoDate,
  requested_end: isoDate,
  data_source: z.string(),
  data_source_priority: z.number().nullable(),
  adjusted: z.boolean(),
  skipped_rows: z.number().int(),
  data_hash: hashSchema,
  benchmark: z.object({
    symbol: z.literal('VNINDEX'),
    available: z.boolean(),
    source: z.string().nullable(),
  }),
  warmup_sessions_requested: z.number().int(),
  warmup_bars: z.number().int(),
  fee_preset: z.enum(['standard', 'none']),
  fees: z.object({ buy: z.number(), sell: z.number() }),
  lot_size: z.number().int(),
  execution: z.enum(['next_open', 'same_close']),
  capital: z.number(),
  execution_profile: z.literal('CLEAN_TECH_2.0'),
  profile: executionProfileSchema,
  slippage: z.literal('not_modelled'),
  open_position_policy: z.literal('mark_to_market_last_close'),
  /** Strategy-spec execution profile (§6.1-§6.3) recorded with every run; absent on pre-v1 runs. */
  simulation: simulationSchema.optional(),
  versions: z.object({
    schema_version: z.string(),
    calculation_version: z.string(),
    rule_version: z.string(),
    engine_version: z.string(),
    formula_version: z.string(),
  }),
  data_warnings: z.array(dataWarningSchema),
  research: z.record(z.string(), z.unknown()).nullable(),
  system: z
    .object({
      options: z.record(z.string(), z.unknown()),
      symbols: z.array(z.string()),
      excluded_symbols: z.array(z.string()),
      universe: z.record(z.string(), z.unknown()).nullable(),
      universe_policy: z.literal('explicit_symbols'),
      sectors: z.record(z.string(), z.string().nullable()).nullable(),
      data_hash: hashSchema,
      profile: z.record(z.string(), z.unknown()),
    })
    .nullable(),
});

const runResultSchema = z.object({
  schema_version: z.string(),
  engine_version: z.string(),
  calculation_version: z.string(),
  rule_version: z.string(),
  formula_version: z.string(),
  profile: executionProfileSchema,
  snapshot: runSnapshotSchema,
  initial: curvePointSchema,
  /** Full curve, never down-sampled; KPIs are computed on it. Prepend `initial` for the 0% origin. */
  curve: z.array(curvePointSchema),
  /** Full trade history of the run (also paged by GET /:id/trades). */
  trades: z.array(closedTradeViewSchema),
  open_position: openPositionViewSchema.nullable(),
  cash: z.number(),
  canceled: z.array(
    z.object({
      reason: z.literal('end_of_range'),
      action: z.enum(['buy', 'sell']),
      signalIndex: z.number().int(),
    }),
  ),
  contract: z.literal('iqx-strategy-backtest-1.0'),
  /** Exactly the six KPIs of spec §6.6 (percentage points). */
  kpis: strategyKpisSchema,
  kpi_basis: z.record(z.string(), z.unknown()),
  counts: z.object({
    buy_count: z.number().int(),
    closed_trade_count: z.number().int(),
    open_position_count: z.number().int(),
    pending_order_count: z.number().int(),
  }),
  /** Engine figures that are not KPIs of the Strategy page. */
  supplementary: z.object({
    winning_trade_count: z.number().int(),
    profit_factor: z.number().nullable(),
  }),
  chart: z.object({
    title: z.literal('Lợi nhuận danh mục (%)'),
    unit: z.literal('percent_points'),
    baseline_field: z.literal('initial'),
    series: z.array(chartSeriesSchema),
    point_count: z.number().int(),
  }),
  pending_orders: z.array(pendingOrderViewSchema),
});

const researchResultSchema = z
  .looseObject({
    type: z.enum(['sensitivity', 'out_of_sample_fixed_config', 'walk_forward_windows']),
    data_hash: hashSchema,
  })
  .describe(
    'Advanced engine output: sensitivity {candidates}, out_of_sample {train,test,attempt}, walk_forward {windows}',
  );

const systemResultSchema = z.object({
  curve: z.array(curvePointSchema),
  trades: z.array(closedTradeSchema.extend({ symbol: z.string(), partial: z.boolean() })),
  positions_open: z.array(
    openPositionSchema.extend({
      symbol: z.string(),
      sector: z.string().nullable(),
      peak_close: z.number(),
    }),
  ),
  kpis: engineKpisSchema,
  ledger_size: z.number().int(),
  applied: z.array(z.string()),
});

const runErrorSchema = z.object({
  status: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.array(z.unknown()).optional(),
});

export const backtestRunResponseSchema = z.object({
  run_id: z.uuid(),
  status: runStatusSchema,
  kind: runKindSchema,
  shared_revision: z.number().int(),
  created_at: z.string(),
  request: z.record(z.string(), z.unknown()),
  snapshot: runSnapshotSchema.nullable(),
  result: runResultSchema.nullable(),
  research_result: researchResultSchema.nullable(),
  system_result: systemResultSchema.nullable(),
  data_warnings: z.array(dataWarningSchema),
  error: runErrorSchema.nullable(),
});

export const backtestRunListSchema = z.object({
  items: z.array(
    z.object({
      run_id: z.uuid(),
      kind: runKindSchema,
      status: runStatusSchema,
      shared_revision: z.number().int(),
      symbol: z.string(),
      start: isoDate,
      end: isoDate,
      created_at: z.string(),
      config_hash: hashSchema,
      kpis: strategyKpisSchema.nullable(),
      error_code: z.string().nullable(),
    }),
  ),
});

export const backtestTradesQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type BacktestTradesQuery = z.infer<typeof backtestTradesQuerySchema>;

/** One page of the complete trade history; `total` is the whole run, not the page. */
export const backtestTradesResponseSchema = z.object({
  run_id: z.uuid(),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  counts: z.object({
    buy_count: z.number().int(),
    closed_trade_count: z.number().int(),
    open_position_count: z.number().int(),
    pending_order_count: z.number().int(),
  }),
  items: z.array(closedTradeViewSchema),
  open_position: openPositionViewSchema.nullable(),
  pending_orders: z.array(pendingOrderViewSchema),
});
