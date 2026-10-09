import { z } from 'zod';

export const HISTORY_DEFAULT_LIMIT = 30;
export const HISTORY_MAX_LIMIT = 100;

const limit = z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT);

/** `GET /bot/trades`: `cursor` is the `next_cursor` of the previous page (a trade id). */
export const tradesQuerySchema = z.object({
  cursor: z.guid({ error: 'cursor không hợp lệ' }).optional(),
  limit,
});
export type TradesQuery = z.output<typeof tradesQuerySchema>;

/** `GET /bot/journal/sessions`: `cursor` is the last `session` date of the previous page. */
export const sessionsQuerySchema = z.object({
  cursor: z.iso.date({ error: 'cursor không hợp lệ' }).optional(),
  limit,
});
export type SessionsQuery = z.output<typeof sessionsQuerySchema>;

/** `GET /bot/journal/sessions/:session`: `cursor` is the `next_cursor` (a decision id). */
export const sessionDecisionsQuerySchema = z.object({
  cursor: z.guid({ error: 'cursor không hợp lệ' }).optional(),
  limit,
});
export type SessionDecisionsQuery = z.output<typeof sessionDecisionsQuerySchema>;

export const sessionParamSchema = z.object({
  session: z.iso.date({ error: 'session phải có dạng YYYY-MM-DD' }),
});
export type SessionParam = z.output<typeof sessionParamSchema>;

// ---------------------------------------------------------------------------------------------
// Response schemas (documentation only; BotHistoryService builds these shapes). Money is a
// string of whole VND (no decimals, never thousands of VND); signed values keep their sign.
// ---------------------------------------------------------------------------------------------
const vnd = z.string();
const timestamp = z.iso.datetime();
const day = z.iso.date();
const revision = z.number().int().min(1).nullable();
const jsonObject = z.record(z.string(), z.unknown());

const tradeBuySchema = z.object({
  execution_id: z.guid().nullable(),
  decision_id: z.guid().nullable(),
  session: day,
  executed_at: timestamp,
  price_vnd: vnd,
  qty: z.number().int().min(1),
  /** qty x price. */
  gross_value_vnd: vnd,
  fee_vnd: vnd,
  /** Cash out: gross_value + fee. */
  total_vnd: vnd,
  /** Shared-config revision that decided the buy. */
  decision_config_revision: revision,
  /** Buy universe (kind/name/revision) when the position was opened; null for legacy lots. */
  entry_source_snapshot: jsonObject.nullable(),
  reason_code: z.string().nullable(),
  reason_label: z.string().nullable(),
  reason: z.string().nullable(),
});

const tradeSellSchema = z.object({
  execution_id: z.guid(),
  decision_id: z.guid().nullable(),
  session: day,
  executed_at: timestamp,
  price_vnd: vnd,
  qty: z.number().int().min(1),
  gross_value_vnd: vnd,
  fee_vnd: vnd,
  /** Sell tax; already part of `net_vnd`, never subtract it again. */
  tax_vnd: vnd,
  /** Cash in: gross_value - fee - tax. */
  net_vnd: vnd,
  decision_config_revision: revision,
  reason_code: z.string().nullable(),
  reason_label: z.string().nullable(),
  reason: z.string().nullable(),
});

export const botTradeSchema = z.object({
  /** Position (lot) id; also the pagination cursor. */
  id: z.guid(),
  symbol: z.string(),
  buy: tradeBuySchema,
  sell: tradeSellSchema,
  /** sell.net_vnd - buy.total_vnd (fees and tax counted once). */
  realized_pnl_vnd: vnd,
  /** realized_pnl / buy.total x 100 (12 decimals; 2.5 means +2.5%); null if the cost is 0. */
  realized_pnl_pct: z.string().nullable(),
  /** Sessions the lot was held at the close (buy session included, sell session excluded). */
  holding_sessions: z.number().int().min(0),
  /** Calendar days between the buy and the sell session. */
  holding_days: z.number().int().min(0),
  /** Retired-policy audit values; null/empty for iqx-bot-v1.0 lots. */
  legacy_stop_loss_vnd: z.string().nullable(),
  legacy_take_profit_vnd: z.string().nullable(),
  legacy_amplitude_at_entry_vnd: z.string().nullable(),
  legacy_amplitude_source_ref: z.string().nullable(),
  legacy_filter_ids: z.array(z.string()),
});
export type BotTradeView = z.infer<typeof botTradeSchema>;

