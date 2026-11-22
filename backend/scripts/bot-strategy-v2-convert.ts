/**
 * One-off conversion of iqx-bot-v1.x Bots to Bot và Chiến lược v2.0 (spec §11, PLAN §5.2, D17–D19).
 *
 *   node dist/scripts/bot-strategy-v2-convert.js [--dry-run] [--json] [--user <uuid>]
 *   BOT_STRATEGY_V2_CONVERSION_APPROVED=true JOB_BOT_SESSION_EOD_ENABLED=false \
 *     node dist/scripts/bot-strategy-v2-convert.js --apply
 *
 * Dry-run is the default and writes nothing (READ ONLY transactions). Per Bot (one transaction each,
 * idempotent through `bot_strategy_conversion_log`):
 *  - group `buy`: effective shared-config revision with ≥1 Buy row → strategy
 *    "Chiến lược của tôi (từ thiết lập cũ)" v1 (+ v2 from a newer pending revision = `buy_pending`);
 *  - group `sell_only`: only Sell rows → same strategy with `sell_only = true`;
 *  - group `none`: no usable row (or an outdated pre-V3 revision) → "Chưa chọn chiến lược";
 *  - Lịch phiên: last = locked row (last receipt date, else activation date), next = P,
 *    `follow_latest = true`;
 *  - open positions: anchor P (`policy_cutover`, Q20), T+2 from the real entry;
 *  - closed trades, old Backtest runs, shared-config and universe revisions: untouched.
 * Never creates an order, a notification or an email (M05, T11): it imports nothing from the
 * notifications module. Rollback: `bot-strategy-v2-rollback.ts`.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool, type PoolClient } from 'pg';

import { canonicalHash } from '../src/modules/bots/bot.domain.js';
import { RULE_VERSION, SCHEMA_VERSION } from '../src/modules/quant/v2/index.js';
// Direct files, not the strategy-rules barrel: the barrel re-exports the notification port and
// this script must not load it (M05, T11).
import { STRATEGY_RULES } from '../src/modules/strategy-rules/constants.js';
import {
  activeIndicatorIds,
  normalizeStrategyContent,
  strategyConfigHash,
} from '../src/modules/strategy-rules/content.js';
import type {
  StrategyContent,
  StrategyUniverse,
} from '../src/modules/strategy-rules/contracts.js';
import {
  nextCalendarDate,
  tradingDayPredicate,
  vnDate,
  type IsTradingDay,
} from '../src/modules/strategy-config/strategy-config.calendar.js';
import type { SqlClient } from '../src/platform/database/database.service.js';

export const SCRIPT_LOCK = 'bot-strategy-v2-conversion';
export const APPROVAL_VARIABLE = 'BOT_STRATEGY_V2_CONVERSION_APPROVED';
export const STRATEGY_NAME = 'Chiến lược của tôi (từ thiết lập cũ)';
export const NOTE_V1 = 'Chuyển từ thiết lập Bot cũ';
export const NOTE_V2 = 'Chuyển từ cấu hình chung chưa áp dụng';
export const ORIGIN = { kind: 'bot_v2_conversion' } as const;
/** Bot session job window (cutoff 19:00 with margins), ICT minutes. */
export const BOT_WINDOW = { from: 18 * 60 + 30, to: 19 * 60 + 40 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATABASE_NAME = /^iqx_v2_[a-z0-9_]+$/;

// ------------------------------------------------------------------ arguments and safety

export type ScriptOptions = { apply: boolean; json: boolean; userId: string | null };

export function parseArgs(argv: readonly string[]): ScriptOptions {
  let apply = false;
  let json = false;
  let userId: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg === '--json') json = true;
    else if (arg === '--user') {
      userId = argv[(index += 1)] ?? '';
      if (!UUID.test(userId)) throw new Error('--user requires a user UUID');
    } else throw new Error(`Unknown argument: ${String(arg)}`);
  }
  return { apply, json, userId };
}

