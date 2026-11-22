import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  IndexMembershipService,
  type MembershipCaptureResult,
} from '../market-integration/index-membership.service.js';
import { STRATEGY_RULES } from '../strategy-rules/index.js';
import { BotScheduleService } from './bot-schedule.service.js';
import { BotSessionRunner, type BotSessionBatchResult } from './bot-session-runner.js';
import { BOT_POLICY, BOT_REASON_LABELS, parseInteger, ratioString } from './bot.domain.js';
import { BOT_POLICY_V2, BOT_POLICY_V2_VERSION } from './bot.policy-v2.js';
import type {
  BotAccountRow,
  BotInstanceRow,
  BotIssue,
  BotRunResult,
  BotRunRow,
} from './bot.types.js';

const DISCLOSURE =
  'Bot demo IQX mô phỏng mua và bán theo giá đóng cửa của chính phiên tạo tín hiệu. ' +
  'Kết quả không tái hiện đầy đủ khả năng khớp lệnh, thanh khoản và thời gian thanh ' +
  'toán của giao dịch thực tế. Đây không phải cam kết lợi nhuận hoặc khuyến nghị ' +
  'giao dịch tiền thật.';

const BOT_STRATEGY_ID = 'iqx_standard';
const BOT_STRATEGY_VERSION = 1;
const INITIAL_CASH_VND = BigInt(BOT_POLICY.initial_cash_vnd);

type InstanceAccountRow = BotInstanceRow & {
  account_id: string;
  account_user_id: string;
  initial_cash_vnd: string;
  cash_vnd: string;
  account_status: 'active' | 'suspended';
  account_activated_at: Date | string;
};

type SellState = 't2_wait' | 'sellable' | 'due' | 'due_unfilled';

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function issues(value: unknown): BotIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = objectValue(item);
    if (typeof row.code !== 'string') return [];
    return [
      {
        code: row.code,
        symbol: typeof row.symbol === 'string' ? row.symbol : null,
        detail: typeof row.detail === 'string' ? row.detail : null,
      },
    ];
  });
}

function validateTradingDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new BadRequestException({
      code: 'INVALID_TRADING_DATE',
      message: 'Ngày giao dịch không hợp lệ',
    });
  }
}

const ddmm = (date: string | null): string | null =>
  date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : null;

/**
 * Bot v2.0 (spec §5, PLAN W3): account initialisation, the read API and the session entry points.
 * The Bot only chooses a strategy (Lịch phiên, `BotScheduleService`); each session runs the shared
 * strategy rules through `BotSessionRunner`.
 */
@Injectable()
export class BotService {
  constructor(
    private readonly database: DatabaseService,
    private readonly runner: BotSessionRunner,
    private readonly schedule: BotScheduleService,
    @Optional()
    private readonly membership?: IndexMembershipService,
    @Optional()
    private readonly config?: ConfigService<Environment, true>,
  ) {}

  /**
   * Bot SPEC 8.4 / 18.2: real new buys stay off until the owner confirms the candidate ordering.
   * `BOT_NEW_BUYS_ENABLED` defaults to false; without a config source it is false too. Sells and
   * the whole decision journal run either way.
   */
  newBuysEnabled(): boolean {
    return this.config?.get('BOT_NEW_BUYS_ENABLED', { infer: true }) === true;
  }

  /** Stable integration aliases used by workspace onboarding hooks. */
  initializeAccount(userId: string): Promise<{ initialized: boolean; instanceId: string | null }> {
    return this.initialize(userId);
  }

  initializeUser(userId: string): Promise<{ initialized: boolean; instanceId: string | null }> {
    return this.initialize(userId);
  }

  initializeRunner(
    userId: string,
    tradingDate?: string,
  ): Promise<{ initialized: boolean; instanceId: string | null } | BotRunResult> {
    return tradingDate === undefined
      ? this.initialize(userId)
      : this.runAccountSession(userId, tradingDate);
  }

