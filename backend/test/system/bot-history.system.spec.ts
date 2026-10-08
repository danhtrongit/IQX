import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BotService } from '../../src/modules/bots/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type User = Awaited<ReturnType<typeof registerAndLogin>>;

/** Fee schedule used by the fixtures: buy 15 bps, sell fee 15 bps, sell tax 10 bps. */
const bps = (amount: number, rate: number) => Math.round((amount * rate) / 10_000);

const DATES = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05'];
/** The last session has a run but no NAV row (valuation not written yet). */
const NAV_DATES = DATES.slice(0, 5);

type Trip = {
  symbol: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  buyDate: string;
  sellDate: string;
  sellAt: Date;
  buyRevision?: number | null;
  sellRevision?: number | null;
  source?: Json | null;
  legacy?: boolean;
  sellReason?: string;
};

describe('system acceptance: Bot history (trades and per-session journal) on a real ledger', () => {
  let stack: SystemStack;

  beforeAll(async () => {
    stack = await startSystemStack();
  });

  afterAll(async () => {
    await stack?.close();
  });

  async function newUser(suffix: string): Promise<User & { accountId: string }> {
    const user = await registerAndLogin(stack.app, suffix);
    await stack.app.get(BotService).initializeAccount(user.id);
    const [account] = await stack.query<{ id: string }>(
      'select id from bot_accounts where user_id = $1',
      [user.id],
    );
    return { ...user, accountId: account!.id };
  }

  async function insertRows(table: string, rows: Array<Record<string, unknown>>) {
    if (rows.length === 0) return;
    const columns = Object.keys(rows[0]!);
    const values: unknown[] = [];
    const tuples = rows.map(
      (row) =>
        `(${columns
          .map((column) => {
            values.push(row[column]);
            return `$${values.length}`;
          })
          .join(',')})`,
    );
    await stack.query(
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`,
      values,
    );
  }

  async function seedRuns(
    user: User & { accountId: string },
    overrides: Record<string, Json> = {},
  ): Promise<Map<string, string>> {
    const runs = new Map<string, string>();
    const rows = DATES.map((date) => {
      const id = randomUUID();
      runs.set(date, id);
      const extra = overrides[date] ?? {};
      return {
        id,
        user_id: user.id,
        bot_account_id: user.accountId,
        trading_date: date,
        status: 'succeeded',
        started_at: new Date(`${date}T11:00:00Z`),
        completed_at: new Date(`${date}T12:00:00Z`),
        strategy_id: 'iqx_standard',
        strategy_version: 1,
        execution_model: 'same_session_close',
        policy_version: 'iqx-bot-v1.0',
        universe_kind: 'vn30',
        universe_revision: 0,
        // Every row carries the same columns: insertRows takes them from the first row.
        rule_snapshot: null,
        rule_hash: null,
        issues: '[]',
        ...extra,
      };
    });
    await insertRows('bot_run_receipts', rows);
    await insertRows(
      'bot_nav_daily',
      NAV_DATES.map((date, index) => ({
        bot_account_id: user.accountId,
        trading_date: date,
        cash_vnd: 50_000_000 + index,
        market_value_vnd: 50_000_000,
        nav_vnd: 100_000_000 + index,
        valuation_complete: date !== '2026-09-29',
        created_at: new Date(`${date}T12:00:00Z`),
      })),
    );
    return runs;
  }

  /** Mirrors the rows BotService.buy()/sell() write for one closed round trip. */
  function tripRows(
    user: User & { accountId: string },
    runs: Map<string, string>,
    trip: Trip,
  ): { position: Json; executions: Json[]; decisions: Json[] } {
    const positionId = randomUUID();
    const buyExecution = randomUUID();
    const sellExecution = randomUUID();
    const buyGross = trip.qty * trip.buyPrice;
    const buyFee = bps(buyGross, 15);
    const sellGross = trip.qty * trip.sellPrice;
    const sellFee = bps(sellGross, 15);
    const sellTax = bps(sellGross, 10);
    const buyAt = new Date(`${trip.buyDate}T07:30:00Z`);
    const key = randomUUID();
    const common = { bot_account_id: user.accountId, position_id: positionId, symbol: trip.symbol };
    return {
      position: {
        id: positionId,
        bot_account_id: user.accountId,
        symbol: trip.symbol,
        qty_open: 0,
        entry_price_vnd: trip.buyPrice,
        entry_value_vnd: buyGross,
        entry_fee_vnd: buyFee,
        amplitude_at_entry_vnd: trip.legacy ? '1500.5' : null,
        amplitude_source_ref: trip.legacy ? 'legacy:l1' : null,
        stop_loss_vnd: trip.legacy ? '108000' : null,
        take_profit_vnd: trip.legacy ? '132000' : null,
        entry_config_revision: trip.legacy ? null : (trip.buyRevision ?? null),
        entry_source_snapshot:
          trip.source === undefined
            ? JSON.stringify({ kind: 'vn30', name: 'VN30', revision: 0 })
            : trip.source === null
              ? null
              : JSON.stringify(trip.source),
        opened_session: trip.buyDate,
        opened_at: buyAt,
        closed_session: trip.sellDate,
        closed_at: trip.sellAt,
        buy_execution_id: buyExecution,
        sell_execution_id: sellExecution,
        status: 'closed',
        filter_ids: JSON.stringify(trip.legacy ? ['khoi_ngoai_gom', 'vuot_dinh_20'] : []),
        source_refs: '{}',
      },
      executions: [
        {
          id: buyExecution,
          bot_run_id: runs.get(trip.buyDate),
          ...common,
          side: 'buy',
          qty: trip.qty,
          price_vnd: trip.buyPrice,
          signal_session: trip.buyDate,
          price_session: trip.buyDate,
          trading_date: trip.buyDate,
          executed_at: buyAt,
          gross_value_vnd: buyGross,
          fee_vnd: buyFee,
          tax_vnd: 0,
          net_cash_delta_vnd: -(buyGross + buyFee),
          execution_model: 'same_session_close',
          idempotency_key: `bot:academy:${key}:buy`,
          reason: 'academy_buy',
          source_snapshot_id: 'a'.repeat(64),
        },
        {
          id: sellExecution,
          bot_run_id: runs.get(trip.sellDate),
          ...common,
          side: 'sell',
          qty: trip.qty,
          price_vnd: trip.sellPrice,
          signal_session: trip.sellDate,
          price_session: trip.sellDate,
          trading_date: trip.sellDate,
          executed_at: trip.sellAt,
          gross_value_vnd: sellGross,
          fee_vnd: sellFee,
          tax_vnd: sellTax,
          net_cash_delta_vnd: sellGross - sellFee - sellTax,
          execution_model: 'same_session_close',
          idempotency_key: `bot:academy:${key}:sell`,
          reason: trip.sellReason ?? 'academy_sell',
          source_snapshot_id: 'a'.repeat(64),
        },
      ],
      decisions: [
        {
          id: randomUUID(),
          bot_run_id: runs.get(trip.buyDate),
          idempotency_key: `bot:academy:${key}:buy:decision`,
          symbol: trip.symbol,
          action: 'buy',
          reason_code: 'academy_buy',
          reason: `Bot mua ${trip.qty} ${trip.symbol}`,
          execution_id: buyExecution,
          decision_config_revision: trip.legacy ? null : (trip.buyRevision ?? null),
          created_at: buyAt,
        },
        {
          id: randomUUID(),
          bot_run_id: runs.get(trip.sellDate),
          idempotency_key: `bot:academy:${key}:sell:decision`,
          symbol: trip.symbol,
          action: 'sell',
          reason_code: trip.sellReason ?? 'academy_sell',
          reason: `Bot bán toàn bộ ${trip.qty} ${trip.symbol}`,
          execution_id: sellExecution,
          decision_config_revision: trip.legacy ? null : (trip.sellRevision ?? null),
          created_at: trip.sellAt,
        },
      ],
    };
  }

  async function seedTrips(
    user: User & { accountId: string },
    runs: Map<string, string>,
    trips: Trip[],
  ) {
    const built = trips.map((trip) => tripRows(user, runs, trip));
    await insertRows(
      'bot_positions',
      built.map((item) => item.position),
    );
    await insertRows(
      'bot_executions',
      built.flatMap((item) => item.executions),
    );
    await insertRows(
      'bot_decisions',
      built.flatMap((item) => item.decisions),
    );
  }

  const get = (user: User, url: string) =>
    stack.app.inject({ method: 'GET', url, headers: authHeader(user.accessToken) });

  describe('GET /api/v2/bot/trades', () => {
    let owner: User & { accountId: string };
    let outsider: User & { accountId: string };
    let runs: Map<string, string>;
    const BULK = 45;

    beforeAll(async () => {
      owner = await newUser('hist-owner');
      outsider = await newUser('hist-outsider');
      runs = await seedRuns(owner);
      const outsiderRuns = await seedRuns(outsider);

      const named: Trip[] = [
        {
          // winner: 9,013,500 out, 9,476,250 in
          symbol: 'VCB',
          qty: 100,
          buyPrice: 90_000,
          sellPrice: 95_000,
          buyDate: '2026-09-28',
          sellDate: '2026-09-30',
          sellAt: new Date('2026-09-30T07:30:00Z'),
          buyRevision: 2,
          sellRevision: 3,
          source: { kind: 'custom', name: 'Danh mục A', revision: 1, symbols_hash: 'b'.repeat(64) },
        },
        {
          // loser held one session
          symbol: 'HPG',
          qty: 200,
          buyPrice: 30_000,
          sellPrice: 29_000,
          buyDate: '2026-09-29',
          sellDate: '2026-09-30',
          sellAt: new Date('2026-09-30T07:30:01Z'),
          buyRevision: 3,
          sellRevision: 3,
        },
        {
          // legacy lot: stop/target audit values, no source snapshot, legacy sell reason
          symbol: 'FPT',
          qty: 100,
          buyPrice: 120_000,
          sellPrice: 100_000,
          buyDate: '2026-09-28',
          sellDate: '2026-09-29',
          sellAt: new Date('2026-09-29T07:30:00Z'),
          legacy: true,
          source: null,
          sellReason: 'stop_loss',
        },
      ];
      // Bulk history: two sells share each timestamp so the id tie-break is exercised.
      const bulk: Trip[] = Array.from({ length: BULK }, (_, index) => ({
        symbol: `B${String(index).padStart(2, '0')}`,
        qty: 100,
        buyPrice: 10_000 + index * 10,
        sellPrice: 10_500 + index * 10,
        buyDate: '2026-09-28',
        sellDate: DATES[1 + (index % 4)]!,
        sellAt: new Date(
          `${DATES[1 + (index % 4)]}T08:${String(Math.floor(index / 2)).padStart(2, '0')}:00Z`,
        ),
        buyRevision: 1,
        sellRevision: 1,
      }));
      await seedTrips(owner, runs, [...named, ...bulk]);
      // An open lot never appears in the round-trip history.
      const open = tripRows(owner, runs, { ...named[0]!, symbol: 'OPEN' });
      await insertRows('bot_positions', [
        {
          ...open.position,
          status: 'open',
          qty_open: 100,
          closed_session: null,
          closed_at: null,
          sell_execution_id: null,
        },
      ]);
      await seedTrips(outsider, outsiderRuns, [
        {
          symbol: 'MSN',
          qty: 100,
          buyPrice: 50_000,
          sellPrice: 51_000,
          buyDate: '2026-09-28',
          sellDate: '2026-09-29',
          sellAt: new Date('2026-09-29T07:30:00Z'),
        },
      ]);
    }, 120_000);

    it('H01 pairs buy and sell with fees, tax counted once, revisions, source and reasons', async () => {
      const response = await get(owner, '/api/v2/bot/trades?limit=100');
      expect(response.statusCode).toBe(200);
      const page = response.json() as { items: Json[]; next_cursor: string | null };
      expect(page.next_cursor).toBeNull();
      const winner = page.items.find((item) => item.symbol === 'VCB')!;
      expect(winner.buy).toMatchObject({
        session: '2026-09-28',
        price_vnd: '90000',
        qty: 100,
        gross_value_vnd: '9000000',
        fee_vnd: '13500',
        total_vnd: '9013500',
        decision_config_revision: 2,
        entry_source_snapshot: { kind: 'custom', name: 'Danh mục A', revision: 1 },
        reason_code: 'academy_buy',
        reason_label: 'Mua theo điều kiện Mua',
      });
      expect(winner.buy.executed_at).toBe('2026-09-28T07:30:00.000Z');
      expect(winner.sell).toMatchObject({
        session: '2026-09-30',
        price_vnd: '95000',
        qty: 100,
        gross_value_vnd: '9500000',
        fee_vnd: '14250',
        tax_vnd: '9500',
        net_vnd: '9476250',
        decision_config_revision: 3,
        reason_code: 'academy_sell',
        reason_label: 'Bán theo điều kiện Bán',
      });
      // realized = sell net (fee and tax already inside) - buy value - buy fee.
      expect(winner.realized_pnl_vnd).toBe('462750');
      expect(winner.realized_pnl_pct).toMatch(/^5\.1339657180/);
      expect(winner.holding_sessions).toBe(2); // closes of 09-28 and 09-29
      expect(winner.holding_days).toBe(2);
      expect(winner.legacy_stop_loss_vnd).toBeNull();
      expect(winner.legacy_take_profit_vnd).toBeNull();
      expect(winner.legacy_filter_ids).toEqual([]);

      const loser = page.items.find((item) => item.symbol === 'HPG')!;
      expect(loser.realized_pnl_vnd).toBe('-223500');
      expect(loser.realized_pnl_pct).toMatch(/^-3\.7194208686/);
      expect(loser.holding_sessions).toBe(1);
      expect(loser.sell.tax_vnd).toBe('5800');
      expect(loser.sell.net_vnd).toBe('5785500');

      // The identity every row must satisfy, for the whole history.
      for (const item of page.items) {
        expect(BigInt(item.sell.net_vnd) - BigInt(item.buy.total_vnd), item.symbol).toBe(
          BigInt(item.realized_pnl_vnd),
        );
        expect(
          BigInt(item.sell.gross_value_vnd) - BigInt(item.sell.fee_vnd) - BigInt(item.sell.tax_vnd),
          item.symbol,
        ).toBe(BigInt(item.sell.net_vnd));
        expect(BigInt(item.buy.gross_value_vnd) + BigInt(item.buy.fee_vnd), item.symbol).toBe(
          BigInt(item.buy.total_vnd),
        );
      }
      expect(page.items.some((item) => item.symbol === 'OPEN')).toBe(false);
    });

    it('H02 exposes stop/target/amplitude only as legacy_* on retired-policy lots', async () => {
      const page = (await get(owner, '/api/v2/bot/trades?limit=100')).json() as { items: Json[] };
      const legacy = page.items.find((item) => item.symbol === 'FPT')!;
      expect(legacy).toMatchObject({
        legacy_stop_loss_vnd: '108000.0000',
        legacy_take_profit_vnd: '132000.0000',
        legacy_amplitude_at_entry_vnd: '1500.5000',
        legacy_amplitude_source_ref: 'legacy:l1',
        legacy_filter_ids: ['khoi_ngoai_gom', 'vuot_dinh_20'],
      });
      expect(legacy.buy.entry_source_snapshot).toBeNull();
      expect(legacy.buy.decision_config_revision).toBeNull();
      expect(legacy.sell).toMatchObject({
        reason_code: 'stop_loss',
        reason_label: 'Bán theo stop cũ (chính sách đã ngừng)',
        decision_config_revision: null,
      });
      expect(legacy.realized_pnl_vnd).toBe(
        String(
          100 * 100_000 -
            bps(10_000_000, 15) -
            bps(10_000_000, 10) -
            12_000_000 -
            bps(12_000_000, 15),
        ),
      );
      for (const retired of ['stop_loss_vnd', 'take_profit_vnd', 'amplitude_at_entry_vnd']) {
        expect(legacy).not.toHaveProperty(retired);
      }
    });

    it('H03 pages through the full history newest first, with ties broken by id', async () => {
      const total = BULK + 3;
      const seen: Json[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = `/api/v2/bot/trades?limit=7${cursor ? `&cursor=${cursor}` : ''}`;
        const response = await get(owner, url);
        expect(response.statusCode).toBe(200);
        const page = response.json() as { items: Json[]; next_cursor: string | null };
        expect(page.items.length).toBeLessThanOrEqual(7);
        seen.push(...page.items);
        cursor = page.next_cursor;
        pages += 1;
        expect(pages).toBeLessThan(20);
      } while (cursor);
      expect(pages).toBe(Math.ceil(total / 7));
      expect(seen).toHaveLength(total);
      expect(new Set(seen.map((item) => item.id)).size).toBe(total);
      const all = ((await get(owner, '/api/v2/bot/trades?limit=100')).json() as { items: Json[] })
        .items;
      expect(seen.map((item) => item.id)).toEqual(all.map((item) => item.id));
      for (let index = 1; index < seen.length; index += 1) {
        const previous = seen[index - 1]!;
        const current = seen[index]!;
        const left = Date.parse(previous.sell.executed_at);
        const right = Date.parse(current.sell.executed_at);
        expect(left >= right).toBe(true);
        if (left === right) expect(previous.id > current.id).toBe(true);
      }
    });

    it('H04 is owner-scoped: no foreign trades, no foreign cursor, empty without an account', async () => {
      const mine = (await get(owner, '/api/v2/bot/trades?limit=100')).json() as { items: Json[] };
      const theirs = (await get(outsider, '/api/v2/bot/trades?limit=100')).json() as {
        items: Json[];
        next_cursor: string | null;
      };
      expect(theirs.items.map((item) => item.symbol)).toEqual(['MSN']);
      expect(theirs.next_cursor).toBeNull();
      expect(mine.items.some((item) => item.symbol === 'MSN')).toBe(false);

      const foreign = await get(outsider, `/api/v2/bot/trades?cursor=${mine.items[3]!.id}`);
      expect(foreign.statusCode).toBe(400);
      expect(foreign.json().error.code).toBe('INVALID_CURSOR');
      const unknown = await get(owner, `/api/v2/bot/trades?cursor=${randomUUID()}`);
      expect(unknown.statusCode).toBe(400);

      const stranger = await registerAndLogin(stack.app, 'hist-no-bot');
      const none = await get(stranger, '/api/v2/bot/trades');
      expect(none.statusCode).toBe(200);
      expect(none.json()).toEqual({ items: [], next_cursor: null });
    });

    it('H05 validates the query and requires authentication', async () => {
      for (const query of ['limit=0', 'limit=101', 'limit=abc', 'cursor=not-a-uuid']) {
        const response = await get(owner, `/api/v2/bot/trades?${query}`);
        expect(response.statusCode, query).toBe(422);
        expect(response.json().error.code, query).toBe('VALIDATION_ERROR');
      }
      const anonymous = await stack.app.inject({ method: 'GET', url: '/api/v2/bot/trades' });
      expect(anonymous.statusCode).toBe(401);
    });

    it('H06 is read-only: nothing is written by reading the history', async () => {
      const count = async () =>
        (
          await stack.query<{ n: string }>(
            `select (select count(*) from bot_positions) + (select count(*) from bot_executions)
                  + (select count(*) from bot_decisions) + (select count(*) from bot_run_receipts)
                  + (select count(*) from bot_cash_ledger) as n`,
          )
        )[0]!.n;
      const before = await count();
      await get(owner, '/api/v2/bot/trades?limit=100');
      await get(owner, '/api/v2/bot/journal/sessions');
      await get(owner, `/api/v2/bot/journal/sessions/${DATES[2]}`);
      expect(await count()).toBe(before);
    });
  });

  describe('GET /api/v2/bot/journal/sessions', () => {
    let owner: User & { accountId: string };
    let outsider: User & { accountId: string };
    let runs: Map<string, string>;

    beforeAll(async () => {
      owner = await newUser('sess-owner');
      outsider = await newUser('sess-outsider');
      await insertRows('bot_universe_revisions', [
        {
          user_id: owner.id,
          bot_account_id: owner.accountId,
          revision: 1,
          kind: 'custom',
          saved_list_id: randomUUID(),
          list_as_of: '2026-09-27',
          name: 'Danh mục A',
          tickers: '{HPG,VCB}',
          requested_at: new Date('2026-09-29T03:00:00Z'),
          effective_session: '2026-09-30',
          status: 'effective',
          idempotency_key: 'history-universe-0001',
          request_hash: 'c'.repeat(64),
        },
      ]);
      const pin = (revision: number) =>
        JSON.stringify({
          shared_config: { revision, config_hash: 'd'.repeat(64), effective_session: '2026-09-28' },
        });
      runs = await seedRuns(owner, {
        '2026-09-28': { rule_snapshot: pin(2), rule_hash: 'e'.repeat(64) },
        '2026-09-29': { rule_snapshot: pin(2), rule_hash: 'e'.repeat(64) },
        '2026-09-30': {
          universe_kind: 'custom',
          universe_revision: 1,
          rule_snapshot: pin(3),
          rule_hash: 'e'.repeat(64),
        },
        '2026-10-01': { universe_kind: 'custom', universe_revision: 1 },
        '2026-10-02': {
          status: 'failed',
          issues: JSON.stringify([{ code: 'source_error', symbol: null, detail: 'timeout' }]),
        },
        '2026-10-05': { status: 'running', completed_at: null },
      });
      await seedRuns(outsider);

      const decisions: Json[] = [];
      let order = 0;
      const decide = (
        date: string,
        action: string,
        reasonCode: string,
        symbol: string | null,
        extra: Json = {},
      ) =>
        decisions.push({
          id: randomUUID(),
          bot_run_id: runs.get(date),
          idempotency_key: `history:${date}:${order++}`,
          symbol,
          action,
          reason_code: reasonCode,
          reason: `${action} ${symbol ?? ''}`.trim(),
          decision_config_revision: 2,
          created_at: new Date(`${date}T11:30:00Z`),
          ...extra,
        });
      // 2026-09-28: one buy (executed), two buy-not-met skips, one hold.
      const trip = tripRows(owner, runs, {
        symbol: 'VCB',
        qty: 100,
        buyPrice: 90_000,
        sellPrice: 95_000,
        buyDate: '2026-09-28',
        sellDate: '2026-09-30',
        sellAt: new Date('2026-09-30T07:30:00Z'),
        buyRevision: 2,
        sellRevision: 3,
      });
      await insertRows('bot_positions', [trip.position]);
      await insertRows('bot_executions', trip.executions);
      decisions.push(...trip.decisions);
      decide('2026-09-28', 'skip', 'academy_buy_not_met', 'HPG');
      decide('2026-09-28', 'skip', 'academy_buy_not_met', 'FPT');
      decide('2026-09-28', 'skip', 'academy_condition_missing', 'MWG');
      decide('2026-09-29', 'hold', 'academy_sell_not_met', 'VCB');
      decide('2026-09-29', 'skip', 'academy_buy_not_met', 'HPG');
      // 2026-09-30: the sell plus a session-level reason without a symbol.
      decide('2026-09-30', 'skip', 'universe_unavailable', null, { decision_config_revision: 3 });
      decide('2026-09-30', 'skip', 'already_holding', 'ACB', { decision_config_revision: 3 });
      // 2026-10-01 has no pinned config in the receipt: the decisions' revision is the fallback.
      decide('2026-10-01', 'skip', 'no_active_buy_conditions', null, {
        decision_config_revision: 4,
      });
      await insertRows('bot_decisions', decisions);
    }, 120_000);

    it('J01 returns one row per session with run, universe, config revision, counts and NAV', async () => {
      const response = await get(owner, '/api/v2/bot/journal/sessions?limit=100');
      expect(response.statusCode).toBe(200);
      const page = response.json() as { items: Json[]; next_cursor: string | null };
      expect(page.next_cursor).toBeNull();
      expect(page.items.map((item) => item.session)).toEqual([...DATES].reverse());

      const bySession = new Map(page.items.map((item) => [item.session, item]));
      const first = bySession.get('2026-09-28')!;
      expect(first).toMatchObject({
        run_id: runs.get('2026-09-28'),
        run_status: 'succeeded',
        policy_version: 'iqx-bot-v1.0',
        universe: { kind: 'vn30', revision: 0, name: 'VN30' },
        config_revision: 2,
        counts: { buy: 1, sell: 0, hold: 0, skip: 3, total: 4 },
        nav_end_vnd: '100000000',
        cash_end_vnd: '50000000',
        valuation_complete: true,
        issues: [],
      });
      expect(first.reasons).toEqual([
        {
          action: 'skip',
          reason_code: 'academy_buy_not_met',
          reason_label: 'Điều kiện Mua chưa đạt',
          count: 2,
        },
        {
          action: 'buy',
          reason_code: 'academy_buy',
          reason_label: 'Mua theo điều kiện Mua',
          count: 1,
        },
        {
          action: 'skip',
          reason_code: 'academy_condition_missing',
          reason_label: 'Thiếu dữ liệu để đánh giá điều kiện',
          count: 1,
        },
      ]);

      // An incomplete valuation never reports a NAV.
      expect(bySession.get('2026-09-29')).toMatchObject({
        nav_end_vnd: null,
        valuation_complete: false,
        counts: { hold: 1, skip: 1, total: 2 },
      });
      // The custom universe and its name come from the immutable revision row.
      expect(bySession.get('2026-09-30')).toMatchObject({
        universe: { kind: 'custom', revision: 1, name: 'Danh mục A' },
        config_revision: 3,
        counts: { buy: 0, sell: 1, skip: 2, total: 3 },
      });
      // Receipt without a pin: fall back to the revision recorded on its decisions.
      expect(bySession.get('2026-10-01')).toMatchObject({
        config_revision: 4,
        universe: { kind: 'custom', revision: 1, name: 'Danh mục A' },
      });
      expect(bySession.get('2026-10-02')).toMatchObject({
        run_status: 'failed',
        issues: [{ code: 'source_error', symbol: null, detail: 'timeout' }],
        counts: { total: 0 },
        reasons: [],
      });
      expect(bySession.get('2026-10-05')).toMatchObject({
        run_status: 'running',
        completed_at: null,
        nav_end_vnd: null,
        cash_end_vnd: null,
        valuation_complete: null,
      });
    });

    it('J02 pages to the end of the history with a date cursor', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = `/api/v2/bot/journal/sessions?limit=4${cursor ? `&cursor=${cursor}` : ''}`;
        const page = (await get(owner, url)).json() as {
          items: Json[];
          next_cursor: string | null;
        };
        seen.push(...page.items.map((item) => item.session));
        cursor = page.next_cursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(pages).toBe(2);
      expect(seen).toEqual([...DATES].reverse());
      const invalid = await get(owner, '/api/v2/bot/journal/sessions?cursor=2026-13-45');
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('J03 lists the decisions of one session, executed first, with a decision cursor', async () => {
      const first = await get(owner, '/api/v2/bot/journal/sessions/2026-09-28?limit=3');
      expect(first.statusCode).toBe(200);
      const page = first.json() as { session: Json; items: Json[]; next_cursor: string | null };
      expect(page.session).toMatchObject({ session: '2026-09-28', counts: { total: 4 } });
      expect(page.items).toHaveLength(3);
      expect(page.items[0]).toMatchObject({
        action: 'buy',
        symbol: 'VCB',
        reason_code: 'academy_buy',
        reason_label: 'Mua theo điều kiện Mua',
        trading_date: '2026-09-28',
        decision_config_revision: 2,
        policy_version: 'iqx-bot-v1.0',
        universe_kind: 'vn30',
        universe_revision: 0,
        execution: { side: 'buy', qty: 100, price_vnd: '90000', fee_vnd: '13500' },
      });
      expect(page.next_cursor).not.toBeNull();
      const second = (
        await get(
          owner,
          `/api/v2/bot/journal/sessions/2026-09-28?limit=3&cursor=${page.next_cursor}`,
        )
      ).json() as { items: Json[]; next_cursor: string | null };
      expect(second.items).toHaveLength(1);
      expect(second.next_cursor).toBeNull();
      const symbols = [...page.items, ...second.items].map((item) => item.symbol);
      expect(symbols).toEqual(['VCB', 'FPT', 'HPG', 'MWG']); // executed, then by symbol
      expect(new Set([...page.items, ...second.items].map((item) => item.id)).size).toBe(4);

      // Session-level decisions (no symbol) sort before symbol decisions after the executed ones.
      const sell = (await get(owner, '/api/v2/bot/journal/sessions/2026-09-30')).json() as {
        items: Json[];
      };
      expect(sell.items.map((item) => [item.action, item.symbol])).toEqual([
        ['sell', 'VCB'],
        ['skip', null],
        ['skip', 'ACB'],
      ]);
      expect(sell.items[0]!.execution).toMatchObject({ side: 'sell', tax_vnd: '9500' });
    });

    it('J04 is owner-scoped and validates the session and cursor', async () => {
      const foreign = await get(outsider, '/api/v2/bot/journal/sessions/2026-09-28');
      expect(foreign.statusCode).toBe(200); // the outsider has its own (empty) run that day
      expect(foreign.json().session.run_id).not.toBe(runs.get('2026-09-28'));
      expect(foreign.json().items).toEqual([]);

      const mine = (await get(owner, '/api/v2/bot/journal/sessions/2026-09-28')).json() as {
        items: Json[];
      };
      const crossCursor = await get(
        outsider,
        `/api/v2/bot/journal/sessions/2026-09-28?cursor=${mine.items[1]!.id}`,
      );
      expect(crossCursor.statusCode).toBe(400);
      expect(crossCursor.json().error.code).toBe('INVALID_CURSOR');
      // A cursor of another session of the same owner is refused too.
      const other = (await get(owner, '/api/v2/bot/journal/sessions/2026-09-30')).json() as {
        items: Json[];
      };
      const wrongSession = await get(
        owner,
        `/api/v2/bot/journal/sessions/2026-09-28?cursor=${other.items[0]!.id}`,
      );
      expect(wrongSession.statusCode).toBe(400);

      const missing = await get(owner, '/api/v2/bot/journal/sessions/2025-01-02');
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('SESSION_NOT_FOUND');
      const stranger = await registerAndLogin(stack.app, 'sess-no-bot');
      expect((await get(stranger, '/api/v2/bot/journal/sessions')).json()).toEqual({
        items: [],
        next_cursor: null,
      });
      expect((await get(stranger, '/api/v2/bot/journal/sessions/2026-09-28')).statusCode).toBe(404);

      const badDate = await get(owner, '/api/v2/bot/journal/sessions/not-a-date');
      expect(badDate.statusCode).toBe(422);
      expect(badDate.json().error.code).toBe('VALIDATION_ERROR');
      const anonymous = await stack.app.inject({
        method: 'GET',
        url: '/api/v2/bot/journal/sessions',
      });
      expect(anonymous.statusCode).toBe(401);
    });

    it('J05 leaves the existing GET /bot/journal route untouched', async () => {
      const response = await get(owner, '/api/v2/bot/journal?limit=100');
      expect(response.statusCode).toBe(200);
      expect(response.json().items.length).toBeGreaterThan(0);
    });
  });
});
