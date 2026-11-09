import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BulletinDataService } from '../../src/modules/market-bulletins/bulletin-data.service.js';
import { BulletinSlotsService } from '../../src/modules/market-bulletins/bulletin-slots.service.js';
import { BulletinTrackingService } from '../../src/modules/market-bulletins/bulletin-tracking.service.js';
import { BulletinRepository } from '../../src/modules/market-bulletins/bulletin.repository.js';
import { BulletinPublicService } from '../../src/modules/market-bulletins/bulletins-public.service.js';
import { MarketBulletinsService } from '../../src/modules/market-bulletins/bulletins.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { DailyBarsService } from '../../src/modules/market-integration/daily-bars.service.js';
import type { DnseMarketProvider } from '../../src/modules/market-data/providers/dnse.provider.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';
import { FIXTURE_DATE, syntheticIndexBars, tradingDays } from './market-bulletin-fixture.js';

/**
 * Chạy SQL thật của bản tin v4 trên PostgreSQL (migration 0001-0044 đã áp). Bỏ qua nếu không đặt
 * BULLETIN_PG_URL trỏ vào một database dùng một lần, ví dụ
 *   BULLETIN_PG_URL=postgresql://postgres@127.0.0.1:55444/iqx_v2_bulletin npx vitest run \
 *     test/unit/market-bulletins.pg.test.ts
 * Các test chạy nối tiếp trên cùng trạng thái: tạo nháp, đẩy bộ lọc, kiểm tra, Public, Public lại, gỡ, theo dõi.
 */
const URL = process.env.BULLETIN_PG_URL;

pg.types.setTypeParser(1082, (value: string) => value);

