import { describe, expect, it, vi } from 'vitest';

import {
  botSessionDecisionsPageSchema,
  botSessionsPageSchema,
  botTradesPageSchema,
  sessionDecisionsQuerySchema,
  sessionParamSchema,
  sessionsQuerySchema,
  tradesQuerySchema,
} from '../../src/modules/bots/bot-history.schemas.js';
import {
  BotHistoryService,
  decisionView,
  sessionView,
  tradeView,
  type DecisionRow,
  type SessionReasonRow,
  type SessionRow,
  type TradeRow,
} from '../../src/modules/bots/bot-history.service.js';
import { tradingDayPredicate } from '../../src/modules/strategy-config/strategy-config.calendar.js';
import type { DatabaseService } from '../../src/platform/database/index.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = ID(1);
const ACCOUNT = ID(2);

/** 100 x 20,000 buy (fee 15 bps), 100 x 22,000 sell (fee 15 bps, tax 10 bps). */
function tradeRow(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    id: ID(10),
    symbol: 'VCB',
    entry_price_vnd: '20000',
    entry_value_vnd: '2000000',
    entry_fee_vnd: '3000',
    opened_session: '2026-09-28',
    opened_at: new Date('2026-09-28T07:30:00Z'),
    entry_config_revision: 2,
    entry_source_snapshot: { kind: 'vn30', name: 'VN30', revision: 0 },
    stop_loss_vnd: null,
    take_profit_vnd: null,
    amplitude_at_entry_vnd: null,
    amplitude_source_ref: null,
    filter_ids: [],
    holding_sessions: 2,
    holding_days: 2,
    buy_execution_id: ID(11),
    buy_qty: 100,
    buy_session: '2026-09-28',
    buy_executed_at: new Date('2026-09-28T07:30:00Z'),
    buy_exec_reason: 'academy_buy',
    buy_decision_id: ID(12),
    buy_reason_code: 'academy_buy',
    buy_reason: 'Bot mua 100 VCB',
    buy_decision_revision: 2,
    sell_execution_id: ID(13),
    sell_qty: 100,
    sell_price_vnd: '22000',
    sell_session: '2026-09-30',
    sell_executed_at: new Date('2026-09-30T07:30:00Z'),
    sell_gross_vnd: '2200000',
    sell_fee_vnd: '3300',
    sell_tax_vnd: '2200',
    sell_net_vnd: '2194500',
    sell_exec_reason: 'academy_sell',
    sell_decision_id: ID(14),
    sell_reason_code: 'academy_sell',
    sell_reason: 'Bot bán toàn bộ 100 VCB',
    sell_decision_revision: 3,
    ...overrides,
  };
}

