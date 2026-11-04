import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FlashbackMarketDataPort } from '../../src/modules/flashback/flashback.market-data.js';
import { FLASHBACK_CLOCK } from '../../src/modules/flashback/flashback.service.js';
import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import { compareRank } from '../../src/modules/flashback/flashback-rooms.logic.js';
import { FlashbackRoomsService } from '../../src/modules/flashback/flashback-rooms.service.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// Flashback v2 · Phòng chơi trên PostgreSQL thật với migration 0033: chọn mã VN30 và giai đoạn
// bằng bộ dựng đề v1.2 (nguồn nến giả lập, có ngày thật), trừ cược một lần, chốt ván và trả xu
// idempotent, hết giờ tính ở phiên cuối, ràng buộc ledger và khoá khi vào phòng song song.
const BASE = '/api/v2/flashback';
const VN30 = [
  'ACB',
  'BCM',
  'BID',
  'BVH',
  'CTG',
  'FPT',
  'GAS',
  'GVR',
  'HDB',
  'HPG',
  'MBB',
  'MSN',
  'MWG',
  'PLX',
  'POW',
  'SAB',
  'SHB',
  'SSB',
  'SSI',
  'STB',
  'TCB',
  'TPB',
  'VCB',
  'VHM',
  'VIB',
  'VIC',
  'VJC',
  'VNM',
  'VPB',
  'VRE',
];

/** Mọi ngày thường từ 2010 tới hôm nay, giá dao động ±2%/phiên quanh 50.000đ, thanh khoản lớn. */
function syntheticBars(symbol: string, from: string, to: string): FlashbackBar[] {
  const bars: FlashbackBar[] = [];
  const seed = symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let price = symbol === 'VNINDEX' ? 1_000 : 50_000;
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let day = Date.UTC(2010, 0, 4), index = 0; day <= end; day += 86_400_000) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    index += 1;
    price *= 1 + 0.02 * Math.sin(index * 1.7 + seed);
    const date = new Date(day).toISOString().slice(0, 10);
    if (date < from) continue;
    const close = Math.round(price);
    bars.push({ d: date, o: close, h: close, l: close, c: close, v: 1_000_000 });
  }
  return bars;
}

const market: FlashbackMarketDataPort = {
  dailyBars: async (symbol, from, to) => syntheticBars(symbol, from, to),
  dailySeries: async (symbol, from, to) => ({
    bars: syntheticBars(symbol, from, to),
    source: 'TEST:dong:adjusted',
  }),
  vn30Symbols: async () => [...VN30],
};

type Session = Awaited<ReturnType<typeof registerAndLogin>>;

