import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import type { IsTradingDay } from '../strategy-config/strategy-config.calendar.js';
import { BOT_REASON_LABELS, parseInteger, ratioString } from './bot.domain.js';
import { loadTradingCalendar, tradingSessionsBetween } from './bot-holding.js';
import type {
  BotSessionDecisionView,
  BotSessionDecisionsPage,
  BotSessionView,
  BotSessionsPage,
  BotTradeView,
  BotTradesPage,
  SessionDecisionsQuery,
  SessionsQuery,
  TradesQuery,
} from './bot-history.schemas.js';

type Action = 'buy' | 'sell' | 'hold' | 'skip';
const ACTION_ORDER: Readonly<Record<string, number>> = { buy: 0, sell: 1, skip: 2, hold: 3 };

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function optionalInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function reasonLabel(code: string | null): string | null {
  return code === null ? null : (BOT_REASON_LABELS[code] ?? null);
}

/** Raw row of the round-trip query (one closed position joined with both executions). */
export type TradeRow = {
  id: string;
  symbol: string;
  entry_price_vnd: string | number;
  entry_value_vnd: string | number;
  entry_fee_vnd: string | number;
  opened_session: string;
  opened_at: Date | string;
  entry_config_revision: number | null;
  entry_source_snapshot: unknown;
  stop_loss_vnd: string | null;
  take_profit_vnd: string | null;
  amplitude_at_entry_vnd: string | null;
  amplitude_source_ref: string | null;
  filter_ids: unknown;
  /** Count of `bot_nav_daily` rows: only the fallback when the trading calendar is unavailable. */
  holding_sessions: number | string | null;
  holding_days: number | string | null;
  buy_execution_id: string | null;
  buy_qty: number | string | null;
  buy_session: string | null;
  buy_executed_at: Date | string | null;
  buy_exec_reason: string | null;
  buy_decision_id: string | null;
  buy_reason_code: string | null;
  buy_reason: string | null;
  buy_decision_revision: number | string | null;
  sell_execution_id: string;
  sell_qty: number | string;
  sell_price_vnd: string | number;
  sell_session: string;
  sell_executed_at: Date | string;
  sell_gross_vnd: string | number;
  sell_fee_vnd: string | number;
  sell_tax_vnd: string | number;
  sell_net_vnd: string | number;
  sell_exec_reason: string | null;
  sell_decision_id: string | null;
  sell_reason_code: string | null;
  sell_reason: string | null;
  sell_decision_revision: number | string | null;
};

/**
 * One closed round trip from the immutable ledger rows, with the formulas of Bot SPEC 8.6:
 *   buy_total    = qty x price + buy_fee             (cash out)
 *   sell_net     = qty x price - sell_fee - sell_tax (cash in; the stored net_cash_delta)
 *   realized_pnl = sell_net - entry_buy_value - entry_buy_fee
 * The tax is part of `sell_net` already, so it is never subtracted a second time.
 *
 * `holding_sessions` counts the trading sessions from the buy session (inclusive) to the sell
 * session (exclusive) with the Bot's own calendar (weekdays minus the configured holidays), so a
 * day without a run still counts. Without a calendar it falls back to the nav-row count.
 */
