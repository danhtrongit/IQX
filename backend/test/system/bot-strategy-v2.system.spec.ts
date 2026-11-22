/**
 * Bot và Chiến lược v2.0 on a real database (PLAN W3): the Bot runs the shared strategy rules
 * over a fake price store and a fake strategy reader (W2 resolves real strategies).
 *  - R15: 60 sessions replayed through BotService give the same executions and daily NAV as
 *    runBasketBacktest over the same store window and basket;
 *  - R14: a retried session writes nothing new (no resell, no duplicate rows, same version);
 *  - B04/B05/T12: the next-session guard and the due-positions confirmation;
 *  - M02 / no mass sell at deploy: positions anchored at P (policy_cutover) are not sold at P and
 *    become due exactly at P+30.
 */
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formatSummary, runConversion } from '../../scripts/bot-strategy-v2-convert.js';
import { runRollback } from '../../scripts/bot-strategy-v2-rollback.js';
import {
  CALCULATION_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
} from '../../src/modules/quant/v2/index.js';

import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import { BotScheduleService, BotService } from '../../src/modules/bots/index.js';
import {
  PRICE_STORE,
  RULE_MESSAGES,
  runBasketBacktest,
  STRATEGY_READER,
  strategyConfigHash,
  type PriceSeriesBundle,
  type PriceStorePort,
  type ResolvedStrategy,
  type StrategyContent,
  type StrategyReaderPort,
  type SymbolSeries,
} from '../../src/modules/strategy-rules/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomBundle(calendar: string[], symbols: string[]): PriceSeriesBundle {
  const out: Record<string, SymbolSeries> = {};
  symbols.forEach((symbol, k) => {
    const rand = lcg(1_000 + k * 7_919);
    const n = calendar.length;
    const close = new Float64Array(n);
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const volume = new Float64Array(n);
    let price = 10_000 + k * 1_000;
    for (let i = 0; i < n; i += 1) {
      const o = price;
      price = Math.max(1_000, Math.round(price * (1 + (rand() - 0.5) * 0.06)));
      open[i] = o;
      close[i] = price;
      high[i] = Math.max(o, price) + 50;
      low[i] = Math.min(o, price) - 50;
      volume[i] = Math.round(100_000 + rand() * 900_000);
    }
    out[symbol] = {
      symbol,
      session_idx: Int32Array.from({ length: n }, (_, i) => i),
      open,
      high,
      low,
      close,
      volume,
      series_rev: 1,
    };
  });
  return {
    calendar,
    data_as_of: calendar.at(-1)!,
    symbols: out,
    market: Float64Array.from(calendar, (_, i) => 120_000 + Math.round(Math.sin(i / 10) * 5_000)),
    data_hash: 'random',
  };
}

/** The store as the Bot sees it on session `until` (nothing after D). */
function sliceBundle(bundle: PriceSeriesBundle, symbols: readonly string[], until: string): PriceSeriesBundle {
  const last = bundle.calendar.findLastIndex((date) => date <= until);
  const calendar = bundle.calendar.slice(0, last + 1);
  const out: Record<string, SymbolSeries> = {};
  for (const symbol of symbols) {
    const series = bundle.symbols[symbol];
    if (!series) continue;
    let n = 0;
    while (n < series.session_idx.length && series.session_idx[n]! <= last) n += 1;
    out[symbol] = {
      ...series,
      session_idx: series.session_idx.slice(0, n),
      open: series.open.slice(0, n),
      high: series.high.slice(0, n),
      low: series.low.slice(0, n),
      close: series.close.slice(0, n),
      volume: series.volume.slice(0, n),
    };
  }
  return {
    calendar,
    data_as_of: calendar.at(-1) ?? null,
    symbols: out,
    market: bundle.market ? bundle.market.slice(0, last + 1) : null,
    data_hash: `random:${until}:${Object.keys(out).sort().join(',')}`,
  };
}

function rsiContent(maxHolding: number, buyBelow: number, sellAbove: number): StrategyContent {
  const indicators = structuredClone(defaultConfig().indicators);
  const rsi = indicators.rsi!;
  rsi.master_enabled = true;
  rsi.buy.enabled = true;
  rsi.sell.enabled = true;
  const rows = (side: 'buy' | 'sell') => rsi[side].rules as Array<Record<string, unknown>>;
  rows('buy')[0] = { ...rows('buy')[0], op: '<', threshold: buyBelow };
  rows('buy')[1] = { ...rows('buy')[1], enabled: false };
  rows('sell')[0] = { ...rows('sell')[0], op: '>', threshold: sellAbove };
  rows('sell')[1] = { ...rows('sell')[1], enabled: false };
  return { universe: { type: 'vn30' }, indicators, max_holding: maxHolding };
}