describe('system acceptance: Flashback v2 · Phòng chơi', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  const clock = { at: new Date() };

  beforeAll(async () => {
    stack = await startSystemStack(
      {},
      {
        overrideProviders: [
          { token: 'FLASHBACK_MARKET_DATA', value: market },
          { token: FLASHBACK_CLOCK, value: { now: () => clock.at } },
        ],
      },
    );
    app = stack.app;
  }, 180_000);

  afterAll(async () => {
    await stack?.close();
  });

  const call = (session: Session, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({
      method,
      url: `${BASE}/${url}`,
      headers: authHeader(session.accessToken),
      ...(payload ? { payload } : {}),
    });

  /** Người chơi bấm "Sẵn sàng" (chủ phòng bắt đầu được ván khi mọi người đã sẵn sàng). */
  const ready = async (sessions: readonly Session[], roomId: string) => {
    for (const session of sessions) {
      const response = await call(session, 'POST', `rooms/${roomId}/ready`, { ready: true });
      expect(response.statusCode, response.body).toBe(200);
    }
  };

  async function user(name: string, xu: number): Promise<Session> {
    const session = await registerAndLogin(app, name);
    await stack.query(
      `insert into coin_wallets (user_id, balance, last_seq) values ($1, $2, 0)
       on conflict (user_id) do update set balance = excluded.balance`,
      [session.id, xu],
    );
    return session;
  }

  const balance = async (session: Session) =>
    Number(
      (
        await stack.query<{ balance: string }>(
          'select balance::text as balance from coin_wallets where user_id = $1',
          [session.id],
        )
      )[0]?.balance ?? 0,
    );

  async function playToEnd(
    session: Session,
    matchId: string,
    buyAt?: { step: number; qty: number },
  ) {
    const snapshot = (await call(session, 'GET', `matches/${matchId}`)).json() as {
      my_step: number;
      play_bars: number;
    };
    for (let step = snapshot.my_step; step <= snapshot.play_bars; step += 1) {
      if (buyAt && buyAt.step === step) {
        const order = await call(session, 'POST', `matches/${matchId}/orders`, {
          side: 'buy',
          qty: buyAt.qty,
        });
        expect(order.statusCode, order.body).toBe(200);
      }
      if (step < snapshot.play_bars) {
        const next = await call(session, 'POST', `matches/${matchId}/next`);
        expect(next.statusCode, next.body).toBe(200);
      }
    }
  }

  it('4 người cược 100: trừ cược một lần, cùng một bộ nến VN30, không lộ mã/ngày, người thắng +400, chạy lại không cộng hai lần', async () => {
    const players = [
      await user('fb-a', 1000),
      await user('fb-b', 1000),
      await user('fb-c', 1000),
      await user('fb-d', 1000),
    ];
    const [a, b, c, d] = players as [Session, Session, Session, Session];
    const created = await call(a, 'POST', 'rooms', {
      view_bars: 40,
      play_bars: 30,
      minutes: 10,
      max_players: 4,
      stake_xu: 100,
    });
    expect(created.statusCode, created.body).toBe(200);
    const room = created.json() as { id: string };
    expect(room.id).toMatch(/^\d{6}$/);
    for (const session of [b, c, d]) {
      const joined = await call(session, 'POST', `rooms/${room.id}/join`, {});
      expect(joined.statusCode, joined.body).toBe(200);
    }
    const lobby = (await call(b, 'GET', 'rooms?status=waiting')).json() as {
      rooms: { id: string; member_count: number; full: boolean }[];
    };
    expect(lobby.rooms.find((item) => item.id === room.id)).toMatchObject({
      member_count: 4,
      full: true,
    });
    expect((await call(b, 'POST', `rooms/${room.id}/start`)).statusCode).toBe(403);
    await ready([b, c, d], room.id);

    const started = await call(a, 'POST', `rooms/${room.id}/start`);
    expect(started.statusCode, started.body).toBe(200);
    const match = (
      started.json() as {
        match: {
          match_id: string;
          history_bars: unknown[];
          warmup_bars: unknown[];
          pot_xu: number;
        };
      }
    ).match;
    expect(match.history_bars).toHaveLength(40);
    expect(match.warmup_bars).toHaveLength(252);
    expect(match.pot_xu).toBe(400);
    const [row] = await stack.query<{ symbol: string; bars: number; start_date: string }>(
      `select symbol, jsonb_array_length(bars)::int as bars, to_char(start_date, 'YYYY-MM-DD') as start_date
         from fb_matches where id = $1`,
      [match.match_id],
    );
    expect(VN30).toContain(row!.symbol);
    expect(row!.bars).toBe(70);
    expect(row!.start_date >= '2012-01-01').toBe(true);
    // Không có mã, ngày phiên thật trong phản hồi bắt đầu và ảnh chụp ván của người khác.
    const snapshotB = await call(b, 'GET', `matches/${match.match_id}`);
    for (const body of [started.body, snapshotB.body]) {
      expect(body).not.toContain(`"${row!.symbol}"`);
      expect(body).not.toContain(row!.start_date);
      expect(body).not.toContain('TEST:dong');
    }
    for (const session of players) expect(await balance(session)).toBe(900);
    expect(
      await stack.query(
        `select 1 from coin_ledger where kind = 'flashback_stake' and ref->>'match_id' = $1`,
        [match.match_id],
      ),
    ).toHaveLength(4);
    // Mọi người cùng một ván, cùng một bộ nến.
    expect(
      await stack.query(
        'select count(distinct match_id)::int as n from fb_entries where match_id = $1',
        [match.match_id],
      ),
    ).toEqual([{ n: 1 }]);

    await playToEnd(a, match.match_id, { step: 0, qty: 50 });
    for (const session of players) {
      if (session !== a) await playToEnd(session, match.match_id);
      // Kết quả chỉ có sau khi mọi người hoàn thành.
      expect((await call(session, 'GET', `matches/${match.match_id}/result`)).statusCode).toBe(409);
      const finished = await call(session, 'POST', `matches/${match.match_id}/finish`);
      expect(finished.statusCode, finished.body).toBe(200);
    }
    const result = await call(c, 'GET', `matches/${match.match_id}/result`);
    expect(result.statusCode, result.body).toBe(200);
    const view = result.json() as {
      symbol: string;
      start_date: string;
      rows: { user_id: string; rank: number; win_xu: number }[];
    };
    expect(view.symbol).toBe(row!.symbol);
    expect(view.start_date).toBe(row!.start_date);
    const winners = view.rows.filter((item) => item.rank === 1);
    const pnlOfA = view.rows.find((item) => item.user_id === a.id)!;
    // Giá giả lập có thể lên hoặc xuống: hoặc a thắng một mình, hoặc b/c/d hoà ở 0%.
    if (pnlOfA.rank === 1) {
      expect(winners).toHaveLength(1);
      expect(pnlOfA.win_xu).toBe(400);
      expect(await balance(a)).toBe(1300);
    } else {
      expect(winners.map((item) => item.win_xu)).toEqual([133, 133, 133]);
      expect(await balance(a)).toBe(900);
    }

    const service = app.get(FlashbackRoomsService);
    clock.at = new Date(clock.at.getTime() + 3_600_000);
    expect(await service.settle(match.match_id)).toBe(false);
    await service.sweep();
    expect(
      await stack.query(
        `select count(*)::int as n from coin_ledger where kind in ('flashback_win', 'flashback_refund') and ref->>'match_id' = $1`,
        [match.match_id],
      ),
    ).toEqual([{ n: winners.length }]);
    clock.at = new Date();
  });

  it('hết giờ: chơi 30 phiên, mua ở phiên 10, dừng ở phiên 20 → tính theo giá phiên 30, giữ nguyên cổ phiếu', async () => {
    const solo = await user('fb-solo', 0);
    const created = await call(solo, 'POST', 'rooms', {
      view_bars: 30,
      play_bars: 30,
      minutes: 5,
      max_players: 1,
    });
    expect(created.statusCode, created.body).toBe(200);
    const roomId = (created.json() as { id: string }).id;
    const started = await call(solo, 'POST', `rooms/${roomId}/start`);
    expect(started.statusCode, started.body).toBe(200);
    const matchId = (started.json() as { match: { match_id: string; stake_xu: number } }).match
      .match_id;
    for (let step = 0; step < 20; step += 1) {
      if (step === 10) {
        const order = await call(solo, 'POST', `matches/${matchId}/orders`, {
          side: 'buy',
          qty: 100,
        });
        expect(order.statusCode, order.body).toBe(200);
      }
      expect((await call(solo, 'POST', `matches/${matchId}/next`)).statusCode).toBe(200);
    }
    clock.at = new Date(clock.at.getTime() + 5 * 60_000 + 1_000);
    const state = await call(solo, 'GET', `matches/${matchId}/state`);
    expect(state.json()).toMatchObject({ status: 'ended', remaining_ms: 0 });
    const [entry] = await stack.query<{
      step: number;
      final_nav: string;
      cash: string;
      auto_finished: boolean;
      qty: number;
    }>(
      `select e.step, e.final_nav::text as final_nav, e.cash::text as cash, e.auto_finished,
              (select sum(qty)::int from fb_lots l where l.entry_id = e.id) as qty
         from fb_entries e where e.match_id = $1`,
      [matchId],
    );
    const [bars] = await stack.query<{ close30: number }>(
      `select (bars->59->>'c')::numeric::int as close30 from fb_matches where id = $1`,
      [matchId],
    );
    expect(entry).toMatchObject({ step: 30, auto_finished: true, qty: 100 });
    expect(BigInt(entry!.final_nav)).toBe(BigInt(entry!.cash) + 100n * BigInt(bars!.close30));
    const result = await call(solo, 'GET', `matches/${matchId}/result`);
    expect(result.json()).toMatchObject({ title: 'Kết quả', solo: true, end_reason: 'timeout' });
    expect(
      // Chơi 1 mình không cược, không thưởng: ví chỉ có khoản tặng đăng ký (migration 0034).
      await stack.query(
        `select 1 from coin_ledger
          where user_id = $1 and kind in ('flashback_stake', 'flashback_win', 'flashback_refund')`,
        [solo.id],
      ),
    ).toHaveLength(0);
    clock.at = new Date();
  });

  it('ledger: mỗi (ván, người, loại) một dòng và dấu của delta đúng loại', async () => {
    const holder = await user('fb-ledger', 100);
    const matchId = '00000000-0000-4000-8000-0000000000aa';
    await stack.query(
      `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values ($1, 101, 'flashback_win', 10, 110, 'k1', jsonb_build_object('match_id', $2::text), 't')`,
      [holder.id, matchId],
    );
    await expect(
      stack.query(
        `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
         values ($1, 102, 'flashback_win', 10, 120, 'k2', jsonb_build_object('match_id', $2::text), 't')`,
        [holder.id, matchId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      stack.query(
        `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
         values ($1, 103, 'flashback_stake', 10, 120, 'k3', '{}'::jsonb, 't')`,
        [holder.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('vào phòng song song: phòng 2 người chỉ nhận một người; một tài khoản không tạo được hai phòng cùng lúc', async () => {
    const owner = await user('fb-own', 100);
    const x = await user('fb-x', 100);
    const y = await user('fb-y', 100);
    const created = await call(owner, 'POST', 'rooms', { max_players: 2, stake_xu: 10 });
    const roomId = (created.json() as { id: string }).id;
    const [jx, jy] = await Promise.all([
      call(x, 'POST', `rooms/${roomId}/join`, {}),
      call(y, 'POST', `rooms/${roomId}/join`, {}),
    ]);
    expect([jx.statusCode, jy.statusCode].sort()).toEqual([200, 409]);
    expect([jx, jy].find((r) => r.statusCode === 409)!.json()).toMatchObject({
      error: { code: 'ROOM_FULL' },
    });

    const z = await user('fb-z', 100);
    const both = await Promise.all([call(z, 'POST', 'rooms', {}), call(z, 'POST', 'rooms', {})]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      await stack.query(
        'select count(*)::int as n from fb_room_members where user_id = $1 and left_at is null',
        [z.id],
      ),
    ).toEqual([{ n: 1 }]);
  });

  it('sẵn sàng và đuổi khỏi phòng (migration 0042): chặn bắt đầu, xoá khi bắt đầu, đuổi không đổi xu, chặn vào lại 10 phút', async () => {
    const [a, b, c] = [
      await user('rk-a', 500),
      await user('rk-b', 500),
      await user('rk-c', 500),
    ] as [Session, Session, Session];
    const room = (
      await call(a, 'POST', 'rooms', { max_players: 4, stake_xu: 50 })
    ).json() as { id: string };
    for (const session of [b, c]) await call(session, 'POST', `rooms/${room.id}/join`, {});
    const readyAt = (session: Session) =>
      stack.query<{ ready_at: Date | null }>(
        'select ready_at from fb_room_members where user_id = $1 and left_at is null',
        [session.id],
      );

    // Chưa ai sẵn sàng: 409 FB_PLAYERS_NOT_READY, chưa có ván, chưa trừ xu.
    const blocked = await call(a, 'POST', `rooms/${room.id}/start`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: { code: 'FB_PLAYERS_NOT_READY', message: 'Còn 2 người chơi chưa sẵn sàng' },
    });
    expect(await balance(b)).toBe(500);

    const readied = await call(b, 'POST', `rooms/${room.id}/ready`, { ready: true });
    expect(readied.statusCode, readied.body).toBe(200);
    // Thứ tự thành viên theo joined_at; đồng hồ giả của test này đứng yên nên so theo ID.
    expect(
      Object.fromEntries(
        (readied.json() as { members: { user_id: string; ready: boolean }[] }).members.map(
          (member) => [member.user_id, member.ready],
        ),
      ),
    ).toEqual({ [a.id]: true, [b.id]: true, [c.id]: false });
    expect((await readyAt(b))[0]!.ready_at).not.toBeNull();
    // Body sai bị từ chối ở lớp validate.
    expect((await call(b, 'POST', `rooms/${room.id}/ready`, { ready: 'yes' })).statusCode).toBe(422);

    // Chỉ chủ phòng đuổi; không tự đuổi mình.
    expect((await call(b, 'POST', `rooms/${room.id}/kick`, { user_id: c.id })).statusCode).toBe(403);
    expect((await call(a, 'POST', `rooms/${room.id}/kick`, { user_id: a.id })).statusCode).toBe(409);

    const kicked = await call(a, 'POST', `rooms/${room.id}/kick`, { user_id: c.id });
    expect(kicked.statusCode, kicked.body).toBe(200);
    expect(
      (kicked.json() as { members: { user_id: string }[] }).members.map((m) => m.user_id).sort(),
    ).toEqual([a.id, b.id].sort());
    expect(await balance(c)).toBe(500);
    expect(
      await stack.query(
        `select left_reason from fb_room_members where user_id = $1 order by joined_at desc limit 1`,
        [c.id],
      ),
    ).toEqual([{ left_reason: 'kicked' }]);
    expect((await call(c, 'GET', `rooms/${room.id}`)).statusCode).toBe(403);
    const mine = (await call(c, 'GET', 'rooms/me')).json() as {
      room: unknown;
      notice: string | null;
      kicked: boolean;
    };
    expect(mine).toEqual({
      room: null,
      notice: 'Bạn đã bị chủ phòng mời ra khỏi phòng.',
      kicked: true,
    });
    expect(((await call(c, 'GET', 'rooms/me')).json() as { kicked: boolean }).kicked).toBe(false);
    const rejoin = await call(c, 'POST', `rooms/${room.id}/join`, {});
    expect(rejoin.statusCode).toBe(409);
    expect(rejoin.json()).toMatchObject({ error: { code: 'FB_KICKED' } });

    // Bắt đầu: chỉ còn a và b, cược 50 trừ của hai người; sẵn sàng bị xoá.
    const started = await call(a, 'POST', `rooms/${room.id}/start`);
    expect(started.statusCode, started.body).toBe(200);
    expect(await balance(b)).toBe(450);
    expect(await balance(c)).toBe(500);
    expect(
      await stack.query(
        'select ready_at from fb_room_members where user_id = any($1::uuid[]) and left_at is null',
        [[a.id, b.id]],
      ),
    ).toEqual([{ ready_at: null }, { ready_at: null }]);
    // Đang chơi: không đuổi, không bấm sẵn sàng.
    expect((await call(a, 'POST', `rooms/${room.id}/kick`, { user_id: b.id })).statusCode).toBe(409);
    expect((await call(b, 'POST', `rooms/${room.id}/ready`, { ready: true })).statusCode).toBe(409);

    // Chơi xong ván: để tác vụ định kỳ của các test sau (đẩy đồng hồ giả) không chốt ván này.
    const matchId = (started.json() as { match: { match_id: string } }).match.match_id;
    for (const session of [a, b]) {
      await playToEnd(session, matchId);
      expect((await call(session, 'POST', `matches/${matchId}/finish`)).statusCode).toBe(200);
    }
  });

  // ---------------------------------------------------------------- v2.1: cấp, điểm, hạng, lịch sử

  type StatsRow = {
    user_id: string;
    points: number;
    games: number;
    wins: number;
    reached_points_at: Date;
  };

  const allStats = () =>
    stack.query<StatsRow>(
      `select user_id::text as user_id, points, games, wins, reached_points_at
         from fb_player_stats where games > 0`,
    );

  const sortedByRank = (rows: StatsRow[]) =>
    rows
      .map((row) => ({
        userId: row.user_id,
        points: row.points,
        wins: row.wins,
        reachedPointsAt: new Date(row.reached_points_at),
      }))
      .sort(compareRank);

  it('v2.1 điểm cấp: thắng +10, thua +3, ghi vào fb_entries và fb_player_stats một lần; chạy lại không cộng thêm', async () => {
    const [a, b, c] = [
      await user('lv-a', 1000),
      await user('lv-b', 1000),
      await user('lv-c', 1000),
    ] as [Session, Session, Session];
    const created = await call(a, 'POST', 'rooms', { max_players: 3, stake_xu: 10 });
    const room = created.json() as { id: string };
    for (const session of [b, c]) await call(session, 'POST', `rooms/${room.id}/join`, {});
    await ready([b, c], room.id);
    const started = await call(a, 'POST', `rooms/${room.id}/start`);
    expect(started.statusCode, started.body).toBe(200);
    const matchId = (started.json() as { match: { match_id: string } }).match.match_id;
    await playToEnd(a, matchId, { step: 0, qty: 50 });
    for (const session of [a, b, c]) {
      if (session !== a) await playToEnd(session, matchId);
      expect((await call(session, 'POST', `matches/${matchId}/finish`)).statusCode).toBe(200);
    }

    const entries = await stack.query<{
      user_id: string;
      rank: number;
      points: number;
      is_win: boolean;
      awarded: boolean;
    }>(
      `select user_id::text as user_id, rank, points, is_win, points_awarded_at is not null as awarded
         from fb_entries where match_id = $1`,
      [matchId],
    );
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.awarded).toBe(true);
      expect(entry.points).toBe(entry.rank === 1 ? 10 : 3);
      expect(entry.is_win).toBe(entry.rank === 1);
    }
    const stats = await allStats();
    for (const entry of entries) {
      expect(stats.find((row) => row.user_id === entry.user_id)).toMatchObject({
        points: entry.points,
        games: 1,
        wins: entry.is_win ? 1 : 0,
      });
    }

    // Kết quả có cột điểm và dòng tiến độ; GET me/level khớp bảng điểm.
    const result = (await call(b, 'GET', `matches/${matchId}/result`)).json() as {
      rows: { user_id: string; points: number; level: number; crown: 1 | 2 | 3 | null }[];
      progress: { points: number; total_points: number; level: number; leveled_up: boolean };
    };
    expect(result.rows.map((row) => row.points).sort()).toEqual(
      entries.map((entry) => entry.points).sort(),
    );
    const mine = entries.find((entry) => entry.user_id === b.id)!;
    expect(result.progress).toMatchObject({
      points: mine.points,
      total_points: mine.points,
      level: 1,
      leveled_up: false,
    });
    const level = (await call(b, 'GET', 'me/level')).json() as {
      points: number;
      level: number;
      level_base: number;
      next_level_points: number;
      rank: number | null;
    };
    expect(level).toMatchObject({
      points: mine.points,
      level: 1,
      level_base: 0,
      next_level_points: 20,
    });
    expect(level.rank).toBeGreaterThanOrEqual(1);

    // Chạy lại nhiều lần (chốt ván, tác vụ định kỳ, mở kết quả) không đổi bảng điểm.
    const before = JSON.stringify(await allStats());
    const service = app.get(FlashbackRoomsService);
    clock.at = new Date(clock.at.getTime() + 3_600_000);
    expect(await service.settle(matchId)).toBe(false);
    await service.sweep();
    await service.sweep();
    await call(a, 'GET', `matches/${matchId}/result`);
    expect(JSON.stringify(await allStats())).toBe(before);
    clock.at = new Date();
  });

  it('v2.1 bảng xếp hạng: SQL xếp đúng thứ tự §4.1 (khớp compareRank), top 3, dòng của mình ngoài top, vương miện', async () => {
    const players: Session[] = [];
    for (let index = 0; index < 8; index += 1) players.push(await user(`rk-${index}`, 100));
    // Điểm có nhiều cặp bằng nhau (điểm, ván thắng, mốc đạt điểm) để chạm đủ các tiêu chí phụ.
    const spec = [
      [200, 10, 100],
      [150, 8, 100],
      [150, 8, 100],
      [150, 8, 50],
      [150, 9, 200],
      [90, 3, 10],
      [90, 3, 10],
      [4, 1, 1],
    ] as const;
    for (const [index, [points, wins, minute]] of spec.entries()) {
      await stack.query(
        `insert into fb_player_stats (user_id, points, games, wins, reached_points_at)
         values ($1, $2, $3, $4, timestamptz '2026-01-01 00:00:00+00' + ($5 * interval '1 minute'))
         on conflict (user_id) do update
           set points = excluded.points, games = excluded.games, wins = excluded.wins,
               reached_points_at = excluded.reached_points_at`,
        [players[index]!.id, points, wins + 5, wins, minute],
      );
    }
    const expected = sortedByRank(await allStats()).map((row) => row.userId);

    const board = (await call(players[3]!, 'GET', 'leaderboard?limit=50')).json() as {
      rows: {
        rank: number;
        user_id: string;
        points: number;
        crown: 1 | 2 | 3 | null;
        is_me: boolean;
      }[];
      me: unknown;
    };
    expect(board.rows.map((row) => row.user_id)).toEqual(expected);
    expect(board.rows.map((row) => row.rank)).toEqual(expected.map((_, index) => index + 1));
    expect(board.rows.map((row) => row.crown).slice(0, 4)).toEqual([1, 2, 3, null]);
    expect(board.rows.filter((row) => row.is_me).map((row) => row.user_id)).toEqual([
      players[3]!.id,
    ]);
    expect(board.me).toBeNull();

    // Giới hạn top: người ngoài top nhận thêm dòng của mình với đúng hạng.
    const lastSession = players[7]!;
    const rankOf = expected.indexOf(lastSession.id) + 1;
    expect(rankOf).toBeGreaterThan(3);
    const limited = (await call(lastSession, 'GET', 'leaderboard?limit=3')).json() as {
      rows: unknown[];
      me: { rank: number; user_id: string; is_me: boolean } | null;
    };
    expect(limited.rows).toHaveLength(3);
    expect(limited.me).toMatchObject({ rank: rankOf, user_id: lastSession.id, is_me: true });
    expect(((await call(lastSession, 'GET', 'me/level')).json() as { rank: number }).rank).toBe(
      rankOf,
    );

    // Top 3 và vương miện ở sảnh (chủ phòng hạng 1).
    const top3 = (await call(players[0]!, 'GET', 'leaderboard/top3')).json() as {
      users: { rank: number; user_id: string }[];
    };
    expect(top3.users.map((item) => [item.rank, item.user_id])).toEqual(
      expected.slice(0, 3).map((id, index) => [index + 1, id]),
    );
    const owner = players.find((session) => session.id === expected[0])!;
    const ownerRoom = (
      await call(owner, 'POST', 'rooms', { max_players: 2, stake_xu: 10 })
    ).json() as { id: string; members: { crown: number | null; level: number }[] };
    // 200 điểm: levelBase(6) = 200 <= 200 < levelBase(7) = 270.
    expect(ownerRoom.members[0]).toMatchObject({ crown: 1, level: 6 });
    const lobby = (await call(players[7]!, 'GET', 'rooms?status=waiting')).json() as {
      rooms: { id: string; owner: { crown: number | null; level: number } }[];
    };
    expect(lobby.rooms.find((room) => room.id === ownerRoom.id)?.owner).toMatchObject({
      crown: 1,
      level: 6,
    });
    await call(owner, 'POST', `rooms/${ownerRoom.id}/leave`);
  });

  it('v2.1 lịch sử đấu: danh sách, lọc, phân trang, chi tiết chỉ có lệnh của mình và 6 số tổng kết trên PostgreSQL thật', async () => {
    const p = await user('hist-p', 1000);
    const q = await user('hist-q', 1000);
    const created = await call(p, 'POST', 'rooms', { max_players: 2, stake_xu: 20 });
    const room = created.json() as { id: string };
    await call(q, 'POST', `rooms/${room.id}/join`, {});
    await ready([q], room.id);
    const started = await call(p, 'POST', `rooms/${room.id}/start`);
    const matchId = (started.json() as { match: { match_id: string } }).match.match_id;
    await playToEnd(p, matchId, { step: 0, qty: 100 });
    await playToEnd(q, matchId);
    for (const session of [p, q]) await call(session, 'POST', `matches/${matchId}/finish`);
    // Đồng hồ của bộ kiểm thử đứng yên: nếu không nhích lên thì hai ván có cùng `ended_at` và thứ tự
    // "mới nhất trước" chỉ còn phụ thuộc vào UUID ngẫu nhiên.
    clock.at = new Date(clock.at.getTime() + 60_000);
    // Một ván chơi 1 mình để có nhãn "Chơi 1 mình".
    await call(p, 'POST', `rooms/${room.id}/leave`);
    await call(q, 'POST', `rooms/${room.id}/leave`).catch(() => undefined);
    const soloRoom = (await call(p, 'POST', 'rooms', { max_players: 1 })).json() as { id: string };
    const soloStart = await call(p, 'POST', `rooms/${soloRoom.id}/start`);
    const soloMatch = (soloStart.json() as { match: { match_id: string } }).match.match_id;
    await playToEnd(p, soloMatch);
    await call(p, 'POST', `matches/${soloMatch}/finish`);

    type History = {
      items: {
        match_id: string;
        result: string;
        rank: number;
        xu: number;
        points: number;
        symbol: string;
        player_count: number;
        orders: { side: string; qty: number }[];
        players: { user_id: string; is_me: boolean; rank: number }[];
        ended_at: string;
      }[];
      page: number;
      pages: number;
      total: number;
    };
    const all = (await call(p, 'GET', 'me/history')).json() as History;
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.match_id)).toEqual([soloMatch, matchId]);
    // Mới nhất trước theo thời điểm kết thúc, không phải do hoà rồi xếp theo ID.
    expect(all.items[0]!.ended_at > all.items[1]!.ended_at).toBe(true);
    expect(all.items[0]).toMatchObject({ result: 'solo', xu: 0, points: 0, player_count: 1 });
    const duel = all.items[1]!;
    expect(VN30).toContain(duel.symbol);
    expect(['win', 'tie', 'lose']).toContain(duel.result);
    expect(duel.points).toBe(duel.result === 'lose' ? 3 : 10);
    expect(duel.players).toHaveLength(2);
    expect(duel.players.find((player) => player.is_me)?.user_id).toBe(p.id);
    expect(duel.orders).toHaveLength(1);
    expect(duel.orders[0]).toMatchObject({ side: 'buy', qty: 100 });
    // q không có lệnh nào và không thấy lệnh của p.
    const theirs = (await call(q, 'GET', 'me/history')).json() as History;
    expect(theirs.items).toHaveLength(1);
    expect(theirs.items[0]!.orders).toEqual([]);

    const query = async (qs: string) =>
      (await call(p, 'GET', `me/history?${qs}`)).json() as History;
    expect((await query('result=solo')).items.map((item) => item.result)).toEqual(['solo']);
    const wins = await query('result=win');
    expect(wins.total).toBe(duel.result === 'lose' ? 0 : 1);
    expect((await query('result=lose')).total).toBe(duel.result === 'lose' ? 1 : 0);
    expect((await query('days=7')).total).toBe(2);
    expect((await query('days=30&result=solo')).total).toBe(1);
    expect((await query('page=9')).page).toBe(1);
    expect((await call(p, 'GET', 'me/history?result=bogus')).statusCode).toBe(422);

    const summary = (await call(p, 'GET', 'me/history/summary?days=7')).json() as {
      games: number;
      solo_games: number;
      multi_games: number;
      wins: number;
      win_rate: number;
      xu_net: number;
      points: number;
      avg_pnl_percent: number;
      best_symbol: string | null;
    };
    expect(summary).toMatchObject({ games: 2, solo_games: 1, multi_games: 1 });
    expect(summary.points).toBe(duel.points);
    expect(summary.wins).toBe(duel.result === 'lose' ? 0 : 1);
    expect(summary.win_rate).toBe(duel.result === 'lose' ? 0 : 1);
    expect(summary.xu_net).toBe(duel.xu);
    expect(summary.best_symbol).not.toBeNull();
    // Mốc thời gian: ván lùi về 40 ngày trước chỉ nằm trong "Tất cả".
    await stack.query(
      `update fb_matches set ended_at = ended_at - interval '40 days' where id = $1`,
      [matchId],
    );
    expect(
      ((await call(p, 'GET', 'me/history/summary?days=30')).json() as { games: number }).games,
    ).toBe(1);
    expect(((await call(p, 'GET', 'me/history/summary')).json() as { games: number }).games).toBe(
      2,
    );
    expect((await query('days=30')).total).toBe(1);
    clock.at = new Date();
  });

  it('v2.1 biểu cảm: gửi qua API, cả ván thấy ở state, chặn 1,5 giây, từ chối emoji lạ, hết ván thì không gửi được', async () => {
    const r1 = await user('rx-1', 200);
    const r2 = await user('rx-2', 200);
    const room = (await call(r1, 'POST', 'rooms', { max_players: 2, stake_xu: 10 })).json() as {
      id: string;
    };
    await call(r2, 'POST', `rooms/${room.id}/join`, {});
    await ready([r2], room.id);
    const started = await call(r1, 'POST', `rooms/${room.id}/start`);
    const matchId = (started.json() as { match: { match_id: string } }).match.match_id;
    const send = (session: Session, emoji: string) =>
      call(session, 'POST', `matches/${matchId}/reactions`, { emoji });

    const sent = await send(r1, '🚀');
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json()).toMatchObject({ user_id: r1.id, emoji: '🚀' });
    const blocked = await send(r1, '🔥');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: 'REACTION_TOO_FAST' } });
    expect((await send(r1, '👍')).statusCode).toBe(400);
    const state = (await call(r2, 'GET', `matches/${matchId}/state`)).json() as {
      reactions: { id: string; user_id: string; emoji: string }[];
    };
    expect(state.reactions).toEqual([
      expect.objectContaining({
        id: (sent.json() as { id: string }).id,
        user_id: r1.id,
        emoji: '🚀',
      }),
    ]);
    clock.at = new Date(clock.at.getTime() + 1_600);
    expect((await send(r1, '🔥')).statusCode).toBe(200);
    expect((await send(r2, '🤑')).statusCode).toBe(200);
    // Người ngoài ván không gửi được.
    const outsider = await user('rx-out', 0);
    expect((await send(outsider, '😂')).statusCode).toBe(404);

    for (const session of [r1, r2]) {
      await playToEnd(session, matchId);
      await call(session, 'POST', `matches/${matchId}/finish`);
    }
    expect((await send(r1, '😎')).statusCode).toBe(409);
    expect(
      ((await call(r1, 'GET', `matches/${matchId}/state`)).json() as { reactions: unknown[] })
        .reactions,
    ).toEqual([]);
    clock.at = new Date();
  });

  it('migration 0038: cộng bù điểm cho ván đã chốt trước đó, dựng lại bảng điểm và chạy lại vẫn không đổi', async () => {
    const [x, y, z] = [await user('mg-x', 0), await user('mg-y', 0), await user('mg-z', 0)] as [
      Session,
      Session,
      Session,
    ];
    const migration = readFileSync(
      fileURLToPath(new URL('../../migrations/0038_flashback_levels.sql', import.meta.url)),
      'utf8',
    );
    const insertRoom = async (codeValue: string, owner: Session) =>
      (
        await stack.query<{ id: string }>(
          `insert into fb_rooms (code, owner_id, view_bars, play_bars, minutes, max_players, stake_xu,
                                 status, closed_at, close_reason)
           values ($1, $2, 30, 30, 5, 4, 0, 'closed', now(), 'ended_timeout')
           returning id::text as id`,
          [codeValue, owner.id],
        )
      )[0]!.id;
    const insertMatch = async (roomId: string, players: number, endedAt: string) =>
      (
        await stack.query<{ id: string }>(
          `insert into fb_matches (room_id, symbol, start_date, end_date, view_bars, play_bars, minutes,
                                   stake_xu, player_count, pot_xu, started_at, ends_at, status,
                                   ended_at, end_reason, paid_at)
           values ($1, 'FPT', '2015-01-02', '2015-06-30', 30, 30, 5, 0, $2, 0,
                   $3::timestamptz - interval '5 minutes', $3::timestamptz, 'paid', $3::timestamptz,
                   'all_finished', $3::timestamptz)
           returning id::text as id`,
          [roomId, players, endedAt],
        )
      )[0]!.id;
    const insertEntry = (matchId: string, session: Session, rank: number) =>
      stack.query(
        `insert into fb_entries (match_id, user_id, step, status, final_nav, pnl_pct, rank, finished_at)
         values ($1, $2, 30, 'finished', 10000000, 0, $3, now())`,
        [matchId, session.id, rank],
      );
    // Ván 1 (x thắng, y thua, z thua), ván 2 (hoà hạng 1: y, z; x hạng 3), ván 3 (x chơi 1 mình).
    const m1 = await insertMatch(await insertRoom('900001', x), 3, '2026-10-01T10:00:00Z');
    await insertEntry(m1, x, 1);
    await insertEntry(m1, y, 2);
    await insertEntry(m1, z, 2);
    const m2 = await insertMatch(await insertRoom('900002', y), 3, '2026-10-02T10:00:00Z');
    await insertEntry(m2, x, 3);
    await insertEntry(m2, y, 1);
    await insertEntry(m2, z, 1);
    const m3 = await insertMatch(await insertRoom('900003', x), 1, '2026-10-03T10:00:00Z');
    await insertEntry(m3, x, 1);

    await stack.query(migration);
    const read = () =>
      stack.query<{
        match_id: string;
        user_id: string;
        points: number;
        is_win: boolean;
        awarded_at: Date | null;
      }>(
        `select match_id::text as match_id, user_id::text as user_id, points, is_win,
                points_awarded_at as awarded_at
           from fb_entries where match_id = any($1::uuid[]) order by match_id, rank, user_id`,
        [[m1, m2, m3]],
      );
    const entries = await read();
    expect(entries).toHaveLength(7);
    const awarded = (matchId: string, session: Session) =>
      entries.find((row) => row.match_id === matchId && row.user_id === session.id);
    expect(awarded(m1, x)).toMatchObject({ points: 10, is_win: true });
    expect(awarded(m1, y)).toMatchObject({ points: 3, is_win: false });
    expect(awarded(m1, z)).toMatchObject({ points: 3, is_win: false });
    expect(awarded(m2, y)).toMatchObject({ points: 10, is_win: true });
    expect(awarded(m2, z)).toMatchObject({ points: 10, is_win: true });
    expect(awarded(m2, x)).toMatchObject({ points: 3, is_win: false });
    // Ván chơi 1 mình: 0 điểm, không thắng, nhưng vẫn đánh dấu đã xử lý.
    expect(awarded(m3, x)).toMatchObject({ points: 0, is_win: false });
    expect(entries.every((row) => row.awarded_at !== null)).toBe(true);
    expect(new Date(awarded(m1, x)!.awarded_at!).toISOString()).toBe('2026-10-01T10:00:00.000Z');
    const stats = async (session: Session) =>
      (
        await stack.query<{ points: number; games: number; wins: number; reached: Date }>(
          `select points, games, wins, reached_points_at as reached from fb_player_stats where user_id = $1`,
          [session.id],
        )
      )[0];
    expect(await stats(x)).toMatchObject({ points: 13, games: 2, wins: 1 });
    expect(await stats(y)).toMatchObject({ points: 13, games: 2, wins: 1 });
    expect(await stats(z)).toMatchObject({ points: 13, games: 2, wins: 1 });
    // Mốc đạt điểm là lúc kết thúc ván cuối có điểm (x: ván 2; ván 1 người không tính).
    expect(new Date((await stats(x))!.reached).toISOString()).toBe('2026-10-02T10:00:00.000Z');

    // Chạy lại lần nữa: không đổi gì (idempotent).
    const snapshot = JSON.stringify([await read(), await stats(x), await stats(y), await stats(z)]);
    await stack.query(migration);
    expect(JSON.stringify([await read(), await stats(x), await stats(y), await stats(z)])).toBe(
      snapshot,
    );
  });
});
