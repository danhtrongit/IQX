/**
 * Kho dữ liệu Flashback v2.2 trên Postgres thật (IQX-Flashback-SPEC-DuLieu.md §1-§4).
 *
 * Cơ sở dữ liệu: `TEST_DATABASE_URL` (tên bắt đầu `iqx_v2_test_`, máy cục bộ) kèm
 * `IQX_TEST_EXTERNAL_SERVICES=1`; không có thì chạy container Postgres. Test tạo một cơ sở dữ
 * liệu riêng, chạy toàn bộ migration (0001-0039) rồi xoá khi xong. Pool dùng đúng giới hạn thời
 * gian câu lệnh mặc định của sản xuất (3 giây) để kiểm chứng ghi theo mã và đọc theo mã đủ nhanh.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { Environment } from '../../src/platform/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import { FlashbackDatasetBuilder } from '../../src/modules/flashback/flashback-dataset.builder.js';
import {
  FLASHBACK_DATASET_DEFAULTS,
  readFlashbackDatasetConfig,
} from '../../src/modules/flashback/flashback-dataset.config.js';
import { FlashbackDatasetCuts } from '../../src/modules/flashback/flashback-dataset.cuts.js';
import {
  DATASET_PURGED_NOTE,
  PgFlashbackDatasetRepository,
} from '../../src/modules/flashback/flashback-dataset.repository.js';
import {
  PgFlashbackRoomsRepository,
  type NewFbMatch,
} from '../../src/modules/flashback/flashback-rooms.repository.js';
import { assertIsolatedTestDatabaseUrl } from '../helpers/test-stack.js';
import {
  healthyRows,
  seededInt,
  weekdaysEndingOn,
} from '../unit/helpers/flashback-dataset-fixtures.js';
import { FakeDatasetSource } from '../unit/helpers/flashback-dataset-memory.js';

const { Client } = pg;
const run = promisify(execFile);
const BACKEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const NOW = new Date('2026-11-04T03:00:00.000Z');
const CALENDAR = weekdaysEndingOn('2026-11-03', 1_200);
const names = (count: number) => Array.from({ length: count }, (_, i) => `S${String(i).padStart(3, '0')}`);

function databaseService(url: string, statementTimeoutMs = 3_000): DatabaseService {
  const values: Partial<Environment> = {
    DATABASE_URL: url,
    DB_READ_ONLY: false,
    DB_POOL_MAX: 6,
    DB_CONNECT_TIMEOUT_MS: 5_000,
    DB_STATEMENT_TIMEOUT_MS: statementTimeoutMs,
  } as Partial<Environment>;
  const config = { get: (key: keyof Environment) => values[key] };
  return new DatabaseService(config as unknown as ConfigService<Environment, true>);
}

describe('Flashback dataset trên PostgreSQL thật', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let adminUrl: string;
  let url: string;
  let databaseName: string;
  let database: DatabaseService;
  let repository: PgFlashbackDatasetRepository;
  const alerts = { send: vi.fn(async () => undefined) };

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
    databaseName = `iqx_v2_test_fbds_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
    database = databaseService(url);
    repository = new PgFlashbackDatasetRepository(database);
  });

  afterAll(async () => {
    await database?.onApplicationShutdown().catch(() => undefined);
    if (databaseName) {
      const admin = new Client({ connectionString: adminUrl });
      await admin.connect();
      await admin.query(`drop database if exists ${databaseName} with (force)`);
      await admin.end();
    }
    await container?.stop();
  });

  beforeEach(async () => {
    alerts.send.mockClear();
    await database.query(`truncate fb_dataset_versions restart identity cascade`);
    await database.query(`delete from flashback_job_log where step = 'alert'`);
  });

  function sourceOf(count: number, bars: (index: number) => number = () => 900): FakeDatasetSource {
    const source = new FakeDatasetSource();
    source.calendarDates = CALENDAR;
    source.basketSymbols = names(count);
    source.basketSymbols.forEach((symbol, index) => {
      source.histories.set(symbol, healthyRows(CALENDAR.slice(-bars(index))));
    });
    return source;
  }

  const builderOf = (source: FakeDatasetSource) => new FlashbackDatasetBuilder(repository, source, alerts);

  it('migration 0039: đủ bảng, cột, ràng buộc và tham số mặc định', async () => {
    const tables = await database.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name like 'fb_dataset_%' order by 1`,
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      'fb_dataset_bars',
      'fb_dataset_prefix',
      'fb_dataset_symbols',
      'fb_dataset_versions',
    ]);
    const columns = await database.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_name = 'fb_matches' and column_name in ('dataset_version', 'start_idx') order by 1`,
    );
    expect(columns).toEqual([
      { column_name: 'dataset_version', is_nullable: 'YES' },
      { column_name: 'start_idx', is_nullable: 'YES' },
    ]);
    const keys = await database.query<{ attname: string }>(
      `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'fb_dataset_bars'::regclass and i.indisprimary order by array_position(i.indkey::int[], a.attnum)`,
    );
    expect(keys.map((row) => row.attname)).toEqual(['version', 'symbol', 'idx']);
    const check = await database.query<{ conname: string }>(
      `select conname from pg_constraint where conname = 'ck_fb_matches_dataset_cut'`,
    );
    expect(check).toHaveLength(1);

    // Tham số mặc định đã được nạp (migration gieo khoá `dataset`) và khớp mặc định của mã nguồn.
    await database.query(`delete from flashback_settings where key = 'dataset'`);
    expect(readFlashbackDatasetConfig(await repository.readConfig()).config).toEqual(FLASHBACK_DATASET_DEFAULTS);
  });

  it('ràng buộc của CSDL: tối đa một phiên bản active và một lần dựng building', async () => {
    await database.query(`insert into fb_dataset_versions (status) values ('active')`);
    await expect(database.query(`insert into fb_dataset_versions (status) values ('active')`)).rejects.toThrow();
    await database.query(`insert into fb_dataset_versions (status) values ('building')`);
    await expect(database.query(`insert into fb_dataset_versions (status) values ('building')`)).rejects.toThrow();
    await database.query(`insert into fb_dataset_versions (status) values ('retired'), ('failed'), ('failed')`);
    await expect(database.query(`insert into fb_dataset_versions (status) values ('bogus')`)).rejects.toThrow();
  });

  it('dựng phiên bản đầu tiên: ghi đủ mã, nến và mảng cộng dồn khớp phép cộng bằng SQL, rồi kích hoạt', async () => {
    const result = await builderOf(sourceOf(85)).build({ trigger: 'cli', now: NOW });
    expect(result).toMatchObject({ status: 'active', version: 1, okCount: 85, excludedCount: 0 });

    const [version] = await database.query<Record<string, unknown>>(
      `select status, symbols_count, source, trigger_kind, params, log->'basket' as basket, activated_at
         from fb_dataset_versions where version = 1`,
    );
    expect(version).toMatchObject({
      status: 'active',
      symbols_count: 85,
      source: 'DNSE:x1000:adjusted',
      trigger_kind: 'cli',
      params: { max_gap_sessions: 5 },
      basket: { index: 'VN100', count: 85 },
    });
    expect(version!.activated_at).toBeInstanceOf(Date);

    const [counts] = await database.query<{ symbols: string; bars: string; prefixes: string }>(
      `select (select count(*) from fb_dataset_symbols where version = 1 and status = 'ok')::text as symbols,
              (select count(*) from fb_dataset_bars where version = 1)::text as bars,
              (select count(*) from fb_dataset_prefix where version = 1)::text as prefixes`,
    );
    expect(counts).toEqual({ symbols: '85', bars: String(85 * 900), prefixes: '85' });

    // Mảng cộng dồn khớp tổng tính bằng SQL từ chính các nến đã lưu (X[k] = tổng các phiên 0..k-1).
    const [prefix] = await database.query<Record<string, unknown>>(
      `select n, cardinality(days) as days, cardinality(p_bad) as len,
              p_gap[n + 1] as gap, p_bad[n + 1] as bad, p_zero[n + 1] as zero,
              p_val[n + 1] as val, p_r[n + 1] as r, p_r2[n + 1] as r2,
              p_val[451] as val_450, p_r[451] as r_450
         from fb_dataset_prefix where version = 1 and symbol = 'S042'`,
    );
    const [sums] = await database.query<Record<string, unknown>>(
      `select count(*) filter (where gap_before > 5) as gap, sum(bad) as bad,
              count(*) filter (where volume = 0) as zero, sum(value_raw)::float8 as val,
              sum(ret) as r, sum(ret * ret) as r2,
              sum(value_raw) filter (where idx < 450)::float8 as val_450,
              sum(ret) filter (where idx < 450) as r_450
         from fb_dataset_bars where version = 1 and symbol = 'S042'`,
    );
    expect(prefix).toMatchObject({ n: 900, days: 900, len: 901 });
    expect(Number(prefix!.gap)).toBe(Number(sums!.gap));
    expect(Number(prefix!.bad)).toBe(Number(sums!.bad));
    expect(Number(prefix!.zero)).toBe(Number(sums!.zero));
    expect(Number(prefix!.val)).toBe(Number(sums!.val));
    expect(Number(prefix!.val_450)).toBe(Number(sums!.val_450));
    expect(Number(prefix!.r)).toBeCloseTo(Number(sums!.r), 9);
    expect(Number(prefix!.r2)).toBeCloseTo(Number(sums!.r2), 9);
    expect(Number(prefix!.r_450)).toBeCloseTo(Number(sums!.r_450), 9);

    // Đọc lại qua kho: kiểu dữ liệu đúng (số nguyên, mảng định kiểu) và đủ n + 1 phần tử.
    const loaded = (await repository.loadPrefix(1, 'S042'))!;
    expect(loaded.n).toBe(900);
    expect(loaded.pBad).toBeInstanceOf(Int32Array);
    expect(loaded.pVal).toBeInstanceOf(Float64Array);
    expect(loaded.pVal).toHaveLength(901);
    const bars = await repository.loadBars(1, 'S042', 10, 3);
    expect(bars.map((bar) => bar.idx)).toEqual([10, 11, 12]);
    expect(bars[0]).toMatchObject({ date: CALENDAR[310], open: 20_000, volume: 600_000 });
    expect(typeof bars[0]!.close).toBe('number');
  });

  it('làm mới thất bại (79 mã) giữ kho đang dùng, báo cảnh báo và dọn dữ liệu của phiên bản lỗi', async () => {
    expect((await builderOf(sourceOf(100)).build({ trigger: 'manual', now: NOW })).status).toBe('active');
    const failing = await builderOf(sourceOf(100, (index) => (index < 21 ? 311 : 900))).build({
      trigger: 'scheduled',
      now: NOW,
    });
    expect(failing).toMatchObject({ status: 'failed', version: 2, okCount: 79, excludedCount: 21 });

    expect(await repository.activeVersionNumber()).toBe(1);
    const statuses = await database.query<{ version: number; status: string }>(
      `select version, status from fb_dataset_versions order by version`,
    );
    expect(statuses).toEqual([
      { version: 1, status: 'active' },
      { version: 2, status: 'failed' },
    ]);
    // Phiên bản đang dùng còn nguyên; phiên bản lỗi chỉ còn dòng mã và nhật ký.
    const [rows] = await database.query<{ v1: string; v2: string; p2: string; s2: string; purged: string }>(
      `select (select count(*) from fb_dataset_bars where version = 1)::text as v1,
              (select count(*) from fb_dataset_bars where version = 2)::text as v2,
              (select count(*) from fb_dataset_prefix where version = 2)::text as p2,
              (select count(*) from fb_dataset_symbols where version = 2)::text as s2,
              (select count(*) from fb_dataset_symbols where version = 2 and reason = $1)::text as purged`,
      [DATASET_PURGED_NOTE],
    );
    expect(rows).toEqual({ v1: String(100 * 900), v2: '0', p2: '0', s2: '100', purged: '79' });
    const excluded = await repository.listSymbols(2);
    expect(excluded.filter((row) => row.status === 'excluded')).toHaveLength(21);
    expect(excluded.find((row) => row.status === 'excluded')!.reason).toMatch(/^Chưa đủ lịch sử/);

    const raised = await repository.listAlerts(5);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ level: 'high', code: 'too_few_symbols' });
    expect(raised[0]!.message).toContain('79 mã hợp lệ');
    expect(await repository.countAlerts('too_few_symbols', 1)).toBe(1);
    expect(await repository.hasRecentAlert('too_few_symbols', 5)).toBe(true);
    expect(await repository.hasRecentAlert('no_cut', 5)).toBe(false);
  });

  it('kích hoạt phiên bản mới: bản cũ thành retired trong cùng một transaction và vẫn đọc được', async () => {
    await builderOf(sourceOf(85)).build({ trigger: 'manual', now: NOW });
    await builderOf(sourceOf(85)).build({ trigger: 'scheduled', now: NOW });
    const versions = await repository.listVersions(10);
    expect(versions.map((row) => [row.version, row.status])).toEqual([
      [2, 'active'],
      [1, 'retired'],
    ]);
    expect(await repository.activeVersionNumber()).toBe(2);
    // Phiên bản retired giữ nguyên nến để dựng lại ván cũ từ (dataset_version, symbol, start_idx).
    expect(await repository.loadBars(1, 'S000', 0, 5)).toHaveLength(5);
    expect(await repository.loadPrefix(1, 'S000')).not.toBeNull();
  });

  it('hai lần dựng đồng thời: ràng buộc duy nhất của CSDL chỉ cho một lần chạy', async () => {
    const source = sourceOf(85);
    const [first, second] = await Promise.all([
      builderOf(source).build({ trigger: 'manual', now: NOW }),
      builderOf(source).build({ trigger: 'manual', now: NOW }),
    ]);
    expect([first.status, second.status].sort()).toEqual(['active', 'already_running']);
    const [{ total } = { total: '0' }] = await database.query<{ total: string }>(
      `select count(*)::text as total from fb_dataset_versions`,
    );
    expect(total).toBe('1');
  });

  it('lần dựng bị ngắt (mất nhịp) bị đánh dấu lỗi, dọn dữ liệu dở dang và không chặn lần dựng sau', async () => {
    const created = (await repository.createBuilding({
      trigger: 'manual',
      requestedBy: 'admin-1',
      maxGapSessions: 5,
      progress: { phase: 'symbols', total: 100, done: 1, ok: 1, excluded: 0 },
    }))!;
    expect(created.status).toBe('building');
    expect(await repository.createBuilding({ trigger: 'manual', requestedBy: null, maxGapSessions: 5, progress: created.progress })).toBeNull();
    // Một mã đã ghi dở dang rồi tiến trình dừng.
    const source = sourceOf(1);
    const rows = source.histories.get('S000')!;
    const { computeBars, computePrefix, TradingCalendar } = await import(
      '../../src/modules/flashback/flashback-dataset.logic.js'
    );
    const computed = computeBars(rows, new TradingCalendar(CALENDAR));
    await repository.saveSymbol(
      created.version,
      { symbol: 'S000', priceSource: 'DNSE:x1000:adjusted', valueBasis: 'approx', badCount: 0 },
      computed.bars,
      computePrefix(computed.bars, 5),
    );
    await database.query(`update fb_dataset_versions set heartbeat_at = now() - interval '11 minutes' where version = $1`, [created.version]);

    expect(await repository.failStaleBuilds(10 * 60_000)).toEqual([created.version]);
    const failed = (await repository.getVersion(created.version))!;
    expect(failed.status).toBe('failed');
    expect(failed.log.error).toContain('bị ngắt giữa chừng');
    expect(await repository.loadBars(created.version, 'S000', 0, 5)).toHaveLength(0);
    expect(await repository.loadPrefix(created.version, 'S000')).toBeNull();
    expect((await repository.listSymbols(created.version))[0]!.reason).toBe(DATASET_PURGED_NOTE);

    // Không còn lần dựng nào đang chạy nên lần sau chạy bình thường.
    expect((await builderOf(sourceOf(85)).build({ trigger: 'manual', now: NOW })).status).toBe('active');
  });

  it('activate từ chối phiên bản không còn building và giữ nguyên kho đang dùng (một transaction)', async () => {
    await builderOf(sourceOf(85)).build({ trigger: 'manual', now: NOW });
    const stale = (await repository.createBuilding({
      trigger: 'manual',
      requestedBy: null,
      maxGapSessions: 5,
      progress: { phase: 'symbols', total: 1, done: 1, ok: 1, excluded: 0 },
    }))!;
    await database.query(`update fb_dataset_versions set status = 'failed' where version = $1`, [stale.version]);
    await expect(
      repository.activate(stale.version, {
        symbolsCount: 85,
        source: 'x',
        log: {} as never,
        progress: { phase: 'done', total: 1, done: 1, ok: 1, excluded: 0 },
      }),
    ).rejects.toThrow('không còn ở trạng thái building');
    // Vì transaction bị huỷ, bản đang dùng không bị chuyển sang retired.
    expect(await repository.activeVersionNumber()).toBe(1);
  });

  it('cắt đề từ kho thật dưới giới hạn 3 giây: nến liên tục từ start_idx, dựng lại được và đúng điều kiện 12 tháng', async () => {
    await builderOf(sourceOf(85, () => 1_200)).build({ trigger: 'manual', now: NOW });
    const cuts = new FlashbackDatasetCuts(repository, alerts, seededInt(5));
    const started = performance.now();
    const picked = (await cuts.pick(NOW, 60, 30))!;
    expect(picked).not.toBeNull();
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(picked).toMatchObject({ datasetVersion: 1, priceSource: 'dataset:v1:DNSE:x1000:adjusted' });
    expect(picked.warmupBars).toHaveLength(252);
    expect(picked.bars).toHaveLength(90);
    // Phiên chơi cuối cách hôm nay ít nhất 12 tháng (mốc 2025-11-04).
    expect(picked.bars.at(-1)!.d <= '2025-11-04').toBe(true);
    // Chuỗi liên tục: khớp phiên start_idx .. start_idx + 341 trong CSDL.
    const stored = await repository.loadBars(1, picked.symbol, picked.startIdx, 342);
    expect([...picked.warmupBars, ...picked.bars].map((bar) => bar.d)).toEqual(stored.map((row) => row.date));
    const rebuilt = await cuts.rebuild({
      version: 1,
      symbol: picked.symbol,
      startIdx: picked.startIdx,
      warmup: 252,
      viewBars: 60,
      playBars: 30,
    });
    expect(rebuilt).toEqual({ warmupBars: picked.warmupBars, bars: picked.bars });

    // Lần chọn kế tiếp dùng bộ nhớ đệm: rất nhanh.
    const again = performance.now();
    expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
    expect(performance.now() - again).toBeLessThan(200);
  });

  it('không có điểm cắt hợp lệ: null, cảnh báo no_cut trong flashback_job_log, không nới điều kiện', async () => {
    // 500 phiên tới hôm qua: chỉ khoảng 240 phiên cũ hơn 12 tháng, không đủ 342 phiên cho một lát cắt.
    await builderOf(sourceOf(85, () => 500)).build({ trigger: 'manual', now: NOW });
    const cuts = new FlashbackDatasetCuts(repository, alerts, seededInt(5));
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    const raised = await repository.listAlerts(5);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ level: 'high', code: 'no_cut' });
    expect(raised[0]!.message).toContain('Ván không bắt đầu, chưa trừ xu');
    expect(alerts.send).toHaveBeenCalledTimes(1);
    // Lần thứ hai trong 30 phút không báo lại.
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    expect(await repository.countAlerts('no_cut', 1)).toBe(1);
  });

  it('fb_matches: insertMatch ghi dataset_version và start_idx; ràng buộc buộc cả hai cùng có hoặc cùng trống', async () => {
    await builderOf(sourceOf(85)).build({ trigger: 'manual', now: NOW });
    const userId = randomUUID();
    await database.query(
      `insert into users (id, email, hashed_password, full_name, username, phone_verified_at, created_at)
       values ($1, $2, 'x', 'Người chơi', $3, '2020-01-01', '2020-01-01')`,
      [userId, `fbds-${userId}@example.com`, `fbds${userId.slice(0, 8)}`],
    );
    try {
      const [room] = await database.query<{ id: string }>(
        `insert into fb_rooms (code, owner_id, view_bars, play_bars, minutes, max_players)
         values ('123456', $1, 60, 30, 10, 1) returning id`,
        [userId],
      );
      const rooms = new PgFlashbackRoomsRepository();
      const match = (extra: Partial<NewFbMatch>): NewFbMatch => ({
        roomId: room!.id,
        symbol: 'AAA',
        startDate: '2020-01-01',
        endDate: '2020-06-01',
        priceSource: 'dataset:v1:DNSE:x1000:adjusted',
        fallbackLevel: 0,
        viewBars: 60,
        playBars: 30,
        warmupBars: [],
        bars: [],
        minutes: 10,
        stakeXu: 0,
        playerCount: 1,
        potXu: 0,
        startedAt: NOW,
        endsAt: new Date(NOW.getTime() + 600_000),
        ...extra,
      });
      const insert = (extra: Partial<NewFbMatch>) =>
        database.transaction((tx) => rooms.insertMatch(tx, match(extra)));

      const cut = await insert({ datasetVersion: 1, startIdx: 17 });
      const legacy = await insert({});
      const stored = await database.query<{ id: string; dataset_version: number | null; start_idx: number | null }>(
        `select id, dataset_version, start_idx from fb_matches where id = any($1::uuid[])`,
        [[cut.id, legacy.id]],
      );
      const byId = new Map(stored.map((row) => [row.id, row]));
      expect(byId.get(cut.id)).toMatchObject({ dataset_version: 1, start_idx: 17 });
      // Ván cũ (không cắt từ kho) vẫn ghi được với hai cột trống.
      expect(byId.get(legacy.id)).toMatchObject({ dataset_version: null, start_idx: null });

      await expect(insert({ datasetVersion: 1, startIdx: null })).rejects.toThrow();
      await expect(insert({ datasetVersion: null, startIdx: 4 })).rejects.toThrow();
      await expect(insert({ datasetVersion: 1, startIdx: -1 })).rejects.toThrow();
      await expect(insert({ datasetVersion: 999, startIdx: 3 })).rejects.toThrow();
    } finally {
      await database.query(`delete from users where id = $1`, [userId]);
    }
  });
});
