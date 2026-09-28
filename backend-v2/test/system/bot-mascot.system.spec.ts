import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  BOT_LAYER_KEYS,
  BotService,
  type BotSnapshotProvider,
} from '../../src/modules/bots/index.js';
import { FILTER_SPECS, HuntEngine } from '../../src/modules/journey/cap5/hunt.engine.js';
import {
  HoseRestrictedSecuritiesProvider,
  MarketHuntDataSource,
} from '../../src/modules/market-integration/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: Bot sessions reach the mascot API', () => {
  let stack: SystemStack;
  const session = '2026-09-28';

  beforeAll(async () => {
    stack = await startSystemStack();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${session}T12:00:00Z`));
    vi.spyOn(stack.app.get(HoseRestrictedSecuritiesProvider), 'current').mockResolvedValue(
      new Set(),
    );
    vi.spyOn(stack.app.get(MarketHuntDataSource), 'dailyBarsThrough').mockResolvedValue(new Map());
  });

  afterAll(async () => {
    vi.useRealTimers();
    await stack?.close();
    vi.restoreAllMocks();
  });

  async function graduatedUser(suffix: string, initialize = true) {
    const user = await registerAndLogin(stack.app, suffix);
    await stack.query(
      `insert into cap6_progress(user_id, entered_at, graduated_at) values($1, $2, $2)`,
      [user.id, new Date()],
    );
    if (initialize) await stack.app.get(BotService).initializeAccount(user.id);
    return user;
  }

  function scan(complete: boolean) {
    return vi.spyOn(HuntEngine.prototype, 'run').mockImplementation(async (filter) => ({
      filter: FILTER_SPECS[filter],
      available: true,
      complete,
      unavailableReason: null,
      matchedCount: 0,
      universeCount: 2,
      evaluatedCount: complete ? 2 : 1,
      floorRejectedCount: 0,
      missingDataCount: complete ? 0 : 1,
      incompleteWarning: complete ? null : 'Fixture source is incomplete',
      items: [],
    }));
  }

  it('records a complete empty scan as success and exposes it without duplicate funding or trades', async () => {
    const filter = scan(true);
    const user = await graduatedUser('bot-empty-session', false);
    const bots = stack.app.get(BotService);
    const batch = await bots.runScheduledSession(session);
    expect(batch).toMatchObject({ initialized: 1, processed: 1, succeeded: 1, failed: 0 });
    const run = await bots.runAccountSession(user.id, session);
    expect(run).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 0, issues: [] });
    const repeated = await bots.runAccountSession(user.id, session);
    expect(repeated.id).toBe(run.id);
    expect(repeated.status).toBe('succeeded');
    expect(filter).toHaveBeenCalledTimes(5);

    const headers = authHeader(user.accessToken);
    const mascot = await stack.app.inject({ method: 'GET', url: '/api/v2/bot/mascot', headers });
    expect(mascot.statusCode, mascot.body).toBe(200);
    expect(mascot.json()).toMatchObject({
      bot_run: {
        connected: true,
        status: 'succeeded',
        latest_run_id: run.id,
        processed_unseen_sessions: 1,
      },
    });
    const overview = await stack.app.inject({ method: 'GET', url: '/api/v2/bot', headers });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({
      eligible: true,
      account: { cash_vnd: '100000000', nav_vnd: '100000000', valuation_complete: true },
      bot_run: { status: 'succeeded', latest_run_id: run.id },
    });
    const counts = await stack.query(
      `select
         (select count(*)::int from bot_cash_ledger where bot_account_id = a.id) as ledger,
         (select count(*)::int from bot_executions where bot_account_id = a.id) as executions,
         (select count(*)::int from bot_run_receipts where user_id = a.user_id) as runs
       from bot_accounts a where a.user_id = $1`,
      [user.id],
    );
    expect(counts).toEqual([{ ledger: 1, executions: 0, runs: 1 }]);
    const decisions = await stack.query(
      'select reason_code from bot_decisions where bot_run_id = $1',
      [run.id],
    );
    expect(decisions).toEqual([{ reason_code: 'no_eligible_candidates' }]);
    filter.mockRestore();
  });

  it('keeps a scan with missing data failed and does not advertise a mascot update', async () => {
    const filter = scan(false);
    const user = await graduatedUser('bot-incomplete-session');
    const run = await stack.app.get(BotService).runAccountSession(user.id, session);
    expect(run).toMatchObject({ status: 'failed', buyCount: 0, sellCount: 0 });
    expect(run.issues).toContainEqual(expect.objectContaining({ code: 'filter_data_incomplete' }));
    const response = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/bot/mascot',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      bot_run: { connected: true, status: 'failed', processed_unseen_sessions: 0 },
    });
    filter.mockRestore();
  });

  it('persists a buy and a later exit without timestamp type errors or duplicate executions', async () => {
    const user = await graduatedUser('bot-buy-sell');
    const bots = stack.app.get(BotService);
    const provider: BotSnapshotProvider = {
      buildSnapshot: async (tradingDate) => ({
        trading_date: tradingDate,
        data_version: `isolated-fixture:${tradingDate}`,
        close_is_official: true,
        buy_inputs_complete: true,
        fee_rules: {
          buy_fee_rate_bps: 15,
          sell_fee_rate_bps: 15,
          sell_tax_rate_bps: 10,
          board_lot_size: 100,
          source_ref: 'isolated-fixture:fees',
        },
        symbols: {
          VCB: {
            close_vnd: tradingDate === session ? 20_000 : 10_000,
            close_is_official: true,
            trading_value_avg20_vnd: 2_000_000_000,
            filter_ids: ['kl_dot_bien'],
            layers: Object.fromEntries(
              BOT_LAYER_KEYS.map((key) => [
                key,
                {
                  verdict: 'ok' as const,
                  raw_level: 'fixture',
                  is_very_negative: false,
                  source_ref: `isolated-fixture:${key}`,
                },
              ]),
            ),
            l1_amplitude_vnd: 500,
            l1_amplitude_source_ref: 'isolated-fixture:l1',
            security_status_verified: true,
            tradable_security_status: true,
          },
        },
      }),
    };
    const bought = await bots.runAccountSession(user.id, session, provider);
    expect(bought).toMatchObject({ status: 'succeeded', buyCount: 1, sellCount: 0 });
    expect((await bots.runAccountSession(user.id, session, provider)).id).toBe(bought.id);
    const sold = await bots.runAccountSession(user.id, '2026-09-29', provider);
    expect(sold).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 1 });
    expect((await bots.runAccountSession(user.id, '2026-09-29', provider)).id).toBe(sold.id);
    const executions = await stack.query(
      `select e.side, count(*)::int as total from bot_executions e
       join bot_accounts a on a.id=e.bot_account_id where a.user_id=$1 group by e.side order by e.side`,
      [user.id],
    );
    expect(executions).toEqual([
      { side: 'buy', total: 1 },
      { side: 'sell', total: 1 },
    ]);
    const balances = await stack.query(
      `select a.cash_vnd::text as cash, sum(l.amount_vnd)::text as ledger
       from bot_accounts a join bot_cash_ledger l on l.bot_account_id=a.id
       where a.user_id=$1 group by a.id`,
      [user.id],
    );
    expect(balances).toEqual([{ cash: expect.any(String), ledger: balances[0]?.cash }]);
  });
});
