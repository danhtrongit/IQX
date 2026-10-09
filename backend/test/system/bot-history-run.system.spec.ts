import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ACADEMY_GRANTS } from '../../src/modules/academy/academy.ports.js';
import {
  BotHistoryService,
  BotService,
  type BotMarketSnapshotInput,
  type BotSnapshotProvider,
} from '../../src/modules/bots/index.js';
import { MarketDataService } from '../../src/modules/market-data/market-data.service.js';
import { HoseRestrictedSecuritiesProvider } from '../../src/modules/market-integration/index.js';
import { defaultConfig } from '../../src/modules/quant/v2/index.js';
import { nextCalendarDate } from '../../src/modules/strategy-config/strategy-config.calendar.js';
import { SharedConfigService } from '../../src/modules/strategy-config/strategy-config.service.js';
import { registerAndLogin, startSystemStack, type SystemStack } from './system-stack.js';

type Trend = 'up' | 'down';

/**
 * The history endpoints read what BotService really wrote: one real session buys, the next
 * one sells, and the round trip, fees, tax and per-session journal are checked against the
 * numbers of the ledger itself.
 */
describe('system acceptance: Bot history reads a real buy-then-sell run', () => {
  let stack: SystemStack;
  const grants = new Set<string>(['indicator:ma']);
  const today = '2026-09-28'; // Monday
  const trends = new Map<string, Trend>();
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
    await stack.query('delete from index_membership_snapshots');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
    vi.spyOn(stack.app.get(HoseRestrictedSecuritiesProvider), 'current').mockResolvedValue(
      new Set(),
    );
    vi.spyOn(stack.app.get(MarketDataService), 'getOhlcv').mockImplementation(
      async (symbol, query) => {
        const end = query?.end ?? today;
        return {
          data: trendBars(
            end,
            trends.get(`${symbol}:${end}`) ?? 'up',
            closes.get(`${symbol}:${end}`) ?? 20_000,
          ),
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
          data_version: `history-fixture:${tradingDate}`,
          close_is_official: true,
          buy_inputs_complete: true,
          fee_rules: feeRules,
          symbols: Object.fromEntries(
            names.map((name) => [
              name,
              {
                close_vnd: String(closes.get(`${name}:${tradingDate}`) ?? 20_000),
                close_is_official: true,
                trading_value_avg20_vnd: '5000000000',
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

  function nextTradingSession(from: string): string {
    let candidate = nextCalendarDate(from);
    while ([0, 6].includes(new Date(`${candidate}T00:00:00Z`).getUTCDay())) {
      candidate = nextCalendarDate(candidate);
    }
    return candidate;
  }

  it('R01 trades and sessions match the executions and decisions the Bot wrote', async () => {
    // Register on the real clock: refresh tokens expire against PostgreSQL now().
    vi.useRealTimers();
    const user = await registerAndLogin(stack.app, 'history-run');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
    const bots = stack.app.get(BotService);
    await bots.initializeAccount(user.id);

    const ma = structuredClone(defaultConfig().indicators.ma!);
    ma.master_enabled = true;
    ma.buy.enabled = true;
    ma.sell.enabled = true;
    const saved = await stack.app.get(SharedConfigService).save(user.id, {
      expected_revision: 0,
      idempotency_key: 'history-run-config-0001',
      indicators: { ma },
    });
    const entry = saved.effective_session!;
    const exit = nextTradingSession(entry);
    for (const date of [entry, exit]) {
      await stack.query(
        `insert into index_membership_snapshots (index_code, session_date, symbols, source, fetched_at, source_hash)
         values ('VN30', $1, '{VCB}'::text[], 'system-fixture', now(), $2)
         on conflict (index_code, session_date) do nothing`,
        [date, 'a'.repeat(64)],
      );
    }
    trends.set(`VCB:${entry}`, 'up');
    closes.set(`VCB:${entry}`, 20_000);
    vi.setSystemTime(new Date(`${entry}T12:00:00Z`));
    expect(await bots.runAccountSession(user.id, entry, provider())).toMatchObject({
      status: 'succeeded',
      buyCount: 1,
    });
    trends.set(`VCB:${exit}`, 'down');
    closes.set(`VCB:${exit}`, 19_000);
    vi.setSystemTime(new Date(`${exit}T12:00:00Z`));
    expect(await bots.runAccountSession(user.id, exit, provider())).toMatchObject({
      status: 'succeeded',
      sellCount: 1,
    });

    const history = stack.app.get(BotHistoryService);
    const trades = await history.trades(user.id, { limit: 10 });
    expect(trades.next_cursor).toBeNull();
    expect(trades.items).toHaveLength(1);
    // 500 x 20,000 = 10,000,000 + 10,000 fee out; 500 x 19,000 = 9,500,000 - 9,500 fee - 9,500 tax in.
    expect(trades.items[0]).toMatchObject({
      symbol: 'VCB',
      buy: {
        session: entry,
        price_vnd: '20000',
        qty: 500,
        gross_value_vnd: '10000000',
        fee_vnd: '10000',
        total_vnd: '10010000',
        decision_config_revision: 1,
        entry_source_snapshot: { kind: 'vn30', revision: 0 },
        reason_code: 'academy_buy',
      },
      sell: {
        session: exit,
        price_vnd: '19000',
        qty: 500,
        gross_value_vnd: '9500000',
        fee_vnd: '9500',
        tax_vnd: '9500',
        net_vnd: '9481000',
        decision_config_revision: 1,
        reason_code: 'academy_sell',
        reason_label: 'Bán theo điều kiện Bán',
      },
      realized_pnl_vnd: '-529000',
      holding_sessions: 1,
      legacy_stop_loss_vnd: null,
      legacy_take_profit_vnd: null,
    });
    expect(trades.items[0]!.realized_pnl_pct).toMatch(/^-5\.2847/);
    // The account really ended at start cash + the signed realized P&L.
    const [account] = await stack.query<{ cash: string }>(
      'select cash_vnd::text as cash from bot_accounts where user_id = $1',
      [user.id],
    );
    expect(account!.cash).toBe(String(100_000_000 - 529_000));

    const sessions = await history.sessions(user.id, { limit: 10 });
    expect(sessions.items.map((item) => item.session)).toEqual([exit, entry]);
    expect(sessions.items[0]).toMatchObject({
      run_status: 'succeeded',
      policy_version: 'iqx-bot-v1.0',
      universe: { kind: 'vn30', revision: 0, name: 'VN30' },
      config_revision: 1,
      counts: { buy: 0, sell: 1 },
      valuation_complete: true,
      nav_end_vnd: String(100_000_000 - 529_000),
    });
    expect(sessions.items[1]).toMatchObject({ config_revision: 1, counts: { buy: 1, sell: 0 } });

    const detail = await history.session(user.id, exit, { limit: 50 });
    expect(detail.items[0]).toMatchObject({
      action: 'sell',
      symbol: 'VCB',
      reason_code: 'academy_sell',
      decision_config_revision: 1,
      execution: { side: 'sell', qty: 500, tax_vnd: '9500', net_cash_delta_vnd: '9481000' },
    });
    expect(detail.next_cursor).toBeNull();
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
