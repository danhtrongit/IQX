/**
 * Vòng đời đề Flashback trên Postgres thật (spec 22-10 QA-01, QA-03, QA-04; FB-01, FB-02).
 *
 * Cơ sở dữ liệu: `TEST_DATABASE_URL` (tên bắt đầu `iqx_v2_test_`, máy cục bộ) kèm
 * `IQX_TEST_EXTERNAL_SERVICES=1`; không có thì chạy container Postgres. Test tạo một cơ sở dữ
 * liệu riêng, chạy toàn bộ migration (0001-0031) rồi xoá khi xong.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { Environment } from '../../src/platform/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import { FlashbackJob } from '../../src/modules/flashback/flashback.job.js';
import { PgFlashbackRepository } from '../../src/modules/flashback/flashback.repository.js';
import type { FlashbackRoundBuilder } from '../../src/modules/flashback/flashback.round-builder.js';
import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import { assertIsolatedTestDatabaseUrl } from '../helpers/test-stack.js';

const { Client } = pg;
const run = promisify(execFile);
const BACKEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const vn20 = (date: string) => new Date(`${date}T13:00:00.000Z`);
const vnClock = (at: Date) => new Date(at.getTime() + 7 * HOUR).toISOString().slice(11, 19);

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function databaseService(url: string): DatabaseService {
  const values: Partial<Environment> = {
    DATABASE_URL: url,
    DB_READ_ONLY: false,
    DB_POOL_MAX: 4,
    DB_CONNECT_TIMEOUT_MS: 5_000,
    DB_STATEMENT_TIMEOUT_MS: 30_000,
  } as Partial<Environment>;
  const config = { get: (key: keyof Environment) => values[key] };
  return new DatabaseService(config as unknown as ConfigService<Environment, true>);
}

/** Bộ dựng đề giả: luôn tạo được đề (nguồn nến giả), mỗi đề một dải ngày riêng. */
function stubBuilder(): FlashbackRoundBuilder {
  let counter = 0;
  return {
    build: async (_now: Date, level: number) => {
      counter += 1;
      const base = Date.UTC(1990, 0, 1) + counter * 400 * DAY;
      const bars: FlashbackBar[] = Array.from({ length: 120 }, (_, index) => ({
        d: new Date(base + index * DAY).toISOString().slice(0, 10),
        o: 30_000,
        h: 30_100,
        l: 29_900,
        c: 30_000 + index * 10,
        v: 1_000_000,
      }));
      return {
        symbol: `S${counter % 30}`,
        startDate: bars[0]!.d,
        bars,
        warmupBars: [],
        fallbackLevel: level,
        priceSource: 'VCI:dong:adjusted',
      };
    },
  } as unknown as FlashbackRoundBuilder;
}