export function tradeView(row: TradeRow, isTradingDay: IsTradingDay | null = null): BotTradeView {
  const buyGross = parseInteger(row.entry_value_vnd, 'entry_value_vnd');
  const buyFee = parseInteger(row.entry_fee_vnd, 'entry_fee_vnd');
  const buyTotal = buyGross + buyFee;
  const sellNet = parseInteger(row.sell_net_vnd, 'net_cash_delta_vnd');
  const realized = sellNet - buyTotal;
  const buyReasonCode = row.buy_reason_code ?? row.buy_exec_reason;
  const sellReasonCode = row.sell_reason_code ?? row.sell_exec_reason;
  return {
    id: row.id,
    symbol: row.symbol,
    buy: {
      execution_id: row.buy_execution_id,
      decision_id: row.buy_decision_id,
      session: row.buy_session ?? row.opened_session,
      executed_at: iso(row.buy_executed_at ?? row.opened_at),
      price_vnd: String(row.entry_price_vnd),
      qty: Number(row.buy_qty ?? row.sell_qty),
      gross_value_vnd: buyGross.toString(),
      fee_vnd: buyFee.toString(),
      total_vnd: buyTotal.toString(),
      decision_config_revision: optionalInteger(
        row.buy_decision_revision ?? row.entry_config_revision,
      ),
      entry_source_snapshot: row.entry_source_snapshot
        ? objectValue(row.entry_source_snapshot)
        : null,
      reason_code: buyReasonCode,
      reason_label: reasonLabel(buyReasonCode),
      reason: row.buy_reason,
    },
    sell: {
      execution_id: row.sell_execution_id,
      decision_id: row.sell_decision_id,
      session: row.sell_session,
      executed_at: iso(row.sell_executed_at),
      price_vnd: String(row.sell_price_vnd),
      qty: Number(row.sell_qty),
      gross_value_vnd: String(row.sell_gross_vnd),
      fee_vnd: String(row.sell_fee_vnd),
      tax_vnd: String(row.sell_tax_vnd),
      net_vnd: sellNet.toString(),
      decision_config_revision: optionalInteger(row.sell_decision_revision),
      reason_code: sellReasonCode,
      reason_label: reasonLabel(sellReasonCode),
      reason: row.sell_reason,
    },
    realized_pnl_vnd: realized.toString(),
    // (realized x 100 + cost - cost) / cost: a percentage, e.g. "2.5" = +2.5 %.
    realized_pnl_pct: buyTotal > 0n ? ratioString(realized * 100n + buyTotal, buyTotal) : null,
    holding_sessions: isTradingDay
      ? tradingSessionsBetween(row.opened_session, row.sell_session, isTradingDay)
      : Number(row.holding_sessions ?? 0),
    holding_days: Number(row.holding_days ?? 0),
    // Retired-policy audit values only; null/empty for iqx-bot-v1.0 lots.
    legacy_stop_loss_vnd: optionalString(row.stop_loss_vnd),
    legacy_take_profit_vnd: optionalString(row.take_profit_vnd),
    legacy_amplitude_at_entry_vnd: optionalString(row.amplitude_at_entry_vnd),
    legacy_amplitude_source_ref: optionalString(row.amplitude_source_ref),
    legacy_filter_ids: stringList(row.filter_ids),
  };
}

/** Raw row of a run receipt joined with its universe name and end-of-session NAV. */
export type SessionRow = {
  run_id: string;
  session: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: Date | string;
  completed_at: Date | string | null;
  policy_version: string | null;
  universe_kind: 'vn30' | 'custom' | null;
  universe_revision: number | string | null;
  universe_name: string | null;
  pinned_revision: number | string | null;
  issues: unknown;
  nav_vnd: string | number | null;
  cash_vnd: string | number | null;
  valuation_complete: boolean | null;
};

/** Decisions of one run grouped by action and reason code. */
export type SessionReasonRow = {
  bot_run_id: string;
  action: Action;
  reason_code: string;
  n: number | string;
  revision: number | string | null;
};

function issueList(value: unknown): BotSessionView['issues'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = objectValue(item);
    if (typeof record.code !== 'string') return [];
    return [
      {
        code: record.code,
        symbol: typeof record.symbol === 'string' ? record.symbol : null,
        detail: typeof record.detail === 'string' ? record.detail : null,
      },
    ];
  });
}

export function sessionView(row: SessionRow, reasons: readonly SessionReasonRow[]): BotSessionView {
  const counts = { buy: 0, sell: 0, hold: 0, skip: 0, total: 0 };
  const revisions: number[] = [];
  const grouped = reasons.map((group) => {
    const count = Number(group.n);
    counts[group.action] += count;
    counts.total += count;
    if (group.revision !== null && group.revision !== undefined) {
      revisions.push(Number(group.revision));
    }
    return {
      action: group.action,
      reason_code: group.reason_code,
      reason_label: reasonLabel(group.reason_code),
      count,
    };
  });
  grouped.sort(
    (a, b) =>
      b.count - a.count ||
      (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9) ||
      a.reason_code.localeCompare(b.reason_code),
  );
  const complete = row.valuation_complete;
  return {
    session: row.session,
    run_id: row.run_id,
    run_status: row.status,
    started_at: iso(row.started_at),
    completed_at: isoOrNull(row.completed_at),
    policy_version: row.policy_version,
    universe: row.universe_kind
      ? {
          kind: row.universe_kind,
          revision: Number(row.universe_revision ?? 0),
          name: row.universe_name ?? (row.universe_kind === 'vn30' ? 'VN30' : null),
        }
      : null,
    config_revision:
      optionalInteger(row.pinned_revision) ?? (revisions.length ? Math.max(...revisions) : null),
    counts,
    reasons: grouped,
    nav_end_vnd: complete === true && row.nav_vnd !== null ? String(row.nav_vnd) : null,
    cash_end_vnd: row.cash_vnd === null ? null : String(row.cash_vnd),
    valuation_complete: complete,
    issues: issueList(row.issues),
  };
}