const CAL = weekdays('2024-01-01', 240);
const SYMBOLS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH'];
const BUNDLE = randomBundle(CAL, SYMBOLS);
const START = 120;
const SESSIONS = 60;
const P = START + SESSIONS; // first session after the "deploy"

const STRATEGIES: Record<string, StrategyContent> = {
  active: rsiContent(10, 45, 55),
  // Never buys, never sells on the indicator: only Giữ tối đa can close a position.
  quiet: rsiContent(30, 1, 99),
  short: rsiContent(3, 1, 99),
};

const reader: StrategyReaderPort = {
  async resolve(_userId, ref) {
    const content = STRATEGIES[ref.id];
    if (ref.source !== 'user' || !content) return null;
    return {
      ref: { source: 'user', id: ref.id, version: 1 },
      name: ref.id === 'active' ? 'RSI chủ động' : 'Chỉ giữ',
      version_label: 'bản 01/01 10:00',
      content,
      config_hash: strategyConfigHash(content),
      hidden: false,
      deleted: false,
    } satisfies ResolvedStrategy;
  },
};

const store: PriceStorePort = {
  async meta() {
    return {
      data_store: 'flashback_vn100',
      data_as_of: CAL.at(-1)!,
      earliest_start: CAL[0]!,
      price_unit: 'VND',
      adjusted: true,
    } as Awaited<ReturnType<PriceStorePort['meta']>>;
  },
  async calendar() {
    return [...CAL];
  },
  async eligibility() {
    return { vn30: SYMBOLS, vn100: SYMBOLS } as unknown as Awaited<
      ReturnType<PriceStorePort['eligibility']>
    >;
  },
  async membersAt() {
    return [...SYMBOLS];
  },
  async loadSeries(symbols, options) {
    return sliceBundle(BUNDLE, symbols, options?.until ?? CAL.at(-1)!);
  },
};

/** 19:05 ICT of `date` (after the cutoff). */
const afterCutoff = (date: string) => new Date(`${date}T12:05:00Z`);
/** 10:00 ICT of `date` (before the cutoff). */
const morning = (date: string) => new Date(`${date}T03:00:00Z`);

