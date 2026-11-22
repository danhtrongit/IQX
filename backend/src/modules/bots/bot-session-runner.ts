import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  buildSessionInput,
  createSignalProvider,
  PRICE_STORE,
  resolveUniverse,
  RULE_MESSAGES,
  sessionStrategyOf,
  stepSession,
  STRATEGY_RULES,
  universeLabel,
  type FeeRules,
  type JournalEntry,
  type PortfolioState,
  type PositionState,
  type PriceStorePort,
  type ResolvedStrategy,
  type SessionInput,
  type SessionResult,
  type SymbolSessionInput,
} from '../strategy-rules/index.js';
import { botCalendar, isGiveUpTime, loadHolidays } from './bot-calendar.js';
import { canonicalHash, parseInteger } from './bot.domain.js';
import {
  BOT_POLICY_V2,
  BOT_POLICY_V2_VERSION,
  botV2Receipt,
  isV2Receipt,
  verifyV2Receipt,
  type BotV2Fees,
  type BotV2RuleSnapshot,
  type BotV2StrategyPin,
  type BotV2UniversePin,
} from './bot.policy-v2.js';
import { BotScheduleService, type ScheduleRow } from './bot-schedule.service.js';
import type { BotBatchResult, BotIssue, BotRunResult, BotRunRow } from './bot.types.js';
import {
  NOTIFICATION_WRITER,
  type BotTradeExecution,
  type NotificationWriter,
} from '../notifications/notification-writer.port.js';

const INITIAL_CASH_VND = STRATEGY_RULES.initial_cash_vnd;

/** The store has no bar of session D yet: the job retries on its next tick (§6.4, PLAN §8). */
export class BotSessionNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotSessionNotReady';
  }
}

type ContextRow = {
  bot_id: string;
  strategy_id: string;
  strategy_version: number;
  account_id: string;
  cash_vnd: string;
  account_status: 'active' | 'suspended';
  account_activated_at: Date | string;
};

type OpenPositionRow = {
  id: string;
  symbol: string;
  qty_open: number;
  entry_price_vnd: string;
  entry_value_vnd: string;
  entry_fee_vnd: string;
  opened_session: string;
  anchor_session: string | null;
  anchor_reason: 'entry' | 'policy_cutover' | null;
  entry_source_snapshot: unknown;
};

type FrozenPayload = {
  session: string;
  data_as_of: string;
  data_hash: string;
  vnindex: number | null;
  input: SerializedSessionInput;
};

type SerializedSymbol = Omit<SymbolSessionInput, 'close_vnd' | 'last_close_vnd' | 'gtgd20_vnd'> & {
  close_vnd: string | null;
  last_close_vnd: string | null;
  gtgd20_vnd: string | null;
};
type SerializedSessionInput = Omit<SessionInput, 'symbols'> & {
  symbols: Record<string, SerializedSymbol>;
};

const big = (value: string | null | undefined): bigint | null =>
  value === null || value === undefined ? null : BigInt(value);

function serializeInput(input: SessionInput): SerializedSessionInput {
  const symbols: Record<string, SerializedSymbol> = {};
  for (const symbol of Object.keys(input.symbols).sort()) {
    const row = input.symbols[symbol]!;
    symbols[symbol] = {
      ...row,
      close_vnd: row.close_vnd?.toString() ?? null,
      last_close_vnd: row.last_close_vnd?.toString() ?? null,
      gtgd20_vnd: row.gtgd20_vnd?.toString() ?? null,
      sell_issue: row.sell_issue ?? null,
    };
  }
  return { ...input, universe: [...input.universe], symbols };
}

function deserializeInput(input: SerializedSessionInput): SessionInput {
  const symbols: Record<string, SymbolSessionInput> = {};
  for (const [symbol, row] of Object.entries(input.symbols)) {
    symbols[symbol] = {
      ...row,
      close_vnd: big(row.close_vnd),
      last_close_vnd: big(row.last_close_vnd),
      gtgd20_vnd: big(row.gtgd20_vnd),
    };
  }
  return { ...input, symbols };
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

function issueList(value: unknown): BotIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item as Record<string, unknown>;
    return typeof row?.code === 'string'
      ? [
          {
            code: row.code,
            symbol: typeof row.symbol === 'string' ? row.symbol : null,
            detail: typeof row.detail === 'string' ? row.detail : null,
          },
        ]
      : [];
  });
}

const SESSION_JOURNAL = new Set(['no_strategy', 'sell_only', 'universe_empty', 'nav_incomplete']);

/** One-line result of a session for the Nhật ký tab (§5.5). */
export function sessionSummary(result: Pick<SessionResult, 'buys' | 'sells' | 'journal'>): string {
  const parts: string[] = [];
  if (result.buys.length) parts.push(`Mua ${result.buys.map((buy) => buy.symbol).join(', ')}`);
  for (const sell of result.sells) {
    parts.push(
      `Bán ${sell.symbol} (${sell.exit_reason === 'indicator' ? RULE_MESSAGES.exit_indicator : RULE_MESSAGES.exit_max_holding})`,
    );
  }
  const unfilled = result.journal.filter((row) => row.code === 'due_unfilled');
  if (unfilled.length) {
    parts.push(
      `${unfilled.length} đến hạn chưa khớp (${unfilled.map((row) => `${row.symbol} tạm ngừng giao dịch`).join(', ')})`,
    );
  }
  if (parts.length === 0) {
    const session = result.journal.find((row) => row.symbol === null);
    if (session?.code === 'no_strategy') return RULE_MESSAGES.no_strategy;
    if (session?.code === 'universe_empty') return RULE_MESSAGES.universe_empty;
    return RULE_MESSAGES.no_orders;
  }
  return parts.join(' · ');
}