class PgDatabase {
  constructor(readonly pool: pg.Pool) {}
  async query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return (await this.pool.query(text, [...values])).rows as T[];
  }
  async transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work({
        query: async (text, values) =>
          (await client.query(text, [...(values ?? [])])).rows as never,
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

const NOW = new Date('2026-11-06T09:30:00.000Z'); // 16:30 ICT, sau giờ chốt 15:15
const STOCKS = {
  T01: { prev: 50, last: 51, volume: 2_000_000 },
  T02: { prev: 30, last: 30.6, volume: 3_000_000 },
  T03: { prev: 20, last: 20, volume: 1_000_000 },
  T04: { prev: 40, last: 39, volume: 4_000_000 },
  T05: { prev: 10, last: 9.8, volume: 500_000 },
} as const;
const SYMBOLS = [...Object.keys(STOCKS), 'H01'];

type StockSeries = { d: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };

function stockSeries(prev: number, last: number, volume: number, sessions = 120): StockSeries {
  const d = tradingDays(FIXTURE_DATE, sessions);
  const c = d.map((_, index) => (index === d.length - 1 ? last : prev));
  return {
    d,
    o: c.map((value) => value),
    h: c.map((value) => value + 0.1),
    l: c.map((value) => value - 0.1),
    c,
    v: d.map((_, index) => (index === d.length - 1 ? volume : 1_000_000)),
  };
}

const admin: AuthenticatedUser = {
  id: randomUUID(),
  email: 'bulletin-admin@example.test',
  full_name: 'Quản trị bản tin',
  role: 'admin',
  status: 'active',
  is_email_verified: true,
};
const plain: AuthenticatedUser = {
  ...admin,
  id: randomUUID(),
  role: 'user',
  email: 'bulletin-user@example.test',
};
const audit: AuditContext = {
  adminId: admin.id,
  actorRole: 'admin',
  ip: null,
  userAgent: null,
  requestId: null,
};

describe.skipIf(!URL)('Bản tin thị trường v4 trên PostgreSQL', () => {
  let pool: pg.Pool;
  let db: SqlClient;
  let repo: BulletinRepository;
  let data: BulletinDataService;
  let tracking: BulletinTrackingService;
  let bulletins: MarketBulletinsService;
  let slots: BulletinSlotsService;
  let publicBulletins: BulletinPublicService;
  let filterId: string;
  let runPass: string;
  let runZero: string;
  let runOtherDefinition: string;
  let runOtherSession: string;
  const definition = { rules: [], note: 'bộ lọc thử' };

  async function insertRun(def: unknown, session: string, rows: unknown[]): Promise<string> {
    const [row] = (
      await pool.query(
        `insert into screener_runs
           (user_id, definition, definition_hash, as_of, data_source, calculation_version, registry_version,
            summary, results, session_date)
         values ($1, $2::jsonb, repeat('a', 64), now(), 'test', '1', '1', '{}'::jsonb, $3::jsonb, $4::date)
         returning id`,
        [admin.id, JSON.stringify(def), JSON.stringify(rows), session],
      )
    ).rows as Array<{ id: string }>;
    return row!.id;
  }

  const push = (
    user: AuthenticatedUser,
    slot: 1 | 2 | 3,
    overrides: Partial<Parameters<BulletinSlotsService['push']>[3]> = {},
  ) =>
    slots.push(
      user,
      FIXTURE_DATE,
      slot,
      {
        result_id: runPass,
        filter_id: filterId,
        filter_version: 1,
        picks: ['T03', 'T01', 'T02'],
        display_name: `Bộ lọc thử ${slot}`,
        conditions: ['Giá đóng cửa lớn hơn SMA20', 'RSI(14) lớn hơn 55'],
        ...overrides,
      },
      audit,
      NOW,
    );

  const writeBars = async (symbol: string, series: StockSeries) => {
    await pool.query(
      `insert into market_daily_bars (symbol, bars, bar_count, first_date, last_date, source)
       values ($1, $2::jsonb, $3, $4::date, $5::date, 'test')
       on conflict (symbol) do update
         set bars = excluded.bars, bar_count = excluded.bar_count, first_date = excluded.first_date,
             last_date = excluded.last_date`,
      [symbol, JSON.stringify(series), series.d.length, series.d[0], series.d.at(-1)],
    );
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 4 });
    const pgDatabase = new PgDatabase(pool);
    db = pgDatabase as unknown as SqlClient;
    const database = pgDatabase as unknown as DatabaseService;
    const indexBars = syntheticIndexBars(FIXTURE_DATE, 260);
    const dnse = {
      fetchDailyBars: vi.fn(async () => ({ bars: indexBars, rawEndpoint: 'test' })),
    } as unknown as DnseMarketProvider;
    repo = new BulletinRepository(database);
    const dailyBars = new DailyBarsService(database, dnse);
    data = new BulletinDataService(database, repo, dnse, dailyBars);
    tracking = new BulletinTrackingService(database, repo, dailyBars);
    bulletins = new MarketBulletinsService(database, repo, data, tracking);
    slots = new BulletinSlotsService(database, repo, bulletins, dailyBars);
    publicBulletins = new BulletinPublicService(database, repo, bulletins, tracking);

    await pool.query(`delete from market_tracking`);
    await pool.query(`delete from market_bulletins`);
    await pool.query(`delete from market_index_bars`);
    await pool.query(`delete from market_daily_bars where symbol = any($1::text[])`, [SYMBOLS]);
    await pool.query(`delete from symbols where symbol = any($1::text[])`, [SYMBOLS]);
    for (const user of [admin, plain])
      await pool.query(
        `insert into users (id, email, username, hashed_password, full_name, role)
         values ($1, $2, left('u' || replace($1::uuid::text, '-', ''), 30), 'x', $3, $4)`,
        [user.id, user.email, user.full_name, user.role],
      );
    for (const symbol of Object.keys(STOCKS))
      await pool.query(
        `insert into symbols (symbol, exchange, asset_type, is_index, is_active) values ($1, 'HOSE', 'stock', false, true)`,
        [symbol],
      );
    await pool.query(
      `insert into symbols (symbol, exchange, asset_type, is_index, is_active) values ('H01', 'HNX', 'stock', false, true)`,
    );
    for (const [symbol, spec] of Object.entries(STOCKS))
      await writeBars(symbol, stockSeries(spec.prev, spec.last, spec.volume));
    await writeBars('H01', stockSeries(10, 11, 1_000_000));

    const [filter] = (
      await pool.query(
        `insert into strategy_filters (user_id, name, current_version) values ($1, 'Bộ lọc tăng giá', 1) returning id`,
        [admin.id],
      )
    ).rows as Array<{ id: string }>;
    filterId = filter!.id;
    await pool.query(
      `insert into filter_versions (filter_id, version, definition, definition_hash)
       values ($1, 1, $2::jsonb, repeat('b', 64))`,
      [filterId, JSON.stringify(definition)],
    );
    const passedRows = Object.keys(STOCKS).map((symbol) => ({ symbol, passed: true }));
    runPass = await insertRun(definition, FIXTURE_DATE, [
      ...passedRows,
      { symbol: 'H01', passed: false },
    ]);
    runZero = await insertRun(definition, FIXTURE_DATE, [{ symbol: 'H01', passed: false }]);
    runOtherDefinition = await insertRun(
      { ...definition, note: 'đã sửa' },
      FIXTURE_DATE,
      passedRows,
    );
    runOtherSession = await insertRun(definition, tradingDays(FIXTURE_DATE, 2)[0]!, passedRows);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`delete from market_tracking`);
    await pool.query(`delete from market_bulletins`);
    await pool.query(`delete from market_index_bars`);
    await pool.query(`delete from market_daily_bars where symbol = any($1::text[])`, [SYMBOLS]);
    await pool.query(`delete from symbols where symbol = any($1::text[])`, [SYMBOLS]);
    await pool.query(`delete from users where id = any($1::uuid[])`, [[admin.id, plain.id]]);
    await pool.end();
  });

  it('tạo bản nháp khi VN-Index có nến phiên đã đóng cửa và điền số liệu thị trường HOSE', async () => {
    const first = await data.ensureDraftAndData(NOW);
    expect(first).toMatchObject({ status: 'ok', date: FIXTURE_DATE, created: true, ready: true });
    const row = await repo.find(db, FIXTURE_DATE);
    expect(row?.status).toBe('draft');
    expect(row?.data_ready_at).not.toBeNull();
    // T01 và T02 tăng, T03 đứng, T04 và T05 giảm; mã HNX không tính vào HOSE.
    expect(row?.market_stats).toMatchObject({ advances: 2, unchanged: 1, declines: 2, symbols: 5 });
    const expected =
      (51 * 2_000_000 + 30.6 * 3_000_000 + 20 * 1_000_000 + 39 * 4_000_000 + 9.8 * 500_000) / 1e6;
    expect(row?.market_stats?.value_bn).toBeCloseTo(expected, 6);
    // Gọi lại không tạo thêm và không đổi giờ chốt.
    const second = await data.ensureDraftAndData(NOW);
    expect(second).toMatchObject({ status: 'ok', created: false, ready: true });
    expect((await repo.find(db, FIXTURE_DATE))?.data_ready_at).toBe(row?.data_ready_at);
  });

  it('bản nháp mới chưa Public được: thiếu nhận định và ba ô bộ lọc', async () => {
    const detail = await bulletins.detail(FIXTURE_DATE, NOW);
    expect(detail.data_ready).toBe(true);
    expect(detail.metrics?.close).toBeGreaterThan(0);
    const codes = detail.checks.items.map((item) => item.code);
    expect(codes.filter((code) => code === 'comment_empty')).toHaveLength(3);
    expect(codes.filter((code) => code === 'slot_not_pushed')).toHaveLength(3);
    expect(detail.can_publish).toBe(false);
    await expect(bulletins.publish(admin, FIXTURE_DATE, audit, NOW)).rejects.toMatchObject({
      response: { code: 'BULLETIN_CHECKS_FAILED' },
    });
  });

  it('Đẩy vào bản tin: chặn đúng điều kiện của spec §4.2 và §6', async () => {
    await expect(push(plain, 1)).rejects.toMatchObject({ status: 403 });
    await expect(push(admin, 1, { filter_version: 9 })).rejects.toMatchObject({
      response: { code: 'FILTER_NOT_SAVED' },
    });
    await expect(push(admin, 1, { result_id: runOtherDefinition })).rejects.toMatchObject({
      response: { code: 'RESULT_NOT_OF_SAVED_VERSION' },
    });
    await expect(push(admin, 1, { result_id: runOtherSession })).rejects.toMatchObject({
      response: { code: 'SESSION_MISMATCH' },
    });
    await expect(
      push(admin, 1, {
        picks: ['T01', 'T02', 'T03', 'T04', 'T05', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'TOO_MANY_PICKS' },
    });
    await expect(push(admin, 1, { picks: ['T01', 'H01'] })).rejects.toMatchObject({
      response: { code: 'PICKS_NOT_IN_RESULT' },
    });
    await expect(push(admin, 1, { picks: [] })).rejects.toMatchObject({
      response: { code: 'PICKS_EMPTY' },
    });
    await expect(push(admin, 2, { result_id: runZero, picks: ['T01'] })).rejects.toMatchObject({
      response: { code: 'PICKS_NOT_IN_RESULT' },
    });
  });

  it('Đẩy hợp lệ: lưu bản chụp xếp theo GTGD, biểu đồ của mã lớn nhất, đẩy lại thì thay và ghi lịch sử', async () => {
    const first = await push(admin, 1);
    expect(first).toMatchObject({ slot: 1, picks: 3, passed_count: 5 });
    const snapshot = (await repo.slots(db, FIXTURE_DATE))[1]!;
    expect(snapshot.picks.map((pick) => pick.symbol)).toEqual(['T01', 'T02', 'T03']);
    expect(snapshot.picks[0]).toMatchObject({ symbol: 'T01', close: 51 });
    expect(snapshot.picks[0]!.value_bn).toBeCloseTo(102, 6);
    expect(snapshot.picks[0]!.change_pct).toBeCloseTo(2, 6);
    expect(snapshot.chart?.symbol).toBe('T01');
    expect(snapshot.chart?.d.at(-1)).toBe(FIXTURE_DATE);
    expect(snapshot.chart?.d.length).toBeLessThanOrEqual(109);
    expect(snapshot.filter_name).toBe('Bộ lọc tăng giá');

    await push(admin, 1, { picks: ['T02'], display_name: 'Tên mới' });
    const replaced = (await repo.slots(db, FIXTURE_DATE))[1]!;
    expect(replaced.picks.map((pick) => pick.symbol)).toEqual(['T02']);
    expect(replaced.display_name).toBe('Tên mới');
    const [{ n }] = (
      await pool.query(
        `select jsonb_array_length(history) as n from market_bulletin_slots where trade_date = $1 and slot = 1`,
        [FIXTURE_DATE],
      )
    ).rows as Array<{ n: number }>;
    expect(n).toBe(2);

    await push(admin, 1);
    // Ô 2: bộ lọc không có mã đạt, đẩy với 0 mã.
    expect(await push(admin, 2, { result_id: runZero, picks: [] })).toMatchObject({
      picks: 0,
      passed_count: 0,
    });
    // Ô 3: một mã.
    await push(admin, 3, { picks: ['T04'] });
    const context = await bulletins.pushContext();
    expect(context.trade_date).toBe(FIXTURE_DATE);
    expect(context.slots.map((slot) => slot.pushed?.picks)).toEqual([3, 0, 1]);
  });

  it('lưu nhận định và kiểm tra: lỗi mức sai chiều, hết lỗi thì Public được', async () => {
    const model = (await bulletins.detail(FIXTURE_DATE, NOW)).metrics!;
    const close = Math.round(model.close);
    const content = {
      trend: 'Xu hướng tăng ngắn hạn vẫn được giữ.',
      momentum: 'Động lượng cải thiện so với những phiên trước.',
      liquidity: 'Thanh khoản ở mức khá.',
    };
    const wrong = await bulletins.saveContent(admin, FIXTURE_DATE, {
      ...content,
      levels: {
        r1: close + 30,
        r2: null,
        s1: close + 10,
        s2: null,
        pa: null,
        pt: null,
        na: null,
        nt: null,
      },
    });
    expect(wrong.checks.errors).toBeGreaterThan(0);
    expect(wrong.checks.items.some((item) => /phải thấp hơn giá đóng cửa/.test(item.message))).toBe(
      true,
    );
    expect(wrong.can_publish).toBe(false);

    const right = await bulletins.saveContent(admin, FIXTURE_DATE, {
      ...content,
      levels: {
        r1: close + 30,
        r2: null,
        s1: close - 30,
        s2: null,
        pa: null,
        pt: null,
        na: null,
        nt: null,
      },
    });
    expect(right.checks.errors).toBe(0);
    expect(right.can_publish).toBe(true);
    expect(right.suggestions.length).toBeGreaterThan(0);
  });

  it('Public: ghi hai file PDF, theo dõi các mã, khoá danh sách mã', async () => {
    const detail = await bulletins.publish(admin, FIXTURE_DATE, audit, NOW);
    expect(detail.status).toBe('public');
    expect(detail.published_revision).toBe(1);
    expect(detail.files.map((file) => [file.variant, file.page_count, file.revision])).toEqual([
      ['desktop', 2, 1],
      ['mobile', 5, 1],
    ]);
    expect(detail.slots_locked).toBe(true);
    expect(detail.has_changes).toBe(false);

    const latest = await publicBulletins.latest();
    expect(latest.bulletin?.trade_date).toBe(FIXTURE_DATE);
    expect(latest.bulletin?.summary).toMatchObject({ pick_count: 4, slot_counts: [3, 0, 1] });
    const desktop = await publicBulletins.file(FIXTURE_DATE, 'desktop', 1);
    expect(desktop.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(desktop.file_name).toBe(`IQX-Ban-Tin-${FIXTURE_DATE}.pdf`);
    expect((await publicBulletins.file(FIXTURE_DATE, 'mobile', 1)).file_name).toBe(
      `IQX-Ban-Tin-${FIXTURE_DATE}-Dien-Thoai.pdf`,
    );
    await expect(publicBulletins.file(FIXTURE_DATE, 'desktop', 2)).rejects.toMatchObject({
      status: 404,
    });

    // Mã vào theo dõi với ngày đề xuất là phiên bản tin, mã lặp giữ một dòng.
    const view = await tracking.view(null);
    expect(view.items.map((item) => item.symbol).sort()).toEqual(
      ['T01', 'T03', 'T04', 'T02'].sort(),
    );
    expect(view.items.every((item) => item.sessions === 0 && item.is_today)).toBe(true);
    expect(view.items.find((item) => item.symbol === 'T04')?.slot).toBe(3);
    expect(view.summary).toMatchObject({
      tracking_count: 4,
      today_count: 4,
      profit_base: 0,
      average_return: null,
    });
    expect((await tracking.view(3)).items.map((item) => item.symbol)).toEqual(['T04']);

    // Danh sách mã đã khoá; Public lại khi chưa sửa gì bị từ chối.
    await expect(push(admin, 1)).rejects.toMatchObject({ response: { code: 'BULLETIN_LOCKED' } });
    await expect(bulletins.publish(admin, FIXTURE_DATE, audit, NOW)).rejects.toMatchObject({
      response: { code: 'BULLETIN_NO_CHANGES' },
    });
  });

  it('Public lại sau khi sửa: revision mới, file cũ không còn được phục vụ', async () => {
    const before = await bulletins.detail(FIXTURE_DATE, NOW);
    const edited = await bulletins.saveContent(admin, FIXTURE_DATE, {
      ...before.content,
      momentum: 'Động lượng tiếp tục cải thiện.',
    });
    expect(edited.has_changes).toBe(true);
    expect(edited.can_publish).toBe(true);
    const again = await bulletins.publish(
      admin,
      FIXTURE_DATE,
      audit,
      new Date(NOW.getTime() + 60_000),
    );
    expect(again.published_revision).toBe(2);
    expect(again.updated_at).not.toBeNull();
    expect(again.history.map((entry) => entry.action)).toEqual(['publish', 'republish']);
    await expect(publicBulletins.file(FIXTURE_DATE, 'desktop', 1)).rejects.toMatchObject({
      status: 404,
    });
    expect((await publicBulletins.file(FIXTURE_DATE, 'desktop', 2)).revision).toBe(2);
    // Mã theo dõi không đổi sau Public lại.
    expect((await tracking.view(null)).items).toHaveLength(4);
  });

  it('Gỡ: web không còn bản tin, mã của bản bị gỡ rời theo dõi, mở khoá ô; Public lại thêm mã với ngày cũ', async () => {
    const removed = await bulletins.unpublish(admin, FIXTURE_DATE, audit, NOW);
    expect(removed.status).toBe('unpublic');
    expect(removed.slots_locked).toBe(false);
    expect((await publicBulletins.latest()).bulletin).toBeNull();
    await expect(publicBulletins.byDate(FIXTURE_DATE)).rejects.toMatchObject({ status: 404 });
    expect((await tracking.view(null)).items).toHaveLength(0);
    const [{ n }] = (
      await pool.query(
        `select count(*)::int as n from market_tracking where exit_reason = 'unpublished'`,
      )
    ).rows as Array<{ n: number }>;
    expect(n).toBe(4);
    await expect(bulletins.unpublish(admin, FIXTURE_DATE, audit, NOW)).rejects.toMatchObject({
      response: { code: 'BULLETIN_NOT_PUBLIC' },
    });
    // Mở khoá: đẩy lại được.
    await push(admin, 3, { picks: ['T04', 'T05'] });
    const republished = await bulletins.publish(admin, FIXTURE_DATE, audit, NOW);
    expect(republished.status).toBe('public');
    expect(republished.published_revision).toBe(3);
    const view = await tracking.view(null);
    expect(view.items.map((item) => item.symbol).sort()).toEqual([
      'T01',
      'T02',
      'T03',
      'T04',
      'T05',
    ]);
    expect(view.items.every((item) => item.first_trade_date === FIXTURE_DATE)).toBe(true);
  });

  it('Theo dõi: dừng lỗ 7% và quá 20 phiên rời danh sách, mã đã rời không hiện ở đâu', async () => {
    const after = tradingDays('2026-12-31', 80)
      .filter((date) => date > FIXTURE_DATE)
      .slice(0, 22);
    // Chỉ số có thêm 22 phiên mới.
    await repo.upsertIndexBars(
      db,
      'VNINDEX',
      after.map((date, index) => ({
        date,
        open: 1700 + index,
        high: 1710 + index,
        low: 1690 + index,
        close: 1700 + index,
        volume: 700_000_000,
      })),
    );
    // T02 chạm dừng lỗ ở phiên thứ 5 (đóng cửa 28 <= 93% của 30,6 = 28,458); mã khác đi ngang.
    const extend = async (symbol: string, closeAt: (index: number) => number) => {
      const spec = STOCKS[symbol as keyof typeof STOCKS];
      const series = stockSeries(spec.prev, spec.last, spec.volume);
      after.forEach((date, index) => {
        const close = closeAt(index);
        series.d.push(date);
        series.o.push(close);
        series.h.push(close + 0.1);
        series.l.push(close - 0.1);
        series.c.push(close);
        series.v.push(1_000_000);
      });
      await writeBars(symbol, series);
    };
    await extend('T02', (index) => (index >= 4 ? 28 : 31));
    for (const symbol of ['T01', 'T03', 'T04', 'T05'])
      await extend(symbol, () => STOCKS[symbol as keyof typeof STOCKS].last);

    const outcome = await tracking.evaluate();
    expect(outcome.exited).toBe(5);
    const rows = (
      await pool.query(
        `select symbol, exit_trade_date, exit_reason from market_tracking where exit_reason <> 'unpublished' order by symbol`,
      )
    ).rows as Array<{ symbol: string; exit_trade_date: string; exit_reason: string }>;
    const reasons = Object.fromEntries(
      rows.map((row) => [row.symbol, [row.exit_trade_date, row.exit_reason]]),
    );
    expect(reasons.T02).toEqual([after[4], 'stop_7']);
    for (const symbol of ['T01', 'T03', 'T04', 'T05'])
      expect(reasons[symbol]).toEqual([after[20], '20_sessions']);
    expect((await tracking.view(null)).items).toHaveLength(0);
    // Mã đã rời được đề xuất lại thì là dòng mới (không có dòng đang theo dõi nào cản).
    expect(await tracking.activeRows()).toHaveLength(0);
  });

  it('Bản tin quá 6 tháng bị xoá cùng file và ô bộ lọc; dòng theo dõi vẫn còn', async () => {
    const farFuture = new Date('2027-07-01T00:00:00.000Z');
    expect(await bulletins.sweepExpired(farFuture)).toEqual([FIXTURE_DATE]);
    for (const table of ['market_bulletins', 'market_bulletin_files', 'market_bulletin_slots']) {
      const [{ n }] = (await pool.query(`select count(*)::int as n from ${table}`)).rows as Array<{
        n: number;
      }>;
      expect(n).toBe(0);
    }
    const [{ kept }] = (await pool.query(`select count(*)::int as kept from market_tracking`))
      .rows as Array<{ kept: number }>;
    expect(kept).toBeGreaterThan(0);
  });
});
