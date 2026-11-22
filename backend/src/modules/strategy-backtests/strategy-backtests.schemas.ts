import { z } from 'zod';

/**
 * Backtest theo rổ (spec Bot và Chiến lược v2.0 §4.7–4.9, §10.3; PLAN §6.1). Every run is a basket
 * run of one strategy version (IQX, mine, or the unsaved draft) over the price store. Runs stored
 * before update 22-11 (one symbol, shared config) are `legacy` and read-only.
 *
 * Money (VND) is a decimal string everywhere in responses (the engine computes in bigint).
 */

const isoDate = z.iso.date();
const timestamp = z.string();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const money = z.string().regex(/^-?\d+$/);

/** Body fields of the pre-22-11 single-symbol Backtest: refused with 422 STRATEGY_INVALID. */
export const LEGACY_BACKTEST_FIELDS = [
  'shared_revision',
  'symbol',
  'assumptions',
  'research',
  'system',
  'draft',
  'origin',
] as const;

const contentInput = z.object({
  universe: z.record(z.string(), z.unknown()),
  indicators: z.record(z.string(), z.unknown()),
  max_holding: z.number(),
  sell_only: z.boolean().optional(),
});

export const backtestStrategyRefSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('iqx'),
    /** Template uuid (or slug). */
    id: z.string().min(1).max(64),
    version: z.number().int().min(1).optional(),
  }),
  z.strictObject({
    source: z.literal('user'),
    id: z.uuid(),
    version: z.number().int().min(1).optional(),
  }),
  z.strictObject({
    source: z.literal('draft'),
    content: contentInput,
    /** The saved version the draft was opened from (labels + "Lần chạy đã lưu" filter). */
    base: z
      .strictObject({ id: z.uuid(), version: z.number().int().min(1) })
      .nullable()
      .optional(),
  }),
]);
export type BacktestStrategyRef = z.infer<typeof backtestStrategyRefSchema>;

/**
 * Loose on purpose: a body with legacy fields (`symbol`, `shared_revision`, …) must reach the
 * service, which answers 422 STRATEGY_INVALID (PLAN §6.1 "Removed") instead of a generic 400.
 */
export const backtestRunBodySchema = z.looseObject({
  idempotency_key: z.string().min(8).max(128),
  strategy: backtestStrategyRefSchema,
  start: isoDate,
  end: isoDate,
  /**
   * Quản trị › Mẫu IQX "Chạy để thử" (§7.2): the draft runs and answers like any run but is NOT
   * stored. Draft only.
   */
  trial: z.boolean().optional(),
});
export type BacktestRunBody = z.infer<typeof backtestRunBodySchema>;

export const backtestRunIdSchema = z.uuid();

export const backtestListQuerySchema = z.object({
  strategy_source: z.enum(['iqx', 'user', 'draft']).optional(),
  /** Matches the run's strategy id (a draft run carries the id of the version it was edited from). */
  strategy_id: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type BacktestListQuery = z.infer<typeof backtestListQuerySchema>;

export const backtestTradesQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});
export type BacktestTradesQuery = z.infer<typeof backtestTradesQuerySchema>;

// ---------------------------------------------------------------------------
// Responses

const exitReasonSchema = z.enum(['indicator', 'max_holding']);
const skipCodeSchema = z.enum([
  'session_buy_limit',
  'insufficient_cash',
  'budget_below_lot',
  'symbol_cap',
]);

export const basketKpisSchema = z.object({
  total_return_pct: z.number(),
  /** null (`—`) below 60 sessions. */
  annualized_return_pct: z.number().nullable(),
  max_drawdown_pct: z.number(),
  closed_trades: z.number().int(),
  win_rate_pct: z.number().nullable(),
  basket_buy_hold_pct: z.number(),
  vnindex_pct: z.number().nullable(),
});

export const dataWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  symbols: z.array(z.string()).optional(),
});

export const basketTradeSchema = z.object({
  symbol: z.string(),
  qty: z.number().int(),
  entry_session: isoDate,
  entry_price_vnd: money,
  entry_cost_vnd: money,
  exit_session: isoDate,
  price_vnd: money,
  gross_vnd: money,
  fee_vnd: money,
  tax_vnd: money,
  net_vnd: money,
  pnl_vnd: money,
  pnl_pct: z.number(),
  exit_reason: exitReasonSchema,
  exit_reasons: z.array(exitReasonSchema),
  holding_sessions: z.number().int(),
  counted_sessions: z.number().int(),
  max_holding_at_exit: z.number().int(),
});

const strategyRefViewSchema = z.object({
  source: z.enum(['iqx', 'user', 'draft']),
  id: z.string().nullable(),
  version: z.number().int().nullable(),
});