/**
 * Bot v2.0 session runner (spec §3, §6.4, PLAN W3): for session D it locks the Lịch phiên row,
 * freezes the session input built from the price store with the same code as the Backtest
 * (`buildSessionInput`), then applies `stepSession` to the ledger in one transaction. A retry of
 * the same session reuses the frozen receipt: no resell, no duplicate row, same version (R14).
 */
@Injectable()
export class BotSessionRunner {
  private readonly logger = new Logger(BotSessionRunner.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly schedule: BotScheduleService,
    @Optional() @Inject(PRICE_STORE) private readonly priceStore?: PriceStorePort,
    @Optional() @Inject(NOTIFICATION_WRITER) private readonly notifications?: NotificationWriter,
    @Optional() private readonly config?: ConfigService<Environment, true>,
  ) {}

  /** BOT_NEW_BUYS_ENABLED (default false): sells always run; would-be buys are journaled only. */
  newBuysEnabled(): boolean {
    return this.config?.get('BOT_NEW_BUYS_ENABLED', { infer: true }) === true;
  }

  private store(): PriceStorePort {
    if (!this.priceStore) {
      throw new ServiceUnavailableException({
        code: 'PRICE_STORE_UNAVAILABLE',
        message: 'Kho giá chưa được cấu hình',
      });
    }
    return this.priceStore;
  }

  /**
   * Run every active Bot for session D. The store must already hold D; otherwise nothing is
   * written and the caller retries (`ready: false`). At the give-up time the session is marked
   * `skipped_no_session` on every locked row (D25).
   */
  async runSession(
    session: string,
    now = new Date(),
  ): Promise<BotBatchResult & { ready: boolean; skippedNoSession: number }> {
    const result = {
      initialized: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skippedNotSession: 0,
      skippedPaused: 0,
      ready: true,
      skippedNoSession: 0,
    };
    const owners = await this.database.query<{ user_id: string; bot_id: string }>(
      `select i.user_id, i.id as bot_id from bot_instances i
         join bot_accounts a on a.id = i.bot_account_id
        where a.status = 'active' order by i.user_id`,
    );
    const calendar = await this.store().calendar();
    if (!calendar.includes(session)) {
      result.ready = false;
      if (isGiveUpTime(now)) {
        for (const owner of owners) {
          try {
            const row = await this.schedule.lockForSession(owner.user_id, session, now);
            if (row) {
              await this.schedule.markRun(this.database, owner.bot_id, session, 'skipped_no_session');
              result.skippedNoSession += 1;
            }
          } catch (error) {
            this.logger.warn(`Bot ${owner.user_id} skip-mark failed: ${String(error)}`);
          }
        }
      }
      return result;
    }
    for (const owner of owners) {
      try {
        const run = await this.runAccountSession(owner.user_id, session, now);
        result.processed += 1;
        if (run.status === 'succeeded') result.succeeded += 1;
        else result.failed += 1;
      } catch (error) {
        if (error instanceof BotSessionNotReadyError) {
          result.skippedNotSession += 1;
          continue;
        }
        this.logger.warn(`Bot ${owner.user_id} session ${session} failed: ${String(error)}`);
        result.processed += 1;
        result.failed += 1;
      }
    }
    return result;
  }