/** Raw decision row of a session page (same columns as the Bot journal). */
export type DecisionRow = {
  id: string;
  run_id: string;
  trading_date: string;
  symbol: string | null;
  action: Action;
  reason_code: string;
  reason: string;
  rank_tuple: unknown;
  data_refs: unknown;
  filter_ids: unknown;
  threshold_vnd: string | number | null;
  decision_config_revision: number | string | null;
  condition_snapshot: unknown;
  created_at: Date | string;
  policy_version: string | null;
  universe_revision: number | string | null;
  universe_kind: 'vn30' | 'custom' | null;
  execution_id_joined: string | null;
  execution_side: 'buy' | 'sell' | null;
  execution_qty: number | string | null;
  execution_price_vnd: string | number | null;
  execution_gross_value_vnd: string | number | null;
  execution_fee_vnd: string | number | null;
  execution_tax_vnd: string | number | null;
  execution_net_cash_delta_vnd: string | number | null;
};

export function decisionView(row: DecisionRow): BotSessionDecisionView {
  const refs = objectValue(row.data_refs);
  return {
    id: row.id,
    run_id: row.run_id,
    trading_date: row.trading_date,
    action: row.action,
    reason_code: row.reason_code,
    reason_label: reasonLabel(row.reason_code),
    reason: row.reason,
    execution:
      row.execution_id_joined && row.execution_side
        ? {
            id: row.execution_id_joined,
            side: row.execution_side,
            qty: Number(row.execution_qty),
            price_vnd: String(row.execution_price_vnd),
            gross_value_vnd: String(row.execution_gross_value_vnd),
            fee_vnd: String(row.execution_fee_vnd),
            tax_vnd: String(row.execution_tax_vnd),
            net_cash_delta_vnd: String(row.execution_net_cash_delta_vnd),
          }
        : null,
    symbol: row.symbol,
    in_universe: typeof refs.in_universe === 'boolean' ? refs.in_universe : null,
    universe_revision: optionalInteger(row.universe_revision),
    universe_kind: row.universe_kind ?? null,
    policy_version: row.policy_version ?? null,
    decision_config_revision: optionalInteger(row.decision_config_revision),
    condition_snapshot: row.condition_snapshot ? objectValue(row.condition_snapshot) : null,
    rank_tuple: Array.isArray(row.rank_tuple) ? row.rank_tuple : null,
    // Legacy decisions only; always empty / null for iqx-bot-v1.0 rows.
    legacy_filter_ids: stringList(row.filter_ids),
    legacy_threshold_vnd: optionalString(row.threshold_vnd),
    source_refs: refs,
    created_at: iso(row.created_at),
  };
}