describe('tradeView (Bot SPEC 8.6 formulas)', () => {
  it('T01 realized P&L = sell net - buy value - buy fee, with the tax counted exactly once', () => {
    const trade = tradeView(tradeRow());
    expect(trade.buy).toMatchObject({
      price_vnd: '20000',
      qty: 100,
      gross_value_vnd: '2000000',
      fee_vnd: '3000',
      total_vnd: '2003000',
    });
    expect(trade.sell).toMatchObject({
      gross_value_vnd: '2200000',
      fee_vnd: '3300',
      tax_vnd: '2200',
      net_vnd: '2194500',
    });
    // 2,194,500 - 2,003,000. Subtracting the tax again would give 189,300.
    expect(trade.realized_pnl_vnd).toBe('191500');
    expect(trade.realized_pnl_vnd).not.toBe('189300');
    // 191,500 / 2,003,000 = 9.5606...%
    expect(trade.realized_pnl_pct).toMatch(/^9\.5606/);
    expect(
      BigInt(trade.sell.gross_value_vnd) - BigInt(trade.sell.fee_vnd) - BigInt(trade.sell.tax_vnd),
    ).toBe(BigInt(trade.sell.net_vnd));
  });

  it('T02 a losing trade is negative, with the fees making a flat price a small loss', () => {
    const flat = tradeView(
      tradeRow({
        sell_price_vnd: '20000',
        sell_gross_vnd: '2000000',
        sell_fee_vnd: '3000',
        sell_tax_vnd: '2000',
        sell_net_vnd: '1995000',
      }),
    );
    expect(flat.realized_pnl_vnd).toBe('-8000'); // 1,995,000 - 2,003,000
    expect(flat.realized_pnl_pct).toMatch(/^-0\.3994/);
  });

  it('T03 uses exact integer arithmetic for very large VND amounts', () => {
    const trade = tradeView(
      tradeRow({
        entry_value_vnd: '9007199254740993000',
        entry_fee_vnd: '1',
        sell_net_vnd: '9007199254740993001',
      }),
    );
    expect(trade.realized_pnl_vnd).toBe('0');
    expect(trade.buy.total_vnd).toBe('9007199254740993001');
  });

  it('T04 carries decision revisions, entry source, reasons and labels from decision time', () => {
    const trade = tradeView(tradeRow());
    expect(trade.buy).toMatchObject({
      session: '2026-09-28',
      executed_at: '2026-09-28T07:30:00.000Z',
      decision_config_revision: 2,
      entry_source_snapshot: { kind: 'vn30', name: 'VN30', revision: 0 },
      reason_code: 'academy_buy',
      reason_label: 'Mua theo điều kiện Mua',
    });
    expect(trade.sell).toMatchObject({
      session: '2026-09-30',
      executed_at: '2026-09-30T07:30:00.000Z',
      decision_config_revision: 3,
      reason_code: 'academy_sell',
      reason_label: 'Bán theo điều kiện Bán',
      reason: 'Bot bán toàn bộ 100 VCB',
    });
    expect(trade.holding_sessions).toBe(2);
    expect(trade.holding_days).toBe(2);
  });

  it('T05 falls back to the position and execution rows when a decision row is missing', () => {
    const trade = tradeView(
      tradeRow({
        buy_decision_id: null,
        buy_reason_code: null,
        buy_reason: null,
        buy_decision_revision: null,
        sell_decision_id: null,
        sell_reason_code: null,
        sell_reason: null,
        sell_decision_revision: null,
      }),
    );
    expect(trade.buy).toMatchObject({
      decision_id: null,
      decision_config_revision: 2, // bot_positions.entry_config_revision
      reason_code: 'academy_buy',
    });
    expect(trade.sell).toMatchObject({
      decision_id: null,
      decision_config_revision: null,
      reason_code: 'academy_sell',
      reason_label: 'Bán theo điều kiện Bán',
      reason: null,
    });
    const noBuyExecution = tradeView(
      tradeRow({
        buy_execution_id: null,
        buy_qty: null,
        buy_session: null,
        buy_executed_at: null,
        buy_exec_reason: null,
        buy_reason_code: null,
      }),
    );
    expect(noBuyExecution.buy).toMatchObject({
      execution_id: null,
      session: '2026-09-28',
      executed_at: '2026-09-28T07:30:00.000Z',
      qty: 100,
      reason_code: null,
      reason_label: null,
    });
  });

  it('T07 holding sessions are trading days from the buy session up to the sell session', () => {
    const calendar = tradingDayPredicate({ holidays: JSON.stringify(['2026-09-30']) })!;
    // Fri 2026-09-25 -> Tue 2026-09-29: Fri + Mon = 2 sessions (the sell session is not counted),
    // although the stored nav-row count says 1 because the Bot did not run on one of the days.
    const view = tradeView(
      tradeRow({
        opened_session: '2026-09-25',
        sell_session: '2026-09-29',
        holding_sessions: 1,
        holding_days: 4,
      }),
      calendar,
    );
    expect(view.holding_sessions).toBe(2);
    expect(view.holding_days).toBe(4);
    // Across a holiday and a weekend: Mon 28, Tue 29, (Wed 30 holiday), Thu 1, Fri 2 -> sold Mon 5.
    expect(
      tradeView(
        tradeRow({ opened_session: '2026-09-28', sell_session: '2026-10-05', holding_sessions: 9 }),
        calendar,
      ).holding_sessions,
    ).toBe(4);
    // Bought and sold in the same session: nothing held across a session.
    expect(
      tradeView(tradeRow({ opened_session: '2026-09-29', sell_session: '2026-09-29' }), calendar)
        .holding_sessions,
    ).toBe(0);
  });

  it('T08 without a verified calendar the nav-row count is kept as the fallback', () => {
    expect(tradeView(tradeRow({ holding_sessions: 5 }), null).holding_sessions).toBe(5);
    expect(tradeView(tradeRow({ holding_sessions: 5 })).holding_sessions).toBe(5);
    expect(tradeView(tradeRow({ holding_sessions: null })).holding_sessions).toBe(0);
  });

  it('T06 exposes stop/target/amplitude only as legacy_* fields, null/empty for the new policy', () => {
    const modern = tradeView(tradeRow());
    expect(modern).toMatchObject({
      legacy_stop_loss_vnd: null,
      legacy_take_profit_vnd: null,
      legacy_amplitude_at_entry_vnd: null,
      legacy_amplitude_source_ref: null,
      legacy_filter_ids: [],
    });
    const legacy = tradeView(
      tradeRow({
        entry_config_revision: null,
        entry_source_snapshot: null,
        stop_loss_vnd: '18000.0000',
        take_profit_vnd: '24000.0000',
        amplitude_at_entry_vnd: '1000.0000',
        amplitude_source_ref: 'l1:atr14',
        filter_ids: ['khoi_ngoai_gom', 7, 'vuot_dinh_20'],
        buy_decision_revision: null,
        sell_reason_code: 'stop_loss',
        sell_exec_reason: 'stop_loss',
      }),
    );
    expect(legacy).toMatchObject({
      legacy_stop_loss_vnd: '18000.0000',
      legacy_take_profit_vnd: '24000.0000',
      legacy_amplitude_at_entry_vnd: '1000.0000',
      legacy_amplitude_source_ref: 'l1:atr14',
      legacy_filter_ids: ['khoi_ngoai_gom', 'vuot_dinh_20'],
    });
    expect(legacy.buy.entry_source_snapshot).toBeNull();
    expect(legacy.buy.decision_config_revision).toBeNull();
    expect(legacy.sell.reason_label).toBe('Bán theo stop cũ (chính sách đã ngừng)');
    for (const retired of ['stop_loss_vnd', 'take_profit_vnd', 'amplitude_at_entry_vnd']) {
      expect(legacy).not.toHaveProperty(retired);
    }
  });

  it('T07 an unknown reason code has no label and a zero cost has no percentage', () => {
    const odd = tradeView(
      tradeRow({
        sell_reason_code: 'something_new',
        entry_value_vnd: '0',
        entry_fee_vnd: '0',
        sell_net_vnd: '100',
      }),
    );
    expect(odd.sell.reason_label).toBeNull();
    expect(odd.realized_pnl_pct).toBeNull();
    expect(odd.realized_pnl_vnd).toBe('100');
  });

  it('T08 the documented response schema accepts the view', () => {
    const page = { items: [tradeView(tradeRow())], next_cursor: ID(10) };
    expect(botTradesPageSchema.safeParse(page).success).toBe(true);
  });
});

function sessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    run_id: ID(20),
    session: '2026-09-28',
    status: 'succeeded',
    started_at: new Date('2026-09-28T11:00:00Z'),
    completed_at: new Date('2026-09-28T12:00:00Z'),
    policy_version: 'iqx-bot-v1.0',
    universe_kind: 'vn30',
    universe_revision: 0,
    universe_name: null,
    pinned_revision: 3,
    issues: [],
    nav_vnd: '100500000',
    cash_vnd: '40000000',
    valuation_complete: true,
    ...overrides,
  };
}

const group = (
  action: SessionReasonRow['action'],
  reason_code: string,
  n: number,
  revision: number | null = 3,
): SessionReasonRow => ({ bot_run_id: ID(20), action, reason_code, n, revision });

describe('sessionView', () => {
  it('S01 counts decisions by action and groups them by reason code, largest first', () => {
    const view = sessionView(sessionRow(), [
      group('skip', 'academy_condition_missing', 1),
      group('buy', 'academy_buy', 1),
      group('skip', 'academy_buy_not_met', 28),
      group('hold', 'academy_sell_not_met', 2),
      group('sell', 'academy_sell', '1' as unknown as number),
    ]);
    expect(view.counts).toEqual({ buy: 1, sell: 1, hold: 2, skip: 29, total: 33 });
    expect(view.reasons.map((reason) => [reason.action, reason.reason_code, reason.count])).toEqual(
      [
        ['skip', 'academy_buy_not_met', 28],
        ['hold', 'academy_sell_not_met', 2],
        ['buy', 'academy_buy', 1],
        ['sell', 'academy_sell', 1],
        ['skip', 'academy_condition_missing', 1],
      ],
    );
    expect(view.reasons[0]).toMatchObject({ reason_label: 'Điều kiện Mua chưa đạt' });
    expect(botSessionsPageSchema.safeParse({ items: [view], next_cursor: null }).success).toBe(
      true,
    );
  });

  it('S02 reports run status, universe, pinned config revision and NAV', () => {
    const view = sessionView(sessionRow(), []);
    expect(view).toMatchObject({
      session: '2026-09-28',
      run_id: ID(20),
      run_status: 'succeeded',
      started_at: '2026-09-28T11:00:00.000Z',
      completed_at: '2026-09-28T12:00:00.000Z',
      policy_version: 'iqx-bot-v1.0',
      universe: { kind: 'vn30', revision: 0, name: 'VN30' },
      config_revision: 3,
      counts: { total: 0 },
      reasons: [],
      nav_end_vnd: '100500000',
      cash_end_vnd: '40000000',
      valuation_complete: true,
    });
    const custom = sessionView(
      sessionRow({ universe_kind: 'custom', universe_revision: '2', universe_name: 'Danh mục A' }),
      [],
    );
    expect(custom.universe).toEqual({ kind: 'custom', revision: 2, name: 'Danh mục A' });
    expect(
      sessionView(sessionRow({ universe_kind: 'custom', universe_name: null }), []).universe?.name,
    ).toBeNull();
    expect(sessionView(sessionRow({ universe_kind: null }), []).universe).toBeNull();
  });

  it('S03 falls back to the decisions revision when the receipt has no pin', () => {
    const view = sessionView(sessionRow({ pinned_revision: null }), [
      group('skip', 'academy_buy_not_met', 3, 4),
      group('hold', 'academy_sell_not_met', 1, null),
    ]);
    expect(view.config_revision).toBe(4);
    expect(sessionView(sessionRow({ pinned_revision: null }), []).config_revision).toBeNull();
  });

  it('S04 never reports a NAV for an incomplete or missing valuation', () => {
    expect(sessionView(sessionRow({ valuation_complete: false }), [])).toMatchObject({
      nav_end_vnd: null,
      valuation_complete: false,
      cash_end_vnd: '40000000',
    });
    expect(
      sessionView(sessionRow({ nav_vnd: null, cash_vnd: null, valuation_complete: null }), []),
    ).toMatchObject({ nav_end_vnd: null, cash_end_vnd: null, valuation_complete: null });
  });

  it('S05 keeps well-formed run issues only', () => {
    const view = sessionView(
      sessionRow({
        status: 'failed',
        issues: [
          { code: 'source_error', symbol: 'VCB', detail: 'timeout' },
          { code: 'valuation_incomplete' },
          { symbol: 'x' },
          'oops',
        ],
      }),
      [],
    );
    expect(view.issues).toEqual([
      { code: 'source_error', symbol: 'VCB', detail: 'timeout' },
      { code: 'valuation_incomplete', symbol: null, detail: null },
    ]);
  });
});

