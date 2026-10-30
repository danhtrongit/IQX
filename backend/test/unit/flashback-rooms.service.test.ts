import { describe, expect, it } from 'vitest';

import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import {
  FlashbackRoomsService,
  type FbDatasetPort,
  type FbMatchDataset,
} from '../../src/modules/flashback/flashback-rooms.service.js';
import { MemoryRoomsRepository, memoryDatabase } from './helpers/flashback-rooms-memory.js';

const T0 = new Date('2026-10-30T03:00:00.000Z');
const CASH = 10_000_000n;

/** Nến có ngày thật năm 2015 và mã FPT/VNM: không được xuất hiện trong phản hồi trước khi hết ván. */
function makeDataset(
  symbol: string,
  viewBars: number,
  playBars: number,
  close: (index: number) => number,
): FbMatchDataset {
  const bar = (index: number, offset: number): FlashbackBar => {
    const c = close(index);
    return {
      d: new Date(Date.UTC(2015, 0, 1) + (index + offset) * 86_400_000).toISOString().slice(0, 10),
      o: c,
      h: c,
      l: c,
      c,
      v: 1_000_000,
    };
  };
  return {
    symbol,
    warmupBars: Array.from({ length: 252 }, (_, index) => bar(0, index - 400)),
    bars: Array.from({ length: viewBars + playBars }, (_, index) => bar(index, 0)),
    priceSource: 'VCI:dong:adjusted',
    fallbackLevel: 0,
  };
}

/** Giá theo phiên chơi: phiên k (k = index − view + 1) đóng cửa 10.000 + 100·k. */
const rising = (viewBars: number) => (index: number) =>
  10_000 + Math.max(0, index - (viewBars - 1)) * 100;

function setup(options: { close?: (viewBars: number) => (index: number) => number } = {}) {
  const repository = new MemoryRoomsRepository();
  const clock = { at: new Date(T0) };
  const symbols = ['FPT', 'VNM', 'HPG', 'MWG'];
  const picks: string[] = [];
  const dataset: FbDatasetPort = {
    pick: async (_now, viewBars, playBars) => {
      const symbol = symbols[picks.length % symbols.length]!;
      picks.push(symbol);
      return makeDataset(symbol, viewBars, playBars, (options.close ?? rising)(viewBars));
    },
  };
  const service = new FlashbackRoomsService(memoryDatabase(), repository, dataset, {
    now: () => clock.at,
  });
  const advance = (ms: number) => {
    clock.at = new Date(clock.at.getTime() + ms);
  };
  return { repository, service, clock, advance, picks };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status: number; response: { code: string; message: string } };
  }
  throw new Error('expected a rejection');
}

const code = (error: { response: { code: string } }) => error.response.code;