  private async context(client: SqlClient, userId: string, lock = false): Promise<ContextRow | null> {
    const rows = await client.query<ContextRow>(
      `select i.id as bot_id, i.strategy_id, i.strategy_version, a.id as account_id, a.cash_vnd,
              a.status as account_status, a.activated_at as account_activated_at
         from bot_instances i join bot_accounts a on a.id = i.bot_account_id
        where i.user_id = $1 and a.user_id = $1${lock ? ' for update of i, a' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async openPositions(client: SqlClient, accountId: string, lock = false): Promise<OpenPositionRow[]> {
    return client.query<OpenPositionRow>(
      `select id, symbol, qty_open, entry_price_vnd::text, entry_value_vnd::text,
              entry_fee_vnd::text, to_char(opened_session, 'YYYY-MM-DD') as opened_session,
              to_char(anchor_session, 'YYYY-MM-DD') as anchor_session, anchor_reason,
              entry_source_snapshot
         from bot_positions where bot_account_id = $1 and status = 'open'
        order by symbol${lock ? ' for update' : ''}`,
      [accountId],
    );
  }

  private async fees(client: SqlClient): Promise<BotV2Fees> {
    const row = (
      await client.query<{
        buy_fee_rate_bps: number;
        sell_fee_rate_bps: number;
        sell_tax_rate_bps: number;
        board_lot_size: number;
      }>(
        `select buy_fee_rate_bps, sell_fee_rate_bps, sell_tax_rate_bps, board_lot_size
           from virtual_trading_configs where is_active = true order by updated_at desc limit 1`,
      )
    )[0];
    if (!row) throw new Error('Thiếu cấu hình phí Bot (virtual_trading_configs)');
    return {
      buy_fee_bps: Number(row.buy_fee_rate_bps),
      sell_fee_bps: Number(row.sell_fee_rate_bps),
      sell_tax_bps: Number(row.sell_tax_rate_bps),
      lot_size: Number(row.board_lot_size),
    };
  }

  async runAccountSession(userId: string, session: string, now = new Date()): Promise<BotRunResult> {
    const existing = (
      await this.database.query<BotRunRow>(
        `select * from bot_run_receipts where user_id = $1 and trading_date = $2::date
          order by started_at desc limit 1`,
        [userId, session],
      )
    )[0];
    if (existing) {
      if (!isV2Receipt(existing.rule_snapshot)) {
        // Receipts of iqx-bot-v1.x are never executed by v2.0; an unfinished one is closed.
        if (existing.status === 'running') {
          return this.failRun(existing.id, [
            {
              code: 'unsupported_rule_version',
              detail: 'Phiên được chụp theo chính sách cũ chưa hoàn tất; không thực thi theo chính sách mới.',
              symbol: null,
            },
          ]);
        }
        return this.runResult(existing);
      }
      return this.execute(existing.id, userId, session);
    }
    const runId = await this.capture(userId, session, now);
    return this.execute(runId, userId, session);
  }

  // -----------------------------------------------------------------------------------------
  // Capture: lock schedule row, build and freeze the session input
  // -----------------------------------------------------------------------------------------

  private async resolveUniverseAt(
    resolved: ResolvedStrategy | null,
    session: string,
  ): Promise<{ symbols: string[]; pin: BotV2UniversePin }> {
    const none: BotV2UniversePin = { type: 'none', label: '', count: 0, symbols_hash: canonicalHash([]) };
    if (!resolved) return { symbols: [], pin: none };
    const content = resolved.content;
    const label = universeLabel(content.universe);
    let symbols: string[] = [];
    if (sessionStrategyOf(content).buy_enabled) {
      const store = this.store();
      if (content.universe.type === 'saved_list') {
        const members = await store.membersAt('VN100', session);
        const universe = resolveUniverse(content.universe, { vn30: [], vn100: members });
        symbols = universe.ok ? universe.symbols : [];
      } else {
        const members = await store.membersAt(
          content.universe.type === 'vn30' ? 'VN30' : 'VN100',
          session,
        );
        const universe = resolveUniverse(content.universe, {
          vn30: content.universe.type === 'vn30' ? members : [],
          vn100: content.universe.type === 'vn100' ? members : [],
        });
        symbols = universe.ok ? universe.symbols : [];
      }
    }
    return {
      symbols,
      pin: { type: content.universe.type, label, count: symbols.length, symbols_hash: canonicalHash(symbols) },
    };
  }

  private async capture(userId: string, session: string, now: Date): Promise<string> {
    const store = this.store();
    const context = await this.context(this.database, userId);
    if (!context) throw new Error('Bot chưa được khởi tạo');
    if (context.account_status !== 'active') throw new Error('Tài khoản Bot đang tạm dừng');
    const calendarDates = await store.calendar();
    if (!calendarDates.includes(session)) {
      throw new BotSessionNotReadyError(`Kho giá chưa có phiên ${session}`);
    }
    const row: ScheduleRow | null = await this.schedule.lockForSession(userId, session, now);
    if (!row) throw new BotSessionNotReadyError(`Lịch phiên ${session} chưa khóa`);
    const resolved = await this.schedule.resolveRow(userId, row);
    const strategyPin: BotV2StrategyPin | null =
      resolved && row.strategy_source
        ? {
            source: resolved.ref.source,
            id: resolved.ref.id,
            version: resolved.ref.version,
            config_hash: resolved.config_hash,
            name: resolved.name,
            version_label: resolved.version_label,
          }
        : null;
    const held = (await this.openPositions(this.database, context.account_id)).map((p) => p.symbol);
    const universe = await this.resolveUniverseAt(strategyPin ? resolved : null, session);
    const bundle = await store.loadSeries([...new Set([...universe.symbols, ...held])].sort(), {
      until: session,
    });
    const sessionIdx = bundle.calendar.indexOf(session);
    if (sessionIdx < 0) throw new BotSessionNotReadyError(`Kho giá chưa có phiên ${session}`);
    const content = strategyPin ? resolved!.content : null;
    const signals = content
      ? createSignalProvider(content, bundle, { config_hash: resolved!.config_hash })
      : null;
    const input = buildSessionInput({
      bundle,
      session_idx: sessionIdx,
      content,
      universe: universe.symbols,
      held,
      signals,
    });
    const market = bundle.market?.[sessionIdx];
    const payload: FrozenPayload = {
      session,
      data_as_of: bundle.data_as_of ?? session,
      data_hash: bundle.data_hash,
      vnindex: market !== undefined && Number.isFinite(market) ? market : null,
      input: serializeInput(input),
    };
    const inputHash = canonicalHash(payload);
    const fees = await this.fees(this.database);
    const receipt = botV2Receipt({
      session,
      strategy: strategyPin,
      universe: universe.pin,
      fees,
      data_as_of: payload.data_as_of,
      data_hash: bundle.data_hash,
      input_hash: inputHash,
    });
    return this.database.transaction(async (tx) => {
      const locked = await this.context(tx, userId, true);
      if (!locked || locked.account_status !== 'active') throw new Error('Bot account unavailable');
      const already = (
        await tx.query<{ id: string }>(
          `select id from bot_run_receipts where user_id = $1 and trading_date = $2::date for update`,
          [userId, session],
        )
      )[0];
      if (already) return already.id;
      const lockedHeld = (await this.openPositions(tx, locked.account_id, true)).map((p) => p.symbol);
      if (json(lockedHeld) !== json(held)) throw new Error('Vị thế Bot đổi trong lúc chụp phiên');
      const later = (
        await tx.query<{ exists: boolean }>(
          `select exists(select 1 from bot_run_receipts where bot_account_id = $1
             and (status = 'running' or (status = 'succeeded' and trading_date > $2::date))) as exists`,
          [locked.account_id, session],
        )
      )[0]?.exists;
      if (later) throw new Error('Bot sessions must be processed in trading-date order');
      const runId = randomUUID();
      await tx.query(
        `insert into bot_run_receipts
           (id, user_id, trading_date, status, started_at, completed_at, issues,
            bot_account_id, strategy_id, strategy_version, execution_model,
            rule_snapshot, rule_hash, policy_version, source_snapshot_hash,
            blocked_symbols_at_start, buy_count, sell_count,
            strategy_source, strategy_ref_id, strategy_ref_version, universe)
         values ($1,$2,$3::date,'running',$4,null,'[]'::jsonb,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,
                 $13::jsonb,0,0,$14,$15,$16,$17::jsonb)`,
        [
          runId,
          userId,
          session,
          now,
          locked.account_id,
          locked.strategy_id,
          locked.strategy_version,
          BOT_POLICY_V2.execution_model,
          json(receipt.snapshot),
          receipt.hash,
          BOT_POLICY_V2_VERSION,
          inputHash,
          json(held),
          strategyPin?.source ?? null,
          strategyPin?.id ?? null,
          strategyPin?.version ?? null,
          json({ ...universe.pin, symbols: universe.symbols }),
        ],
      );
      await tx.query(
        `insert into bot_market_snapshots
           (id, bot_run_id, trading_date, data_version, observed_at, close_is_official,
            buy_inputs_complete, snapshot_hash, payload, source_refs)
         values ($1,$2,$3,$4,$5,true,true,$6,$7::jsonb,$8::jsonb)`,
        [
          randomUUID(),
          runId,
          session,
          `price-store:${payload.data_as_of}`,
          now,
          inputHash,
          json(payload),
          json({ data_store: BOT_POLICY_V2.data_store, data_hash: bundle.data_hash }),
        ],
      );
      return runId;
    });
  }

  // -----------------------------------------------------------------------------------------
  // Execute: stepSession on the frozen input, persist in one transaction
  // -----------------------------------------------------------------------------------------

  private async execute(runId: string, userId: string, session: string): Promise<BotRunResult> {
    try {
      return await this.database.transaction(async (tx) => {
        const context = await this.context(tx, userId, true);
        if (!context || context.account_status !== 'active') throw new Error('Bot account unavailable');
        const run = (
          await tx.query<BotRunRow>('select * from bot_run_receipts where id = $1 for update', [runId])
        )[0];
        if (!run || run.user_id !== userId || isoDate(run.trading_date) !== session) {
          throw new Error('Bot run ownership mismatch');
        }
        if (run.status === 'succeeded') return this.runResult(run);
        const receipt = verifyV2Receipt(run.rule_snapshot, run.rule_hash);
        if (!receipt.valid) {
          return this.runResult(
            await this.markFailed(tx, run.id, [
              { code: 'unsupported_rule_version', detail: 'Worker không hỗ trợ rule snapshot', symbol: null },
            ]),
          );
        }
        const outOfOrder = (
          await tx.query<{ exists: boolean }>(
            `select exists(select 1 from bot_run_receipts o where o.bot_account_id = $1 and o.id <> $2
               and ((o.status = 'succeeded' and o.trading_date > $3::date) or o.status = 'running')) as exists`,
            [context.account_id, run.id, session],
          )
        )[0]?.exists;
        if (outOfOrder) {
          const error = new Error('Bot sessions must execute in trading-date order');
          error.name = 'BotRunOrderingError';
          throw error;
        }
        if (!(await this.reconcile(tx, context.account_id))) {
          return this.runResult(
            await this.markFailed(tx, run.id, [
              { code: 'reconciliation_failed', detail: 'Sổ Bot không hợp lệ trước phiên', symbol: null },
            ]),
          );
        }
        const snapshot = (
          await tx.query<{ snapshot_hash: string; payload: FrozenPayload }>(
            'select snapshot_hash, payload from bot_market_snapshots where bot_run_id = $1',
            [run.id],
          )
        )[0];
        if (
          !snapshot ||
          canonicalHash(snapshot.payload) !== snapshot.snapshot_hash ||
          snapshot.snapshot_hash !== receipt.snapshot.input_hash
        ) {
          return this.runResult(
            await this.markFailed(tx, run.id, [
              { code: 'snapshot_hash_mismatch', detail: 'Snapshot Bot đã thay đổi', symbol: null },
            ]),
          );
        }
        const positions = await this.openPositions(tx, context.account_id, true);
        const expectedHeld = Array.isArray(run.blocked_symbols_at_start)
          ? (run.blocked_symbols_at_start as string[])
          : [];
        if (json(positions.map((p) => p.symbol)) !== json(expectedHeld)) {
          return this.runResult(
            await this.markFailed(tx, run.id, [
              { code: 'state_changed', detail: 'Vị thế Bot đã đổi sau khi chụp phiên', symbol: null },
            ]),
          );
        }
        const result = await this.applySession(
          tx,
          context,
          run,
          receipt.snapshot,
          snapshot.payload,
          positions,
        );
        return this.runResult(result);
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'BotRunOrderingError') throw error;
      try {
        await this.database.transaction(async (tx) => {
          const current = (
            await tx.query<{ status: string }>(
              'select status from bot_run_receipts where id = $1 for update',
              [runId],
            )
          )[0];
          if (current?.status !== 'running') return;
          await this.markFailed(tx, runId, [
            {
              code: 'reconciliation_failed',
              detail: 'Giao dịch hoặc đối soát thất bại; lượt đã rollback',
              symbol: null,
            },
          ]);
        });
      } catch {
        // keep the original failure
      }
      throw error;
    }
  }

  private async applySession(
    tx: SqlClient,
    context: ContextRow,
    run: BotRunRow,
    rules: BotV2RuleSnapshot,
    payload: FrozenPayload,
    positions: OpenPositionRow[],
  ): Promise<BotRunRow> {
    const session = payload.session;
    const input = deserializeInput(payload.input);
    const cashStart = parseInteger(context.cash_vnd, 'cash_vnd');
    const state: PortfolioState = {
      cash_vnd: cashStart,
      positions: positions.map(
        (row): PositionState => ({
          symbol: row.symbol,
          qty: Number(row.qty_open),
          entry_session: row.opened_session,
          entry_price_vnd: BigInt(row.entry_price_vnd),
          entry_cost_vnd: BigInt(row.entry_value_vnd) + BigInt(row.entry_fee_vnd),
          anchor_session: row.anchor_session ?? row.opened_session,
          anchor_reason: row.anchor_reason ?? 'entry',
        }),
      ),
      last_session: null,
    };
    const calendar = botCalendar(await this.store().calendar(), await loadHolidays(tx));
    const fees: FeeRules = rules.fees;
    const result = stepSession(state, input, calendar, { fees });
    const buysEnabled = this.newBuysEnabled();
    const buys = buysEnabled ? result.buys : [];
    const strategyLabel = rules.strategy?.name ?? null;
    const versionLabel = rules.strategy?.version_label ?? null;
    const strategyRefs = {
      strategy_source: rules.strategy?.source ?? null,
      strategy_id: rules.strategy?.id ?? null,
      strategy_version: rules.strategy?.version ?? null,
      strategy_label: strategyLabel,
      version_label: versionLabel,
    };
    const byId = new Map(positions.map((row) => [row.symbol, row]));
    let cash = cashStart;
    let order = 0;
    const decision = (values: {
      key: string;
      symbol: string | null;
      action: 'buy' | 'sell' | 'hold' | 'skip';
      reasonCode: string;
      reason: string;
      dataRefs?: Record<string, unknown>;
      rankTuple?: unknown[];
      budgetVnd?: bigint;
      proposedQty?: number;
      executionId?: string;
    }) =>
      tx.query(
        `insert into bot_decisions
           (id, bot_run_id, idempotency_key, symbol, action, reason_code, reason,
            filter_ids, rank_tuple, data_refs, budget_vnd, proposed_qty, threshold_vnd,
            execution_id, decision_config_revision, condition_snapshot, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8::jsonb,$9::jsonb,$10,$11,null,$12,null,null,$13)
         on conflict (idempotency_key) do nothing`,
        [
          randomUUID(),
          run.id,
          values.key,
          values.symbol,
          values.action,
          values.reasonCode,
          values.reason,
          values.rankTuple ? json(values.rankTuple) : null,
          json({ ...strategyRefs, ...(values.dataRefs ?? {}) }),
          values.budgetVnd?.toString() ?? null,
          values.proposedQty ?? null,
          values.executionId ?? null,
          // Distinct, ordered timestamps keep the journal in processing order.
          new Date(Date.now() + order++),
        ],
      );
    const universeSet = new Set(input.universe);
    const notify: BotTradeExecution[] = [];

    // 1. Sells
    for (const sell of result.sells) {
      const position = byId.get(sell.symbol);
      if (!position) throw new Error(`Không tìm thấy vị thế ${sell.symbol}`);
      const key = `bot:v2:${context.account_id}:${session}:${sell.symbol}:sell`;
      const executionId = randomUUID();
      const now = new Date();
      await tx.query(
        `insert into bot_executions
           (id, bot_run_id, bot_account_id, position_id, symbol, side, qty, price_vnd,
            signal_session, price_session, trading_date, executed_at, gross_value_vnd,
            fee_vnd, tax_vnd, net_cash_delta_vnd, execution_model, idempotency_key,
            filter_ids, supporting_count, layer_snapshot, reason, source_snapshot_id,
            exit_reason, exit_reasons, holding_sessions, counted_sessions, max_holding_at_exit,
            strategy_source, strategy_id, strategy_version)
         values ($1,$2,$3,$4,$5,'sell',$6,$7,$8::date,$8::date,$8::date,$9,$10,$11,$12,$13,$14,$15,
                 '[]'::jsonb,null,'{}'::jsonb,$16,$17,$16,$18::jsonb,$19,$20,$21,$22,$23,$24)`,
        [
          executionId,
          run.id,
          context.account_id,
          position.id,
          sell.symbol,
          sell.qty,
          sell.price_vnd.toString(),
          session,
          now,
          sell.gross_vnd.toString(),
          sell.fee_vnd.toString(),
          sell.tax_vnd.toString(),
          sell.net_vnd.toString(),
          BOT_POLICY_V2.execution_model,
          key,
          sell.exit_reason,
          run.source_snapshot_hash,
          json(sell.exit_reasons),
          sell.holding_sessions,
          sell.counted_sessions,
          sell.max_holding_at_exit,
          rules.strategy?.source ?? null,
          rules.strategy?.id ?? null,
          rules.strategy?.version ?? null,
        ],
      );
      cash += sell.net_vnd;
      await tx.query(
        `insert into bot_cash_ledger
           (id, bot_account_id, execution_id, kind, amount_vnd, balance_after_vnd,
            idempotency_key, note, created_at)
         values ($1,$2,$3,'sell',$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          context.account_id,
          executionId,
          sell.net_vnd.toString(),
          cash.toString(),
          `${key}:cash`,
          `Bán mô phỏng ${sell.qty} ${sell.symbol} tại đóng cửa ${session}`,
          now,
        ],
      );
      await tx.query(
        `update bot_positions set qty_open = 0, status = 'closed', closed_session = $2::date,
                closed_at = $3::timestamptz, sell_execution_id = $4,
                updated_at = $3::timestamptz at time zone 'UTC'
          where id = $1`,
        [position.id, session, now, executionId],
      );
      const both = sell.exit_reasons.length > 1 ? ' (cùng đến hạn)' : '';
      await decision({
        key: `${key}:decision`,
        symbol: sell.symbol,
        action: 'sell',
        reasonCode: sell.exit_reason,
        reason: `Bán ${sell.qty} ${sell.symbol} tại đóng cửa ${session}: ${sell.exit_reason === 'indicator' ? RULE_MESSAGES.exit_indicator : RULE_MESSAGES.exit_max_holding}${both}.`,
        dataRefs: {
          exit_reason: sell.exit_reason,
          exit_reasons: sell.exit_reasons,
          holding_sessions: sell.holding_sessions,
          counted_sessions: sell.counted_sessions,
          max_holding_at_exit: sell.max_holding_at_exit,
          anchor_session: sell.anchor_session,
          anchor_reason: sell.anchor_reason,
          sell_issue: sell.sell_issue,
          in_universe: universeSet.has(sell.symbol),
        },
        executionId,
      });
      notify.push({
        side: 'sell',
        symbol: sell.symbol,
        price: Number(sell.price_vnd),
        quantity: sell.qty,
        reason: sell.exit_reason,
      });
    }