export function requireSafeTarget(apply: boolean, env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Refusing to run: DATABASE_URL is required');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Refusing to run: DATABASE_URL must use PostgreSQL');
  }
  if (!DATABASE_NAME.test(decodeURIComponent(parsed.pathname.replace(/^\//, '')))) {
    throw new Error('Refusing to run: database name must match iqx_v2_*');
  }
  if (apply && env[APPROVAL_VARIABLE] !== 'true') {
    throw new Error(`Refusing --apply: set ${APPROVAL_VARIABLE}=true after approval`);
  }
  if (apply && env.JOB_BOT_SESSION_EOD_ENABLED !== 'false') {
    throw new Error('Refusing --apply: set JOB_BOT_SESSION_EOD_ENABLED=false (Bot job must be off)');
  }
  return databaseUrl;
}

export function vietnamMinutes(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60) % (24 * 60);
}

export function inBotWindow(now: Date): boolean {
  const minutes = vietnamMinutes(now);
  return minutes >= BOT_WINDOW.from && minutes < BOT_WINDOW.to;
}

async function preflight(db: SqlClient, now: Date, apply: boolean): Promise<void> {
  const [database] = await db.query<{ name: string }>('select current_database() as name');
  if (!DATABASE_NAME.test(String(database?.name ?? ''))) {
    throw new Error('Refusing to run: connected database name must match iqx_v2_*');
  }
  if (inBotWindow(now)) throw new Error('Refusing to run between 18:30 and 19:40 ICT (Bot window)');
  const [tables] = await db.query<{ missing: string[] }>(
    `select array_remove(array[
       case when to_regclass('bot_strategy_schedule') is null then 'bot_strategy_schedule (0060)' end,
       case when to_regclass('bot_strategy_conversion_log') is null then 'bot_strategy_conversion_log (0060)' end,
       case when $1 and to_regclass('user_strategies') is null then 'user_strategies (0059)' end,
       case when $1 and to_regclass('user_strategy_versions') is null then 'user_strategy_versions (0059)' end
     ], null) as missing`,
    [apply],
  );
  if (tables?.missing.length) {
    throw new Error(`Refusing to run: migrations missing (${tables.missing.join(', ')})`);
  }
  const [running] = await db.query<{ n: number }>(
    `select count(*)::int as n from bot_run_receipts where status = 'running'`,
  );
  if ((running?.n ?? 0) > 0) {
    throw new Error(`Refusing to run: ${running!.n} Bot run receipt(s) are still running`);
  }
}

// ------------------------------------------------------------------ pure planning

export type RevisionInput = {
  revision: number;
  config: unknown;
  effective_session: string | null;
};

export type GroupKind = 'buy' | 'buy_pending' | 'sell_only' | 'none';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Pre-V3 (iqx-rules-4.0) revisions are "no usable rows" (D18). */
export function isOutdatedConfig(config: unknown): boolean {
  return (
    !isRecord(config) ||
    config.schema_version !== SCHEMA_VERSION ||
    config.rule_version !== RULE_VERSION
  );
}

/** D17: keep a live `max_holding` (1–2 → 3), else 30. */
export function convertedMaxHolding(config: unknown): { value: number; kept: boolean } {
  const raw = isRecord(config) ? config.max_holding : undefined;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
    return {
      value: Math.min(Math.max(raw, STRATEGY_RULES.max_holding_min), STRATEGY_RULES.max_holding_max),
      kept: true,
    };
  }
  return { value: STRATEGY_RULES.default_max_holding, kept: false };
}

export function contentFrom(
  config: unknown,
  universe: StrategyUniverse,
): { content: StrategyContent; buy: boolean; sell: boolean; max_holding_kept: boolean } | null {
  if (isOutdatedConfig(config)) return null;
  const indicators = (config as { indicators?: unknown }).indicators;
  if (!isRecord(indicators)) return null;
  const draft = { indicators } as Pick<StrategyContent, 'indicators'>;
  const buy = activeIndicatorIds(draft, 'buy').length > 0;
  const sell = activeIndicatorIds(draft, 'sell').length > 0;
  if (!buy && !sell) return null;
  const holding = convertedMaxHolding(config);
  const content = normalizeStrategyContent({
    universe,
    indicators: indicators as StrategyContent['indicators'],
    max_holding: holding.value,
    ...(buy ? {} : { sell_only: true }),
  });
  return { content, buy, sell, max_holding_kept: holding.kept };
}