describe('Flashback v2 · Phòng chơi: sảnh, tạo phòng, vào phòng', () => {
  it('tạo phòng: cấp ID 6 chữ số, người tạo là chủ phòng và vào phòng chờ ngay', async () => {
    const { repository, service } = setup();
    repository.addUser('a', 'minhkhoa', 500);
    const room = await service.createRoom('a', {
      view_bars: 60,
      play_bars: 30,
      max_players: 4,
      stake_xu: 100,
    });
    expect(room.id).toMatch(/^\d{6}$/);
    expect(room).toMatchObject({ is_owner: true, status: 'waiting', stake_xu: 100, locked: false });
    expect(room.members).toEqual([
      expect.objectContaining({ user_id: 'a', is_owner: true, is_me: true }),
    ]);
    // Xu không bị trừ lúc tạo hay vào phòng (§8).
    expect(repository.balanceOf('a')).toBe(500);
  });

  it('tạo phòng: báo đúng một dòng lỗi §3 và chặn cược vượt số xu', async () => {
    const { repository, service } = setup();
    repository.addUser('a', 'a', 50);
    expect(code(await rejection(service.createRoom('a', { view_bars: 20 })))).toBe('ROOM_INVALID');
    const error = await rejection(service.createRoom('a', { stake_xu: 100 }));
    expect(error).toMatchObject({ status: 422, response: { message: 'Bạn chỉ có 50 xu' } });
    const solo = await service.createRoom('a', { max_players: 1, stake_xu: 100 });
    expect(solo.stake_xu).toBe(0);
  });

  it('mỗi tài khoản chỉ ở một phòng: tạo hay vào phòng khác khi chưa rời trả ALREADY_IN_ROOM', async () => {
    const { repository, service } = setup();
    repository.addUser('a', 'a', 500);
    repository.addUser('b', 'b', 500);
    const first = await service.createRoom('a', {});
    const second = await service.createRoom('b', {});
    expect(code(await rejection(service.createRoom('a', {})))).toBe('ALREADY_IN_ROOM');
    const error = await rejection(service.joinRoom('a', second.id, null));
    expect(error).toMatchObject({ status: 409, response: { code: 'ALREADY_IN_ROOM' } });
    // Vào lại đúng phòng của mình là thao tác hợp lệ (vào lại).
    expect((await service.joinRoom('a', first.id, null)).id).toBe(first.id);
  });

  it('vào phòng: báo lỗi đúng với phòng không có, sai định dạng, đang chơi, đủ người, thiếu xu, sai mật khẩu', async () => {
    const { repository, service } = setup();
    for (const [id, balance] of [
      ['owner', 1000],
      ['p1', 1000],
      ['p2', 50],
      ['p3', 1000],
      ['solo', 0],
    ] as const)
      repository.addUser(id, id, balance);
    expect(await rejection(service.joinRoom('p1', '12345', null))).toMatchObject({
      status: 400,
      response: { code: 'ROOM_ID_INVALID', message: 'ID phòng gồm 6 chữ số' },
    });
    expect(await rejection(service.joinRoom('p1', '999999', null))).toMatchObject({
      status: 404,
      response: { code: 'ROOM_NOT_FOUND', message: 'Không tìm thấy phòng 999999' },
    });

    const locked = await service.createRoom('owner', {
      max_players: 2,
      stake_xu: 100,
      password: '1234',
    });
    expect(await rejection(service.joinRoom('p2', locked.id, '0000'))).toMatchObject({
      status: 409,
      response: { code: 'XU_INSUFFICIENT', message: 'Không đủ xu để vào phòng cược 100 xu' },
    });
    expect(await rejection(service.joinRoom('p1', locked.id, null))).toMatchObject({
      status: 403,
      response: { code: 'PASSWORD_REQUIRED' },
    });
    expect(await rejection(service.joinRoom('p1', locked.id, '0000'))).toMatchObject({
      status: 403,
      response: { code: 'WRONG_PASSWORD', message: 'Mật khẩu không đúng' },
    });
    await service.joinRoom('p1', locked.id, '1234');
    // Phòng đã đủ người được báo trước thiếu xu và mật khẩu (thứ tự §2.3).
    expect(await rejection(service.joinRoom('p2', locked.id, 'sai'))).toMatchObject({
      status: 409,
      response: { code: 'ROOM_FULL', message: 'Phòng đã đủ người' },
    });

    await service.startRoom('owner', locked.id);
    expect(await rejection(service.joinRoom('p3', locked.id, '1234'))).toMatchObject({
      status: 409,
      response: { code: 'ROOM_PLAYING', message: 'Phòng đang chơi, chưa vào được' },
    });
  });

  it('Chơi phòng bất kỳ chỉ vào phòng không khoá, còn chỗ, đủ xu; không có thì báo tạo phòng', async () => {
    const { repository, service } = setup();
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5']) repository.addUser(id, id, 1000);
    repository.addUser('me', 'me', 100);
    repository.addUser('x', 'x', 1000);
    await service.createRoom('o1', { password: '1234', stake_xu: 10 });
    await service.createRoom('o2', { stake_xu: 200 });
    const full = await service.createRoom('o3', { max_players: 2, stake_xu: 10 });
    await service.joinRoom('x', full.id, null);
    const playing = await service.createRoom('o4', { stake_xu: 10 });
    await service.startRoom('o4', playing.id);
    expect(await rejection(service.randomJoin('me'))).toMatchObject({
      status: 404,
      response: { code: 'NO_ROOM_AVAILABLE', message: 'Chưa có phòng mở phù hợp, hãy tạo phòng' },
    });
    const good = await service.createRoom('o5', { stake_xu: 100 });
    expect((await service.randomJoin('me')).id).toBe(good.id);
  });

  it('danh sách sảnh: lọc đúng, phòng mới lên trên, phòng đã đóng không hiện', async () => {
    const { repository, service, advance } = setup();
    for (const id of ['a', 'b', 'c']) repository.addUser(id, id, 1000);
    const ra = await service.createRoom('a', { max_players: 1 });
    advance(1000);
    const rb = await service.createRoom('b', {});
    advance(1000);
    const rc = await service.createRoom('c', {});
    await service.startRoom('a', ra.id);
    await service.leaveRoom('c', rc.id);
    expect((await service.listRooms('all')).rooms.map((r) => r.id)).toEqual([rb.id, ra.id]);
    expect((await service.listRooms('waiting')).rooms.map((r) => r.id)).toEqual([rb.id]);
    expect((await service.listRooms('playing')).rooms).toEqual([
      expect.objectContaining({ id: ra.id, status: 'playing', stake_xu: 0, max_players: 1 }),
    ]);
  });

  it('chủ phòng rời phòng chờ: quyền chuyển cho người vào sớm nhất; không còn ai thì đóng phòng', async () => {
    const { repository, service, advance } = setup();
    for (const id of ['a', 'b', 'c']) repository.addUser(id, id, 1000);
    const room = await service.createRoom('a', {});
    advance(10);
    await service.joinRoom('b', room.id, null);
    advance(10);
    await service.joinRoom('c', room.id, null);
    await service.leaveRoom('a', room.id);
    const view = await service.getRoom('b', room.id);
    expect(view.owner_id).toBe('b');
    expect(view.is_owner).toBe(true);
    expect(view.members.map((m) => m.user_id)).toEqual(['b', 'c']);
    expect(code(await rejection(service.startRoom('c', room.id)))).toBe('NOT_ROOM_OWNER');
    await service.leaveRoom('b', room.id);
    await service.leaveRoom('c', room.id);
    expect(code(await rejection(service.getRoom('c', room.id)))).toBe('ROOM_NOT_FOUND');
    expect((await service.myRoom('c')).room).toBeNull();
  });

  it('phòng chờ quá 30 phút chưa bắt đầu thì tự đóng', async () => {
    const { repository, service, advance } = setup();
    repository.addUser('a', 'a', 1000);
    const room = await service.createRoom('a', {});
    advance(29 * 60_000);
    expect(await service.sweep()).toEqual({ settled: 0, closed: 0 });
    advance(60_000);
    expect(await service.sweep()).toEqual({ settled: 0, closed: 1 });
    expect((await service.listRooms('all')).rooms).toHaveLength(0);
    expect(await service.myRoom('a')).toEqual({ room: null, notice: null });
    // Đã ra khỏi phòng nên tạo được phòng mới.
    expect((await service.createRoom('a', {})).id).not.toBe(undefined);
    expect(room.auto_close_at).toBe(new Date(T0.getTime() + 30 * 60_000).toISOString());
  });
});