describe('system acceptance: Bot v2.0 runs the shared strategy rules', () => {
  let stack: SystemStack;
  let bots: BotService;
  let schedule: BotScheduleService;
  let user: Awaited<ReturnType<typeof registerAndLogin>>;
  let accountId: string;

  beforeAll(async () => {
    stack = await startSystemStack(
      { BOT_NEW_BUYS_ENABLED: 'true' },
      {
        overrideProviders: [
          { token: PRICE_STORE, value: store },
          { token: STRATEGY_READER, value: reader },
        ],
      },
    );
    bots = stack.app.get(BotService);
    schedule = stack.app.get(BotScheduleService);
    user = await registerAndLogin(stack.app, 'botv2');
    await bots.initializeAccount(user.id);
    accountId = (
      await stack.query<{ id: string }>('select id from bot_accounts where user_id = $1', [user.id])
    )[0]!.id;
  });

  afterAll(async () => {
    await stack?.close();
  });

  const countRows = async (table: string) =>
    Number(
      (
        await stack.query<{ n: number }>(
          `select count(*)::int as n from ${table} where bot_account_id = $1`,
          [accountId],
        )
      )[0]!.n,
    );
  const countDecisions = async () =>
    Number(
      (
        await stack.query<{ n: number }>(
          `select count(*)::int as n from bot_decisions d
             join bot_run_receipts r on r.id = d.bot_run_id where r.bot_account_id = $1`,
          [accountId],
        )
      )[0]!.n,
    );

  it('B05: the next session must match (409 SCHEDULE_SESSION_LOCKED)', async () => {
    await expect(
      schedule.putNext(
        user.id,
        { source: 'user', id: 'active', expected_next_session: CAL[START + 1]! },
        morning(CAL[START]!),
      ),
    ).rejects.toMatchObject({ response: { code: 'SCHEDULE_SESSION_LOCKED' } });
    const view = await schedule.putNext(
      user.id,
      { source: 'user', id: 'active', expected_next_session: CAL[START]! },
      morning(CAL[START]!),
    );
    expect(view.next).toMatchObject({
      session_date: CAL[START],
      source: 'user',
      id: 'active',
      follow_latest: true,
      max_holding: 10,
    });
  });

  it('R15: 60 sessions of Bot executions and daily NAV equal runBasketBacktest', async () => {
    for (let i = START; i < START + SESSIONS; i += 1) {
      const run = await bots.runAccountSession(user.id, CAL[i]!, afterCutoff(CAL[i]!));
      expect(run.status, `session ${CAL[i]}`).toBe('succeeded');
    }
    const backtest = runBasketBacktest({
      content: STRATEGIES.active!,
      universe: SYMBOLS,
      start: CAL[START]!,
      end: CAL[START + SESSIONS - 1]!,
      data: BUNDLE,
    });
    expect(backtest.sessions).toBe(SESSIONS);

    const navs = await stack.query<{ trading_date: string; nav_vnd: string }>(
      `select to_char(trading_date, 'YYYY-MM-DD') as trading_date, nav_vnd::text
         from bot_nav_daily where bot_account_id = $1 order by trading_date`,
      [accountId],
    );
    expect(navs.map((row) => [row.trading_date, row.nav_vnd])).toEqual(
      backtest.curve.map((point) => [point.date, point.nav_vnd.toString()]),
    );

    const executions = await stack.query<Json>(
      `select to_char(trading_date, 'YYYY-MM-DD') as d, side, symbol, qty, price_vnd::text as price,
              exit_reason
         from bot_executions where bot_account_id = $1 order by trading_date, side desc, symbol`,
      [accountId],
    );
    const expected = [
      ...backtest.trades.map((trade) => ({
        d: trade.entry_session,
        side: 'buy',
        symbol: trade.symbol,
        qty: trade.qty,
        price: trade.entry_price_vnd.toString(),
        exit_reason: null,
      })),
      ...backtest.open_positions.map((open) => ({
        d: open.entry_session,
        side: 'buy',
        symbol: open.symbol,
        qty: open.qty,
        price: open.entry_price_vnd.toString(),
        exit_reason: null,
      })),
      ...backtest.trades.map((trade) => ({
        d: trade.exit_session,
        side: 'sell',
        symbol: trade.symbol,
        qty: trade.qty,
        price: trade.price_vnd.toString(),
        exit_reason: trade.exit_reason,
      })),
    ].sort((a, b) =>
      a.d === b.d
        ? a.side === b.side
          ? a.symbol.localeCompare(b.symbol)
          : b.side.localeCompare(a.side)
        : a.d.localeCompare(b.d),
    );
    expect(executions.length).toBeGreaterThan(0);
    expect(executions.map((row) => ({ ...row, qty: Number(row.qty) }))).toEqual(expected);

    const opens = await stack.query<{ symbol: string }>(
      `select symbol from bot_positions where bot_account_id = $1 and status = 'open' order by symbol`,
      [accountId],
    );
    expect(opens.map((row) => row.symbol)).toEqual(
      backtest.open_positions.map((open) => open.symbol).sort(),
    );

    // T01/T02: exactly one "Bot giao dịch" per session with fills, none for a session without.
    const notified = await stack.query<{ d: string }>(
      `select to_char(trade_date, 'YYYY-MM-DD') as d from user_notifications
        where user_id = $1 and type = 'bot_trades' order by trade_date`,
      [user.id],
    );
    expect(notified.map((row) => row.d)).toEqual([...new Set(executions.map((row) => row.d))]);
  });

  it('R14: a retried session writes nothing new and keeps the pinned version', async () => {
    const session = CAL[START + SESSIONS - 1]!;
    const before = {
      executions: await countRows('bot_executions'),
      decisions: await countDecisions(),
      ledger: await countRows('bot_cash_ledger'),
      nav: await countRows('bot_nav_daily'),
    };
    const receiptBefore = (
      await stack.query<Json>(
        `select id, strategy_ref_id, strategy_ref_version, rule_hash, status
           from bot_run_receipts where bot_account_id = $1 and trading_date = $2::date`,
        [accountId, session],
      )
    )[0];
    const again = await bots.runAccountSession(user.id, session, afterCutoff(session));
    expect(again.status).toBe('succeeded');
    expect({
      executions: await countRows('bot_executions'),
      decisions: await countDecisions(),
      ledger: await countRows('bot_cash_ledger'),
      nav: await countRows('bot_nav_daily'),
    }).toEqual(before);
    const receiptAfter = await stack.query<Json>(
      `select id, strategy_ref_id, strategy_ref_version, rule_hash, status
         from bot_run_receipts where bot_account_id = $1 and trading_date = $2::date`,
      [accountId, session],
    );
    expect(receiptAfter).toEqual([receiptBefore]);
    // T03: no second notification.
    expect(
      (
        await stack.query<{ n: number }>(
          `select count(*)::int as n from user_notifications where user_id = $1 and trade_date = $2::date`,
          [user.id, session],
        )
      )[0]!.n,
    ).toBeLessThanOrEqual(1);
    expect(receiptBefore).toMatchObject({ strategy_ref_id: 'active', strategy_ref_version: 1 });
  });

  it('B04/B05: shortening Giữ tối đa lists the due positions; 422 without, 409 on a stale list', async () => {
    const now = afterCutoff(CAL[P - 1]!);
    const impact = await schedule.impact(user.id, { source: 'user', id: 'short' }, now);
    expect(impact).toMatchObject({ next_session: CAL[P], n_current: 10, n_new: 3 });
    expect(impact.positions.length).toBeGreaterThan(0);
    for (const position of impact.positions) {
      expect(position.counted).toBeGreaterThanOrEqual(3);
      expect(position.counted).toBeLessThan(10);
    }
    const body = { source: 'user' as const, id: 'short', expected_next_session: CAL[P]! };
    await expect(schedule.putNext(user.id, body, now)).rejects.toMatchObject({
      response: { code: 'DUE_CONFIRM_REQUIRED' },
    });
    await expect(
      schedule.putNext(user.id, { ...body, confirm_due_positions: ['ZZZ'] }, now),
    ).rejects.toMatchObject({ response: { code: 'DUE_POSITIONS_CHANGED' } });
    // Nothing was written: the next session still runs the active strategy.
    expect((await schedule.view(user.id, now)).next).toMatchObject({ id: 'active' });
  });

  it('M02 / no mass sell at deploy: positions anchored at P are not sold at P, due at P+30', async () => {
    const opens = await stack.query<{ id: string; symbol: string }>(
      `select id, symbol from bot_positions where bot_account_id = $1 and status = 'open'`,
      [accountId],
    );
    expect(opens.length).toBeGreaterThan(0);
    // What the conversion writes (PLAN §5.2): anchor P, T+2 from the real entry.
    await stack.query(
      `update bot_positions set anchor_session = $2::date, anchor_reason = 'policy_cutover'
        where bot_account_id = $1 and status = 'open'`,
      [accountId, CAL[P]],
    );
    // B06: raising Giữ tối đa (10 → 30) needs no confirmation.
    const view = await schedule.putNext(
      user.id,
      { source: 'user', id: 'quiet', expected_next_session: CAL[P]! },
      afterCutoff(CAL[P - 1]!),
    );
    expect(view.next).toMatchObject({ session_date: CAL[P], id: 'quiet', max_holding: 30 });

    for (let i = P; i <= P + 30; i += 1) {
      const run = await bots.runAccountSession(user.id, CAL[i]!, afterCutoff(CAL[i]!));
      expect(run.status, `session ${CAL[i]}`).toBe('succeeded');
      const sells = await stack.query<{ symbol: string; exit_reason: string; counted: number }>(
        `select symbol, exit_reason, counted_sessions as counted from bot_executions
          where bot_account_id = $1 and side = 'sell' and trading_date = $2::date`,
        [accountId, CAL[i]],
      );
      if (i < P + 30) {
        expect(sells, `no sell at ${CAL[i]}`).toEqual([]);
      } else {
        expect(sells.map((row) => row.symbol).sort()).toEqual(opens.map((row) => row.symbol).sort());
        expect(new Set(sells.map((row) => row.exit_reason))).toEqual(new Set(['max_holding']));
        expect(sells.every((row) => Number(row.counted) === 30)).toBe(true);
      }
    }
  });

  it('B06/T12: a same-N switch has no due position and creates no notification', async () => {
    const next = CAL[P + 31]!;
    const notificationsBefore = (
      await stack.query<{ n: number }>('select count(*)::int as n from user_notifications where user_id = $1', [user.id])
    )[0]!.n;
    await schedule.putNext(
      user.id,
      { source: 'user', id: 'active', expected_next_session: next },
      afterCutoff(CAL[P + 30]!),
    );
    const impact = await schedule.impact(user.id, { source: 'user', id: 'active' }, morning(next));
    expect(impact).toMatchObject({ next_session: next, n_current: 10, n_new: 10, positions: [] });
    expect(
      (
        await stack.query<{ n: number }>('select count(*)::int as n from user_notifications where user_id = $1', [user.id])
      )[0]!.n,
    ).toBe(notificationsBefore);
  });

  it('B13: a new account has no strategy and does not buy', async () => {
    const fresh = await registerAndLogin(stack.app, 'botv2new');
    await bots.initializeAccount(fresh.id);
    const view = await schedule.view(fresh.id, morning(CAL[START]!));
    expect(view.last).toBeNull();
    expect(view.next).toMatchObject({ session_date: CAL[START], source: null, id: null });
    const run = await bots.runAccountSession(fresh.id, CAL[START]!, afterCutoff(CAL[START]!));
    expect(run.status).toBe('succeeded');
    const receipt = await stack.query<Json>(
      `select counters->>'summary' as summary from bot_run_receipts where user_id = $1`,
      [fresh.id],
    );
    expect(receipt).toEqual([{ summary: RULE_MESSAGES.no_strategy }]);
    expect(
      await stack.query('select 1 from bot_executions e join bot_accounts a on a.id = e.bot_account_id where a.user_id = $1', [fresh.id]),
    ).toEqual([]);
  });

  it('HTTP: GET /api/v2/bot/schedule, /positions and /journal/sessions expose v2 fields', async () => {
    const scheduleView = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/bot/schedule',
      headers: authHeader(user.accessToken),
    });
    expect(scheduleView.statusCode).toBe(200);
    expect(scheduleView.json().next).toHaveProperty('cutoff_at');
    const sessions = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/bot/journal/sessions?limit=2',
      headers: authHeader(user.accessToken),
    });
    expect(sessions.statusCode).toBe(200);
    const item = sessions.json().items[0];
    expect(item).toMatchObject({ strategy_label: 'Chỉ giữ', universe_label: 'VN30' });
    expect(item.counters).toMatchObject({ sells: expect.any(Number), buys: 0 });
    const trades = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/bot/trades?limit=5',
      headers: authHeader(user.accessToken),
    });
    expect(trades.statusCode).toBe(200);
    expect(trades.json().items[0]).toMatchObject({
      exit_reason: 'max_holding',
      exit_reason_label: 'Hết thời gian giữ',
      max_holding_at_exit: 30,
    });
  });

  it('conversion (§11): dry-run writes nothing; apply anchors at P, no due at P, no notification; rollback', async () => {
    // A Bot of iqx-bot-v1.x: positions from the old engine, a V3 shared config with Buy+Sell rows.
    const legacy = await registerAndLogin(stack.app, 'botv2conv');
    await bots.initializeAccount(legacy.id);
    const legacyAccount = (
      await stack.query<{ id: string }>('select id from bot_accounts where user_id = $1', [legacy.id])
    )[0]!.id;
    await schedule.putNext(
      legacy.id,
      { source: 'user', id: 'active', expected_next_session: CAL[START]! },
      morning(CAL[START]!),
    );
    for (let i = START; i < START + 20; i += 1) {
      await bots.runAccountSession(legacy.id, CAL[i]!, afterCutoff(CAL[i]!));
    }
    const held = await stack.query<{ symbol: string }>(
      `select symbol from bot_positions where bot_account_id = $1 and status = 'open'`,
      [legacyAccount],
    );
    expect(held.length).toBeGreaterThan(0);
    const legacyBot = (
      await stack.query<{ id: string }>('select id from bot_instances where user_id = $1', [legacy.id])
    )[0]!.id;
    await stack.query('delete from bot_strategy_schedule where bot_id = $1', [legacyBot]);
    await stack.query(
      `update bot_positions set anchor_session = null, anchor_reason = null, sellable_from_session = null
        where bot_account_id = $1`,
      [legacyAccount],
    );
    const config = {
      schema_version: SCHEMA_VERSION,
      rule_version: RULE_VERSION,
      revision: 1,
      indicators: STRATEGIES.active!.indicators,
      max_holding: 12,
    };
    await stack.query(
      `insert into shared_config_revisions
         (user_id, revision, schema_version, rule_version, calculation_version, config, config_hash,
          patch, requested_at, actor_id, idempotency_key)
       values ($1, 1, $2, $3, $4, $5::jsonb, $6, '{}'::jsonb, now(), $1, 'conv-test')`,
      [legacy.id, SCHEMA_VERSION, RULE_VERSION, CALCULATION_VERSION, JSON.stringify(config), 'e'.repeat(64)],
    );
    await stack.query(
      `insert into effective_config_sessions (user_id, revision, effective_session, status)
       values ($1, 1, '2024-01-02', 'effective')`,
      [legacy.id],
    );
    const pool = new Pool({ connectionString: stack.databaseUrl, max: 3 });
    const now = new Date('2026-11-20T03:00:00Z'); // Friday 10:00 ICT → P = Monday 2026-11-23
    const notificationsBefore = (
      await stack.query<{ n: number }>('select count(*)::int as n from user_notifications')
    )[0]!.n;
    try {
      const dry = await runConversion(pool, { apply: false, userId: legacy.id, now });
      expect(dry).toMatchObject({
        mode: 'dry-run',
        p_session: '2026-11-23',
        accounts: 1,
        groups: { buy: 1, buy_pending: 0, sell_only: 0, none: 0 },
        max_holding: { kept: 1, default_30: 0 },
        positions_due_at_p: 0,
        open_positions: held.length,
        positions_held_ge_30_real: held.length,
        failed: [],
      });
      expect(dry.fee_config).toMatchObject({ buy_fee_rate_bps: 15, board_lot_size: 100 });
      expect(formatSummary(dry)).toContain('positions due at P (must be 0)');
      expect(
        await stack.query('select 1 from bot_strategy_schedule where bot_id = $1', [legacyBot]),
      ).toEqual([]);

      const applied = await runConversion(pool, { apply: true, userId: legacy.id, now });
      expect(applied).toMatchObject({ mode: 'apply', converted: 1, failed: [] });
      const rows = await stack.query<Json>(
        `select to_char(session_date, 'YYYY-MM-DD') as d, strategy_source, version, follow_latest,
                locked_at is not null as locked, run_status
           from bot_strategy_schedule where bot_id = $1 order by session_date`,
        [legacyBot],
      );
      expect(rows).toEqual([
        { d: CAL[START + 19], strategy_source: 'user', version: 1, follow_latest: true, locked: true, run_status: 'converted' },
        { d: '2026-11-23', strategy_source: 'user', version: 1, follow_latest: true, locked: false, run_status: null },
      ]);
      const anchors = await stack.query<Json>(
        `select distinct to_char(anchor_session, 'YYYY-MM-DD') as a, anchor_reason
           from bot_positions where bot_account_id = $1 and status = 'open'`,
        [legacyAccount],
      );
      expect(anchors).toEqual([{ a: '2026-11-23', anchor_reason: 'policy_cutover' }]);
      const strategy = await stack.query<Json>(
        `select s.name, s.latest_version, v.content->>'max_holding' as max_holding, v.note
           from user_strategies s join user_strategy_versions v on v.strategy_id = s.id
          where s.user_id = $1`,
        [legacy.id],
      );
      expect(strategy).toEqual([
        {
          name: 'Chiến lược của tôi (từ thiết lập cũ)',
          latest_version: 1,
          max_holding: '12',
          note: 'Chuyển từ thiết lập Bot cũ',
        },
      ]);
      // M05/T11: no notification, no order.
      expect(
        (await stack.query<{ n: number }>('select count(*)::int as n from user_notifications'))[0]!.n,
      ).toBe(notificationsBefore);
      // Idempotent.
      const again = await runConversion(pool, { apply: true, userId: legacy.id, now });
      expect(again).toMatchObject({ already_converted: 1, converted: 0 });

      const rollback = await runRollback(pool, { apply: true, userId: legacy.id, now });
      expect(rollback).toMatchObject({ accounts: 1, schedule_rows: 2, anchored_positions: held.length });
      expect(
        await stack.query('select 1 from bot_strategy_schedule where bot_id = $1', [legacyBot]),
      ).toEqual([]);
      expect(
        await stack.query(
          `select 1 from bot_positions where bot_account_id = $1 and anchor_session is not null`,
          [legacyAccount],
        ),
      ).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