export const botTradesPageSchema = z.object({
  /** Closed round trips, newest sell first. Open lots are in `GET /bot/positions`. */
  items: z.array(botTradeSchema),
  next_cursor: z.guid().nullable(),
});
export type BotTradesPage = z.infer<typeof botTradesPageSchema>;

const actionSchema = z.enum(['buy', 'sell', 'hold', 'skip']);

const sessionReasonSchema = z.object({
  action: actionSchema,
  reason_code: z.string(),
  reason_label: z.string().nullable(),
  count: z.number().int().min(1),
});

export const botSessionSchema = z.object({
  session: day,
  run_id: z.guid(),
  run_status: z.enum(['running', 'succeeded', 'failed']),
  started_at: timestamp,
  completed_at: timestamp.nullable(),
  policy_version: z.string().nullable(),
  /** Buy universe captured by the run; null for runs from before universes existed. */
  universe: z
    .object({
      kind: z.enum(['vn30', 'custom']),
      /** 0 = implicit VN30 default. */
      revision: z.number().int().min(0),
      name: z.string().nullable(),
    })
    .nullable(),
  /** Shared-config revision pinned by the run (falls back to the decisions' revision). */
  config_revision: revision,
  counts: z.object({
    buy: z.number().int().min(0),
    sell: z.number().int().min(0),
    hold: z.number().int().min(0),
    skip: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  /** Decisions grouped by action and reason code, largest group first. */
  reasons: z.array(sessionReasonSchema),
  /** NAV at the session close; null while the valuation is incomplete or missing. */
  nav_end_vnd: vnd.nullable(),
  cash_end_vnd: vnd.nullable(),
  /** null when no NAV row exists for the session. */
  valuation_complete: z.boolean().nullable(),
  issues: z.array(
    z.object({ code: z.string(), symbol: z.string().nullable(), detail: z.string().nullable() }),
  ),
});
export type BotSessionView = z.infer<typeof botSessionSchema>;

export const botSessionsPageSchema = z.object({
  items: z.array(botSessionSchema),
  next_cursor: day.nullable(),
});
export type BotSessionsPage = z.infer<typeof botSessionsPageSchema>;

const executionSchema = z.object({
  id: z.guid(),
  side: z.enum(['buy', 'sell']),
  qty: z.number().int(),
  price_vnd: vnd,
  gross_value_vnd: vnd,
  fee_vnd: vnd,
  tax_vnd: vnd,
  net_cash_delta_vnd: vnd,
});

/** Same fields as an item of `GET /bot/journal`. */
export const botSessionDecisionSchema = z.object({
  id: z.guid(),
  run_id: z.guid(),
  trading_date: day,
  action: actionSchema,
  reason_code: z.string(),
  reason_label: z.string().nullable(),
  reason: z.string(),
  execution: executionSchema.nullable(),
  symbol: z.string().nullable(),
  in_universe: z.boolean().nullable(),
  universe_revision: z.number().int().min(0).nullable(),
  universe_kind: z.enum(['vn30', 'custom']).nullable(),
  policy_version: z.string().nullable(),
  decision_config_revision: revision,
  condition_snapshot: jsonObject.nullable(),
  rank_tuple: z.array(z.unknown()).nullable(),
  legacy_filter_ids: z.array(z.string()),
  legacy_threshold_vnd: z.string().nullable(),
  source_refs: jsonObject,
  created_at: timestamp,
});
export type BotSessionDecisionView = z.infer<typeof botSessionDecisionSchema>;

export const botSessionDecisionsPageSchema = z.object({
  session: botSessionSchema,
  /** Executed decisions first, then session-level ones, then by symbol. */
  items: z.array(botSessionDecisionSchema),
  next_cursor: z.guid().nullable(),
});
export type BotSessionDecisionsPage = z.infer<typeof botSessionDecisionsPageSchema>;
