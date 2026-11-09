/**
 * Mẫu nến tính sẵn của kho Flashback trên Postgres thật (Candle Dojo v1.3, migration 0046).
 *
 * Cơ sở dữ liệu: `TEST_DATABASE_URL` (tên bắt đầu `iqx_v2_test_`, máy cục bộ) kèm
 * `IQX_TEST_EXTERNAL_SERVICES=1`; không có thì chạy container Postgres. Test tạo một cơ sở dữ liệu
 * riêng, chạy toàn bộ migration rồi xoá khi xong. Pool dùng đúng giới hạn thời gian câu lệnh mặc định
 * của sản xuất (3 giây).
 *
 * Kiểm chứng: bước 2b chạy trước khi kích hoạt kho, bảng mẫu khớp bộ nhận diện chạy trực tiếp trên
 * nến đã lưu (nghiệm thu 2 của v1.3 §9), chạy lại không tạo dòng trùng, thống kê khớp truy vấn §6, sở
 * hữu thẻ + `fb_match_cards` + `seen_at`, dọn dữ liệu của phiên bản không kích hoạt, tra một phiên
 * dưới 5 ms.
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
import {
  CANDLE_DETECTOR_VERSION,
  pick,
  prep,
  type CdRawBar,
} from '../../src/modules/candle-dojo/shared/detector.js';
import { FlashbackDatasetBuilder } from '../../src/modules/flashback/flashback-dataset.builder.js';
import { PgFlashbackDatasetRepository } from '../../src/modules/flashback/flashback-dataset.repository.js';
import type { DatasetRawPrice } from '../../src/modules/flashback/flashback-dataset.source.js';
import {
  FlashbackPatternsCompute,
  type FlashbackPatternStepPort,
} from '../../src/modules/flashback/flashback-patterns.compute.js';
import { PgFlashbackPatternsRepository } from '../../src/modules/flashback/flashback-patterns.repository.js';
import { FlashbackRoomCards } from '../../src/modules/flashback/flashback-rooms.cards.js';
import {
  PgFlashbackRoomsRepository,
  type NewFbMatch,
} from '../../src/modules/flashback/flashback-rooms.repository.js';
import { assertIsolatedTestDatabaseUrl } from '../helpers/test-stack.js';
import { simulateMarket } from '../unit/candle-dojo-test-kit.js';
import { weekdaysEndingOn } from '../unit/helpers/flashback-dataset-fixtures.js';
import { FakeDatasetSource } from '../unit/helpers/flashback-dataset-memory.js';

const { Client } = pg;
const run = promisify(execFile);
const BACKEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const NOW = new Date('2026-11-04T03:00:00.000Z');
const CALENDAR = weekdaysEndingOn('2026-11-03', 1_200);
const BARS = 900;
const SYMBOLS = 85;
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

describe('Mẫu nến tính sẵn của kho Flashback trên PostgreSQL thật', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let adminUrl: string;
  let url: string;
  let databaseName: string;
  let database: DatabaseService;
  let datasets: PgFlashbackDatasetRepository;
  let patterns: PgFlashbackPatternsRepository;
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
    databaseName = `iqx_v2_test_fbpat_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
    datasets = new PgFlashbackDatasetRepository(database);
    patterns = new PgFlashbackPatternsRepository(database);
  }, 180_000);

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
    await database.query(`delete from symbols where symbol like 'S0%'`);
  });

  /** Nguồn giả: rổ `count` mã, mỗi mã một chuỗi nến mô phỏng thị trường Việt Nam, giá gốc = giá điều chỉnh. */
  function sourceOf(count: number, bars = BARS) {
    const source = new FakeDatasetSource();
    source.calendarDates = CALENDAR;
    source.basketSymbols = names(count);
    const dates = CALENDAR.slice(-bars);
    source.basketSymbols.forEach((symbol, index) => {
      const market = simulateMarket(1_000 + index, bars, 20_000);
      source.histories.set(
        symbol,
        market.map((bar, i) => ({
          date: dates[i]!,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: 600_000,
        })),
      );
      source.rawPrices = async (name) => {
        const rows = source.histories.get(name)!;
        const prices = new Map<string, DatasetRawPrice>();
        rows.forEach((row, i) =>
          prices.set(row.date, {
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            ref: i === 0 ? row.close : rows[i - 1]!.close,
          }),
        );
        return prices;
      };
    });
    return source;
  }

  const stepOf = (source: FakeDatasetSource) => new FlashbackPatternsCompute(patterns, source);
  const builderOf = (source: FakeDatasetSource, step: FlashbackPatternStepPort = stepOf(source)) =>
    new FlashbackDatasetBuilder(datasets, source, alerts, step);

  it('migration 0046: đủ bảng, khoá chính, khoá ngoại và ràng buộc; bảng cũ không đổi cột', async () => {
    const tables = await database.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name in
          ('fb_dataset_patterns', 'fb_dataset_pattern_runs', 'fb_dataset_raw', 'fb_match_cards') order by 1`,
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      'fb_dataset_pattern_runs',
      'fb_dataset_patterns',
      'fb_dataset_raw',
      'fb_match_cards',
    ]);
    const keys = await database.query<{ attname: string }>(
      `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'fb_dataset_patterns'::regclass and i.indisprimary
        order by array_position(i.indkey::int[], a.attnum)`,
    );
    expect(keys.map((row) => row.attname)).toEqual(['version', 'symbol', 'idx', 'detector_version']);
    // Bảng cũ: không thêm cột nào của 0046 vào fb_dataset_bars.
    const barColumns = await database.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'fb_dataset_bars' order by ordinal_position`,
    );
    expect(barColumns.map((row) => row.column_name)).toEqual([
      'version', 'symbol', 'idx', 'date', 'open', 'high', 'low', 'close', 'volume', 'value_raw',
      'gap_before', 'bad', 'ret',
    ]);
  });

  it('bước 2b chạy trong lúc dựng kho: kho chỉ active khi đã có lần chạy done; số liệu nhật ký khớp bảng', async () => {
    const source = sourceOf(SYMBOLS);
    const result = await builderOf(source).build({ trigger: 'cli', now: NOW });
    expect(result).toMatchObject({ status: 'active', version: 1, okCount: SYMBOLS });
    if (result.status !== 'active') return;

    const [runRow] = await database.query<Record<string, unknown>>(
      `select status, trigger_kind, detector_version, symbols_done, symbols_total, patterns_count,
              finished_at is not null as finished, log
         from fb_dataset_pattern_runs where version = 1`,
    );
    expect(runRow).toMatchObject({
      status: 'done',
      trigger_kind: 'build',
      detector_version: CANDLE_DETECTOR_VERSION,
      symbols_done: SYMBOLS,
      symbols_total: SYMBOLS,
      finished: true,
    });
    const [counts] = await database.query<{ patterns: number; raw: number; symbols: number }>(
      `select (select count(*) from fb_dataset_patterns where version = 1)::int as patterns,
              (select count(*) from fb_dataset_raw where version = 1)::int as raw,
              (select count(distinct symbol) from fb_dataset_patterns where version = 1)::int as symbols`,
    );
    expect(runRow!.patterns_count).toBe(counts!.patterns);
    expect(counts!.raw).toBe(SYMBOLS * BARS);
    expect(counts!.symbols).toBeGreaterThan(SYMBOLS - 3);
    expect(counts!.patterns).toBeGreaterThan(SYMBOLS * 50);
    expect(runRow!.log).toMatchObject({
      failed: [],
      raw: { symbols_with_raw: SYMBOLS, symbols_without_raw: 0, errors: [], reused: [] },
      missing_raw_sessions: 0,
      sessions: SYMBOLS * BARS,
    });
    expect(result.log.patterns).toMatchObject({
      run_id: 1,
      symbols_done: SYMBOLS,
      patterns_count: counts!.patterns,
      failed_symbols: 0,
    });
    const [version] = await database.query<{ status: string; log: { patterns?: unknown } }>(
      `select status, log from fb_dataset_versions where version = 1`,
    );
    expect(version!.status).toBe('active');
    expect(version!.log.patterns).toBeDefined();
    // Phiên bản của lần chạy done mới nhất là lần ván chơi dùng.
    expect((await patterns.latestDoneRun(1))!.detectorVersion).toBe(CANDLE_DETECTOR_VERSION);
  });

  it('đúng với bộ nhận diện: bảng khớp pick() chạy trực tiếp trên nến và giá gốc đã lưu, mỗi phiên tối đa một dòng', async () => {
    await builderOf(sourceOf(SYMBOLS)).build({ trigger: 'cli', now: NOW });
    const [dirty] = await database.query<{ bad: string; gaps: string }>(
      `select coalesce(sum(bad), 0)::text as bad, count(*) filter (where gap_before > 5)::text as gaps
         from fb_dataset_bars where version = 1`,
    );
    // Dữ liệu sạch: không có phiên bị loại vì dữ liệu xấu, nên bảng phải khớp pick() từng phiên.
    expect(dirty).toEqual({ bad: '0', gaps: '0' });

    let compared = 0;
    for (const symbol of ['S000', 'S017', 'S042', 'S084']) {
      const bars = await database.query<Record<string, unknown>>(
        `select idx, open, high, low, close from fb_dataset_bars where version = 1 and symbol = $1 order by idx`,
        [symbol],
      );
      const raw = await database.query<Record<string, unknown>>(
        `select idx, open_raw, high_raw, low_raw, close_raw, ref_price, exchange from fb_dataset_raw
          where version = 1 and symbol = $1 order by idx`,
        [symbol],
      );
      expect(raw).toHaveLength(BARS);
      const series = bars.map((bar) => ({
        o: Number(bar.open),
        h: Number(bar.high),
        l: Number(bar.low),
        c: Number(bar.close),
      }));
      const rawSeries: CdRawBar[] = raw.map((row) => ({
        o: Number(row.open_raw),
        h: Number(row.high_raw),
        l: Number(row.low_raw),
        c: Number(row.close_raw),
        ref: Number(row.ref_price),
        exchange: row.exchange as 'HOSE',
      }));
      const prepared = prep(series, rawSeries);
      const stored = await database.query<{ idx: number; card_id: string; card_n: number; tier: number }>(
        `select idx, card_id, card_n, tier from fb_dataset_patterns
          where version = 1 and symbol = $1 and detector_version = $2 order by idx`,
        [symbol, CANDLE_DETECTOR_VERSION],
      );
      const expected: string[] = [];
      for (let i = 0; i < series.length; i += 1) {
        const match = pick(prepared, i);
        if (match) expected.push(`${i}:${match.id}:${match.n}`);
        compared += 1;
      }
      expect(stored.map((row) => `${row.idx}:${row.card_id}:${row.card_n}`)).toEqual(expected);
      expect(stored.length).toBeGreaterThan(20);
    }
    expect(compared).toBe(4 * BARS);
    // Giá gốc ghi đúng đơn vị và tham chiếu = đóng cửa phiên trước.
    const [ref] = await database.query<Record<string, unknown>>(
      `select r.ref_price, r.exchange, prev.close as prev_close
         from fb_dataset_raw r join fb_dataset_bars prev
           on prev.version = r.version and prev.symbol = r.symbol and prev.idx = r.idx - 1
        where r.version = 1 and r.symbol = 'S042' and r.idx = 500`,
    );
    expect(Number(ref!.ref_price)).toBe(Number(ref!.prev_close));
    expect(ref!.exchange).toBe('HOSE');
  });

  it('chạy lại không tạo dòng trùng; lấy sàn từ bảng symbols; lần done mới nhất được dùng', async () => {
    const source = sourceOf(SYMBOLS);
    await builderOf(source).build({ trigger: 'cli', now: NOW });
    const perSymbol = () =>
      database.query<{ symbol: string; n: number; ids: string }>(
        `select symbol, count(*)::int as n, string_agg(idx || ':' || card_id, ',' order by idx) as ids
           from fb_dataset_patterns where version = 1 group by symbol order by symbol`,
      );
    const before = await perSymbol();
    await database.query(`insert into symbols (symbol, exchange) values ('S001', 'UPCoM'), ('S002', 'HNX')`);
    const again = await stepOf(source).run({ version: 1, trigger: 'admin', requestedBy: 'admin-1', now: NOW });
    expect(again).toMatchObject({ status: 'done', symbolsDone: SYMBOLS });
    // Cùng bộ nhận diện, cùng nến: mọi mã còn HOSE ra đúng kết quả cũ từng phiên; chỉ S001 và S002 (đổi
    // sàn nên biên độ trần/sàn của 4 thẻ Việt Nam đổi) được phép khác.
    const after = await perSymbol();
    expect(after.map((row) => row.symbol)).toEqual(before.map((row) => row.symbol));
    const changed = after.filter((row, i) => row.ids !== before[i]!.ids).map((row) => row.symbol);
    expect(changed.every((symbol) => symbol === 'S001' || symbol === 'S002')).toBe(true);
    const [dups] = await database.query<{ dup: number }>(
      `select count(*)::int as dup from (
         select symbol, idx from fb_dataset_patterns where version = 1
          group by symbol, idx, detector_version having count(*) > 1) d`,
    );
    expect(dups!.dup).toBe(0);
    const exchanges = await database.query<{ symbol: string; exchange: string }>(
      `select symbol, min(exchange) as exchange from fb_dataset_raw
        where version = 1 and symbol in ('S000', 'S001', 'S002') group by symbol order by symbol`,
    );
    expect(exchanges).toEqual([
      { symbol: 'S000', exchange: 'HOSE' },
      { symbol: 'S001', exchange: 'UPCOM' },
      { symbol: 'S002', exchange: 'HNX' },
    ]);
    const runs = await database.query<{ id: number; status: string; trigger_kind: string }>(
      `select id, status, trigger_kind from fb_dataset_pattern_runs where version = 1 order by id`,
    );
    expect(runs.map((r) => [r.status, r.trigger_kind])).toEqual([
      ['done', 'build'],
      ['done', 'admin'],
    ]);
    expect((await patterns.latestDoneRun(1))!.id).toBe(Number(runs[1]!.id));
  });

  it('bộ nhận diện mới: chạy với detector_version khác, bản cũ còn nguyên cho ván đang chơi', async () => {
    const source = sourceOf(SYMBOLS);
    await builderOf(source).build({ trigger: 'cli', now: NOW });
    const v1 = await patterns.overview(1, 1);
    await stepOf(source).run({ version: 1, trigger: 'detector', detectorVersion: 2, now: NOW });
    expect(await patterns.overview(1, 1)).toEqual(v1);
    expect((await patterns.overview(1, 2)).length).toBeGreaterThan(0);
    expect((await patterns.latestDoneRun(1))!.detectorVersion).toBe(2);
    const [sample] = await database.query<{ idx: number; symbol: string }>(
      `select idx, symbol from fb_dataset_patterns where version = 1 and detector_version = 1 limit 1`,
    );
    expect(await patterns.patternAt(1, sample!.symbol, sample!.idx, 1)).not.toBeNull();
    expect(await patterns.patternAt(1, sample!.symbol, sample!.idx, 3)).toBeNull();
  });

  it('chỉ một lần chạy running mỗi phiên bản (chỉ mục duy nhất); lần chạy treo được đóng', async () => {
    await builderOf(sourceOf(SYMBOLS)).build({ trigger: 'cli', now: NOW });
    const first = await patterns.createRun({ version: 1, detectorVersion: 9, trigger: 'admin', requestedBy: null, symbolsTotal: 1 });
    expect(first).not.toBeNull();
    expect(await patterns.createRun({ version: 1, detectorVersion: 9, trigger: 'admin', requestedBy: null, symbolsTotal: 1 })).toBeNull();
    expect(
      await stepOf(sourceOf(SYMBOLS)).run({ version: 1, trigger: 'admin', now: NOW }),
    ).toEqual({ status: 'already_running', version: 1 });
    await database.query(`update fb_dataset_pattern_runs set heartbeat_at = now() - interval '11 minutes' where id = $1`, [
      first!.id,
    ]);
    expect(await patterns.failStaleRuns(10 * 60_000)).toBe(1);
    expect((await patterns.latestRun(1))).toMatchObject({ status: 'failed' });
    const [stale] = await database.query<{ log: { error?: string } }>(
      `select log from fb_dataset_pattern_runs where id = $1`,
      [first!.id],
    );
    expect(stale!.log.error).toContain('bị ngắt');
    expect(await patterns.createRun({ version: 1, detectorVersion: 9, trigger: 'admin', requestedBy: null, symbolsTotal: 1 })).not.toBeNull();
  });

  it('thống kê khớp truy vấn §6: số lần theo thẻ của một mã trong khoảng ngày, gồm hai đầu; tổng quan cả kho', async () => {
    await builderOf(sourceOf(SYMBOLS)).build({ trigger: 'cli', now: NOW });
    const from = CALENDAR[400]!;
    const to = CALENDAR[700]!;
    const [first, ...rest] = await Promise.all([
      patterns.countByCard({ version: 1, detectorVersion: 1, symbol: 'S005', from, to }),
    ]);
    expect(rest).toEqual([]);
    // Truy vấn nguyên văn của spec §6.
    const spec = await database.query<{ card_id: string; tier: number; so_lan: number }>(
      `SELECT card_id, tier, COUNT(*)::int AS so_lan
         FROM fb_dataset_patterns
        WHERE version = 1 AND detector_version = 1 AND symbol = 'S005' AND date BETWEEN $1::date AND $2::date
        GROUP BY card_id, tier ORDER BY tier, so_lan DESC, card_id`,
      [from, to],
    );
    expect(first!.map((row) => ({ card_id: row.cardId, tier: row.tier, so_lan: row.count }))).toEqual(spec);
    expect(first!.length).toBeGreaterThan(3);
    // Hai đầu khoảng ngày được tính.
    const [edge] = await database.query<{ date: string }>(
      `select date::text as date from fb_dataset_patterns where version = 1 and symbol = 'S005'
        and date >= $1::date order by date limit 1`,
      [from],
    );
    const exact = await patterns.countByCard({ version: 1, detectorVersion: 1, symbol: 'S005', from: edge!.date, to: edge!.date });
    expect(exact.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThanOrEqual(1);
    // "Tất cả mã" là tổng các mã.
    const all = await patterns.countByCard({ version: 1, detectorVersion: 1, symbol: null, from, to });
    const [sum] = await database.query<{ n: number }>(
      `select count(*)::int as n from fb_dataset_patterns
        where version = 1 and detector_version = 1 and date between $1::date and $2::date`,
      [from, to],
    );
    expect(all.reduce((total, row) => total + row.count, 0)).toBe(sum!.n);
    const overview = await patterns.overview(1, 1);
    const [every] = await database.query<{ n: number }>(`select count(*)::int as n from fb_dataset_patterns where version = 1`);
    expect(overview.reduce((total, row) => total + row.count, 0)).toBe(every!.n);
    expect(await patterns.rawCoverage(1)).toEqual({ symbols: SYMBOLS, sessions: SYMBOLS * BARS });
  });

  it('tra một phiên lúc chơi dưới 5 ms (khoá chính), kể cả khi cả kho đã có mẫu', async () => {
    await builderOf(sourceOf(SYMBOLS)).build({ trigger: 'cli', now: NOW });
    const sample = await database.query<{ idx: number; symbol: string }>(
      `select idx, symbol from fb_dataset_patterns where version = 1 order by symbol, idx limit 400`,
    );
    await patterns.patternAt(1, sample[0]!.symbol, sample[0]!.idx, 1); // khởi động kết nối
    const started = performance.now();
    for (const row of sample) expect(await patterns.patternAt(1, row.symbol, row.idx, 1)).not.toBeNull();
    const average = (performance.now() - started) / sample.length;
    expect(average).toBeLessThan(5);
    expect(await patterns.patternAt(1, 'S000', 1, 1)).toBeNull(); // phiên 1 chưa đủ bối cảnh
  });

  it('ràng buộc của CSDL: số nến, bậc, idx, khoá ngoại tới mã, sàn, giá dương và xoá theo mã', async () => {
    await builderOf(sourceOf(SYMBOLS)).build({ trigger: 'cli', now: NOW });
    const insert = (over: Record<string, unknown>) => {
      const row = { symbol: 'S000', idx: 20, date: '2020-01-01', card_id: 'doji', card_n: 1, tier: 1, detector_version: 7, ...over };
      return database.query(
        `insert into fb_dataset_patterns (version, symbol, idx, date, card_id, card_n, tier, detector_version)
         values (1, $1, $2, $3::date, $4, $5, $6, $7)`,
        [row.symbol, row.idx, row.date, row.card_id, row.card_n, row.tier, row.detector_version],
      );
    };
    await insert({});
    await expect(insert({})).rejects.toThrow(); // trùng khoá chính
    await expect(insert({ idx: 21, card_n: 0 })).rejects.toThrow();
    await expect(insert({ idx: 22, card_n: 21 })).rejects.toThrow();
    await expect(insert({ idx: 23, tier: 6 })).rejects.toThrow();
    await expect(insert({ idx: 1, card_n: 3 })).rejects.toThrow(); // idx < card_n − 1
    await expect(insert({ symbol: 'NOPE' })).rejects.toThrow(); // khoá ngoại tới mã
    await expect(
      database.query(
        `insert into fb_dataset_raw (version, symbol, idx, open_raw, high_raw, low_raw, close_raw, ref_price, exchange)
         values (1, 'S000', 999999, 1, 1, 1, 1, 1, 'HOSE')`,
      ),
    ).rejects.toThrow(); // khoá ngoại tới nến
    await expect(
      database.query(`update fb_dataset_raw set exchange = 'NYSE' where version = 1 and symbol = 'S000' and idx = 5`),
    ).rejects.toThrow();
    await expect(
      database.query(`update fb_dataset_raw set ref_price = 0 where version = 1 and symbol = 'S000' and idx = 5`),
    ).rejects.toThrow();
    // Xoá nến của một mã kéo theo giá gốc; xoá mã kéo theo mẫu.
    await database.query(`delete from fb_dataset_bars where version = 1 and symbol = 'S084'`);
    const [gone] = await database.query<{ n: number }>(
      `select count(*)::int as n from fb_dataset_raw where version = 1 and symbol = 'S084'`,
    );
    expect(gone!.n).toBe(0);
    await database.query(`delete from fb_dataset_symbols where version = 1 and symbol = 'S083'`);
    const [cascaded] = await database.query<{ n: number }>(
      `select count(*)::int as n from fb_dataset_patterns where version = 1 and symbol = 'S083'`,
    );
    expect(cascaded!.n).toBe(0);
  });

  it('phiên bản không được kích hoạt bị dọn cả mẫu nến; kho đang dùng còn nguyên', async () => {
    const source = sourceOf(SYMBOLS);
    expect((await builderOf(source).build({ trigger: 'manual', now: NOW })).status).toBe('active');
    const [before] = await database.query<{ n: number }>(
      `select count(*)::int as n from fb_dataset_patterns where version = 1`,
    );
    // Bước 2b tính xong rồi bị báo lỗi: kho mới failed, mẫu của nó phải bị dọn cùng nến.
    const real = stepOf(source);
    const flaky: FlashbackPatternStepPort = {
      run: async (options) => {
        const result = await real.run(options);
        return result.status === 'already_running' ? result : { ...result, status: 'failed', reason: 'giả lập lỗi' };
      },
    };
    const failed = await builderOf(source, flaky).build({ trigger: 'scheduled', now: NOW });
    expect(failed).toMatchObject({ status: 'failed', version: 2 });
    const [after] = await database.query<{ v1: number; v2: number; raw2: number; bars2: number; runs2: number }>(
      `select (select count(*) from fb_dataset_patterns where version = 1)::int as v1,
              (select count(*) from fb_dataset_patterns where version = 2)::int as v2,
              (select count(*) from fb_dataset_raw where version = 2)::int as raw2,
              (select count(*) from fb_dataset_bars where version = 2)::int as bars2,
              (select count(*) from fb_dataset_pattern_runs where version = 2)::int as runs2`,
    );
    expect(after).toEqual({ v1: before!.n, v2: 0, raw2: 0, bars2: 0, runs2: 1 });
    expect(await datasets.activeVersionNumber()).toBe(1);
    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect((await datasets.listAlerts(5))[0]).toMatchObject({ code: 'pattern_failed' });
  });

  it('thẻ trong ván: chỉ ghi khi người chơi sở hữu thẻ, ghi một dòng mỗi phiên và "Đã gặp" lần đầu; đọc lại đúng khối', async () => {
    await builderOf(sourceOf(SYMBOLS)).build({ trigger: 'cli', now: NOW });
    const userId = randomUUID();
    const strangerId = randomUUID();
    for (const id of [userId, strangerId]) {
      await database.query(
        `insert into users (id, email, hashed_password, full_name, username, phone_verified_at, created_at)
         values ($1, $2, 'x', 'Người chơi', $3, '2020-01-01', '2020-01-01')`,
        [id, `fbpat-${id}@example.com`, `fbpat${id.slice(0, 8)}`],
      );
    }
    try {
      const [room] = await database.query<{ id: string }>(
        `insert into fb_rooms (code, owner_id, view_bars, play_bars, minutes, max_players)
         values ('654321', $1, 60, 30, 10, 1) returning id`,
        [userId],
      );
      // Chọn một mẫu thật ở phiên đủ xa, rồi đặt điểm cắt sao cho Phiên 3 của ván rơi đúng vào đó.
      const [sample] = await database.query<{ symbol: string; idx: number; card_id: string; card_n: number }>(
        `select symbol, idx, card_id, card_n from fb_dataset_patterns
          where version = 1 and idx > 200 and card_id <> 'doji' order by symbol, idx limit 1`,
      );
      const rooms = new PgFlashbackRoomsRepository();
      const startIdx = sample!.idx - 60 - 2; // warmupBars rỗng: idx = start + 0 + H + k − 1, k = 3
      const match = await database.transaction((tx) =>
        rooms.insertMatch(tx, {
          roomId: room!.id,
          symbol: sample!.symbol,
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
          datasetVersion: 1,
          startIdx,
        } satisfies NewFbMatch),
      );
      // Cột dataset_version / start_idx đọc lại đúng qua repository phòng chơi.
      const stored = (await rooms.matchById(database, match.id))!;
      expect(stored).toMatchObject({ datasetVersion: 1, startIdx });

      const cards = new FlashbackRoomCards(patterns);
      // Chưa có thẻ: không hiện, không ghi gì.
      expect(await cards.cardAt({ match: stored, userId, step: 3 })).toBeNull();
      expect(await patterns.matchCards(match.id, userId, 30)).toEqual([]);

      // Mua thẻ rồi bấm lại ở phiên đó (mô phỏng "có hiệu lực từ lần bấm kế tiếp").
      await database.query(`insert into cd_user_cards (user_id, card_id, price_xu) values ($1, $2, 100)`, [
        userId,
        sample!.card_id,
      ]);
      const shown = await cards.cardAt({ match: stored, userId, step: 3 });
      expect(shown).toEqual({ id: sample!.card_id, n: sample!.card_n });
      const [seen] = await database.query<{ seen_at: Date | null }>(
        `select seen_at from cd_user_cards where user_id = $1 and card_id = $2`,
        [userId, sample!.card_id],
      );
      expect(seen!.seen_at).toBeInstanceOf(Date);
      const firstSeen = seen!.seen_at!.getTime();
      // Bấm lặp lại không tạo dòng trùng và không đổi "lần đầu gặp".
      await cards.cardAt({ match: stored, userId, step: 3 });
      expect(await patterns.matchCards(match.id, userId, 30)).toEqual([
        { playIdx: 3, cardId: sample!.card_id, cardN: sample!.card_n },
      ]);
      const [again] = await database.query<{ seen_at: Date }>(
        `select seen_at from cd_user_cards where user_id = $1 and card_id = $2`,
        [userId, sample!.card_id],
      );
      expect(again!.seen_at.getTime()).toBe(firstSeen);
      // Người khác (không có thẻ) không thấy gì và không bị ghi.
      expect(await cards.cardAt({ match: stored, userId: strangerId, step: 3 })).toBeNull();
      expect(await patterns.matchCards(match.id, strangerId, 30)).toEqual([]);
      // Chỉ thẻ tới phiên đã mở: xem tới Phiên 2 thì chưa có thẻ ở Phiên 3.
      expect(await patterns.matchCards(match.id, userId, 2)).toEqual([]);
      // Phiên không có mẫu (Phiên 4 của cùng ván) không có thẻ.
      const [next] = await database.query<{ n: number }>(
        `select count(*)::int as n from fb_dataset_patterns where version = 1 and symbol = $1 and idx = $2`,
        [sample!.symbol, sample!.idx + 1],
      );
      const fourth = await cards.cardAt({ match: stored, userId, step: 4 });
      expect(fourth === null).toBe(next!.n === 0 || fourth === null);
      // Xoá ván kéo theo thẻ của ván (khoá ngoại ON DELETE CASCADE).
      await database.query(`delete from fb_matches where id = $1`, [match.id]);
      expect(await patterns.matchCards(match.id, userId, 30)).toEqual([]);
    } finally {
      await database.query(`delete from users where id = any($1::uuid[])`, [[userId, strangerId]]);
    }
  });
});