describe('Flashback scheduler on real PostgreSQL', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let adminUrl: string;
  let url: string;
  let databaseName: string;
  const services: DatabaseService[] = [];

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      if (process.env.IQX_TEST_EXTERNAL_SERVICES !== '1')
        throw new Error('TEST_DATABASE_URL requires IQX_TEST_EXTERNAL_SERVICES=1');
      adminUrl = assertIsolatedTestDatabaseUrl(process.env.TEST_DATABASE_URL).toString();
    } else {
      container = await new PostgreSqlContainer('postgres:17-alpine')
        .withDatabase('iqx_v2_test_containers')
        .start();
      adminUrl = container.getConnectionUri();
    }
    databaseName = `iqx_v2_test_fb_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    await admin.end();
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    url = target.toString();
    await run(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, DATABASE_URL: url, V2_MIGRATIONS_ALLOWED: 'true' },
    });
  });

  afterAll(async () => {
    for (const service of services) await service.onApplicationShutdown().catch(() => undefined);
    if (databaseName) {
      const admin = new Client({ connectionString: adminUrl });
      await admin.connect();
      await admin.query(`drop database if exists ${databaseName} with (force)`);
      await admin.end();
    }
    await container?.stop();
  });

  /** Một "tiến trình": pool riêng, kho riêng, tác vụ riêng. */
  function processUnderTest(clock: { at: Date }) {
    const database = databaseService(url);
    services.push(database);
    const repository = new PgFlashbackRepository(database);
    const job = new FlashbackJob(database, repository, { now: () => clock.at }, stubBuilder());
    return { database, repository, job };
  }

  async function reset() {
    const database = databaseService(url);
    await database.query(
      `truncate flashback_reward_holds, flashback_orders, flashback_lots, flashback_entries,
                flashback_rounds, flashback_job_log, coin_ledger, coin_wallets cascade`,
    );
    await database.query(`delete from flashback_settings where key <> 'config'`);
    await database.query(`delete from users where email like 'fb-it-%'`);
    await database.onApplicationShutdown();
  }

  async function seedPlayers(database: DatabaseService, roundId: string, count = 3) {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = randomUUID();
      ids.push(id);
      await database.query(
        `insert into users (id, email, hashed_password, full_name, username, phone_verified_at, created_at)
         values ($1, $2, 'x', 'Người chơi', $3, '2020-01-01', '2020-01-01')`,
        [id, `fb-it-${id}@example.com`, `fbit${id.slice(0, 8)}`],
      );
      await database.query(
        `insert into flashback_entries
           (round_id, user_id, fee_xu, first_join, cash, initial_cash, indicator_params, step,
            status, final_nav, pnl_pct, max_drawdown, finished_at, device_id, join_ip)
         values ($1, $2, 0, true, 10000000, 10000000, '[]'::jsonb, 60, 'finished', $3, $4, 0.01,
                 now(), $5, $6)`,
        [
          roundId,
          id,
          String(10_000_000 + (count - index) * 100_000),
          (count - index) / 100,
          `device-${id}`,
          `10.1.0.${index + 1}`,
        ],
      );
    }
    return ids;
  }

  it('QA-01: 30 ngày tua nhanh, giây ngẫu nhiên: đủ 15 đề, 48 giờ, đóng 20:00, luôn đúng 1 đề open', async () => {
    await reset();
    const clock = { at: new Date(0) };
    const { database, repository, job } = processUnderTest(clock);
    const random = seededRandom(30);
    const start = new Date('2025-12-31T17:00:00.000Z').getTime(); // 00:00 01/01 giờ VN
    const end = start + 30 * DAY;
    // Tác vụ chạy mỗi phút ở một giây ngẫu nhiên, đủ 43.200 lần.
    for (let minute = start; minute < end; minute += MINUTE) {
      clock.at = new Date(minute + Math.floor(random() * 60_000));
      await job.run(clock.at);
      const [{ open } = { open: -1 }] = await database.query<{ open: number }>(
        `select count(*)::int as open from flashback_rounds where status = 'open'`,
      );
      expect(open).toBe(1);
    }
    const rounds = await repository.listRounds(database, 100);
    const opened = rounds.filter((round) => round.opensAt && round.opensAt.getTime() < end);
    expect(opened).toHaveLength(15);
    for (const round of opened) {
      expect(vnClock(round.closesAt!)).toBe('20:00:00');
      if (round.roundNo === 1) continue;
      const length = round.closesAt!.getTime() - round.opensAt!.getTime();
      expect(length).toBeLessThanOrEqual(48 * HOUR);
      expect(length).toBeGreaterThan(48 * HOUR - MINUTE);
    }
  }, 600_000);

  it('QA-03: hai tiến trình chạy đồng thời 100 lần: mỗi lần chỉ một tiến trình chạy, không kẹt khoá', async () => {
    await reset();
    const clock = { at: new Date(0) };
    const first = processUnderTest(clock);
    const second = processUnderTest(clock);
    const random = seededRandom(3);
    const start = vn20('2026-02-01').getTime() - 50 * MINUTE;
    let completed = 0;
    for (let index = 0; index < 100; index += 1) {
      clock.at = new Date(start + index * MINUTE + Math.floor(random() * 60_000));
      const outcomes = await Promise.all([first.job.run(clock.at), second.job.run(clock.at)]);
      const ran = outcomes.filter((outcome) => outcome.status === 'completed').length;
      // Không bao giờ hai tiến trình cùng chạy một lượt.
      expect(ran).toBeLessThanOrEqual(1);
      completed += ran;
    }
    // Khoá không kẹt: hầu hết các phút đều có một tiến trình chạy được, và sau cùng không còn khoá.
    expect(completed).toBeGreaterThanOrEqual(95);
    const [{ locks } = { locks: -1 }] = await first.database.query<{ locks: number }>(
      `select count(*)::int as locks from pg_locks where locktype = 'advisory' and objid = 78291042`,
    );
    expect(locks).toBe(0);
    const solo = await first.job.run(new Date(start + 101 * MINUTE));
    expect(solo.status).toBe('completed');
    const rows = await first.database.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from flashback_rounds group by status`,
    );
    const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.n]));
    expect(byStatus.open).toBe(1);
    expect(byStatus.ready ?? 0).toBeLessThanOrEqual(1);
    const [{ dupes } = { dupes: -1 }] = await first.database.query<{ dupes: number }>(
      `select count(*)::int as dupes from (
         select round_no from flashback_rounds group by round_no having count(*) > 1) d`,
    );
    expect(dupes).toBe(0);
  }, 300_000);

  it('QA-03: ngắt giữa bước trả thưởng rồi chạy lại: mỗi người nhận thưởng đúng một lần', async () => {
    await reset();
    const clock = { at: vn20('2026-03-01') };
    const { database, repository, job } = processUnderTest(clock);
    await job.run(clock.at);
    const open = (await repository.openRound(database))!;
    const players = await seedPlayers(database, open.id);

    let calls = 0;
    const original = repository.appendLedger.bind(repository);
    repository.appendLedger = async (tx, entry) => {
      calls += 1;
      if (calls === 2) throw new Error('máy chủ dừng giữa bước 3');
      return original(tx, entry);
    };
    clock.at = new Date(open.closesAt!.getTime() + 30_000);
    await expect(job.run(clock.at)).rejects.toThrow('máy chủ dừng giữa bước 3');
    const [{ count: afterCrash } = { count: -1 }] = await database.query<{ count: number }>(
      `select count(*)::int as count from coin_ledger where kind = 'flashback_reward'`,
    );
    expect(afterCrash).toBe(0);
    expect((await repository.roundById(database, open.id))!.status).toBe('closed');

    repository.appendLedger = original;
    for (let index = 1; index <= 3; index += 1) {
      clock.at = new Date(open.closesAt!.getTime() + index * MINUTE + 30_000);
      await job.run(clock.at);
    }
    const ledger = await database.query<{ user_id: string; n: number }>(
      `select user_id::text as user_id, count(*)::int as n from coin_ledger
        where kind = 'flashback_reward' group by user_id`,
    );
    expect(ledger.map((row) => row.user_id).sort()).toEqual([...players].sort());
    expect(ledger.every((row) => row.n === 1)).toBe(true);
    expect((await repository.roundById(database, open.id))!.status).toBe('paid');
  }, 120_000);

  it('QA-04: máy chủ dừng 5 giờ qua giờ đổi đề: đề cũ đóng và trả thưởng, đề mới mở ngay đủ 48 giờ, đề sau về 20:00', async () => {
    await reset();
    const clock = { at: new Date(0) };
    const { database, repository, job } = processUnderTest(clock);
    const random = seededRandom(4);
    const tick = async (minute: number) => {
      clock.at = new Date(minute + Math.floor(random() * 60_000));
      return job.run(clock.at);
    };
    await tick(vn20('2026-04-01').getTime() - 10 * MINUTE);
    const first = (await repository.openRound(database))!;
    expect(first.closesAt!.toISOString()).toBe(vn20('2026-04-03').toISOString());
    await seedPlayers(database, first.id);

    const outageFrom = vn20('2026-04-03').getTime() - 2 * HOUR;
    for (let minute = vn20('2026-04-01').getTime(); minute < outageFrom; minute += HOUR) {
      await tick(minute);
    }
    const resumeAt = outageFrom + 5 * HOUR;
    await tick(resumeAt);

    expect((await repository.roundById(database, first.id))!.status).toBe('paid');
    const [{ rewards } = { rewards: -1 }] = await database.query<{ rewards: number }>(
      `select count(*)::int as rewards from coin_ledger where kind = 'flashback_reward'`,
    );
    expect(rewards).toBe(3);
    const current = (await repository.openRound(database))!;
    expect(current.opensAt!.getTime()).toBe(clock.at.getTime());
    expect(current.closesAt!.getTime()).toBe(clock.at.getTime() + 48 * HOUR);

    for (let minute = resumeAt + MINUTE; minute < resumeAt + 4 * DAY; minute += 15 * MINUTE) {
      await tick(minute);
    }
    const next = (await repository.listRounds(database, 20)).find(
      (round) => round.roundNo === current.roundNo + 1,
    )!;
    expect(next.opensAt).not.toBeNull();
    expect(vnClock(next.closesAt!)).toBe('20:00:00');
  }, 120_000);
});