export const basketSnapshotSchema = z.object({
  strategy_ref: strategyRefViewSchema,
  strategy_label: z.string(),
  version_label: z.string().nullable(),
  /** `Kết quả · {label}` (§4.7). */
  result_label: z.string(),
  subtitle: z.string(),
  content: z.record(z.string(), z.unknown()),
  config_hash: hashSchema,
  universe_label: z.string(),
  universe_resolved: z.array(z.string()),
  excluded_symbols: z.array(z.string()),
  requested_start: isoDate,
  requested_end: isoDate,
  data_store: z.literal('flashback_vn100'),
  data_as_of: isoDate.nullable(),
  data_hash: z.string(),
  price_unit: z.literal('VND'),
  adjusted: z.boolean(),
  rules_version: z.string(),
  fee_rules: z.object({
    buy_fee_bps: z.number(),
    sell_fee_bps: z.number(),
    sell_tax_bps: z.number(),
    lot_size: z.number(),
  }),
  initial_cash_vnd: money,
  warnings: z.array(dataWarningSchema),
});

export const basketResultSchema = z.object({
  sessions: z.number().int(),
  start_session: isoDate.nullable(),
  end_session: isoDate.nullable(),
  initial_cash_vnd: money,
  final_nav_vnd: money,
  cash_end_vnd: money,
  kpis: basketKpisSchema,
  curve: z.array(
    z.object({
      date: isoDate,
      nav_vnd: money,
      strategy: z.number(),
      basket: z.number(),
      vnindex: z.number().nullable(),
    }),
  ),
  trades: z.array(basketTradeSchema),
  time_exits: z.number().int(),
  per_symbol: z.array(
    z.object({
      symbol: z.string(),
      closed_trades: z.number().int(),
      wins: z.number().int(),
      realized_pnl_vnd: money,
      unrealized_pnl_vnd: money,
      contribution_pct: z.number(),
    }),
  ),
  open_positions: z.array(
    z.object({
      symbol: z.string(),
      entry_session: isoDate,
      entry_price_vnd: money,
      qty: z.number().int(),
      last_close_vnd: money,
      holding_sessions: z.number().int(),
      counted_sessions: z.number().int(),
      max_holding: z.number().int(),
      unrealized_pnl_vnd: money,
      unrealized_pct: z.number(),
    }),
  ),
  skipped_orders: z.object({
    counts: z.partialRecord(skipCodeSchema, z.number().int()),
    total: z.number().int(),
    items: z.array(
      z.object({ date: isoDate, symbol: z.string(), code: skipCodeSchema, message: z.string() }),
    ),
  }),
  basket_buy_hold: z.object({ symbols: z.array(z.string()), return_pct: z.number() }),
});

/** KPIs shown for a pre-22-11 run ("Cấu hình cũ · Xem số liệu", §4.9). */
export const legacyKpisSchema = z.object({
  total_return_pct: z.number(),
  max_drawdown_pct: z.number(),
  closed_trades: z.number().int(),
});

const runErrorSchema = z.object({
  status: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.array(z.unknown()).optional(),
});

export const backtestRunResponseSchema = z.object({
  run_id: z.uuid(),
  status: z.enum(['succeeded', 'failed']),
  legacy: z.boolean(),
  /** Run not stored (admin "Chạy để thử"). */
  trial: z.boolean(),
  created_at: timestamp,
  snapshot: basketSnapshotSchema.nullable(),
  result: basketResultSchema.nullable(),
  /** Legacy runs only. */
  legacy_view: z
    .object({
      kind: z.string(),
      symbol: z.string().nullable(),
      start: isoDate.nullable(),
      end: isoDate.nullable(),
      kpis: legacyKpisSchema.nullable(),
      note: z.string(),
    })
    .nullable(),
  error: runErrorSchema.nullable(),
});

export const backtestRunListItemSchema = z.object({
  run_id: z.uuid(),
  created_at: timestamp,
  legacy: z.boolean(),
  status: z.enum(['succeeded', 'failed']),
  strategy_source: z.enum(['iqx', 'user', 'draft']).nullable(),
  strategy_id: z.string().nullable(),
  strategy_version: z.number().int().nullable(),
  strategy_label: z.string(),
  version_label: z.string().nullable(),
  universe_label: z.string(),
  start: isoDate.nullable(),
  end: isoDate.nullable(),
  config_hash: hashSchema,
  kpis: z
    .object({
      total_return_pct: z.number(),
      max_drawdown_pct: z.number(),
      closed_trades: z.number().int(),
    })
    .nullable(),
});

export const backtestRunListSchema = z.object({ items: z.array(backtestRunListItemSchema) });

/** One page of the trades, newest exit first; `total` counts the whole run. */
export const backtestTradesResponseSchema = z.object({
  run_id: z.uuid(),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  time_exits: z.number().int(),
  items: z.array(basketTradeSchema),
});