    // 2–4. Buys (or would-be buys while BOT_NEW_BUYS_ENABLED is off)
    if (!buysEnabled) {
      for (const buy of result.buys) {
        await decision({
          key: `bot:v2:${run.id}:${buy.symbol}:buy-disabled`,
          symbol: buy.symbol,
          action: 'skip',
          reasonCode: 'candidate_order_unconfirmed',
          reason: `Mua mới đang tắt (BOT_NEW_BUYS_ENABLED); không mua ${buy.symbol}.`,
          rankTuple: ['gtgd20_desc_symbol_asc', buy.gtgd20_vnd.toString(), buy.symbol],
          budgetVnd: buy.budget_vnd,
          proposedQty: buy.qty,
        });
      }
    }
    const entrySource = { type: rules.universe.type, label: rules.universe.label };
    for (const buy of buys) {
      const key = `bot:v2:${context.account_id}:${session}:${buy.symbol}:buy`;
      const positionId = randomUUID();
      const executionId = randomUUID();
      const now = new Date();
      await tx.query(
        `insert into bot_positions
           (id, bot_account_id, symbol, qty_open, entry_price_vnd, entry_value_vnd,
            entry_fee_vnd, amplitude_at_entry_vnd, amplitude_source_ref, stop_loss_vnd,
            take_profit_vnd, entry_config_revision, opened_session, opened_at, status,
            filter_ids, source_refs, buy_execution_id, entry_source_snapshot, created_at, updated_at,
            anchor_session, anchor_reason, sellable_from_session)
         values ($1,$2,$3,$4,$5,$6,$7,null,null,null,null,null,$8::date,$9::timestamptz,'open',
                 '[]'::jsonb,$10::jsonb,$11,$12::jsonb,$9::timestamptz at time zone 'UTC',
                 $9::timestamptz at time zone 'UTC', $8::date, 'entry', $13::date)`,
        [
          positionId,
          context.account_id,
          buy.symbol,
          buy.qty,
          buy.price_vnd.toString(),
          buy.gross_vnd.toString(),
          buy.fee_vnd.toString(),
          session,
          now,
          json({ gtgd20_vnd: buy.gtgd20_vnd, rank: buy.rank, ...strategyRefs }),
          executionId,
          json(entrySource),
          buy.sellable_from,
        ],
      );
      await tx.query(
        `insert into bot_executions
           (id, bot_run_id, bot_account_id, position_id, symbol, side, qty, price_vnd,
            signal_session, price_session, trading_date, executed_at, gross_value_vnd,
            fee_vnd, tax_vnd, net_cash_delta_vnd, execution_model, idempotency_key,
            filter_ids, supporting_count, layer_snapshot, reason, source_snapshot_id,
            strategy_source, strategy_id, strategy_version)
         values ($1,$2,$3,$4,$5,'buy',$6,$7,$8::date,$8::date,$8::date,$9,$10,$11,0,$12,$13,$14,
                 '[]'::jsonb,null,'{}'::jsonb,'strategy_buy',$15,$16,$17,$18)`,
        [
          executionId,
          run.id,
          context.account_id,
          positionId,
          buy.symbol,
          buy.qty,
          buy.price_vnd.toString(),
          session,
          now,
          buy.gross_vnd.toString(),
          buy.fee_vnd.toString(),
          (-buy.total_vnd).toString(),
          BOT_POLICY_V2.execution_model,
          key,
          run.source_snapshot_hash,
          rules.strategy?.source ?? null,
          rules.strategy?.id ?? null,
          rules.strategy?.version ?? null,
        ],
      );
      cash -= buy.total_vnd;
      if (cash < 0n) throw new Error('Bot cash would become negative');
      await tx.query(
        `insert into bot_cash_ledger
           (id, bot_account_id, execution_id, kind, amount_vnd, balance_after_vnd,
            idempotency_key, note, created_at)
         values ($1,$2,$3,'buy',$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          context.account_id,
          executionId,
          (-buy.total_vnd).toString(),
          cash.toString(),
          `${key}:cash`,
          `Mua mô phỏng ${buy.qty} ${buy.symbol} tại đóng cửa ${session}`,
          now,
        ],
      );
      await decision({
        key: `${key}:decision`,
        symbol: buy.symbol,
        action: 'buy',
        reasonCode: 'strategy_buy',
        reason: `Bot mua ${buy.qty} ${buy.symbol} theo điều kiện Mua tại đóng cửa ${session}.`,
        rankTuple: ['gtgd20_desc_symbol_asc', buy.gtgd20_vnd.toString(), buy.symbol],
        budgetVnd: buy.budget_vnd,
        proposedQty: buy.qty,
        executionId,
        dataRefs: { sellable_from: buy.sellable_from, rank: buy.rank, entry_source: entrySource },
      });
      notify.push({ side: 'buy', symbol: buy.symbol, price: Number(buy.price_vnd), quantity: buy.qty });
    }
    const expectedCash = buysEnabled ? result.nav.cash_vnd : result.nav.cash_after_sells_vnd;
    if (cash !== expectedCash) throw new Error('Tiền Bot lệch với kết quả luật phiên');

    // Skips and journal
    for (const skip of result.skips) {
      await decision({
        key: `bot:v2:${run.id}:${skip.symbol}:skip`,
        symbol: skip.symbol,
        action: 'skip',
        reasonCode: skip.code,
        reason: `Không mua ${skip.symbol}: ${skip.message}.`,
        rankTuple: ['gtgd20_desc_symbol_asc', skip.gtgd20_vnd.toString(), skip.symbol],
      });
    }
    for (const [index, entry] of result.journal.entries() as IterableIterator<[number, JournalEntry]>) {
      await decision({
        key: `bot:v2:${run.id}:${entry.symbol ?? 'session'}:${entry.code}:${index}`,
        symbol: entry.symbol,
        action: entry.symbol === null || SESSION_JOURNAL.has(entry.code) ? 'skip' : 'hold',
        reasonCode: entry.code,
        reason: entry.symbol ? `${entry.symbol}: ${entry.message}` : entry.message,
        dataRefs: {
          counted_sessions: entry.counted_sessions ?? null,
          holding_sessions: entry.holding_sessions ?? null,
          max_holding: entry.max_holding ?? null,
          in_universe: entry.symbol ? universeSet.has(entry.symbol) : null,
        },
      });
    }

    // 5. End of session NAV (would-be buys never touched cash or positions)
    let marketValue = result.nav.market_value_vnd;
    if (!buysEnabled) {
      for (const buy of result.buys) marketValue -= BigInt(buy.qty) * buy.price_vnd;
    }
    const nav = cash + marketValue;
    await tx.query(
      `insert into bot_nav_daily
         (id, bot_account_id, trading_date, cash_vnd, market_value_vnd, nav_vnd,
          valuation_complete, vnindex, source_refs, created_at)
       values ($1,$2,$3::date,$4,$5,$6,$7,$8,$9::jsonb,$10)
       on conflict (bot_account_id, trading_date) do update set
         cash_vnd = excluded.cash_vnd, market_value_vnd = excluded.market_value_vnd,
         nav_vnd = excluded.nav_vnd, valuation_complete = excluded.valuation_complete,
         vnindex = excluded.vnindex, source_refs = excluded.source_refs`,
      [
        randomUUID(),
        context.account_id,
        session,
        cash.toString(),
        marketValue.toString(),
        nav.toString(),
        result.nav.complete,
        payload.vnindex,
        json({ snapshot_hash: run.source_snapshot_hash, data_as_of: payload.data_as_of }),
        new Date(),
      ],
    );
    await tx.query('update bot_accounts set cash_vnd = $2, updated_at = $3 where id = $1', [
      context.account_id,
      cash.toString(),
      new Date(),
    ]);
    if (!(await this.reconcile(tx, context.account_id))) {
      throw new Error('Bot reconciliation failed after strategy application');
    }
    const summaryResult = { ...result, buys };
    const counters = {
      ...result.counters,
      buys: buys.length,
      summary: sessionSummary(summaryResult),
      strategy_label: strategyLabel,
      version_label: versionLabel,
      universe_label: rules.universe.label || null,
      universe_count: rules.universe.count,
    };
    const updated = (
      await tx.query<BotRunRow>(
        `update bot_run_receipts set status = 'succeeded', completed_at = $2, issues = '[]'::jsonb,
                buy_count = $3, sell_count = $4, reconciled_at = $2, nav_basis_vnd = $5,
                counters = $6::jsonb
          where id = $1 returning *`,
        [
          run.id,
          new Date(),
          buys.length,
          result.sells.length,
          result.nav.sizing_nav_vnd?.toString() ?? null,
          json(counters),
        ],
      )
    )[0];
    if (!updated) throw new Error('Bot run disappeared');
    await this.schedule.markRun(tx, context.bot_id, session, 'succeeded');
    if (notify.length > 0 && this.notifications) {
      await this.notifications.botTrades(tx, {
        userId: run.user_id,
        tradeDate: session,
        executions: notify,
        strategyLabel: strategyLabel ? `${strategyLabel} · ${versionLabel ?? ''}`.trim() : null,
        navVnd: Number(nav),
      });
    }
    return updated;
  }

  private async reconcile(tx: SqlClient, accountId: string): Promise<boolean> {
    const rows = await tx.query<{ valid: boolean }>(
      `select
         coalesce((select sum(l.amount_vnd) from bot_cash_ledger l where l.bot_account_id = a.id), 0) = a.cash_vnd
         and (select count(*) from bot_cash_ledger l where l.bot_account_id = a.id
              and l.kind = 'initial_funding' and l.execution_id is null
              and l.amount_vnd = $2) = 1
         and not exists (
           select 1 from bot_executions e
           left join bot_cash_ledger l on l.execution_id = e.id
           where e.bot_account_id = a.id and (
             l.id is null or l.amount_vnd <> e.net_cash_delta_vnd or l.kind <> e.side
             or e.gross_value_vnd <> e.qty::bigint * e.price_vnd
             or e.net_cash_delta_vnd <> case when e.side = 'buy'
                  then -(e.gross_value_vnd + e.fee_vnd)
                  else e.gross_value_vnd - e.fee_vnd - e.tax_vnd end))
         and not exists (
           select 1 from bot_positions p
           where p.bot_account_id = a.id and not (
             (p.status = 'open' and p.qty_open > 0) or (p.status = 'closed' and p.qty_open = 0))) as valid
       from bot_accounts a where a.id = $1`,
      [accountId, INITIAL_CASH_VND.toString()],
    );
    return rows[0]?.valid ?? false;
  }

  private async markFailed(tx: SqlClient, runId: string, failures: BotIssue[]): Promise<BotRunRow> {
    const row = (
      await tx.query<BotRunRow>(
        `update bot_run_receipts set status = 'failed', completed_at = $2, issues = $3::jsonb
          where id = $1 returning *`,
        [runId, new Date(), json(failures)],
      )
    )[0];
    if (!row) throw new Error('Bot run not found');
    return row;
  }

  private failRun(runId: string, failures: BotIssue[]): Promise<BotRunResult> {
    return this.database.transaction(async (tx) => this.runResult(await this.markFailed(tx, runId, failures)));
  }

  private runResult(run: BotRunRow): BotRunResult {
    return {
      id: run.id,
      userId: run.user_id,
      tradingDate: isoDate(run.trading_date),
      status: run.status,
      buyCount: run.buy_count,
      sellCount: run.sell_count,
      issues: issueList(run.issues),
      inputHash: run.source_snapshot_hash,
    };
  }
}