function decisionRow(overrides: Partial<DecisionRow> = {}): DecisionRow {
  return {
    id: ID(30),
    run_id: ID(20),
    trading_date: '2026-09-28',
    symbol: 'VCB',
    action: 'buy',
    reason_code: 'academy_buy',
    reason: 'Bot mua 100 VCB',
    rank_tuple: ['1', '2'],
    data_refs: { in_universe: true, entry_source: { kind: 'vn30' } },
    filter_ids: [],
    threshold_vnd: null,
    decision_config_revision: 3,
    condition_snapshot: { buy_active_ids: ['rsi'], sell_active_ids: [], rules: [] },
    created_at: new Date('2026-09-28T11:30:00Z'),
    policy_version: 'iqx-bot-v1.0',
    universe_revision: 0,
    universe_kind: 'vn30',
    execution_id_joined: ID(31),
    execution_side: 'buy',
    execution_qty: 100,
    execution_price_vnd: '20000',
    execution_gross_value_vnd: '2000000',
    execution_fee_vnd: '3000',
    execution_tax_vnd: '0',
    execution_net_cash_delta_vnd: '-2003000',
    ...overrides,
  };
}

describe('decisionView', () => {
  it('D01 mirrors the journal item with execution, snapshot and labels', () => {
    const view = decisionView(decisionRow());
    expect(view).toMatchObject({
      id: ID(30),
      trading_date: '2026-09-28',
      reason_label: 'Mua theo điều kiện Mua',
      in_universe: true,
      universe_kind: 'vn30',
      universe_revision: 0,
      decision_config_revision: 3,
      condition_snapshot: { buy_active_ids: ['rsi'] },
      rank_tuple: ['1', '2'],
      legacy_filter_ids: [],
      legacy_threshold_vnd: null,
      created_at: '2026-09-28T11:30:00.000Z',
      execution: {
        id: ID(31),
        side: 'buy',
        qty: 100,
        price_vnd: '20000',
        fee_vnd: '3000',
        tax_vnd: '0',
        net_cash_delta_vnd: '-2003000',
      },
    });
    expect(
      botSessionDecisionsPageSchema.safeParse({
        session: sessionView(sessionRow(), []),
        items: [view],
        next_cursor: null,
      }).success,
    ).toBe(true);
  });

  it('D02 a skip has no execution, and legacy fields only appear when present', () => {
    const skip = decisionView(
      decisionRow({
        action: 'skip',
        reason_code: 'universe_unavailable',
        symbol: null,
        execution_id_joined: null,
        execution_side: null,
        data_refs: {},
        rank_tuple: null,
        condition_snapshot: null,
        decision_config_revision: null,
        universe_kind: null,
        universe_revision: null,
        policy_version: null,
      }),
    );
    expect(skip).toMatchObject({
      execution: null,
      symbol: null,
      in_universe: null,
      rank_tuple: null,
      condition_snapshot: null,
      decision_config_revision: null,
      universe_kind: null,
      universe_revision: null,
      policy_version: null,
      reason_label: 'Chưa xác minh được nguồn mua: không mua mới',
    });
    const legacy = decisionView(
      decisionRow({ filter_ids: ['khoi_ngoai_gom'], threshold_vnd: '18000.0000' }),
    );
    expect(legacy).toMatchObject({
      legacy_filter_ids: ['khoi_ngoai_gom'],
      legacy_threshold_vnd: '18000.0000',
    });
    expect(legacy).not.toHaveProperty('filter_ids');
  });
});