/** P = first session strictly after `today` (weekdays minus holidays, §11.1). */
export function firstSessionAfter(today: string, isTradingDay: IsTradingDay): string {
  let date = nextCalendarDate(today);
  for (let guard = 0; guard < 60; guard += 1) {
    if (isTradingDay(date)) return date;
    date = nextCalendarDate(date);
  }
  throw new Error('Không xác định được phiên P');
}

/** The n-th session after `date` on the real calendar (T+2). */
export function addTradingSessions(date: string, n: number, isTradingDay: IsTradingDay): string {
  let current = date;
  let left = n;
  for (let guard = 0; guard < 3660 && left > 0; guard += 1) {
    current = nextCalendarDate(current);
    if (isTradingDay(current)) left -= 1;
  }
  return current;
}

/** Sessions s with from < s <= to. */
export function countTradingSessions(from: string, to: string, isTradingDay: IsTradingDay): number {
  let count = 0;
  let current = from;
  for (let guard = 0; guard < 20 * 366 && current < to; guard += 1) {
    current = nextCalendarDate(current);
    if (isTradingDay(current)) count += 1;
  }
  return count;
}

export type UserPlan = {
  user_id: string;
  bot_id: string;
  account_id: string;
  group: GroupKind;
  versions: Array<{ version: number; note: string; content: StrategyContent; config_hash: string; from_revision: number }>;
  universe_label: string;
  universe_count: number;
  excluded_symbols: string[];
  max_holding: number | null;
  max_holding_kept: boolean;
  last_session: string;
  p_session: string;
  positions: Array<{
    id: string;
    symbol: string;
    entry_session: string;
    sellable_from: string;
    held_at_p: number;
    counted_at_p: number;
    due_at_p: boolean;
  }>;
  pause_resolved: boolean;
  plan_hash: string;
};

// ------------------------------------------------------------------ database helpers

function sqlClientOf(client: PoolClient): SqlClient {
  return {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<Row[]> => (await client.query(text, values ? [...values] : undefined)).rows as Row[],
  };
}

type Transaction = <T>(operation: (tx: SqlClient) => Promise<T>) => Promise<T>;

