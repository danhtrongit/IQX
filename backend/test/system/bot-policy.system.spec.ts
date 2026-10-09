import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ACADEMY_GRANTS } from '../../src/modules/academy/academy.ports.js';
import {
  BOT_POLICY,
  BotService,
  BotUniverseService,
  type BotMarketSnapshotInput,
  type BotSnapshotProvider,
} from '../../src/modules/bots/index.js';
import { MarketDataService } from '../../src/modules/market-data/market-data.service.js';
import {
  HoseRestrictedSecuritiesProvider,
  IndexMembershipProvider,
  MarketHuntDataSource,
} from '../../src/modules/market-integration/index.js';
import { defaultConfig } from '../../src/modules/quant/v2/index.js';
import { SharedConfigService } from '../../src/modules/strategy-config/strategy-config.service.js';
import { nextCalendarDate } from '../../src/modules/strategy-config/strategy-config.calendar.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Trend = 'up' | 'down';

describe('system acceptance: Bot policy iqx-bot-v1.0 on a real ledger', () => {
  let stack: SystemStack;
  const grants = new Set<string>(['indicator:ma']);
  const session = '2026-09-28'; // Monday
  /** Trend of the daily history the config engine sees, per `${symbol}:${session}`. */
  const trends = new Map<string, Trend>();
  /** Official close per `${symbol}:${session}` delivered by the snapshot provider. */
  const closes = new Map<string, number>();

  beforeAll(async () => {
    stack = await startSystemStack(
      {},
      {
        overrideProviders: [
          { token: ACADEMY_GRANTS, value: { grantedCapabilities: async () => grants } },
        ],
      },
    );
    // Membership snapshots are global per date: start from a clean table so reruns on a
    // reused external database behave like a fresh container.
    await stack.query('delete from index_membership_snapshots');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${session}T12:00:00Z`));
    vi.spyOn(stack.app.get(HoseRestrictedSecuritiesProvider), 'current').mockResolvedValue(
      new Set(),
    );
    vi.spyOn(stack.app.get(MarketDataService), 'getOhlcv').mockImplementation(
      async (symbol, query) => {
        const end = query?.end ?? session;
        const trend = trends.get(`${symbol}:${end}`) ?? 'up';
        return {
          data: trendBars(end, trend, closes.get(`${symbol}:${end}`) ?? 20_000),
          meta: {
            source: 'SYSTEM_FIXTURE',
            source_priority: 1,
            fallback_used: false,
            as_of: end,
            raw_endpoint: 'system-fixture:ohlcv',
          },
        };
      },
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    await stack?.close();
    vi.restoreAllMocks();
  });

  async function newUser(suffix: string, initialize = true) {
    // Register on the real clock: the refresh-token row expires at Date.now() + 7 days and
    // the auth guard compares it with PostgreSQL now().
    const fakedNow = Date.now();
    vi.useRealTimers();
    let user: Awaited<ReturnType<typeof registerAndLogin>>;
    try {
      user = await registerAndLogin(stack.app, suffix);
    } finally {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(fakedNow));
    }
    if (initialize) await stack.app.get(BotService).initializeAccount(user.id);
    return user;
  }

  /** Master ON `ma` with both sides: Buy when rising, Sell when falling. */
  async function saveMaConfig(userId: string, suffix: string) {
    const ma = structuredClone(defaultConfig().indicators.ma!);
    ma.master_enabled = true;
    ma.buy.enabled = true;
    ma.sell.enabled = true;
    const saved = await stack.app.get(SharedConfigService).save(userId, {
      expected_revision: 0,
      idempotency_key: `bot-policy-config-${suffix}`,
      indicators: { ma },
    });
    if (!saved.effective_session) throw new Error('System calendar did not produce a session');
    return saved;
  }

  async function storeVn30(date: string, symbols: string[]) {
    await stack.query(
      `insert into index_membership_snapshots (index_code, session_date, symbols, source, fetched_at, source_hash)
       values ('VN30', $1, $2::text[], 'system-fixture', now(), $3)
       on conflict (index_code, session_date) do nothing`,
      [date, symbols, 'a'.repeat(64)],
    );
  }

  const feeRules = {
    buy_fee_rate_bps: 10,
    sell_fee_rate_bps: 10,
    sell_tax_rate_bps: 10,
    board_lot_size: 100,
    source_ref: 'system-fixture:fees',
  };

  function provider(): BotSnapshotProvider {
    return {
      buildSnapshot: async (tradingDate, options) => {
        const names = [...new Set([...options.openSymbols, ...(options.universeSymbols ?? [])])];
        const input: BotMarketSnapshotInput = {
          trading_date: tradingDate,
          data_version: `policy-system-fixture:${tradingDate}`,
          close_is_official: true,
          buy_inputs_complete: true,
          fee_rules: feeRules,
          symbols: Object.fromEntries(
            names.map((name) => [
              name,
              {
                close_vnd: String(closes.get(`${name}:${tradingDate}`) ?? 20_000),
                close_is_official: true,
                trading_value_avg20_vnd: name === 'VCB' ? '5000000000' : '2000000000',
                security_status_verified: true,
                tradable_security_status: true,
                source_refs: { close: { session: tradingDate, official: true } },
              },
            ]),
          ),
        };
        return input;
      },
    };
  }

  function setDay(date: string) {
    vi.setSystemTime(new Date(`${date}T12:00:00Z`));
  }

  /**
   * Config revisions become effective from the DB clock, so every test needs its own
   * trading dates: membership snapshots are global per date and runs are ordered per account.
   */
  let cursor = '';
  function allocate(floor: string): string {
    const date = cursor >= floor ? nextTradingSession(cursor) : floor;
    cursor = date;
    return date;
  }

  function nextTradingSession(from: string): string {
    let candidate = nextCalendarDate(from);
    while ([0, 6].includes(new Date(`${candidate}T00:00:00Z`).getUTCDay())) {
      candidate = nextCalendarDate(candidate);
    }
    return candidate;
  }

  const countRows = (userId: string) =>
    stack.query(
      `select
         (select count(*)::int from bot_cash_ledger where bot_account_id = a.id) as ledger,
         (select count(*)::int from bot_executions where bot_account_id = a.id) as executions,
         (select count(*)::int from bot_run_receipts where user_id = a.user_id) as runs
       from bot_accounts a where a.user_id = $1`,
      [userId],
    );

  it('I01 funds exactly once without any level gate; the scheduler never backfills an account', async () => {
    const user = await newUser('policy-init', false);
    // A stale graduation row must neither be required nor trigger a backfill.
    await stack.query(
      `insert into cap6_progress(user_id, entered_at, graduated_at) values($1, now(), now())`,
      [user.id],
    );
    const bots = stack.app.get(BotService);
    const batch = await bots.runScheduledSession(session, provider());
    expect(batch.initialized).toBe(0);
    expect(await countRows(user.id)).toEqual([]);

    expect(await bots.initializeAccount(user.id)).toMatchObject({ initialized: true });
    expect(await bots.initializeAccount(user.id)).toMatchObject({ initialized: false });
    expect(await countRows(user.id)).toEqual([{ ledger: 1, executions: 0, runs: 0 }]);
    expect(
      await stack.query(
        `select i.cap6_graduated_at, a.cash_vnd::text as cash
           from bot_instances i join bot_accounts a on a.id = i.bot_account_id where i.user_id = $1`,
        [user.id],
      ),
    ).toEqual([{ cap6_graduated_at: null, cash: '100000000' }]);
  });

  it('A02 with no config the Bot waits, replays idempotently and reports the waiting state', async () => {
    const user = await newUser('policy-waiting');
    const bots = stack.app.get(BotService);

    const run = await bots.runAccountSession(user.id, session, provider());
    const repeated = await bots.runAccountSession(user.id, session, provider());

    expect(run).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 0, issues: [] });
    expect(repeated.id).toBe(run.id);
    expect(await countRows(user.id)).toEqual([{ ledger: 1, executions: 0, runs: 1 }]);
    expect(
      await stack.query('select reason_code from bot_decisions where bot_run_id = $1', [run.id]),
    ).toEqual([{ reason_code: 'waiting_for_academy_conditions' }]);
    expect(
      await stack.query(
        'select policy_version, universe_kind from bot_run_receipts where id = $1',
        [run.id],
      ),
    ).toEqual([{ policy_version: BOT_POLICY.policy_version, universe_kind: 'vn30' }]);

    const headers = authHeader(user.accessToken);
    const overview = await stack.app.inject({ method: 'GET', url: '/api/v2/bot', headers });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({
      eligible: true,
      account: { cash_vnd: '100000000', nav_vnd: '100000000', valuation_complete: true },
      bot: {
        policy_version: 'iqx-bot-v1.0',
        candidate_order: 'gtgd20_desc_symbol_asc',
        new_buys_enabled: true,
      },
      conditions: { state: 'waiting_for_conditions', state_label: 'Chờ thiết lập điều kiện' },
      bot_run: { status: 'succeeded', latest_run_id: run.id },
    });
    const status = await stack.app.inject({ method: 'GET', url: '/api/v2/bot/status', headers });
    expect(status.json()).toMatchObject({ status: 'succeeded', latest_run_id: run.id });
  });

  it('U13 without a verified VN30 membership nothing is bought, but the run still succeeds', async () => {
    const user = await newUser('policy-nomembership');
    const saved = await saveMaConfig(user.id, 'policy-nomembership');
    const entry = allocate(saved.effective_session!);
    setDay(entry);
    const bots = stack.app.get(BotService);
    const fetchCurrent = vi
      .spyOn(stack.app.get(IndexMembershipProvider), 'fetchCurrent')
      .mockRejectedValue(new Error('upstream down'));

    const run = await bots.runAccountSession(user.id, entry, provider());
    fetchCurrent.mockRestore();
    setDay(session);

    expect(run).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 0 });
    expect(run.issues.map((row) => row.code)).toContain('universe_unavailable');
    expect(
      await stack.query('select reason_code from bot_decisions where bot_run_id = $1', [run.id]),
    ).toEqual([{ reason_code: 'universe_unavailable' }]);
    expect(await countRows(user.id)).toEqual([{ ledger: 1, executions: 0, runs: 1 }]);
  });

  it('B02/B03 buys from the stored VN30 membership, records no stop, and never exits without a Sell', async () => {
    const user = await newUser('policy-vn30-buy');
    const saved = await saveMaConfig(user.id, 'policy-vn30-buy');
    const entry = allocate(saved.effective_session!);
    await storeVn30(entry, ['VCB']);
    trends.set(`VCB:${entry}`, 'up');
    closes.set(`VCB:${entry}`, 20_000);
    setDay(entry);
    const bots = stack.app.get(BotService);

    const bought = await bots.runAccountSession(user.id, entry, provider());

    expect(bought).toMatchObject({ status: 'succeeded', buyCount: 1, sellCount: 0 });
    expect((await bots.runAccountSession(user.id, entry, provider())).id).toBe(bought.id);
    const positions = await stack.query(
      `select qty_open, entry_price_vnd::text, entry_fee_vnd::text, stop_loss_vnd,
              amplitude_at_entry_vnd, amplitude_source_ref, take_profit_vnd,
              entry_config_revision, entry_source_snapshot
         from bot_positions where bot_account_id = (select id from bot_accounts where user_id = $1)`,
      [user.id],
    );
    expect(positions).toEqual([
      {
        qty_open: 500,
        entry_price_vnd: '20000',
        entry_fee_vnd: '10000',
        stop_loss_vnd: null,
        amplitude_at_entry_vnd: null,
        amplitude_source_ref: null,
        take_profit_vnd: null,
        entry_config_revision: saved.revision,
        entry_source_snapshot: expect.objectContaining({
          kind: 'vn30',
          name: 'VN30',
          revision: 0,
          membership_session: entry,
        }),
      },
    ]);

    // Legacy-style stop evidence is history only: a deep loss on the next session with an
    // unmet Sell condition (still rising history) must not sell.
    await stack.query(
      `update bot_positions set stop_loss_vnd = 19000, amplitude_at_entry_vnd = 500,
              amplitude_source_ref = 'legacy:l1'
        where bot_account_id = (select id from bot_accounts where user_id = $1)`,
      [user.id],
    );
    const next = allocate(saved.effective_session!);
    await storeVn30(next, ['VCB']);
    trends.set(`VCB:${next}`, 'up');
    closes.set(`VCB:${next}`, 12_000);
    setDay(next);
    const held = await bots.runAccountSession(user.id, next, provider());
    setDay(session);

    expect(held).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 0 });
    expect(
      await stack.query(
        `select qty_open, status from bot_positions
          where bot_account_id = (select id from bot_accounts where user_id = $1)`,
        [user.id],
      ),
    ).toEqual([{ qty_open: 500, status: 'open' }]);
    const reasons = await stack.query<{ reason_code: string }>(
      'select reason_code from bot_decisions where bot_run_id = $1',
      [held.id],
    );
    expect(reasons.map((row) => row.reason_code)).not.toContain('stop_loss');
  });

  it('U10 a position that left the buy universe is still sold when the Sell condition holds', async () => {
    const user = await newUser('policy-outside');
    const saved = await saveMaConfig(user.id, 'policy-outside');
    const entry = allocate(saved.effective_session!);
    await storeVn30(entry, ['VCB', 'VNM']);
    trends.set(`VCB:${entry}`, 'up');
    trends.set(`VNM:${entry}`, 'down');
    closes.set(`VCB:${entry}`, 20_000);
    setDay(entry);
    const bots = stack.app.get(BotService);
    const bought = await bots.runAccountSession(user.id, entry, provider());
    expect(bought).toMatchObject({ status: 'succeeded', buyCount: 1 });

    // Apply a list without VCB; it takes effect on the next session only.
    // A list the Bot may buy from is tied to a stored screener result (server-held evidence).
    const snapshotId = (
      await stack.query<{ id: string }>(
        `insert into result_snapshots
           (user_id, name, definition, definition_hash, as_of, run_at, data_source,
            calculation_version, registry_version, selection, symbols, rows)
         values ($1, 'Kết quả thử', $2::jsonb, $3, now(), now(), 'VCI', 'iqx-fund-2.0',
                 'iqx-fund-registry-2.1', '{"mode":"all","symbols":["VNM"]}'::jsonb,
                 ARRAY['VNM'], '[]'::jsonb)
         returning id`,
        [
          user.id,
          JSON.stringify({
            schema_version: '3.0',
            name: 'Thử',
            logic: 'AND',
            data_mode: 'latest_disclosed',
            rules: [],
            scope: { market: 'HOSE', sector: '' },
          }),
          'a'.repeat(64),
        ],
      )
    )[0]!.id;
    const listId = (
      await stack.query<{ id: string }>(
        `insert into list_snapshots (user_id, name, tickers, as_of, data_source, scope, result_snapshot_id)
         values ($1, 'Chỉ VNM', ARRAY['VNM'], $2, 'VCI', '{}'::jsonb, $3) returning id`,
        [user.id, entry, snapshotId],
      )
    )[0]!.id;
    // Service calls: the HTTP access token (30 minutes of REAL time) is not valid at the
    // far-future faked session dates this scenario needs.
    const apply = await stack.app.get(BotUniverseService).applyList(user.id, {
      list_id: listId,
      symbols: ['VNM'],
      expected_revision: 0,
      idempotency_key: `policy-outside-${user.id}`,
    });

    const exit = apply.request.effective_session as string;
    expect(exit).toBe(allocate(saved.effective_session!));
    trends.set(`VCB:${exit}`, 'down');
    trends.set(`VNM:${exit}`, 'down');
    closes.set(`VCB:${exit}`, 19_000);
    closes.set(`VNM:${exit}`, 20_000);
    setDay(exit);

    // Before the run the position is already shown as watch-only.
    const positions = (await bots.positions(user.id)) as Json;
    expect(positions.items[0]).toMatchObject({
      symbol: 'VCB',
      in_universe: false,
      source_scope: 'sell_watch_only',
      entry_source_snapshot: { kind: 'vn30' },
    });

    const sold = await bots.runAccountSession(user.id, exit, provider());
    setDay(session);

    expect(sold).toMatchObject({ status: 'succeeded', sellCount: 1, buyCount: 0 });
    const executions = await stack.query(
      `select e.side, e.qty, e.price_vnd::text, e.reason, to_char(e.trading_date, 'YYYY-MM-DD') as trading_date
         from bot_executions e join bot_accounts a on a.id = e.bot_account_id
        where a.user_id = $1 order by e.side`,
      [user.id],
    );
    expect(executions).toEqual([
      { side: 'buy', qty: 500, price_vnd: '20000', reason: 'academy_buy', trading_date: entry },
      { side: 'sell', qty: 500, price_vnd: '19000', reason: 'academy_sell', trading_date: exit },
    ]);
    const receipt = await stack.query(
      'select universe_revision, universe_kind from bot_run_receipts where id = $1',
      [sold.id],
    );
    expect(receipt).toEqual([{ universe_revision: 1, universe_kind: 'custom' }]);
    const balances = await stack.query<{ cash: string; ledger: string }>(
      `select a.cash_vnd::text as cash, sum(l.amount_vnd)::text as ledger
         from bot_accounts a join bot_cash_ledger l on l.bot_account_id = a.id
        where a.user_id = $1 group by a.id`,
      [user.id],
    );
    expect(balances[0]?.ledger).toBe(balances[0]?.cash);
  });

  it('C01 ranks by 20-session traded value and stops at two successful buys (real provider)', async () => {
    const user = await newUser('policy-real-provider');
    const saved = await saveMaConfig(user.id, 'policy-real-provider');
    const entry = allocate(saved.effective_session!);
    await storeVn30(entry, ['VCB', 'VNM', 'HPG']);
    await stack.query(
      `insert into symbols (id, symbol, name, exchange, asset_type, is_index, current_price_vnd, last_synced_at, is_active)
       values (gen_random_uuid(), 'HPG', 'Hoa Phat', 'HOSE', 'stock', false, 30000, now(), true)
       on conflict (symbol) do nothing`,
    );
    for (const name of ['VCB', 'VNM', 'HPG']) {
      trends.set(`${name}:${entry}`, 'up');
      closes.set(`${name}:${entry}`, 20_000);
    }
    const dailyBars = (gtgd: number) =>
      Array.from({ length: 25 }, (_, index) => {
        const date = new Date(`${entry}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - (24 - index));
        return {
          time: date.toISOString().slice(0, 10),
          open: 20_000,
          high: 20_100,
          low: 19_900,
          close: 20_000,
          volume: 100_000,
          gtgdVnd: gtgd,
        };
      });
    const barsSpy = vi
      .spyOn(stack.app.get(MarketHuntDataSource), 'dailyBarsThrough')
      .mockImplementation(
        async (symbols) =>
          new Map(
            symbols.map((symbol) => [
              symbol,
              dailyBars(symbol === 'HPG' ? 9_000_000_000 : symbol === 'VNM' ? 3_000_000_000 : 1e9),
            ]),
          ),
      );
    setDay(entry);

    const batch = await stack.app.get(BotService).runScheduledSession(entry);
    setDay(session);
    barsSpy.mockRestore();

    expect(batch.initialized).toBe(0);
    const bought = await stack.query<{ symbol: string }>(
      `select e.symbol from bot_executions e join bot_accounts a on a.id = e.bot_account_id
        where a.user_id = $1 and e.side = 'buy' order by e.symbol`,
      [user.id],
    );
    // HPG (9e9) and VNM (3e9) outrank VCB (1e9); only two buys per session.
    expect(bought.map((row) => row.symbol)).toEqual(['HPG', 'VNM']);
    const limit = await stack.query(
      `select count(*)::int as n from bot_decisions d join bot_run_receipts r on r.id = d.bot_run_id
        where r.user_id = $1 and d.reason_code = 'session_buy_limit'`,
      [user.id],
    );
    expect(limit).toEqual([{ n: 1 }]);
  });

  it('M01 the VN30 membership job stores today once, refuses past sessions and never rewrites', async () => {
    const bots = stack.app.get(BotService);
    const symbols = Array.from({ length: 30 }, (_, index) => `S${String(index).padStart(2, '0')}`);
    const fetchCurrent = vi
      .spyOn(stack.app.get(IndexMembershipProvider), 'fetchCurrent')
      .mockResolvedValue({
        index_code: 'VN30',
        symbols,
        source: 'system-fixture:getByGroup',
        source_hash: 'e'.repeat(64),
      });
    const today = '2026-09-28';

    const stored = await bots.captureVn30Membership(today, new Date(`${today}T11:40:00Z`));
    const again = await bots.captureVn30Membership(today, new Date(`${today}T11:45:00Z`));
    const past = await bots.captureVn30Membership('2026-09-25', new Date(`${today}T11:40:00Z`));

    expect(stored).toMatchObject({ status: 'stored', count: 30, session_date: today });
    expect(again).toMatchObject({ status: 'exists', count: 30 });
    expect(past).toMatchObject({ status: 'not_current_session' });
    expect(fetchCurrent).toHaveBeenCalledTimes(1);
    expect(
      await stack.query(
        `select session_date::text as session_date, cardinality(symbols)::int as n
           from index_membership_snapshots where index_code = 'VN30' order by session_date`,
      ),
    ).toEqual(expect.arrayContaining([{ session_date: today, n: 30 }]));
    const missing = await stack.query(
      `select 1 from index_membership_snapshots where index_code = 'VN30' and session_date = '2026-09-25'`,
    );
    expect(missing).toEqual([]);

    fetchCurrent.mockRejectedValue(new Error('upstream down'));
    expect(
      await bots.captureVn30Membership('2026-09-29', new Date('2026-09-29T11:40:00Z')),
    ).toMatchObject({ status: 'unavailable' });
    fetchCurrent.mockRestore();
    expect(stack.app.get(BotUniverseService)).toBeDefined();
  });
});

function trendBars(end: string, trend: Trend, finalClose: number) {
  const endDate = new Date(`${end}T00:00:00Z`);
  return Array.from({ length: 80 }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(endDate.getUTCDate() - (79 - index));
    const offset = (79 - index) * 100;
    const close = trend === 'up' ? finalClose - offset : finalClose + offset;
    return {
      time: date.toISOString().slice(0, 10),
      open: close,
      high: close + 100,
      low: close - 100,
      close,
      volume: 1_000_000,
    };
  });
}