describe('query schemas', () => {
  it('Q01 default the page size and bound it to 1..100', () => {
    for (const schema of [tradesQuerySchema, sessionsQuerySchema, sessionDecisionsQuerySchema]) {
      expect(schema.parse({})).toMatchObject({ limit: 30 });
      expect(schema.parse({ limit: '100' }).limit).toBe(100);
      expect(schema.safeParse({ limit: '0' }).success).toBe(false);
      expect(schema.safeParse({ limit: '101' }).success).toBe(false);
      expect(schema.safeParse({ limit: '1.5' }).success).toBe(false);
      expect(schema.safeParse({ limit: 'abc' }).success).toBe(false);
    }
  });

  it('Q02 validate the cursors and the session date', () => {
    expect(tradesQuerySchema.safeParse({ cursor: ID(1) }).success).toBe(true);
    expect(tradesQuerySchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
    expect(sessionDecisionsQuerySchema.safeParse({ cursor: "1' or 1=1" }).success).toBe(false);
    expect(sessionsQuerySchema.safeParse({ cursor: '2026-09-28' }).success).toBe(true);
    expect(sessionsQuerySchema.safeParse({ cursor: '2026-13-45' }).success).toBe(false);
    expect(sessionsQuerySchema.safeParse({ cursor: ID(1) }).success).toBe(false);
    expect(sessionParamSchema.safeParse({ session: '2026-09-28' }).success).toBe(true);
    expect(sessionParamSchema.safeParse({ session: '28/09/2026' }).success).toBe(false);
    expect(sessionParamSchema.safeParse({ session: '2026-02-30' }).success).toBe(false);
  });
});

/** Records every query and answers it from a handler keyed by a SQL fragment. */
function fakeDatabase(handlers: Array<[RegExp, (values: readonly unknown[]) => unknown[]]>): {
  database: DatabaseService;
  calls: Array<{ text: string; values: readonly unknown[] }>;
} {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    calls.push({ text, values });
    const handler = handlers.find(([pattern]) => pattern.test(text));
    if (!handler) throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    return handler[1](values);
  });
  return { database: { query } as unknown as DatabaseService, calls };
}