function transactionOn(pool: Pool, readOnly: boolean): Transaction {
  return async (operation) => {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      const value = await operation(sqlClientOf(client));
      await client.query(readOnly ? 'ROLLBACK' : 'COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
}

async function tradingDay(db: SqlClient): Promise<IsTradingDay> {
  const rows = await db.query<{ holidays: unknown }>(
    `select holidays from virtual_trading_configs where is_active = true
      order by updated_at desc limit 1`,
  );
  const predicate = tradingDayPredicate(rows[0]);
  if (!predicate) throw new Error('Refusing to run: active trading calendar is unavailable');
  return predicate;
}

async function vn100Members(db: SqlClient): Promise<Set<string> | null> {
  const rows = await db.query<{ symbols: string[] }>(
    `select symbols from index_membership_snapshots where index_code = 'VN100'
      order by session_date desc limit 1`,
  );
  return rows[0] ? new Set(rows[0].symbols.map((symbol) => symbol.toUpperCase())) : null;
}

async function universeOf(
  db: SqlClient,
  userId: string,
  pSession: string,
  vn100: Set<string> | null,
): Promise<{ universe: StrategyUniverse; excluded: string[]; label: string; count: number | null }> {
  const row = (
    await db.query<{
      kind: 'vn30' | 'custom';
      saved_list_id: string | null;
      name: string;
      tickers: string[] | null;
    }>(
      `select kind, saved_list_id::text as saved_list_id, name, tickers
         from bot_universe_revisions
        where user_id = $1 and status in ('effective', 'pending')
          and effective_session is not null and effective_session <= $2::date
        order by revision desc limit 1`,
      [userId, pSession],
    )
  )[0];
  if (!row || row.kind === 'vn30') {
    return { universe: { type: 'vn30' }, excluded: [], label: 'VN30', count: null };
  }
  const tickers = [...new Set((row.tickers ?? []).map((symbol) => symbol.toUpperCase()))].sort();
  const kept = vn100 ? tickers.filter((symbol) => vn100.has(symbol)) : [];
  const excluded = tickers.filter((symbol) => !kept.includes(symbol));
  return {
    universe: {
      type: 'saved_list',
      list_id: row.saved_list_id ?? 'unknown',
      list_name: row.name.slice(0, 120),
      symbols: kept,
    },
    excluded,
    label: row.name,
    count: kept.length,
  };
}

export async function planUser(
  db: SqlClient,
  bot: { user_id: string; bot_id: string; account_id: string; activated_at: Date | string },
  context: { today: string; pSession: string; isTradingDay: IsTradingDay; vn100: Set<string> | null },
): Promise<UserPlan> {
  const { today, pSession, isTradingDay } = context;
  const revisions = await db.query<RevisionInput & { effective_session: string | null }>(
    `select r.revision, r.config, to_char(e.effective_session, 'YYYY-MM-DD') as effective_session
       from shared_config_revisions r
       join effective_config_sessions e on e.user_id = r.user_id and e.revision = r.revision
      where r.user_id = $1 and e.effective_session is not null
      order by r.revision desc`,
    [bot.user_id],
  );
  const effective = revisions.find((row) => row.effective_session! <= today) ?? null;
  const pending =
    revisions.find(
      (row) =>
        row.effective_session! > today &&
        row.effective_session! <= pSession &&
        (!effective || row.revision > effective.revision),
    ) ?? null;
  const universe = await universeOf(db, bot.user_id, pSession, context.vn100);
  const versions: UserPlan['versions'] = [];
  let group: GroupKind = 'none';
  let maxHolding: number | null = null;
  let kept = false;
  const first = effective ? contentFrom(effective.config, universe.universe) : null;
  const second = pending ? contentFrom(pending.config, universe.universe) : null;
  if (first) {
    versions.push({
      version: 1,
      note: NOTE_V1,
      content: first.content,
      config_hash: strategyConfigHash(first.content),
      from_revision: effective!.revision,
    });
    group = first.buy ? 'buy' : 'sell_only';
  }
  if (second) {
    versions.push({
      version: versions.length + 1,
      note: versions.length ? NOTE_V2 : NOTE_V1,
      content: second.content,
      config_hash: strategyConfigHash(second.content),
      from_revision: pending!.revision,
    });
    group = second.buy ? (first ? 'buy_pending' : 'buy') : first?.buy ? 'buy_pending' : 'sell_only';
  }
  const latest = versions.at(-1);
  if (latest) {
    maxHolding = latest.content.max_holding;
    kept = (second ?? first)!.max_holding_kept;
  }
  const lastReceipt = (
    await db.query<{ trading_date: string }>(
      `select to_char(max(trading_date), 'YYYY-MM-DD') as trading_date
         from bot_run_receipts where user_id = $1`,
      [bot.user_id],
    )
  )[0]?.trading_date;
  const lastSession = lastReceipt ?? vnDate(new Date(bot.activated_at));
  const positions = (
    await db.query<{ id: string; symbol: string; opened_session: string }>(
      `select id, symbol, to_char(opened_session, 'YYYY-MM-DD') as opened_session
         from bot_positions where bot_account_id = $1 and status = 'open' order by symbol`,
      [bot.account_id],
    )
  ).map((row) => {
    const counted = countTradingSessions(pSession, pSession, isTradingDay); // anchor = P → 0
    const n = maxHolding ?? STRATEGY_RULES.default_max_holding;
    return {
      id: row.id,
      symbol: row.symbol,
      entry_session: row.opened_session,
      sellable_from: addTradingSessions(row.opened_session, STRATEGY_RULES.settlement_sessions, isTradingDay),
      held_at_p: countTradingSessions(row.opened_session, pSession, isTradingDay),
      counted_at_p: counted,
      due_at_p: counted >= n,
    };
  });
  const pause = (
    await db.query<{ n: number }>(
      `select count(*)::int as n from bot_config_pauses where user_id = $1 and resume_revision is null`,
      [bot.user_id],
    )
  )[0];
  const plan: Omit<UserPlan, 'plan_hash'> = {
    user_id: bot.user_id,
    bot_id: bot.bot_id,
    account_id: bot.account_id,
    group,
    versions,
    universe_label: universe.label,
    universe_count: universe.count ?? 0,
    excluded_symbols: universe.excluded,
    max_holding: maxHolding,
    max_holding_kept: kept,
    last_session: lastSession < pSession ? lastSession : today,
    p_session: pSession,
    positions,
    pause_resolved: (pause?.n ?? 0) > 0,
  };
  return { ...plan, plan_hash: canonicalHash(plan) };
}

// ------------------------------------------------------------------ apply

async function applyPlan(tx: SqlClient, plan: UserPlan): Promise<'converted' | 'already'> {
  const done = await tx.query<{ user_id: string }>(
    'select user_id from bot_strategy_conversion_log where user_id = $1 for update',
    [plan.user_id],
  );
  if (done[0]) return 'already';
  let strategyId: string | null = null;
  if (plan.versions.length) {
    const existing = (
      await tx.query<{ id: string; latest_version: number }>(
        `select id::text as id, latest_version from user_strategies
          where user_id = $1 and lower(name) = lower($2) and deleted_at is null
            and origin @> $3::jsonb`,
        [plan.user_id, STRATEGY_NAME, JSON.stringify(ORIGIN)],
      )
    )[0];
    if (existing) {
      // Re-run after a rollback: the strategy and its versions are kept, never duplicated.
      strategyId = existing.id;
    } else {
      const latest = plan.versions.at(-1)!;
      strategyId = (
        await tx.query<{ id: string }>(
          `insert into user_strategies
             (id, user_id, name, latest_version, origin, sell_only, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, now(), now())
           returning id::text as id`,
          [
            plan.user_id,
            STRATEGY_NAME,
            plan.versions.length,
            JSON.stringify(ORIGIN),
            latest.content.sell_only === true,
          ],
        )
      )[0]!.id;
      for (const version of plan.versions) {
        await tx.query(
          `insert into user_strategy_versions
             (strategy_id, version, content, config_hash, from_run_id, note, created_at)
           values ($1::uuid, $2, $3::jsonb, $4, null, $5, now())`,
          [strategyId, version.version, JSON.stringify(version.content), version.config_hash, version.note],
        );
      }
    }
  }
  const lastVersion = plan.versions.length ? 1 : null;
  const nextVersion = plan.versions.length || null;
  await tx.query(
    `insert into bot_strategy_schedule
       (bot_id, session_date, strategy_source, strategy_id, version, follow_latest,
        locked_at, run_status, updated_at)
     values ($1, $2::date, $3, $4, $5, $6, now(), 'converted', now())
     on conflict (bot_id, session_date) do nothing`,
    [
      plan.bot_id,
      plan.last_session,
      strategyId ? 'user' : null,
      strategyId,
      lastVersion,
      Boolean(strategyId),
    ],
  );
  await tx.query(
    `delete from bot_strategy_schedule where bot_id = $1 and locked_at is null`,
    [plan.bot_id],
  );
  await tx.query(
    `insert into bot_strategy_schedule
       (bot_id, session_date, strategy_source, strategy_id, version, follow_latest, updated_at)
     values ($1, $2::date, $3, $4, $5, $6, now())`,
    [plan.bot_id, plan.p_session, strategyId ? 'user' : null, strategyId, nextVersion, Boolean(strategyId)],
  );
  for (const position of plan.positions) {
    await tx.query(
      `update bot_positions
          set anchor_session = $2::date, anchor_reason = 'policy_cutover',
              sellable_from_session = $3::date
        where id = $1 and status = 'open'`,
      [position.id, plan.p_session, position.sellable_from],
    );
  }
  if (plan.pause_resolved) {
    await tx.query(
      `update bot_config_pauses
          set resume_revision = coalesce(paused_revision, 1), resumed_at = now()
        where user_id = $1 and resume_revision is null`,
      [plan.user_id],
    );
  }
  await tx.query(
    `insert into bot_strategy_conversion_log
       (user_id, bot_id, group_kind, strategy_id, versions, max_holding, excluded_symbols,
        positions_anchored, p_session, dry_run_hash, details, converted_at)
     values ($1, $2, $3, $4::uuid, $5, $6, $7::text[], $8, $9::date, $10, $11::jsonb, now())`,
    [
      plan.user_id,
      plan.bot_id,
      plan.group,
      strategyId,
      plan.versions.length,
      plan.max_holding,
      plan.excluded_symbols,
      plan.positions.length,
      plan.p_session,
      plan.plan_hash,
      JSON.stringify({
        universe_label: plan.universe_label,
        max_holding_kept: plan.max_holding_kept,
        from_revisions: plan.versions.map((version) => version.from_revision),
        last_session: plan.last_session,
      }),
    ],
  );
  return 'converted';
}

// ------------------------------------------------------------------ run

export type ConversionSummary = {
  mode: 'dry-run' | 'apply';
  today: string;
  p_session: string;
  accounts: number;
  already_converted: number;
  open_positions: number;
  revisions: number;
  groups: Record<GroupKind, number>;
  accounts_with_excluded_symbols: Array<{ user_id: string; excluded: string[] }>;
  max_holding: { kept: number; default_30: number; kept_accounts: Array<{ user_id: string; value: number }> };
  positions_due_at_p: number;
  positions_held_ge_30_real: number;
  fee_config: Record<string, unknown> | null;
  converted: number;
  failed: Array<{ user_id: string; error: string }>;
};

export async function runConversion(
  pool: Pool,
  options: { apply: boolean; userId?: string | null; now?: Date },
): Promise<ConversionSummary> {
  const now = options.now ?? new Date();
  const lockClient = await pool.connect();
  const lockDb = sqlClientOf(lockClient);
  let locked = false;
  try {
    locked =
      (
        await lockDb.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtext($1)) as ok', [
          SCRIPT_LOCK,
        ])
      )[0]?.ok === true;
    if (!locked) throw new Error('Refusing to run: another bot-strategy-v2 script is running');
    await preflight(lockDb, now, options.apply);
    const isTradingDay = await tradingDay(lockDb);
    const today = vnDate(now);
    const pSession = firstSessionAfter(today, isTradingDay);
    const vn100 = await vn100Members(lockDb);
    const bots = await lockDb.query<{
      user_id: string;
      bot_id: string;
      account_id: string;
      activated_at: Date | string;
      converted: boolean;
    }>(
      `select i.user_id, i.id as bot_id, a.id as account_id, a.activated_at,
              exists(select 1 from bot_strategy_conversion_log l where l.user_id = i.user_id) as converted
         from bot_instances i join bot_accounts a on a.id = i.bot_account_id
        where ($1::uuid is null or i.user_id = $1::uuid)
        order by i.user_id`,
      [options.userId ?? null],
    );
    const fee = (
      await lockDb.query<Record<string, unknown>>(
        `select buy_fee_rate_bps, sell_fee_rate_bps, sell_tax_rate_bps, board_lot_size
           from virtual_trading_configs where is_active = true order by updated_at desc limit 1`,
      )
    )[0];
    const revisions = (
      await lockDb.query<{ n: number }>(
        `select count(*)::int as n from shared_config_revisions r
          where exists (select 1 from bot_instances i where i.user_id = r.user_id)`,
      )
    )[0]?.n ?? 0;
    const summary: ConversionSummary = {
      mode: options.apply ? 'apply' : 'dry-run',
      today,
      p_session: pSession,
      accounts: bots.length,
      already_converted: bots.filter((bot) => bot.converted).length,
      open_positions: 0,
      revisions,
      groups: { buy: 0, buy_pending: 0, sell_only: 0, none: 0 },
      accounts_with_excluded_symbols: [],
      max_holding: { kept: 0, default_30: 0, kept_accounts: [] },
      positions_due_at_p: 0,
      positions_held_ge_30_real: 0,
      fee_config: fee ?? null,
      converted: 0,
      failed: [],
    };
    const run = transactionOn(pool, !options.apply);
    for (const bot of bots) {
      if (bot.converted) continue;
      try {
        const outcome = await run(async (tx) => {
          const plan = await planUser(tx, bot, { today, pSession, isTradingDay, vn100 });
          const applied = options.apply ? await applyPlan(tx, plan) : 'planned';
          return { plan, applied };
        });
        const { plan } = outcome;
        summary.groups[plan.group] += 1;
        summary.open_positions += plan.positions.length;
        summary.positions_due_at_p += plan.positions.filter((p) => p.due_at_p).length;
        summary.positions_held_ge_30_real += plan.positions.filter(
          (p) => p.held_at_p >= STRATEGY_RULES.default_max_holding,
        ).length;
        if (plan.excluded_symbols.length) {
          summary.accounts_with_excluded_symbols.push({
            user_id: plan.user_id,
            excluded: plan.excluded_symbols,
          });
        }
        if (plan.max_holding !== null) {
          if (plan.max_holding_kept) {
            summary.max_holding.kept += 1;
            summary.max_holding.kept_accounts.push({ user_id: plan.user_id, value: plan.max_holding });
          } else summary.max_holding.default_30 += 1;
        }
        if (outcome.applied === 'converted') summary.converted += 1;
      } catch (error) {
        summary.failed.push({
          user_id: bot.user_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (summary.positions_due_at_p > 0) {
      throw new Error(`Safety check failed: ${summary.positions_due_at_p} position(s) due at P`);
    }
    return summary;
  } finally {
    if (locked) await lockClient.query('select pg_advisory_unlock(hashtext($1))', [SCRIPT_LOCK]);
    lockClient.release();
  }
}

export function formatSummary(summary: ConversionSummary): string {
  const rows: Array<[string, string | number]> = [
    ['mode', summary.mode],
    ['today (ICT)', summary.today],
    ['P (first session after today)', summary.p_session],
    ['Bot accounts', summary.accounts],
    ['already converted', summary.already_converted],
    ['shared-config revisions (Bot users)', summary.revisions],
    ['open positions', summary.open_positions],
    ['group buy', summary.groups.buy],
    ['group buy_pending (2 versions)', summary.groups.buy_pending],
    ['group sell_only', summary.groups.sell_only],
    ['group none (chưa chọn)', summary.groups.none],
    ['accounts with symbols outside VN100', summary.accounts_with_excluded_symbols.length],
    ['max_holding kept (D17)', summary.max_holding.kept],
    ['max_holding = 30', summary.max_holding.default_30],
    ['positions due at P (must be 0)', summary.positions_due_at_p],
    ['positions held >= 30 real sessions (anchored to P)', summary.positions_held_ge_30_real],
    ['fee config', JSON.stringify(summary.fee_config)],
    ['converted', summary.converted],
    ['failed', summary.failed.length],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`);
  for (const row of summary.accounts_with_excluded_symbols) {
    lines.push(`  excluded ${row.user_id}: ${row.excluded.join(', ')}`);
  }
  for (const row of summary.max_holding.kept_accounts) {
    lines.push(`  max_holding kept ${row.user_id}: ${row.value}`);
  }
  for (const row of summary.failed) lines.push(`  FAILED ${row.user_id}: ${row.error}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    application_name: 'iqx-bot-strategy-v2-convert',
    connectionString: requireSafeTarget(options.apply),
    max: 3,
  });
  try {
    const summary = await runConversion(pool, options);
    process.stdout.write(
      options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatSummary(summary)}\n`,
    );
    if (summary.failed.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