const invalidCursor = () =>
  new BadRequestException({ code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ' });

/**
 * Read-only history of the Bot ledger (Bot SPEC 2.2, 6.4, 8.6): closed round trips and the
 * per-session journal, computed from the immutable executions, positions, run receipts and
 * decision rows at decision time. Nothing here writes, and every query is scoped to the
 * authenticated owner's Bot account.
 */
@Injectable()
export class BotHistoryService {
  constructor(private readonly database: DatabaseService) {}

  private async accountId(userId: string): Promise<string | null> {
    const rows = await this.database.query<{ id: string }>(
      'select id from bot_accounts where user_id = $1',
      [userId],
    );
    return rows[0]?.id ?? null;
  }

  /** Closed round trips, newest sell first; the cursor is the id of the last trade of a page. */
  async trades(userId: string, query: TradesQuery): Promise<BotTradesPage> {
    const accountId = await this.accountId(userId);
    if (!accountId) return { items: [], next_cursor: null };
    const values: unknown[] = [accountId, query.limit + 1];
    let cursorCondition = '';
    if (query.cursor) {
      const found = await this.database.query<{ id: string }>(
        `select id from bot_positions
         where id = $1 and bot_account_id = $2 and status = 'closed' and sell_execution_id is not null`,
        [query.cursor, accountId],
      );
      if (!found[0]) throw invalidCursor();
      values.push(query.cursor);
      cursorCondition = `and (sx.executed_at, p.id) < (
          select cx.executed_at, c.id from bot_positions c
          join bot_executions cx on cx.id = c.sell_execution_id
          where c.id = $3 and c.bot_account_id = $1)`;
    }
    const rows = await this.database.query<TradeRow>(
      `select p.id, p.symbol, p.entry_price_vnd, p.entry_value_vnd, p.entry_fee_vnd,
              to_char(p.opened_session, 'YYYY-MM-DD') as opened_session, p.opened_at,
              p.entry_config_revision, p.entry_source_snapshot,
              p.stop_loss_vnd, p.take_profit_vnd, p.amplitude_at_entry_vnd,
              p.amplitude_source_ref, p.filter_ids,
              (select count(*)::int from bot_nav_daily n
                where n.bot_account_id = p.bot_account_id
                  and n.trading_date >= p.opened_session
                  and n.trading_date < sx.trading_date) as holding_sessions,
              (sx.trading_date - p.opened_session)::int as holding_days,
              bx.id as buy_execution_id, bx.qty as buy_qty,
              to_char(bx.trading_date, 'YYYY-MM-DD') as buy_session,
              bx.executed_at as buy_executed_at, bx.reason as buy_exec_reason,
              bd.id as buy_decision_id, bd.reason_code as buy_reason_code,
              bd.reason as buy_reason, bd.decision_config_revision as buy_decision_revision,
              sx.id as sell_execution_id, sx.qty as sell_qty, sx.price_vnd as sell_price_vnd,
              to_char(sx.trading_date, 'YYYY-MM-DD') as sell_session,
              sx.executed_at as sell_executed_at, sx.gross_value_vnd as sell_gross_vnd,
              sx.fee_vnd as sell_fee_vnd, sx.tax_vnd as sell_tax_vnd,
              sx.net_cash_delta_vnd as sell_net_vnd, sx.reason as sell_exec_reason,
              sd.id as sell_decision_id, sd.reason_code as sell_reason_code,
              sd.reason as sell_reason, sd.decision_config_revision as sell_decision_revision
         from bot_positions p
         join bot_executions sx on sx.id = p.sell_execution_id
         left join bot_executions bx on bx.id = p.buy_execution_id
         left join lateral (
           select d.id, d.reason_code, d.reason, d.decision_config_revision
             from bot_decisions d where d.execution_id = bx.id
            order by d.created_at, d.id limit 1) bd on true
         left join lateral (
           select d.id, d.reason_code, d.reason, d.decision_config_revision
             from bot_decisions d where d.execution_id = sx.id
            order by d.created_at, d.id limit 1) sd on true
        where p.bot_account_id = $1 and p.status = 'closed' ${cursorCondition}
        order by sx.executed_at desc, p.id desc
        limit $2`,
      values,
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    // One calendar read per page; null (no verified calendar) keeps the nav-row count.
    const calendar = page.length ? await loadTradingCalendar(this.database) : null;
    return {
      items: page.map((row) => tradeView(row, calendar)),
      next_cursor: rows.length > query.limit && last ? last.id : null,
    };
  }

  /** One row per trading session (run receipt), newest first; the cursor is a session date. */
  async sessions(userId: string, query: SessionsQuery): Promise<BotSessionsPage> {
    const accountId = await this.accountId(userId);
    if (!accountId) return { items: [], next_cursor: null };
    const rows = await this.sessionRows(userId, accountId, {
      before: query.cursor,
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const reasons = await this.reasonRows(page.map((row) => row.run_id));
    return {
      items: page.map((row) =>
        sessionView(
          row,
          reasons.filter((group) => group.bot_run_id === row.run_id),
        ),
      ),
      next_cursor: rows.length > query.limit ? (page.at(-1)?.session ?? null) : null,
    };
  }

  /** The decisions of one session (executed ones first, then by symbol), paginated. */
  async session(
    userId: string,
    session: string,
    query: SessionDecisionsQuery,
  ): Promise<BotSessionDecisionsPage> {
    const accountId = await this.accountId(userId);
    const header = accountId
      ? (await this.sessionRows(userId, accountId, { on: session, limit: 1 }))[0]
      : undefined;
    if (!header) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Không có lượt chạy Bot nào cho phiên này',
      });
    }
    const values: unknown[] = [header.run_id, query.limit + 1];
    let cursorCondition = '';
    if (query.cursor) {
      const found = await this.database.query<{ id: string }>(
        'select id from bot_decisions where id = $1 and bot_run_id = $2',
        [query.cursor, header.run_id],
      );
      if (!found[0]) throw invalidCursor();
      values.push(query.cursor);
      cursorCondition = `and ((d.execution_id is null), coalesce(d.symbol, ''), d.id) > (
          select (c.execution_id is null), coalesce(c.symbol, ''), c.id
            from bot_decisions c where c.id = $3 and c.bot_run_id = $1)`;
    }
    const rows = await this.database.query<DecisionRow>(
      `select d.id, d.symbol, d.action, d.reason_code, d.reason, d.rank_tuple, d.data_refs,
              d.filter_ids, d.threshold_vnd, d.decision_config_revision, d.condition_snapshot,
              d.created_at, r.id as run_id, to_char(r.trading_date, 'YYYY-MM-DD') as trading_date,
              r.policy_version, r.universe_revision, r.universe_kind,
              e.id as execution_id_joined, e.side as execution_side, e.qty as execution_qty,
              e.price_vnd as execution_price_vnd, e.gross_value_vnd as execution_gross_value_vnd,
              e.fee_vnd as execution_fee_vnd, e.tax_vnd as execution_tax_vnd,
              e.net_cash_delta_vnd as execution_net_cash_delta_vnd
         from bot_decisions d
         join bot_run_receipts r on r.id = d.bot_run_id
         left join bot_executions e on e.id = d.execution_id
        where d.bot_run_id = $1 ${cursorCondition}
        order by (d.execution_id is null), coalesce(d.symbol, ''), d.id
        limit $2`,
      values,
    );
    const page = rows.slice(0, query.limit);
    const reasons = await this.reasonRows([header.run_id]);
    return {
      session: sessionView(header, reasons),
      items: page.map(decisionView),
      next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private sessionRows(
    userId: string,
    accountId: string,
    filter: { before?: string; on?: string; limit: number },
  ): Promise<SessionRow[]> {
    const values: unknown[] = [userId, accountId, filter.limit];
    let condition = '';
    if (filter.on) {
      values.push(filter.on);
      condition = `and r.trading_date = $${values.length}::date`;
    } else if (filter.before) {
      values.push(filter.before);
      condition = `and r.trading_date < $${values.length}::date`;
    }
    return this.database.query<SessionRow>(
      `select r.id as run_id, to_char(r.trading_date, 'YYYY-MM-DD') as session, r.status,
              r.started_at, r.completed_at, r.policy_version, r.universe_kind,
              r.universe_revision, r.issues, u.name as universe_name,
              case when jsonb_typeof(r.rule_snapshot #> '{shared_config,revision}') = 'number'
                   then (r.rule_snapshot #>> '{shared_config,revision}')::numeric::int
              end as pinned_revision,
              n.nav_vnd, n.cash_vnd, n.valuation_complete
         from bot_run_receipts r
         left join bot_universe_revisions u
           on u.user_id = r.user_id and u.revision = r.universe_revision
         left join bot_nav_daily n
           on n.bot_account_id = r.bot_account_id and n.trading_date = r.trading_date
        where r.user_id = $1 and r.bot_account_id = $2 ${condition}
        order by r.trading_date desc
        limit $3`,
      values,
    );
  }

  private async reasonRows(runIds: readonly string[]): Promise<SessionReasonRow[]> {
    if (runIds.length === 0) return [];
    return this.database.query<SessionReasonRow>(
      `select d.bot_run_id, d.action, d.reason_code, count(*)::int as n,
              max(d.decision_config_revision) as revision
         from bot_decisions d
        where d.bot_run_id = any($1::uuid[])
        group by d.bot_run_id, d.action, d.reason_code`,
      [runIds],
    );
  }
}
