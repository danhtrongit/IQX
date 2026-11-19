import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the real SQL of migration 0056 (Demo về 100.000.000 VND, update 19-11 §8.2) on PostgreSQL.
 * Skipped unless DEMO_RESET_TEST_DATABASE_URL points at a throwaway local `iqx_v2_test_*` database
 * already migrated through 0055 (or 0056), for example
 *   createdb -T iqx_v2_local iqx_v2_test_u1911_econ
 *   DATABASE_URL=postgresql://localhost/iqx_v2_test_u1911_econ V2_MIGRATIONS_ALLOWED=true npm run migrate
 *   DEMO_RESET_TEST_DATABASE_URL=postgresql://localhost/iqx_v2_test_u1911_econ \
 *     npx vitest run test/unit/demo-reset-100m.pg.test.ts
 *   dropdb iqx_v2_test_u1911_econ
 * The fixture accounts are inserted after the database is migrated, so they are not logged yet; the
 * file is then applied twice (each time in its own transaction, like the migration runner).
 */
const URL_ENV = process.env.DEMO_RESET_TEST_DATABASE_URL;
const M = 100_000_000n;

type Fixture = {
  label: string;
  initial: bigint;
  net: bigint;
  cash: bigint;
  /** Expected after 0056. */
  cashAfter: bigint;
  refundXu: number;
};

const FIXTURES: Fixture[] = [
  { label: 'opened at 0', initial: 0n, net: 0n, cash: 0n, cashAfter: M, refundXu: 0 },
  {
    label: '1000 xu converted, part spent',
    initial: 0n,
    net: 10_000_000n,
    cash: 4_200_000n,
    cashAfter: 94_200_000n,
    refundXu: 1000,
  },
  {
    label: '100 xu converted',
    initial: 0n,
    net: 1_000_000n,
    cash: 1_000_000n,
    cashAfter: M,
    refundXu: 100,
  },
  {
    label: 'old 100M converted into xu',
    initial: M,
    net: 0n,
    cash: 0n,
    cashAfter: M,
    refundXu: 0,
  },
  {
    label: 'old 100M untouched',
    initial: M,
    net: M,
    cash: 73_500_000n,
    cashAfter: 73_500_000n,
    refundXu: 0,
  },
];

function guardUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^iqx_v2_test_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to run the 0056 test against database ${name || '<empty>'}`);
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('DEMO_RESET_TEST_DATABASE_URL must target a local throwaway database');
  }
  return connectionString;
}

describe.skipIf(!URL_ENV)('migration 0056 demo_reset_100m on PostgreSQL', () => {
  let pool: pg.Pool;
  let sql: string;
  const accounts = new Map<string, { userId: string; accountId: string }>();

  const applyOnce = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: guardUrl(URL_ENV!) });
    sql = await readFile(resolve(process.cwd(), 'migrations/0056_demo_reset_100m.sql'), 'utf8');
    for (const fixture of FIXTURES) {
      const userId = (
        await pool.query<{ id: string }>(
          `insert into users (email, username, hashed_password, full_name)
           values ($1, left('dr' || replace(gen_random_uuid()::text, '-', ''), 30), 'x', 'Demo reset')
           returning id`,
          [`demo-reset-${randomUUID()}@test.invalid`],
        )
      ).rows[0]!.id;
      const accountId = randomUUID();
      await pool.query(
        `insert into virtual_trading_accounts
           (id, user_id, status, initial_cash_vnd, cash_available_vnd, cash_reserved_vnd,
            cash_pending_vnd, activated_at, created_at, updated_at)
         values ($1, $2, 'active', $3, $4, 0, 0, now(), now(), now())`,
        [accountId, userId, fixture.initial.toString(), fixture.cash.toString()],
      );
      // The insert trigger derives net from initial; set the legacy value explicitly (an update of
      // net_deposited_cash_vnd alone does not fire trg_demo_net_deposited_default).
      await pool.query(
        `update virtual_trading_accounts set net_deposited_cash_vnd = $2 where id = $1`,
        [accountId, fixture.net.toString()],
      );
      // An existing wallet with earlier history: the refund must continue its seq.
      await pool.query(
        `insert into coin_wallets (user_id, balance, last_seq) values ($1, 0, 0)
         on conflict (user_id) do nothing`,
        [userId],
      );
      accounts.set(fixture.label, { userId, accountId });
    }
    // One wallet with prior history (seq 1, balance 500) for the 1000 xu case.
    const prior = accounts.get('1000 xu converted, part spent')!;
    await pool.query(
      `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values ($1, 1, 'adjustment', 500, 500, $2, '{}'::jsonb, 'iqx-shop-xu-v2')`,
      [prior.userId, `test-prior:${prior.userId}`],
    );
    await pool.query(`update coin_wallets set balance = 500, last_seq = 1 where user_id = $1`, [
      prior.userId,
    ]);
    await applyOnce();
    await applyOnce();
  });

  afterAll(async () => {
    if (pool) {
      const userIds = [...accounts.values()].map((entry) => entry.userId);
      if (userIds.length > 0) {
        await pool.query(`delete from demo_reset_100m_log where user_id = any($1::uuid[])`, [
          userIds,
        ]);
        await pool.query(`delete from users where id = any($1::uuid[])`, [userIds]);
      }
      await pool.end();
    }
  });

  it.each(FIXTURES)('$label → cash and capital at 100.000.000 VND', async (fixture) => {
    const { accountId } = accounts.get(fixture.label)!;
    const row = (
      await pool.query<{ initial: string; net: string; cash: string }>(
        `select initial_cash_vnd::text as initial, net_deposited_cash_vnd::text as net,
                cash_available_vnd::text as cash
           from virtual_trading_accounts where id = $1`,
        [accountId],
      )
    ).rows[0]!;
    expect(row).toEqual({
      initial: M.toString(),
      net: M.toString(),
      cash: fixture.cashAfter.toString(),
    });
    const log = (
      await pool.query<{ cash_added: string; refund_xu: number; old_net: string }>(
        `select cash_added_vnd::text as cash_added, refund_xu,
                old_net_deposited_cash_vnd::text as old_net
           from demo_reset_100m_log where account_id = $1`,
        [accountId],
      )
    ).rows;
    // Logged exactly once even though the file ran twice.
    expect(log).toEqual([
      {
        cash_added: (M - fixture.net).toString(),
        refund_xu: fixture.refundXu,
        old_net: fixture.net.toString(),
      },
    ]);
    const cashRows = (
      await pool.query<{ amount: string }>(
        `select amount_vnd::text as amount from virtual_cash_ledger
          where account_id = $1 and kind = 'demo_reset_100m'`,
        [accountId],
      )
    ).rows;
    expect(cashRows).toEqual(fixture.net === M ? [] : [{ amount: (M - fixture.net).toString() }]);
  });

  it.each(FIXTURES)('$label → xu refund once, ledger and wallet consistent', async (fixture) => {
    const { userId } = accounts.get(fixture.label)!;
    const refunds = (
      await pool.query<{ delta: number; seq: string; balance_after: string; unique_key: string }>(
        `select delta, seq::text as seq, balance_after::text as balance_after, unique_key
           from coin_ledger where user_id = $1 and kind = 'demo_exchange_refund'`,
        [userId],
      )
    ).rows;
    const wallet = (
      await pool.query<{ balance: string; last_seq: string }>(
        `select balance::text as balance, last_seq::text as last_seq
           from coin_wallets where user_id = $1`,
        [userId],
      )
    ).rows[0]!;
    if (fixture.refundXu === 0) {
      expect(refunds).toEqual([]);
      return;
    }
    const priorBalance = fixture.label === '1000 xu converted, part spent' ? 500 : 0;
    const priorSeq = fixture.label === '1000 xu converted, part spent' ? 1 : 0;
    expect(refunds).toEqual([
      {
        delta: fixture.refundXu,
        seq: String(priorSeq + 1),
        balance_after: String(priorBalance + fixture.refundXu),
        unique_key: `demo_exchange_refund:${userId}`,
      },
    ]);
    expect(wallet).toEqual({
      balance: String(priorBalance + fixture.refundXu),
      last_seq: String(priorSeq + 1),
    });
  });

  it('rejects a non-positive demo_exchange_refund and keeps the config at 100.000.000 VND', async () => {
    const { userId } = accounts.get('opened at 0')!;
    await expect(
      pool.query(
        `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
         values ($1, 99, 'demo_exchange_refund', -1, 0, $2, '{}'::jsonb, 'x')`,
        [userId, `neg:${userId}`],
      ),
    ).rejects.toThrow(/ck_coin_ledger_demo_refund_sign/);
    const configs = (
      await pool.query<{ initial: string }>(
        `select initial_cash_vnd::text as initial from virtual_trading_configs`,
      )
    ).rows;
    expect(configs.every((row) => row.initial === M.toString())).toBe(true);
  });

  it('aborts and lists the accounts when the cash would become negative', async () => {
    const userId = (
      await pool.query<{ id: string }>(
        `insert into users (email, username, hashed_password, full_name)
         values ($1, left('dn' || replace(gen_random_uuid()::text, '-', ''), 30), 'x', 'Neg')
         returning id`,
        [`demo-reset-neg-${randomUUID()}@test.invalid`],
      )
    ).rows[0]!.id;
    accounts.set('negative', { userId, accountId: randomUUID() });
    const accountId = accounts.get('negative')!.accountId;
    await pool.query(
      `insert into virtual_trading_accounts
         (id, user_id, status, initial_cash_vnd, cash_available_vnd, cash_reserved_vnd,
          cash_pending_vnd, activated_at, created_at, updated_at)
       values ($1, $2, 'active', 0, 1000000, 0, 0, now(), now(), now())`,
      [accountId, userId],
    );
    await pool.query(
      `update virtual_trading_accounts set net_deposited_cash_vnd = 200000000 where id = $1`,
      [accountId],
    );
    await expect(applyOnce()).rejects.toThrow(new RegExp(accountId));
    const logged = await pool.query(`select 1 from demo_reset_100m_log where account_id = $1`, [
      accountId,
    ]);
    expect(logged.rowCount).toBe(0);
  });
});