describe('BotHistoryService paging and owner scope', () => {
  const account = [
    /from bot_accounts where user_id/,
    (values: readonly unknown[]) => (values[0] === USER ? [{ id: ACCOUNT }] : []),
  ] as [RegExp, (values: readonly unknown[]) => unknown[]];

  it('P01 trades: asks for limit + 1 rows, trims the page and returns the last id as the cursor', async () => {
    const rows = [10, 9, 8, 7].map((n) => tradeRow({ id: ID(n) }));
    const { database, calls } = fakeDatabase([
      account,
      [/from bot_positions p/, () => rows],
      [/from virtual_trading_configs/, () => [{ holidays: [] }]],
    ]);
    const page = await new BotHistoryService(database).trades(USER, { limit: 3 });
    expect(page.items.map((item) => item.id)).toEqual([ID(10), ID(9), ID(8)]);
    expect(page.next_cursor).toBe(ID(8));
    const select = calls.find((call) => /from bot_positions p/.test(call.text))!;
    expect(select.values).toEqual([ACCOUNT, 4]); // account from the session, limit + 1
    expect(select.text).toContain("p.status = 'closed'");
    expect(select.text).toContain('order by sx.executed_at desc, p.id desc');

    const last = await new BotHistoryService(
      fakeDatabase([
        account,
        [/from bot_positions p/, () => rows.slice(0, 3)],
        [/from virtual_trading_configs/, () => []],
      ]).database,
    ).trades(USER, { limit: 3 });
    expect(last.items).toHaveLength(3);
    expect(last.next_cursor).toBeNull();
  });

  it('P02 trades: a cursor must be a closed lot of the caller, and keyset-filters the query', async () => {
    const { database, calls } = fakeDatabase([
      account,
      [/select id from bot_positions/, (values) => (values[1] === ACCOUNT ? [{ id: ID(8) }] : [])],
      [/from bot_positions p/, () => []],
    ]);
    const service = new BotHistoryService(database);
    await service.trades(USER, { limit: 5, cursor: ID(8) });
    const select = calls.find((call) => /from bot_positions p/.test(call.text))!;
    expect(select.values).toEqual([ACCOUNT, 6, ID(8)]);
    expect(select.text).toContain('(sx.executed_at, p.id) <');
    expect(select.text).toContain('c.bot_account_id = $1'); // the cursor row is owner-scoped too

    const missing = fakeDatabase([account, [/select id from bot_positions/, () => []]]);
    await expect(
      new BotHistoryService(missing.database).trades(USER, { limit: 5, cursor: ID(99) }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CURSOR' },
      status: 400,
    });
    expect(missing.calls.some((call) => /from bot_positions p/.test(call.text))).toBe(false);
  });

  it('P03 every history read is empty, with no further query, for a user without a Bot account', async () => {
    const { database, calls } = fakeDatabase([account]);
    const service = new BotHistoryService(database);
    const stranger = ID(77);
    await expect(service.trades(stranger, { limit: 10 })).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
    await expect(service.sessions(stranger, { limit: 10 })).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
    await expect(service.session(stranger, '2026-09-28', { limit: 10 })).rejects.toMatchObject({
      status: 404,
      response: { code: 'SESSION_NOT_FOUND' },
    });
    expect(calls).toHaveLength(3); // only the account lookups
    expect(calls.every((call) => call.values[0] === stranger)).toBe(true);
  });

  it('P04 sessions: scopes by user and account, pages by date and aggregates decisions once', async () => {
    const rows = ['2026-09-30', '2026-09-29', '2026-09-28'].map((session, index) =>
      sessionRow({ session, run_id: ID(40 + index) }),
    );
    const { database, calls } = fakeDatabase([
      account,
      [/from bot_run_receipts r/, () => rows],
      [
        /group by d.bot_run_id/,
        () => [
          { ...group('buy', 'academy_buy', 2, 3), bot_run_id: ID(40) },
          { ...group('skip', 'academy_buy_not_met', 5), bot_run_id: ID(41) },
        ],
      ],
    ]);
    const page = await new BotHistoryService(database).sessions(USER, {
      limit: 2,
      cursor: '2026-10-01',
    });
    expect(page.items.map((item) => item.session)).toEqual(['2026-09-30', '2026-09-29']);
    expect(page.next_cursor).toBe('2026-09-29');
    expect(page.items[0]!.counts).toMatchObject({ buy: 2, total: 2 });
    expect(page.items[1]!.counts).toMatchObject({ skip: 5, total: 5 });
    const select = calls.find((call) => /from bot_run_receipts r/.test(call.text))!;
    expect(select.values).toEqual([USER, ACCOUNT, 3, '2026-10-01']);
    expect(select.text).toContain('r.trading_date < $4::date');
    const aggregate = calls.filter((call) => /group by d.bot_run_id/.test(call.text));
    expect(aggregate).toHaveLength(1); // one aggregate query for the whole page
    expect(aggregate[0]!.values).toEqual([[ID(40), ID(41)]]);
  });

  it('P05 session decisions: 404 when the caller has no run that day, cursor limited to that run', async () => {
    const missing = fakeDatabase([account, [/from bot_run_receipts r/, () => []]]);
    await expect(
      new BotHistoryService(missing.database).session(USER, '2026-09-28', { limit: 10 }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'SESSION_NOT_FOUND' } });
    expect(missing.calls.find((call) => /from bot_run_receipts r/.test(call.text))!.values).toEqual(
      [USER, ACCOUNT, 1, '2026-09-28'],
    );

    const decisions = [30, 31, 32].map((n) => decisionRow({ id: ID(n) }));
    const { database, calls } = fakeDatabase([
      account,
      [/from bot_run_receipts r/, () => [sessionRow()]],
      [/select id from bot_decisions/, (values) => (values[1] === ID(20) ? [{ id: ID(30) }] : [])],
      [/from bot_decisions d\s+join bot_run_receipts/, () => decisions],
      [/group by d.bot_run_id/, () => []],
    ]);
    const service = new BotHistoryService(database);
    const page = await service.session(USER, '2026-09-28', { limit: 2, cursor: ID(30) });
    expect(page.items.map((item) => item.id)).toEqual([ID(30), ID(31)]);
    expect(page.next_cursor).toBe(ID(31));
    const select = calls.find((call) =>
      /from bot_decisions d\s+join bot_run_receipts/.test(call.text),
    )!;
    expect(select.values).toEqual([ID(20), 3, ID(30)]);
    expect(select.text).toContain('order by (d.execution_id is null)');

    const wrong = fakeDatabase([
      account,
      [/from bot_run_receipts r/, () => [sessionRow()]],
      [/select id from bot_decisions/, () => []],
    ]);
    await expect(
      new BotHistoryService(wrong.database).session(USER, '2026-09-28', {
        limit: 2,
        cursor: ID(99),
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'INVALID_CURSOR' } });
  });
});
