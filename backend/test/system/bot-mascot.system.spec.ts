import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ACADEMY_CATALOG_VERSION,
  loadAcademyContent,
} from '../../src/modules/academy/academy.content.js';
import { AcademyService } from '../../src/modules/academy/academy.service.js';
import {
  BOT_POLICY,
  BotService,
  formatDecimal4,
  parseDecimal4,
  snapshotHash,
  type BotMarketSnapshotInput,
  type BotSnapshotProvider,
} from '../../src/modules/bots/index.js';
import { FILTER_SPECS, HuntEngine } from '../../src/modules/journey/cap5/hunt.engine.js';
import { MarketDataService } from '../../src/modules/market-data/market-data.service.js';
import {
  HoseRestrictedSecuritiesProvider,
  MarketHuntDataSource,
} from '../../src/modules/market-integration/index.js';
import { defaultConfig } from '../../src/modules/quant/v2/index.js';
import { nextCalendarDate } from '../../src/modules/strategy-config/strategy-config.calendar.js';
import { SharedConfigService } from '../../src/modules/strategy-config/strategy-config.service.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: Bot sessions reach the mascot API', () => {
  let stack: SystemStack;
  const session = '2026-09-28';
  const historyCloseBySession = new Map<string, number>();

  beforeAll(async () => {
    stack = await startSystemStack();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${session}T12:00:00Z`));
    vi.spyOn(stack.app.get(HoseRestrictedSecuritiesProvider), 'current').mockResolvedValue(
      new Set(),
    );
    vi.spyOn(stack.app.get(MarketHuntDataSource), 'dailyBarsThrough').mockResolvedValue(new Map());
    vi.spyOn(stack.app.get(MarketDataService), 'getOhlcv').mockImplementation(
      async (_symbol, query) => {
        const end = query?.end ?? session;
        return {
          data: rsiReboundBars(end, historyCloseBySession.get(end) ?? 20_000),
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

  async function graduatedUser(suffix: string, initialize = true) {
    // Register and log in on the real clock: the refresh-token row expires at
    // `Date.now() + REFRESH_TOKEN_EXPIRE_DAYS`, and the auth guard compares it
    // with PostgreSQL `now()`, so a session issued on the faked session date
    // would already be revoked once the real date passes session + 7 days.
    const fakedNow = Date.now();
    vi.useRealTimers();
    let user: Awaited<ReturnType<typeof registerAndLogin>>;
    try {
      user = await registerAndLogin(stack.app, suffix);
    } finally {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(fakedNow));
    }
    await stack.query(
      `insert into cap6_progress(user_id, entered_at, graduated_at) values($1, $2, $2)`,
      [user.id, new Date()],
    );
    if (initialize) await stack.app.get(BotService).initializeAccount(user.id);
    return user;
  }

  async function activateRsi(userId: string, suffix: string) {
    const academy = stack.app.get(AcademyService);
    const content = loadAcademyContent();
    const lessonId = 'ch01-l01';
    const attempt = await academy.createAttempt(userId, {
      lesson_id: lessonId,
      catalog_version: ACADEMY_CATALOG_VERSION,
      idempotency_key: `bot-system-attempt-${suffix}`,
    });
    await academy.submit(userId, attempt.attempt_id, {
      answers: content.lessons.get(lessonId)!.assessment!.questions.map((question) => ({
        question_id: question.id,
        option_id: question.correct_option_id,
      })),
    });

    const rsi = structuredClone(defaultConfig().indicators.rsi!);
    rsi.master_enabled = true;
    rsi.buy.enabled = true;
    rsi.sell.enabled = false;
    const saved = await stack.app.get(SharedConfigService).save(userId, {
      expected_revision: 0,
      idempotency_key: `bot-system-config-${suffix}`,
      indicators: { rsi },
    });
    if (!saved.effective_session) throw new Error('System calendar did not produce a session');
    return saved;
  }

  function provider(entrySession: string): BotSnapshotProvider {
    return {
      buildSnapshot: async (tradingDate) => {
        const input: BotMarketSnapshotInput = {
          trading_date: tradingDate,
          data_version: `academy-system-fixture:${tradingDate}`,
          close_is_official: true,
          buy_inputs_complete: true,
          fee_rules: {
            buy_fee_rate_bps: 10,
            sell_fee_rate_bps: 10,
            sell_tax_rate_bps: 10,
            board_lot_size: 100,
            source_ref: 'system-fixture:fees',
          },
          symbols: {
            VCB: {
              close_vnd: tradingDate === entrySession ? 20_000 : 19_000,
              close_is_official: true,
              trading_value_avg20_vnd: 2_000_000_000,
              filter_ids: ['kl_dot_bien'],
              l1_amplitude_vnd: 500,
              l1_amplitude_source_ref: `system-fixture:l1:${tradingDate}`,
              security_status_verified: true,
              tradable_security_status: true,
              source_refs: {
                close: { session: tradingDate, official: true },
                l1_amplitude: { session: tradingDate, unit: 'VND/share' },
              },
            },
          },
          source_refs: { hunt: `system-fixture:hunt:${tradingDate}` },
        };
        return { ...input, snapshot_hash: snapshotHash(input) };
      },
    };
  }

  async function academyBuyer(suffix: string) {
    const user = await graduatedUser(suffix);
    const saved = await activateRsi(user.id, suffix);
    const entrySession = saved.effective_session!;
    vi.setSystemTime(new Date(`${entrySession}T12:00:00Z`));
    historyCloseBySession.set(entrySession, 20_000);
    return { user, saved, entrySession, provider: provider(entrySession) };
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

  it('A02 S/A04 S/F07 S funds once, waits after an empty scan, and replays the run', async () => {
    const filter = scan(true);
    const user = await graduatedUser('bot-empty-session', false);
    const bots = stack.app.get(BotService);
    const batch = await bots.runScheduledSession(session);
    expect(batch).toMatchObject({ initialized: 1, processed: 1, succeeded: 1, failed: 0 });
    expect(await bots.initializeAccount(user.id)).toMatchObject({ initialized: false });
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
    expect(decisions).toEqual([{ reason_code: 'waiting_for_academy_conditions' }]);
    const receipts = await stack.query(
      'select policy_version from bot_run_receipts where id = $1',
      [run.id],
    );
    expect(receipts).toEqual([{ policy_version: BOT_POLICY.policy_version }]);
    filter.mockRestore();
  });

  it('A02 S waits with no Academy config even when the snapshot has a buyable candidate', async () => {
    const user = await graduatedUser('bot-waiting-candidate');
    const run = await stack.app
      .get(BotService)
      .runAccountSession(user.id, session, provider(session));
    expect(run).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 0 });
    expect(
      await stack.query('select reason_code from bot_decisions where bot_run_id = $1', [run.id]),
    ).toEqual([{ reason_code: 'waiting_for_academy_conditions' }]);
  });

  it('keeps an Academy-entry scan with missing data failed and hides the mascot update', async () => {
    const filter = scan(false);
    const user = await graduatedUser('bot-incomplete-session');
    const saved = await activateRsi(user.id, 'bot-incomplete-session');
    vi.setSystemTime(new Date(`${saved.effective_session!}T12:00:00Z`));
    const run = await stack.app
      .get(BotService)
      .runAccountSession(user.id, saved.effective_session!);
    expect(run).toMatchObject({ status: 'failed', buyCount: 0, sellCount: 0 });
    expect(run.issues).toContainEqual(expect.objectContaining({ code: 'filter_data_incomplete' }));
    vi.setSystemTime(new Date(`${session}T12:00:00Z`));
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

  it('D01/D12 S/E01 buys from an effective Academy config and replays the entry run', async () => {
    const {
      user,
      saved,
      entrySession,
      provider: snapshotProvider,
    } = await academyBuyer('bot-academy-buy');
    const bots = stack.app.get(BotService);
    const bought = await bots.runAccountSession(user.id, entrySession, snapshotProvider);
    expect(bought).toMatchObject({ status: 'succeeded', buyCount: 1, sellCount: 0 });
    expect((await bots.runAccountSession(user.id, entrySession, snapshotProvider)).id).toBe(
      bought.id,
    );
    const positions = await stack.query(
      `select qty_open, entry_price_vnd::text, entry_fee_vnd::text,
              stop_loss_vnd::text, take_profit_vnd::text, entry_config_revision
         from bot_positions where bot_account_id =
           (select id from bot_accounts where user_id = $1)`,
      [user.id],
    );
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      qty_open: 500,
      entry_price_vnd: '20000',
      entry_fee_vnd: '10000',
      take_profit_vnd: null,
      entry_config_revision: saved.revision,
    });
    expect(decimalVnd(positions[0]!.stop_loss_vnd)).toBe('19000');
    expect(
      await stack.query('select policy_version from bot_run_receipts where id = $1', [bought.id]),
    ).toEqual([{ policy_version: BOT_POLICY.policy_version }]);
  });

  it('D12 S/F07 S sells all at the next-session close when close equals the stored stop', async () => {
    const {
      user,
      entrySession,
      provider: snapshotProvider,
    } = await academyBuyer('bot-academy-stop');
    const bots = stack.app.get(BotService);
    const bought = await bots.runAccountSession(user.id, entrySession, snapshotProvider);
    expect(bought).toMatchObject({ status: 'succeeded', buyCount: 1, sellCount: 0 });
    const exitSession = nextTradingSession(entrySession);
    historyCloseBySession.set(exitSession, 19_000);
    vi.setSystemTime(new Date(`${exitSession}T12:00:00Z`));
    const sold = await bots.runAccountSession(user.id, exitSession, snapshotProvider);
    expect(sold).toMatchObject({ status: 'succeeded', buyCount: 0, sellCount: 1 });
    expect((await bots.runAccountSession(user.id, exitSession, snapshotProvider)).id).toBe(sold.id);
    const executions = await stack.query(
      `select e.side, e.qty, e.price_vnd::text, e.reason,
              to_char(e.trading_date, 'YYYY-MM-DD') as trading_date
         from bot_executions e join bot_accounts a on a.id=e.bot_account_id
        where a.user_id=$1 order by e.side`,
      [user.id],
    );
    expect(executions).toEqual([
      {
        side: 'buy',
        qty: 500,
        price_vnd: '20000',
        reason: 'academy_buy',
        trading_date: entrySession,
      },
      {
        side: 'sell',
        qty: 500,
        price_vnd: '19000',
        reason: 'stop_loss',
        trading_date: exitSession,
      },
    ]);
    expect(
      await stack.query(
        `select qty_open, to_char(closed_session, 'YYYY-MM-DD') as closed_session,
                (sell_execution_id is not null) as execution_linked
           from bot_positions where bot_account_id =
             (select id from bot_accounts where user_id = $1)`,
        [user.id],
      ),
    ).toEqual([{ qty_open: 0, closed_session: exitSession, execution_linked: true }]);
    const balances = await stack.query(
      `select a.cash_vnd::text as cash, sum(l.amount_vnd)::text as ledger
       from bot_accounts a join bot_cash_ledger l on l.bot_account_id=a.id
       where a.user_id=$1 group by a.id`,
      [user.id],
    );
    expect(balances).toEqual([{ cash: expect.any(String), ledger: balances[0]?.cash }]);
  });
});

function rsiReboundBars(end: string, finalClose: number) {
  const endDate = new Date(`${end}T00:00:00Z`);
  return Array.from({ length: 80 }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(endDate.getUTCDate() - (79 - index));
    const close = index === 79 ? finalClose : finalClose + 7_700 - index * 100;
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

function nextTradingSession(session: string): string {
  let candidate = nextCalendarDate(session);
  while ([0, 6].includes(new Date(`${candidate}T00:00:00Z`).getUTCDay())) {
    candidate = nextCalendarDate(candidate);
  }
  return candidate;
}

function decimalVnd(value: unknown): string {
  const parsed = parseDecimal4(String(value));
  if (parsed === null) throw new Error(`Invalid decimal VND fixture value: ${String(value)}`);
  return formatDecimal4(parsed);
}