describe('Flashback v2 · Phòng chơi: bắt đầu, xu cược, kết thúc', () => {
  async function roomOf(
    h: ReturnType<typeof setup>,
    users: readonly string[],
    settings: Record<string, unknown> = { stake_xu: 100, play_bars: 30, view_bars: 60 },
    balance = 1000,
  ) {
    for (const id of users) h.repository.addUser(id, `user-${id}`, balance);
    const room = await h.service.createRoom(users[0]!, { max_players: 4, ...settings });
    for (const id of users.slice(1)) {
      h.advance(10);
      await h.service.joinRoom(id, room.id, null);
    }
    return room;
  }

  async function playTo(
    h: ReturnType<typeof setup>,
    userId: string,
    matchId: string,
    step: number,
  ) {
    let current = (await h.service.state(userId, matchId)).my_step;
    while (current < step) {
      current = (await h.service.next(userId, matchId)).me.step;
    }
  }

  it('chỉ chủ phòng bắt đầu được; bắt đầu khi chỉ có một người thì không trừ xu', async () => {
    const h = setup();
    const room = await roomOf(h, ['a']);
    const started = await h.service.startRoom('a', room.id);
    expect(started.match).toMatchObject({ stake_xu: 0, pot_xu: 0, view_bars: 60, play_bars: 30 });
    expect(started.match.history_bars).toHaveLength(60);
    expect(started.match.warmup_bars).toHaveLength(252);
    expect(started.match.played_bars).toHaveLength(0);
    expect(h.repository.balanceOf('a')).toBe(1000);
    expect(h.repository.state.ledger).toHaveLength(0);
  });

  it('trừ cược mỗi người đúng một lần khi bắt đầu; phòng 4 người cược 100: người thắng +400, chạy lại không cộng hai lần', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c', 'd']);
    const { match } = await h.service.startRoom('a', room.id);
    expect(match.pot_xu).toBe(400);
    for (const id of ['a', 'b', 'c', 'd']) expect(h.repository.balanceOf(id)).toBe(900);
    expect(h.repository.state.ledger.filter((row) => row.kind === 'flashback_stake')).toHaveLength(
      4,
    );
    // Bấm Bắt đầu lần nữa không trừ thêm (phòng đã chuyển sang đang chơi).
    expect(code(await rejection(h.service.startRoom('a', room.id)))).toBe('ROOM_PLAYING');

    // a mua ở phiên 0 (giá đi lên), những người khác không giao dịch.
    await h.service.placeOrder('a', match.match_id, { side: 'buy', qty: 100 });
    for (const id of ['a', 'b', 'c', 'd']) {
      await playTo(h, id, match.match_id, 30);
      await h.service.finish(id, match.match_id);
    }
    const result = await h.service.result('a', match.match_id);
    expect(result.title).toBe('Bạn thắng');
    expect(result.rows[0]).toMatchObject({
      user_id: 'a',
      rank: 1,
      win_xu: 400,
      xu_label: '+400 xu',
    });
    expect(result.rows.slice(1).every((row) => row.xu_label === null && row.win_xu === 0)).toBe(
      true,
    );
    expect((await h.service.result('b', match.match_id)).title).toBe('user-a thắng');
    expect(h.repository.balanceOf('a')).toBe(1300);
    expect(h.repository.balanceOf('b')).toBe(900);

    // Tác vụ kết thúc ván chạy lại nhiều lần vẫn không cộng xu hai lần.
    h.advance(60 * 60_000);
    expect(await h.service.settle(match.match_id)).toBe(false);
    await h.service.sweep();
    expect(h.repository.balanceOf('a')).toBe(1300);
    expect(h.repository.state.ledger.filter((row) => row.kind === 'flashback_win')).toHaveLength(1);
  });

  it('hai người hoà hạng 1: mỗi người +200', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c', 'd']);
    const { match } = await h.service.startRoom('a', room.id);
    for (const id of ['a', 'b'])
      await h.service.placeOrder(id, match.match_id, { side: 'buy', qty: 50 });
    for (const id of ['a', 'b', 'c', 'd']) {
      await playTo(h, id, match.match_id, 30);
      await h.service.finish(id, match.match_id);
    }
    const result = await h.service.result('c', match.match_id);
    expect(result.title).toBe('Hoà');
    expect(result.rows.map((row) => [row.user_id, row.rank, row.win_xu])).toEqual([
      ['a', 1, 200],
      ['b', 1, 200],
      ['c', 3, 0],
      ['d', 3, 0],
    ]);
    expect(h.repository.balanceOf('a')).toBe(1100);
    expect(h.repository.balanceOf('c')).toBe(900);
  });

  it('cả phòng hoà ở 0%: hoàn xu cược (flashback_refund), dòng kết quả ghi "Hoàn xu cược"', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    const { match } = await h.service.startRoom('a', room.id);
    for (const id of ['a', 'b']) {
      await playTo(h, id, match.match_id, 30);
      await h.service.finish(id, match.match_id);
    }
    const result = await h.service.result('a', match.match_id);
    expect(result).toMatchObject({ title: 'Hoà', refund: true });
    expect(result.rows.map((row) => row.xu_label)).toEqual(['Hoàn xu cược', 'Hoàn xu cược']);
    expect(h.repository.balanceOf('a')).toBe(1000);
    expect(h.repository.balanceOf('b')).toBe(1000);
    expect(h.repository.state.ledger.map((row) => row.kind).sort()).toEqual([
      'flashback_refund',
      'flashback_refund',
      'flashback_stake',
      'flashback_stake',
    ]);
  });

  it('hết giờ: chơi 30 phiên, mua ở phiên 10, dừng ở phiên 20 → tính theo giá phiên 30, giữ nguyên số cổ phiếu', async () => {
    const h = setup();
    const room = await roomOf(h, ['a'], { minutes: 5, play_bars: 30, view_bars: 60 });
    const { match } = await h.service.startRoom('a', room.id);
    await playTo(h, 'a', match.match_id, 10);
    const bought = await h.service.placeOrder('a', match.match_id, { side: 'buy', qty: 100 });
    expect(bought.order.price).toBe('11000');
    await playTo(h, 'a', match.match_id, 20);
    h.advance(5 * 60_000);
    const state = await h.service.state('a', match.match_id);
    expect(state.status).toBe('ended');
    const snapshot = await h.service.matchSnapshot('a', match.match_id);
    expect(snapshot.me).toMatchObject({
      step: 30,
      holdings: 100,
      auto_finished: true,
      finished: true,
    });
    const cost = 100n * 11_000n + 1_650n; // phí 0,15%
    const expected = CASH - cost + 100n * 13_000n; // giá phiên 30 = 10.000 + 30·100
    expect(snapshot.me.total_assets).toBe(expected.toString());
    const result = await h.service.result('a', match.match_id);
    expect(result).toMatchObject({ title: 'Kết quả', solo: true, end_reason: 'timeout' });
    expect(result.rows[0]!.final_nav).toBe(expected.toString());
    expect(result.played_bars).toHaveLength(30);
    expect(code(await rejection(h.service.next('a', match.match_id)))).toBe('MATCH_ENDED');
  });

  it('% người khác không vượt quá phiên mình đang xem; % đổi khi mua bán và khi sang phiên', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    const { match } = await h.service.startRoom('a', room.id);
    await h.service.placeOrder('b', match.match_id, { side: 'buy', qty: 100 });
    const afterBuy = await h.service.state('b', match.match_id);
    const me = afterBuy.players.find((p) => p.is_me)!;
    expect(me.pnl_pct).toBeLessThan(0); // phí mua làm % âm ngay
    await playTo(h, 'b', match.match_id, 20);
    await playTo(h, 'a', match.match_id, 5);
    const seenByA = (await h.service.state('a', match.match_id)).players.find(
      (p) => p.user_id === 'b',
    )!;
    const seenByB = (await h.service.state('b', match.match_id)).players.find(
      (p) => p.user_id === 'b',
    )!;
    const fee = 1_500n; // 0,15% của 100 × 10.000
    const navAt = (step: number) =>
      CASH - 100n * 10_000n - fee + 100n * BigInt(10_000 + step * 100);
    expect(seenByA.pnl_pct).toBeCloseTo(Number(navAt(5) - CASH) / Number(CASH), 12);
    expect(seenByB.pnl_pct).toBeCloseTo(Number(navAt(20) - CASH) / Number(CASH), 12);
    // a đã ở phiên 25 thì thấy b (đang ở 20) tại phiên 20.
    await playTo(h, 'a', match.match_id, 25);
    const later = (await h.service.state('a', match.match_id)).players.find(
      (p) => p.user_id === 'b',
    )!;
    expect(later.pnl_pct).toBeCloseTo(Number(navAt(20) - CASH) / Number(CASH), 12);
    // Đồng hồ chung giống nhau ở mọi người.
    expect((await h.service.state('a', match.match_id)).ends_at).toBe(
      (await h.service.state('b', match.match_id)).ends_at,
    );
  });

  it('không có mã, ngày hay nến tương lai trong mọi phản hồi trước khi ván kết thúc', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    const responses: unknown[] = [];
    responses.push(await h.service.getRoom('a', room.id));
    const started = await h.service.startRoom('a', room.id);
    responses.push(started);
    const matchId = started.match.match_id;
    responses.push(await h.service.matchSnapshot('b', matchId));
    responses.push(await h.service.next('a', matchId));
    responses.push(await h.service.placeOrder('a', matchId, { side: 'buy', qty: 10 }));
    await playTo(h, 'a', matchId, 30);
    responses.push(await h.service.finish('a', matchId));
    responses.push(await h.service.state('b', matchId));
    responses.push(await h.service.myRoom('b'));
    responses.push(await h.service.listRooms('all'));
    expect(code(await rejection(h.service.result('a', matchId)))).toBe('RESULT_NOT_READY');

    const text = JSON.stringify(responses, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(text).not.toContain('FPT');
    expect(text).not.toMatch(/"20(1[0-9])-\d{2}-\d{2}"/); // ngày phiên thật (2015)
    expect(text).not.toContain('2015-');
    expect(text).not.toContain('VCI');
    // b đang ở phiên 0: không có nến phiên chơi nào trong dữ liệu của b.
    const snapshotB = responses[2] as { played_bars: unknown[]; history_bars: unknown[] };
    expect(snapshotB.played_bars).toHaveLength(0);
    // a đã hoàn thành (mua ở phiên 1) nhưng b còn ở phiên 0: b thấy % của a tại phiên 0.
    const stateB = responses[6] as { players: { user_id: string; pnl_pct: number }[] };
    const aSeenByB = stateB.players.find((p) => p.user_id === 'a')!;
    expect(aSeenByB.pnl_pct).toBe(0);

    await playTo(h, 'b', matchId, 30);
    await h.service.finish('b', matchId);
    const result = await h.service.result('b', matchId);
    expect(result.symbol).toBe('FPT');
    expect(result.start_date).toBe('2015-01-01');
    expect(result.end_date).toBe(
      new Date(Date.UTC(2015, 0, 1) + 89 * 86_400_000).toISOString().slice(0, 10),
    );
  });

  it('đặt lệnh kiểm tra trên server: đủ tiền, T+2, đủ cổ phiếu; người không trong ván không thao tác được', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], { stake_xu: 10 });
    h.repository.addUser('z', 'z', 0);
    const { match } = await h.service.startRoom('a', room.id);
    const id = match.match_id;
    expect(code(await rejection(h.service.placeOrder('a', id, { side: 'buy', qty: 10_000 })))).toBe(
      'INSUFFICIENT_CASH',
    );
    await h.service.placeOrder('a', id, { side: 'buy', qty: 100 });
    expect(code(await rejection(h.service.placeOrder('a', id, { side: 'sell', qty: 100 })))).toBe(
      'NOT_SETTLED_YET',
    );
    await h.service.next('a', id);
    await h.service.next('a', id);
    const sold = await h.service.placeOrder('a', id, { side: 'sell', qty: 100 });
    expect(sold.order).toMatchObject({ side: 'sell', price: '10200', tax: '1020', fee: '1530' });
    expect(code(await rejection(h.service.placeOrder('a', id, { side: 'sell', qty: 1 })))).toBe(
      'NOT_ENOUGH_SHARES',
    );
    expect(code(await rejection(h.service.finish('a', id)))).toBe('NOT_AT_END');
    expect(code(await rejection(h.service.state('z', id)))).toBe('MATCH_NOT_FOUND');
    expect(code(await rejection(h.service.next('z', id)))).toBe('MATCH_NOT_FOUND');
  });

  it('bắt đầu: ai không đủ xu bị đưa ra khỏi phòng kèm thông báo; còn một người thì chơi một mình không cược', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    h.repository.state.wallets.set('b', { balance: 50, lastSeq: 0 });
    const started = await h.service.startRoom('a', room.id);
    expect(started.removed).toEqual([
      { user_id: 'b', name: 'user-b', message: 'Không đủ xu để vào phòng cược 100 xu' },
    ]);
    expect(started.match).toMatchObject({ stake_xu: 0, pot_xu: 0 });
    expect(h.repository.balanceOf('a')).toBe(1000);
    expect(await h.service.myRoom('b')).toEqual({
      room: null,
      notice: 'Không đủ xu để vào phòng cược 100 xu',
    });
    // Thông báo chỉ hiện một lần.
    expect((await h.service.myRoom('b')).notice).toBeNull();
  });

  it('chơi lại: giữ ID, thiết lập và người chơi, ra mã mới; người thiếu xu nhận "Không đủ {n} xu để chơi lại"', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c']);
    const first = await h.service.startRoom('a', room.id);
    // a thắng ván đầu.
    await h.service.placeOrder('a', first.match.match_id, { side: 'buy', qty: 100 });
    for (const id of ['a', 'b', 'c']) {
      await playTo(h, id, first.match.match_id, 30);
      await h.service.finish(id, first.match.match_id);
    }
    expect((await h.service.result('a', first.match.match_id)).symbol).toBe('FPT');
    expect(code(await rejection(h.service.joinRoom('x', room.id, null)))).not.toBe(
      'ROOM_NOT_FOUND',
    );

    const replayed = await h.service.replayRoom('a', room.id);
    expect(replayed).toMatchObject({
      id: room.id,
      status: 'waiting',
      stake_xu: 100,
      view_bars: 60,
    });
    expect(replayed.members.map((m) => m.user_id)).toEqual(['a', 'b', 'c']);

    // c còn 900 xu nhưng tiêu hết trước khi chủ phòng bắt đầu lại.
    h.repository.state.wallets.set('c', { balance: 40, lastSeq: 10 });
    expect(await rejection(h.service.replayRoom('c', room.id))).toMatchObject({
      status: 409,
      response: { code: 'XU_INSUFFICIENT', message: 'Không đủ 100 xu để chơi lại' },
    });
    expect((await h.service.myRoom('c')).room).toBeNull();

    // b không bấm chơi lại nhưng vẫn ở phòng; thiếu xu thì bị đưa ra lúc bắt đầu.
    h.repository.state.wallets.set('b', { balance: 90, lastSeq: 10 });
    const second = await h.service.startRoom('a', room.id);
    expect(second.removed.map((r) => r.message)).toEqual(['Không đủ 100 xu để chơi lại']);
    expect(second.match.match_id).not.toBe(first.match.match_id);
    expect(second.room.id).toBe(room.id);
    await playTo(h, 'a', second.match.match_id, 30);
    await h.service.finish('a', second.match.match_id);
    expect((await h.service.result('a', second.match.match_id)).symbol).toBe('VNM');
    expect(h.picks).toEqual(['FPT', 'VNM']);
  });

  it('rời giữa ván vẫn giữ lượt; vào lại trong giờ thì chơi tiếp từ phiên đang dở', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    const { match } = await h.service.startRoom('a', room.id);
    await playTo(h, 'b', match.match_id, 7);
    await h.service.leaveRoom('b', room.id);
    expect((await h.service.myRoom('b')).room).toBeNull();
    const back = await h.service.joinRoom('b', room.id, null);
    expect(back.match).toMatchObject({ id: match.match_id, status: 'playing', joined: true });
    const snapshot = await h.service.matchSnapshot('b', match.match_id);
    expect(snapshot.my_step).toBe(7);
    expect(snapshot.played_bars.map((bar) => bar.session)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('tác vụ định kỳ chốt ván hết giờ khi không ai mở màn chơi', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], { minutes: 5, stake_xu: 100 });
    const { match } = await h.service.startRoom('a', room.id);
    await h.service.placeOrder('b', match.match_id, { side: 'buy', qty: 100 });
    h.advance(5 * 60_000 + 1);
    expect(await h.service.sweep()).toEqual({ settled: 1, closed: 0 });
    expect(await h.service.sweep()).toEqual({ settled: 0, closed: 0 });
    expect(h.repository.balanceOf('b')).toBe(1100);
    // Không ai chơi lại sau 30 phút thì phòng đóng.
    h.advance(30 * 60_000);
    expect((await h.service.sweep()).closed).toBe(1);
  });
});