  /**
   * Gate-free, idempotent account initialisation (workspace ensure). One Bot instance and
   * one Bot account per user; the initial 100m VND is granted exactly once under the
   * ledger idempotency key `bot:v1:funding:<user>` (also what legacy accounts carry).
   * Never called from a scheduled run and never from a GET.
   */
  async initialize(userId: string): Promise<{ initialized: boolean; instanceId: string | null }> {
    return this.database.transaction(async (tx) => {
      const existing = await tx.query<{ id: string }>(
        'select id from bot_instances where user_id = $1',
        [userId],
      );
      if (existing[0]) return { initialized: false, instanceId: existing[0].id };

      const now = new Date();
      const accountId = randomUUID();
      const accountRows = await tx.query<BotAccountRow>(
        `insert into bot_accounts
           (id, user_id, initial_cash_vnd, cash_vnd, status, activated_at, created_at, updated_at)
         values ($1, $2, $3, $3, 'active', $4::timestamptz,
                 $4::timestamptz at time zone 'UTC', $4::timestamptz at time zone 'UTC')
         on conflict (user_id) do nothing
         returning id, user_id, initial_cash_vnd, cash_vnd, status, activated_at`,
        [accountId, userId, INITIAL_CASH_VND.toString(), now],
      );
      const account =
        accountRows[0] ??
        (
          await tx.query<BotAccountRow>(
            `select id, user_id, initial_cash_vnd, cash_vnd, status, activated_at
           from bot_accounts where user_id = $1 for update`,
            [userId],
          )
        )[0];
      if (!account) throw new Error('Bot account conflict could not be resolved');

      const fundingKey = `bot:v1:funding:${userId}`;
      const ledger = await tx.query<{ entries: string; funding_exists: boolean }>(
        `select count(*)::text as entries,
                bool_or(idempotency_key = $2) as funding_exists
         from bot_cash_ledger where bot_account_id = $1`,
        [account.id, fundingKey],
      );
      if (!ledger[0]?.funding_exists) {
        if (ledger[0]?.entries !== '0' || parseInteger(account.cash_vnd) !== INITIAL_CASH_VND) {
          throw new Error('Cannot reconstruct Bot funding without changing balance');
        }
        await tx.query(
          `insert into bot_cash_ledger
             (id, bot_account_id, execution_id, kind, amount_vnd, balance_after_vnd,
              idempotency_key, note, created_at)
           values ($1, $2, null, 'initial_funding', $3, $3, $4, $5, $6)
           on conflict (idempotency_key) do nothing`,
          [
            randomUUID(),
            account.id,
            INITIAL_CASH_VND.toString(),
            fundingKey,
            'Vốn demo Bot IQX, cấp đúng một lần',
            now,
          ],
        );
      }

      const instanceId = randomUUID();
      const inserted = await tx.query<{ id: string }>(
        `insert into bot_instances
           (id, user_id, bot_account_id, strategy_id, strategy_version, execution_model,
            cap6_graduated_at, activated_at, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, null, $7::timestamptz,
                 $7::timestamptz at time zone 'UTC', $7::timestamptz at time zone 'UTC')
         on conflict (user_id) do nothing returning id`,
        [
          instanceId,
          userId,
          account.id,
          BOT_STRATEGY_ID,
          BOT_STRATEGY_VERSION,
          BOT_POLICY_V2.execution_model,
          now,
        ],
      );
      const winner =
        inserted[0]?.id ??
        (
          await tx.query<{ id: string }>('select id from bot_instances where user_id = $1', [
            userId,
          ])
        )[0]?.id;
      if (!winner) throw new Error('Bot instance conflict could not be resolved');
      return { initialized: Boolean(inserted[0]), instanceId: winner };
    });
  }

