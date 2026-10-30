import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FlashbackMarketDataPort } from '../../src/modules/flashback/flashback.market-data.js';
import { FLASHBACK_CLOCK } from '../../src/modules/flashback/flashback.service.js';
import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
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
      await stack.query('select 1 from coin_ledger where user_id = $1', [solo.id]),
    ).toHaveLength(0);
    clock.at = new Date();
  });

  it('ledger: mỗi (ván, người, loại) một dòng và dấu của delta đúng loại', async () => {
    const holder = await user('fb-ledger', 100);
    const matchId = '00000000-0000-4000-8000-0000000000aa';
    await stack.query(
      `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values ($1, 1, 'flashback_win', 10, 110, 'k1', jsonb_build_object('match_id', $2::text), 't')`,
      [holder.id, matchId],
    );
    await expect(
      stack.query(
        `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
         values ($1, 2, 'flashback_win', 10, 120, 'k2', jsonb_build_object('match_id', $2::text), 't')`,
        [holder.id, matchId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      stack.query(
        `insert into coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
         values ($1, 3, 'flashback_stake', 10, 120, 'k3', '{}'::jsonb, 't')`,
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
});