  /**
   * Stores today's VN30 constituents (job `market.index-membership`, before the Bot run).
   * Past sessions are never written.
   */
  captureVn30Membership(sessionDate: string, now = new Date()): Promise<MembershipCaptureResult> {
    validateTradingDate(sessionDate);
    if (!this.membership) {
      throw new ServiceUnavailableException({
        code: 'INDEX_MEMBERSHIP_UNAVAILABLE',
        message: 'Nguồn thành phần chỉ số chưa được cấu hình',
      });
    }
    return this.membership.capture('VN30', sessionDate, now);
  }

  /** Job `bot.session-eod`: every active Bot for session D (no-op until the store has D). */
  runSession(tradingDate: string, now = new Date()): Promise<BotSessionBatchResult> {
    validateTradingDate(tradingDate);
    return this.runner.runSession(tradingDate, now);
  }

  runScheduledSession(tradingDate: string, now = new Date()) {
    return this.runSession(tradingDate, now);
  }

  runAccountSession(userId: string, tradingDate: string, now = new Date()): Promise<BotRunResult> {
    validateTradingDate(tradingDate);
    return this.runner.runAccountSession(userId, tradingDate, now);
  }

  private async instanceAccount(
    client: SqlClient,
    userId: string,
  ): Promise<InstanceAccountRow | null> {
    const rows = await client.query<InstanceAccountRow>(
      `select i.*, a.id as account_id, a.user_id as account_user_id,
              a.initial_cash_vnd, a.cash_vnd, a.status as account_status,
              a.activated_at as account_activated_at
       from bot_instances i
       join bot_accounts a on a.id = i.bot_account_id
       where i.user_id = $1 and a.user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async latestNav(accountId: string) {
    return (
      await this.database.query<{
        trading_date: Date | string;
        cash_vnd: string;
        market_value_vnd: string | null;
        nav_vnd: string | null;
        valuation_complete: boolean;
      }>(
        `select trading_date, cash_vnd, market_value_vnd, nav_vnd, valuation_complete
           from bot_nav_daily where bot_account_id = $1
          order by trading_date desc limit 1`,
        [accountId],
      )
    )[0];
  }

  async overview(userId: string): Promise<Record<string, unknown>> {
    const context = await this.instanceAccount(this.database, userId);
    const runStatus = await this.status(userId);
    const nav = context ? await this.latestNav(context.account_id) : undefined;
    const navValue = nav?.valuation_complete
      ? nav.nav_vnd
      : nav
        ? null
        : (context?.cash_vnd ?? null);
    const openPositions = context
      ? Number(
          (
            await this.database.query<{ n: number }>(
              `select count(*)::int as n from bot_positions
                where bot_account_id = $1 and status = 'open'`,
              [context.account_id],
            )
          )[0]?.n ?? 0,
        )
      : 0;
    return {
      eligible: Boolean(context),
      disclosure: DISCLOSURE,
      bot: context
        ? {
            strategy_id: context.strategy_id,
            strategy_version: context.strategy_version,
            execution_model: context.execution_model,
            initial_cash_vnd: context.initial_cash_vnd,
            activated_at: isoTimestamp(context.activated_at),
            policy_version: BOT_POLICY_V2_VERSION,
            rules_version: BOT_POLICY_V2.rules_version,
            candidate_order: BOT_POLICY_V2.candidate_order,
            new_buys_enabled: this.newBuysEnabled(),
          }
        : null,
      open_positions: openPositions,
      account: context
        ? {
            cash_vnd: nav?.cash_vnd ?? context.cash_vnd,
            market_value_vnd: nav ? nav.market_value_vnd : '0',
            nav_vnd: navValue,
            pnl_total_net_vnd:
              navValue === null ? null : (parseInteger(navValue) - INITIAL_CASH_VND).toString(),
            return_total:
              navValue === null ? null : ratioString(parseInteger(navValue), INITIAL_CASH_VND),
            valuation_complete: nav?.valuation_complete ?? true,
            as_of_session: nav ? isoDate(nav.trading_date) : null,
          }
        : null,
      bot_run: runStatus,
    };
  }

  /**
   * Latest run status. `processed_unseen_sessions` was a mascot-animation cursor owned by
   * the journey identity module; the Bot no longer reads that table, so it is always 0 here
   * (the identity mascot endpoint computes its own value).
   */
  async status(userId: string): Promise<{
    status: 'idle' | 'running' | 'succeeded' | 'failed';
    latest_run_id: string | null;
    last_updated_at: string | null;
    processed_unseen_sessions: number;
    issues: BotIssue[];
  }> {
    const rows = await this.database.query<BotRunRow>(
      `select r.* from bot_run_receipts r
       where r.user_id = $1
       order by r.trading_date desc, r.started_at desc
       limit 1`,
      [userId],
    );
    const latest = rows[0];
    return {
      status: latest?.status ?? 'idle',
      latest_run_id: latest?.id ?? null,
      last_updated_at: latest ? isoTimestamp(latest.completed_at ?? latest.started_at) : null,
      processed_unseen_sessions: 0,
      issues: issues(latest?.issues),
    };
  }


  /**
   * Đang giữ (§5.5, §10.4): counted/held against the last processed session, N = Giữ tối đa of
   * the strategy of the last session (30 without one), T+2 and due dates on the real calendar.
   */
  async positions(userId: string, now = new Date()): Promise<Record<string, unknown>> {
    const context = await this.instanceAccount(this.database, userId);
    if (!context) return { items: [], valuation_complete: false, as_of_session: null };
    const rows = await this.database.query<{
      id: string;
      symbol: string;
      qty_open: number;
      entry_price_vnd: string;
      entry_value_vnd: string;
      entry_fee_vnd: string;
      opened_session: string;
      opened_at: Date | string;
      anchor_session: string | null;
      anchor_reason: 'entry' | 'policy_cutover' | null;
      sellable_from_session: string | null;
      entry_source_snapshot: unknown;
      sector: string | null;
    }>(
      `select p.id, p.symbol, p.qty_open, p.entry_price_vnd::text, p.entry_value_vnd::text,
              p.entry_fee_vnd::text, to_char(p.opened_session, 'YYYY-MM-DD') as opened_session,
              p.opened_at, to_char(p.anchor_session, 'YYYY-MM-DD') as anchor_session,
              p.anchor_reason,
              to_char(p.sellable_from_session, 'YYYY-MM-DD') as sellable_from_session,
              p.entry_source_snapshot, s.icb_lv2 as sector
         from bot_positions p left join symbols s on s.symbol = p.symbol
        where p.bot_account_id = $1 and p.status = 'open' order by p.symbol`,
      [context.account_id],
    );
    const lastRun = (
      await this.database.query<{ id: string; trading_date: string; universe: unknown }>(
        `select id, to_char(trading_date, 'YYYY-MM-DD') as trading_date, universe
           from bot_run_receipts where bot_account_id = $1 and status = 'succeeded'
          order by trading_date desc limit 1`,
        [context.account_id],
      )
    )[0];
    const asOf = lastRun?.trading_date ?? null;
    const snapshot = lastRun
      ? (
          await this.database.query<{ payload: unknown }>(
            'select payload from bot_market_snapshots where bot_run_id = $1',
            [lastRun.id],
          )
        )[0]
      : undefined;
    const frozen = objectValue(objectValue(objectValue(snapshot?.payload).input).symbols);
    const unfilled = new Set(
      lastRun
        ? (
            await this.database.query<{ symbol: string }>(
              `select symbol from bot_decisions
                where bot_run_id = $1 and reason_code = 'due_unfilled'`,
              [lastRun.id],
            )
          ).map((row) => row.symbol)
        : [],
    );
    let scheduleView: Awaited<ReturnType<BotScheduleService['view']>> | null;
    try {
      scheduleView = await this.schedule.view(userId, now);
    } catch {
      scheduleView = null;
    }
    const strategyLast = scheduleView?.last ?? null;
    const maxHolding = strategyLast?.source
      ? strategyLast.max_holding
      : STRATEGY_RULES.default_max_holding;
    const nextSession = scheduleView?.next.session_date ?? null;
    const universe = objectValue(lastRun?.universe);
    const universeSymbols = new Set(stringList(universe.symbols));
    const universeKnown = Boolean(lastRun && universe.type && universe.type !== 'none');
    let calendar: Awaited<ReturnType<BotScheduleService['calendar']>> | null = null;
    try {
      calendar = rows.length ? await this.schedule.calendar() : null;
    } catch {
      calendar = null;
    }
    let complete = Boolean(lastRun);
    let marketTotal = 0n;
    const items = rows.map((row) => {
      const frozenRow = objectValue(frozen[row.symbol]);
      const closeRaw = frozenRow.close_vnd ?? frozenRow.last_close_vnd;
      const close = typeof closeRaw === 'string' ? BigInt(closeRaw) : null;
      if (close === null) complete = false;
      const marketValue = close === null ? null : BigInt(row.qty_open) * close;
      if (marketValue !== null) marketTotal += marketValue;
      const pnl =
        marketValue === null
          ? null
          : marketValue - parseInteger(row.entry_value_vnd) - parseInteger(row.entry_fee_vnd);
      const entry = row.opened_session;
      const anchor = row.anchor_session ?? entry;
      const held = calendar && asOf ? calendar.countSessions(entry, asOf) : null;
      const counted = calendar && asOf ? calendar.countSessions(anchor, asOf) : null;
      const sellableFrom =
        row.sellable_from_session ??
        calendar?.addSessions(entry, STRATEGY_RULES.settlement_sessions) ??
        null;
      const dueSession = calendar ? calendar.addSessions(anchor, maxHolding) : null;
      const nextCounted =
        calendar && nextSession ? calendar.countSessions(anchor, nextSession) : null;
      const nextHeld = calendar && nextSession ? calendar.countSessions(entry, nextSession) : null;
      let sellState: SellState = 'sellable';
      let detail: string | null = dueSession ? `Đến hạn ${ddmm(dueSession)}` : null;
      if (counted !== null && counted >= maxHolding) {
        sellState = unfilled.has(row.symbol) ? 'due_unfilled' : 'due';
        detail = unfilled.has(row.symbol) ? 'Tạm ngừng giao dịch' : 'Bán ở phiên xử lý kế tiếp';
      } else if (
        nextCounted !== null &&
        nextHeld !== null &&
        nextCounted >= maxHolding &&
        nextHeld >= STRATEGY_RULES.settlement_sessions
      ) {
        sellState = 'due';
        detail = 'Bán ở phiên xử lý kế tiếp';
      } else if (nextSession && sellableFrom && nextSession < sellableFrom) {
        sellState = 't2_wait';
        detail = `Bán được từ ${ddmm(sellableFrom)}`;
      }
      const entrySource = objectValue(row.entry_source_snapshot);
      return {
        id: row.id,
        symbol: row.symbol,
        qty: row.qty_open,
        entry_price_vnd: row.entry_price_vnd,
        current_close_vnd: close?.toString() ?? null,
        market_value_vnd: marketValue?.toString() ?? null,
        unrealized_pnl_net_vnd: pnl?.toString() ?? null,
        entry_session: entry,
        anchor_session: anchor,
        anchor_reason: row.anchor_reason ?? 'entry',
        sellable_from_session: sellableFrom,
        counted,
        held,
        holding_sessions: held,
        max_holding: maxHolding,
        due_session: dueSession,
        sell_state: sellState,
        sell_state_detail: detail,
        entry_universe_label:
          typeof entrySource.label === 'string'
            ? entrySource.label
            : typeof entrySource.name === 'string'
              ? entrySource.name
              : null,
        in_universe: universeKnown ? universeSymbols.has(row.symbol) : null,
        opened_session: entry,
        opened_at: isoTimestamp(row.opened_at),
        sector: row.sector,
      };
    });
    const nav = await this.latestNav(context.account_id);
    const navValue = nav?.nav_vnd ? parseInteger(nav.nav_vnd) : null;
    return {
      items: items.map((item) => ({
        ...item,
        weight_pct:
          item.market_value_vnd && navValue && navValue > 0n
            ? ratioString(BigInt(item.market_value_vnd) * 100n + navValue, navValue)
            : null,
      })),
      max_holding: maxHolding,
      market_value_vnd: complete ? marketTotal.toString() : null,
      valuation_complete: complete && Boolean(nav?.valuation_complete),
      as_of_session: asOf,
    };
  }

  async journal(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Record<string, unknown>> {
    const context = await this.instanceAccount(this.database, userId);
    if (!context) return { items: [], next_cursor: null, issues: [] };
    let cursorCondition = '';
    const values: unknown[] = [userId, context.account_id, limit + 1];
    if (cursor) {
      const cursorRows = await this.database.query<{ created_at: Date | string; id: string }>(
        `select d.created_at, d.id from bot_decisions d
         join bot_run_receipts r on r.id = d.bot_run_id
         where d.id = $1 and r.user_id = $2`,
        [cursor, userId],
      );
      if (!cursorRows[0]) {
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'Cursor nhật ký không hợp lệ',
        });
      }
      values.push(cursorRows[0].created_at, cursorRows[0].id);
      cursorCondition = 'and (d.created_at, d.id) < ($4, $5::uuid)';
    }
    const rows = await this.database.query<Record<string, unknown>>(
      `select d.*, r.trading_date, r.id as run_id, r.policy_version,
              r.universe_revision, r.universe_kind,
              e.id as execution_id_joined, e.side as execution_side, e.qty as execution_qty,
              e.price_vnd as execution_price_vnd, e.gross_value_vnd as execution_gross_value_vnd,
              e.fee_vnd as execution_fee_vnd, e.tax_vnd as execution_tax_vnd,
              e.net_cash_delta_vnd as execution_net_cash_delta_vnd
       from bot_decisions d
       join bot_run_receipts r on r.id = d.bot_run_id
       left join bot_executions e on e.id = d.execution_id
       where r.user_id = $1 and r.bot_account_id = $2 ${cursorCondition}
       order by d.created_at desc, d.id desc limit $3`,
      values,
    );
    const page = rows.slice(0, limit);
    const latest = (
      await this.database.query<{ issues: unknown }>(
        `select issues from bot_run_receipts where bot_account_id = $1
         order by trading_date desc, started_at desc limit 1`,
        [context.account_id],
      )
    )[0];
    return {
      items: page.map((row) => {
        const refs = objectValue(row.data_refs);
        const reasonCode = String(row.reason_code);
        return {
          id: row.id,
          run_id: row.run_id,
          trading_date: isoDate(row.trading_date as Date | string),
          action: row.action,
          reason_code: reasonCode,
          reason_label: BOT_REASON_LABELS[reasonCode] ?? null,
          reason: row.reason,
          execution: row.execution_id_joined
            ? {
                id: row.execution_id_joined,
                side: row.execution_side,
                qty: row.execution_qty,
                price_vnd: String(row.execution_price_vnd),
                gross_value_vnd: String(row.execution_gross_value_vnd),
                fee_vnd: String(row.execution_fee_vnd),
                tax_vnd: String(row.execution_tax_vnd),
                net_cash_delta_vnd: String(row.execution_net_cash_delta_vnd),
              }
            : null,
          symbol: row.symbol,
          // Buy-source membership of a held symbol at decision time (Sell holds only).
          in_universe: typeof refs.in_universe === 'boolean' ? refs.in_universe : null,
          universe_revision:
            row.universe_revision === null || row.universe_revision === undefined
              ? null
              : Number(row.universe_revision),
          universe_kind:
            row.universe_kind === null || row.universe_kind === undefined
              ? null
              : String(row.universe_kind),
          policy_version:
            row.policy_version === null || row.policy_version === undefined
              ? null
              : String(row.policy_version),
          decision_config_revision:
            row.decision_config_revision === null || row.decision_config_revision === undefined
              ? null
              : Number(row.decision_config_revision),
          condition_snapshot:
            row.condition_snapshot === null || row.condition_snapshot === undefined
              ? null
              : objectValue(row.condition_snapshot),
          rank_tuple: Array.isArray(row.rank_tuple) ? row.rank_tuple : null,
          // Legacy decisions only; always empty / null for iqx-bot-v1.0 rows.
          legacy_filter_ids: stringList(row.filter_ids),
          legacy_threshold_vnd: row.threshold_vnd == null ? null : String(row.threshold_vnd),
          source_refs: refs,
          created_at: isoTimestamp(row.created_at as Date | string),
        };
      }),
      next_cursor: rows.length > limit ? String(page.at(-1)?.id ?? '') || null : null,
      issues: issues(latest?.issues),
    };
  }


  async performance(userId: string, from?: string, to?: string): Promise<Record<string, unknown>> {
    if (from) validateTradingDate(from);
    if (to) validateTradingDate(to);
    if (from && to && from > to) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'Khoảng ngày hiệu suất không hợp lệ',
      });
    }
    const context = await this.instanceAccount(this.database, userId);
    if (!context) return { base: null, series: [], comparison_available: false };
    const values: unknown[] = [context.account_id];
    const conditions: string[] = [];
    if (from) {
      values.push(from);
      conditions.push(`trading_date >= $${values.length}::date`);
    }
    if (to) {
      values.push(to);
      conditions.push(`trading_date <= $${values.length}::date`);
    }
    const rows = await this.database.query<{
      trading_date: Date | string;
      cash_vnd: string;
      market_value_vnd: string | null;
      nav_vnd: string | null;
      valuation_complete: boolean;
      vnindex: string | null;
    }>(
      `select trading_date, cash_vnd, market_value_vnd, nav_vnd, valuation_complete, vnindex
       from bot_nav_daily where bot_account_id = $1
       ${conditions.length ? `and ${conditions.join(' and ')}` : ''}
       order by trading_date`,
      values,
    );
    const complete = rows.filter(
      (row) => row.valuation_complete && row.nav_vnd && parseInteger(row.nav_vnd) > 0n,
    );
    const common = complete.filter((row) => row.vnindex && Number(row.vnindex) > 0);
    const base = common[0] ?? complete[0];
    return {
      base: base
        ? {
            trading_date: isoDate(base.trading_date),
            bot_nav_vnd: base.nav_vnd,
            vnindex_value: base.vnindex,
          }
        : null,
      series: rows.map((row) => ({
        trading_date: isoDate(row.trading_date),
        cash_vnd: row.cash_vnd,
        market_value_vnd: row.market_value_vnd,
        nav_vnd: row.nav_vnd,
        valuation_complete: row.valuation_complete,
        bot_return_since_base:
          base?.nav_vnd && row.valuation_complete && row.nav_vnd
            ? ratioString(parseInteger(row.nav_vnd), parseInteger(base.nav_vnd))
            : null,
        vnindex_value: row.vnindex,
        vnindex_return_since_base:
          base?.vnindex && row.vnindex ? this.decimalRatio(row.vnindex, base.vnindex) : null,
      })),
      comparison_available: common.length > 0,
    };
  }

  private decimalRatio(value: string, base: string): string | null {
    const scale = Math.max((value.split('.')[1] ?? '').length, (base.split('.')[1] ?? '').length);
    const multiplier = 10n ** BigInt(scale);
    const toScaled = (input: string): bigint => {
      const [whole = '0', fraction = ''] = input.split('.');
      return BigInt(whole) * multiplier + BigInt((fraction + '0'.repeat(scale)).slice(0, scale));
    };
    return ratioString(toScaled(value), toScaled(base));
  }
}
