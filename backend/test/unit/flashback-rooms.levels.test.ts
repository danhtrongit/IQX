/**
 * Flashback v2.1: cấp, điểm, bảng xếp hạng, vương miện, lịch sử đấu và biểu cảm
 * (IQX-Flashback-SPEC-BoSung §3, §4, §5, §6.4, §10), chạy trên kho trong bộ nhớ.
 */
import { describe, expect, it } from 'vitest';

import { FB_HISTORY_CAP } from '../../src/modules/flashback/flashback-rooms.repository.js';
import {
  FB_REACTION_COOLDOWN_MS,
  FB_REACTION_EMOJIS,
  FB_REACTION_WINDOW_MS,
} from '../../src/modules/flashback/flashback-rooms.reactions.js';
import { memoryDatabase } from './helpers/flashback-rooms-memory.js';
import {
  CASH,
  T0,
  code,
  playTo,
  rejection,
  roomOf,
  setup,
  type Harness,
} from './helpers/flashback-rooms-fixtures.js';

const ids = (count: number, prefix = 'u') =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(2, '0')}`);

/** Chơi một ván tới hết: `winner` mua 100 cổ phiếu ở phiên 0 (giá đi lên) nên thắng một mình. */
async function playMatch(
  h: Harness,
  users: readonly string[],
  options: { winner?: string; settings?: Record<string, unknown>; balance?: number } = {},
) {
  const room = await roomOf(
    h,
    users,
    options.settings ?? { stake_xu: 100, play_bars: 30, view_bars: 60 },
    options.balance ?? 1000,
  );
  const { match } = await h.service.startRoom(users[0]!, room.id);
  if (options.winner)
    await h.service.placeOrder(options.winner, match.match_id, { side: 'buy', qty: 100 });
  for (const id of users) {
    await playTo(h, id, match.match_id, 30);
    await h.service.finish(id, match.match_id);
  }
  return { room, matchId: match.match_id };
}

interface SeedPlayer {
  userId: string;
  rank: number;
  pnlPct?: number;
  stakeXu?: number;
  winXu?: number;
  refundXu?: number;
}

let seedSequence = 0;

/**
 * Chèn thẳng một ván đã kết thúc vào kho trong bộ nhớ (để dựng lịch sử dài, nhiều ván), rồi cộng
 * điểm bằng đúng đường cộng điểm của kho (`awardEntry`) nên bảng điểm khớp với các dòng entry.
 */
async function seedMatch(
  h: Harness,
  input: {
    endedAt: Date;
    players: readonly SeedPlayer[];
    symbol?: string;
    minutes?: number;
    stakeXu?: number;
    award?: boolean;
  },
) {
  const { repository } = h;
  const n = (seedSequence += 1);
  const pad = (value: number, width = 12) => String(value).padStart(width, '0');
  const roomId = `00000000-0000-4000-8000-${pad(n)}`;
  const matchId = `10000000-0000-4000-8000-${pad(n)}`;
  const minutes = input.minutes ?? 10;
  const stakeXu = input.stakeXu ?? 0;
  repository.state.rooms.push({
    id: roomId,
    code: String(200000 + n),
    ownerId: input.players[0]!.userId,
    viewBars: 60,
    playBars: 30,
    minutes,
    maxPlayers: 30,
    stakeXu,
    passwordHash: null,
    status: 'closed',
    currentMatchId: matchId,
    matchCount: 1,
    createdAt: input.endedAt,
    waitingSince: input.endedAt,
    closedAt: input.endedAt,
  });
  repository.state.matches.push({
    id: matchId,
    roomId,
    symbol: input.symbol ?? 'FPT',
    startDate: '2015-01-02',
    endDate: '2015-06-30',
    priceSource: null,
    fallbackLevel: 0,
    viewBars: 60,
    playBars: 30,
    warmupBars: [],
    bars: [],
    minutes,
    stakeXu,
    playerCount: input.players.length,
    potXu: stakeXu * input.players.length,
    startedAt: new Date(input.endedAt.getTime() - minutes * 60_000),
    endsAt: input.endedAt,
    status: 'paid',
    endedAt: input.endedAt,
    endReason: 'all_finished',
    paidAt: input.endedAt,
  });
  const entryIds: string[] = [];
  const solo = input.players.length === 1;
  for (const [index, player] of input.players.entries()) {
    const entryId = `20000000-0000-4000-8000-${pad(n * 100 + index)}`;
    entryIds.push(entryId);
    const pnl = player.pnlPct ?? 0;
    const finalNav = CASH + BigInt(Math.round(pnl * Number(CASH)));
    repository.state.entries.push({
      id: entryId,
      matchId,
      userId: player.userId,
      stakeXu: player.stakeXu ?? stakeXu,
      step: 30,
      cash: finalNav,
      initialCash: CASH,
      navByStep: [CASH],
      joinedAt: new Date(input.endedAt.getTime() - 60_000 + index),
      finishedAt: input.endedAt,
      autoFinished: false,
      finalNav,
      pnlPct: pnl,
      rank: player.rank,
      winXu: player.winXu ?? 0,
      refundXu: player.refundXu ?? 0,
      status: 'finished',
      points: 0,
      isWin: false,
      pointsAwardedAt: null,
    });
    if (input.award !== false) {
      const winner = !solo && player.rank === 1;
      await repository.awardEntry(memoryDatabase() as never, {
        entryId,
        userId: player.userId,
        points: solo ? 0 : winner ? 10 : 3,
        isWin: winner,
        counted: !solo,
        at: input.endedAt,
      });
    }
  }
  return { matchId, roomId, entryIds };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe('v2.1 §3 điểm và cấp khi kết thúc ván', () => {
  it('ván 4 người: người thắng +10, ba người còn lại +3; điểm vào fb_entries và bảng điểm; kết quả có cột điểm', async () => {
    const h = setup();
    const { matchId } = await playMatch(h, ['a', 'b', 'c', 'd'], { winner: 'a' });
    const entries = h.repository.state.entries.filter((entry) => entry.matchId === matchId);
    expect(entries.map((entry) => [entry.userId, entry.points, entry.isWin])).toEqual([
      ['a', 10, true],
      ['b', 3, false],
      ['c', 3, false],
      ['d', 3, false],
    ]);
    expect(entries.every((entry) => entry.pointsAwardedAt !== null)).toBe(true);
    expect(h.repository.state.stats.get('a')).toMatchObject({ points: 10, games: 1, wins: 1 });
    expect(h.repository.state.stats.get('b')).toMatchObject({ points: 3, games: 1, wins: 0 });

    const result = await h.service.result('b', matchId);
    expect(result.rows.map((row) => [row.user_id, row.points])).toEqual([
      ['a', 10],
      ['b', 3],
      ['c', 3],
      ['d', 3],
    ]);
    expect(result.solo).toBe(false);
    expect(result.progress).toEqual({
      points: 3,
      total_points: 3,
      level: 1,
      previous_level: 1,
      leveled_up: false,
      level_base: 0,
      next_level_points: 20,
      remaining_points: 17,
    });
    expect((await h.service.result('a', matchId)).progress).toMatchObject({
      points: 10,
      total_points: 10,
      remaining_points: 10,
    });
  });

  it('hoà hạng 1 tính thắng: cả hai người đồng hạng nhận +10 và một ván thắng', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c']);
    const { match } = await h.service.startRoom('a', room.id);
    for (const id of ['a', 'b'])
      await h.service.placeOrder(id, match.match_id, { side: 'buy', qty: 50 });
    for (const id of ['a', 'b', 'c']) {
      await playTo(h, id, match.match_id, 30);
      await h.service.finish(id, match.match_id);
    }
    const result = await h.service.result('c', match.match_id);
    expect(result.rows.map((row) => [row.user_id, row.rank, row.points])).toEqual([
      ['a', 1, 10],
      ['b', 1, 10],
      ['c', 3, 3],
    ]);
    expect(h.repository.state.stats.get('a')).toMatchObject({ points: 10, games: 1, wins: 1 });
    expect(h.repository.state.stats.get('b')).toMatchObject({ points: 10, games: 1, wins: 1 });
    expect(h.repository.state.stats.get('c')).toMatchObject({ points: 3, games: 1, wins: 0 });
    // Cả phòng hoà ở 0%: hoàn xu cược và tất cả đều là người thắng.
    const draw = await playMatch(h, ['x', 'y'], { settings: { stake_xu: 100 } });
    expect((await h.service.result('x', draw.matchId)).rows.map((row) => row.points)).toEqual([
      10, 10,
    ]);
  });

  it('chơi 1 mình: 0 điểm, không tính ván, không tính thắng, không vào bảng xếp hạng', async () => {
    const h = setup();
    const { matchId } = await playMatch(h, ['solo'], { settings: { max_players: 1 } });
    const entry = h.repository.state.entries.find((item) => item.matchId === matchId)!;
    expect(entry).toMatchObject({ points: 0, isWin: false });
    expect(entry.pointsAwardedAt).not.toBeNull();
    expect(h.repository.state.stats.has('solo')).toBe(false);
    const result = await h.service.result('solo', matchId);
    expect(result.solo).toBe(true);
    expect(result.rows[0]).toMatchObject({ points: 0, is_winner: false });
    expect(result.progress).toMatchObject({ points: 0, leveled_up: false, level: 1 });
    expect(await h.service.myLevel('solo')).toMatchObject({ rank: null, points: 0, games: 0 });
    expect((await h.service.leaderboard('solo')).rows).toEqual([]);
  });

  it('người chưa bấm tới phiên cuối (hết giờ, bị kéo tới phiên cuối) vẫn nhận điểm', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], { minutes: 5, stake_xu: 100 });
    const { match } = await h.service.startRoom('a', room.id);
    await h.service.placeOrder('a', match.match_id, { side: 'buy', qty: 100 });
    await playTo(h, 'b', match.match_id, 10);
    h.advance(5 * 60_000 + 1);
    expect(await h.service.sweep()).toEqual({ settled: 1, closed: 0 });
    const entries = h.repository.state.entries.filter((e) => e.matchId === match.match_id);
    expect(entries.map((entry) => [entry.userId, entry.autoFinished, entry.points])).toEqual([
      ['a', true, 10],
      ['b', true, 3],
      ['c', true, 3],
    ]);
  });

  it('phòng 30 người: một người +10, 29 người +3, mỗi người một ván, đúng xu', async () => {
    const h = setup();
    const users = ids(30);
    const { matchId } = await playMatch(h, users, {
      winner: 'u07',
      settings: { max_players: 30, stake_xu: 10, play_bars: 30, view_bars: 60 },
    });
    const entries = h.repository.state.entries.filter((entry) => entry.matchId === matchId);
    expect(entries).toHaveLength(30);
    expect(entries.filter((entry) => entry.points === 10).map((entry) => entry.userId)).toEqual([
      'u07',
    ]);
    expect(entries.filter((entry) => entry.points === 3)).toHaveLength(29);
    expect(entries.filter((entry) => entry.isWin)).toHaveLength(1);
    const total = [...h.repository.state.stats.values()].reduce((sum, row) => sum + row.points, 0);
    expect(total).toBe(10 + 29 * 3);
    expect([...h.repository.state.stats.values()].every((row) => row.games === 1)).toBe(true);
    expect(h.repository.balanceOf('u07')).toBe(1290);
    expect((await h.service.leaderboard('u00')).rows).toHaveLength(30);
  });

  it('mỗi (ván, người) chỉ cộng một lần: chốt lại, tác vụ định kỳ, xem kết quả nhiều lần không đổi điểm', async () => {
    const h = setup();
    const { matchId } = await playMatch(h, ['a', 'b'], { winner: 'a' });
    const snapshot = () => JSON.stringify([...h.repository.state.stats.entries()]);
    const before = snapshot();
    h.advance(60 * 60_000);
    expect(await h.service.settle(matchId)).toBe(false);
    await h.service.sweep();
    await h.service.sweep();
    await h.service.result('a', matchId);
    await h.service.result('b', matchId);
    await Promise.all([h.service.sweep(), h.service.sweep()]);
    expect(snapshot()).toBe(before);
    const entry = h.repository.state.entries.find((e) => e.userId === 'a')!;
    // Gọi thẳng kho lần hai: dòng đã có points_awarded_at nên bị bỏ qua, bảng điểm không đổi.
    expect(
      await h.repository.awardEntry(memoryDatabase() as never, {
        entryId: entry.id,
        userId: 'a',
        points: 10,
        isWin: true,
        counted: true,
        at: h.clock.at,
      }),
    ).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it('ván do bản cũ chốt (chưa có điểm): tác vụ định kỳ và xem kết quả cộng bù đúng một lần', async () => {
    const h = setup();
    const { matchId } = await playMatch(h, ['a', 'b', 'c'], { winner: 'a' });
    const wipe = () => {
      for (const entry of h.repository.state.entries) {
        entry.points = 0;
        entry.isWin = false;
        entry.pointsAwardedAt = null;
      }
      h.repository.state.stats.clear();
    };
    wipe();
    expect(await h.service.sweep()).toEqual({ settled: 0, closed: 0 });
    expect(
      h.repository.state.entries.map((entry) => [entry.userId, entry.points, entry.isWin]),
    ).toEqual([
      ['a', 10, true],
      ['b', 3, false],
      ['c', 3, false],
    ]);
    expect(h.repository.state.stats.get('a')).toMatchObject({ points: 10, games: 1, wins: 1 });
    await h.service.sweep();
    expect(h.repository.state.stats.get('a')).toMatchObject({ points: 10, games: 1, wins: 1 });

    wipe();
    const result = await h.service.result('b', matchId);
    expect(result.rows.map((row) => row.points)).toEqual([10, 3, 3]);
    expect(h.repository.state.stats.get('b')).toMatchObject({ points: 3, games: 1 });
  });

  it('lên cấp: dòng tiến độ báo cấp trước, cấp sau và số điểm còn thiếu; mốc 50 điểm là cấp 3', async () => {
    const h = setup();
    for (const id of ['a', 'b']) h.repository.addUser(id, `user-${id}`, 1000);
    // Bốn ván thắng trước đó: 40 điểm, cấp 2.
    for (let index = 0; index < 4; index += 1)
      await seedMatch(h, {
        endedAt: new Date(T0.getTime() - (index + 1) * DAY),
        players: [
          { userId: 'a', rank: 1 },
          { userId: 'b', rank: 2 },
        ],
      });
    expect(await h.service.myLevel('a')).toMatchObject({
      points: 40,
      level: 2,
      remaining_points: 10,
    });
    const { matchId } = await playMatch(h, ['a', 'b'], { winner: 'a' });
    const result = await h.service.result('a', matchId);
    expect(result.progress).toEqual({
      points: 10,
      total_points: 50,
      level: 3,
      previous_level: 2,
      leveled_up: true,
      level_base: 50,
      next_level_points: 90,
      remaining_points: 40,
    });
    expect(await h.service.myLevel('a')).toMatchObject({
      points: 50,
      level: 3,
      level_base: 50,
      next_level_points: 90,
      remaining_points: 40,
    });
    // b thua 5 ván (bốn ván trước và ván này, mỗi ván +3) rồi thắng 3 ván: 15 + 30 = 45 điểm,
    // còn 5 điểm nữa mới lên cấp 3 (50 điểm).
    for (let index = 0; index < 3; index += 1)
      await seedMatch(h, {
        endedAt: new Date(T0.getTime() - (index + 10) * DAY),
        players: [
          { userId: 'b', rank: 1 },
          { userId: 'c', rank: 2 },
        ],
      });
    expect(await h.service.myLevel('b')).toMatchObject({
      points: 45,
      level: 2,
      level_base: 20,
      next_level_points: 50,
      remaining_points: 5,
    });
  });

  it('mở lại kết quả sau khi đã chơi ván khác: tổng điểm tính tới ván đó, không phải tổng hiện tại', async () => {
    const h = setup();
    const first = await playMatch(h, ['a', 'b'], { winner: 'a' });
    expect((await h.service.result('a', first.matchId)).progress).toMatchObject({
      points: 10,
      total_points: 10,
    });
    // Phòng bị đóng sau 30 phút; a chơi tiếp ván khác trong phòng mới (+10 nữa).
    h.advance(31 * 60_000);
    await h.service.sweep();
    const second = await playMatch(h, ['a', 'c'], { winner: 'a' });
    expect((await h.service.result('a', second.matchId)).progress).toMatchObject({
      points: 10,
      total_points: 20,
      level: 2,
      previous_level: 1,
      leveled_up: true,
    });
    expect((await h.service.result('a', first.matchId)).progress).toMatchObject({
      points: 10,
      total_points: 10,
      level: 1,
      leveled_up: false,
    });
  });
});

describe('v2.1 §4 bảng xếp hạng và vương miện', () => {
  it('xếp theo điểm, bằng điểm thì nhiều ván thắng hơn, vẫn bằng thì đạt mốc điểm sớm hơn', async () => {
    const h = setup();
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 0, minute));
    for (const [id, points, wins, minute] of [
      ['d', 50, 3, 5],
      ['b', 60, 2, 9],
      ['c', 50, 4, 8],
      ['a', 50, 3, 1],
      ['e', 10, 1, 0],
    ] as const) {
      h.repository.addUser(id, `user-${id}`);
      h.repository.setStats(id, { points, wins, games: 6, reachedPointsAt: at(minute) });
    }
    const board = await h.service.leaderboard('e');
    expect(board.rows.map((row) => [row.rank, row.user_id])).toEqual([
      [1, 'b'],
      [2, 'c'],
      [3, 'a'],
      [4, 'd'],
      [5, 'e'],
    ]);
    expect(board.rows.map((row) => row.crown)).toEqual([1, 2, 3, null, null]);
    expect(board.rows.map((row) => row.level)).toEqual([3, 3, 3, 3, 1]);
    expect(board.rows.find((row) => row.is_me)?.user_id).toBe('e');
    expect(board.me).toBeNull();
    expect(board.rows[0]).toMatchObject({ points: 60, wins: 2, games: 6, name: 'user-b' });
  });

  it('chỉ tính người đã chơi ít nhất một ván từ 2 người; mình ngoài top 50 thì có thêm dòng của mình với đúng hạng', async () => {
    const h = setup();
    const users = ids(60, 'p');
    users.forEach((id, index) => {
      h.repository.addUser(id, `user-${id}`);
      h.repository.setStats(id, { points: 600 - index * 5, wins: 5, games: 8 });
    });
    h.repository.addUser('newbie', 'newbie');
    h.repository.state.stats.set('newbie', {
      points: 0,
      games: 0,
      wins: 0,
      reachedPointsAt: new Date(0),
    });
    const outside = await h.service.leaderboard('p54');
    expect(outside.rows).toHaveLength(50);
    expect(outside.rows.some((row) => row.is_me)).toBe(false);
    expect(outside.me).toMatchObject({ rank: 55, user_id: 'p54', is_me: true, crown: null });
    // 330 điểm: levelBase(7) = 270 <= 330 < levelBase(8) = 350.
    expect(outside.me!.level).toBe(7);

    const inside = await h.service.leaderboard('p09');
    expect(inside.me).toBeNull();
    expect(inside.rows.find((row) => row.is_me)).toMatchObject({ rank: 10, user_id: 'p09' });

    const nobody = await h.service.leaderboard('newbie');
    expect(nobody.me).toBeNull();
    expect(await h.service.myLevel('newbie')).toMatchObject({
      rank: null,
      points: 0,
      level: 1,
      level_base: 0,
      next_level_points: 20,
      remaining_points: 20,
    });
    expect(await h.service.myLevel('p54')).toMatchObject({ rank: 55, points: 600 - 54 * 5 });
    expect((await h.service.leaderboard('p00', 3)).rows).toHaveLength(3);
  });

  it('top3 trả đúng người đang hạng 1, 2, 3; vương miện hiện ở sảnh, phòng chờ, màn chơi, kết quả và lịch sử', async () => {
    const h = setup();
    for (const [id, points] of [
      ['p1', 100],
      ['p2', 80],
      ['p3', 60],
      ['p4', 40],
    ] as const) {
      h.repository.addUser(id, `user-${id}`, 1000);
      h.repository.setStats(id, { points, wins: 2, games: 5 });
    }
    expect(
      (await h.service.top3()).users.map((user) => [user.rank, user.user_id, user.level]),
    ).toEqual([
      [1, 'p1', 4],
      [2, 'p2', 3],
      [3, 'p3', 3],
    ]);
    // Sảnh: chủ phòng p3 hạng 3.
    const room = await h.service.createRoom('p3', { max_players: 4, stake_xu: 10 });
    for (const id of ['p1', 'p2', 'p4']) {
      h.advance(10);
      await h.service.joinRoom(id, room.id, null);
      await h.service.setReady(id, room.id, true);
    }
    const lobby = await h.service.listRooms('all');
    expect(lobby.rooms[0]!.owner).toMatchObject({ name: 'user-p3', crown: 3, level: 3 });
    // Phòng chờ.
    const waiting = await h.service.getRoom('p4', room.id);
    expect(waiting.members.map((member) => [member.user_id, member.crown, member.level])).toEqual([
      ['p3', 3, 3],
      ['p1', 1, 4],
      ['p2', 2, 3],
      ['p4', null, 2],
    ]);
    // Màn chơi và kết quả.
    const { match } = await h.service.startRoom('p3', room.id);
    const state = await h.service.state('p4', match.match_id);
    expect(state.players.map((player) => [player.user_id, player.crown, player.level])).toEqual([
      ['p3', 3, 3],
      ['p1', 1, 4],
      ['p2', 2, 3],
      ['p4', null, 2],
    ]);
    expect(match.players.map((player) => player.crown)).toEqual([3, 1, 2, null]);
    for (const id of ['p3', 'p1', 'p2', 'p4']) {
      await playTo(h, id, match.match_id, 30);
      await h.service.finish(id, match.match_id);
    }
    const result = await h.service.result('p4', match.match_id);
    expect(result.rows.every((row) => 'crown' in row && 'level' in row)).toBe(true);
    // Lịch sử: người chơi trong chi tiết ván cũng có cấp và vương miện.
    const history = await h.service.history('p4', { result: 'all', days: 'all', page: 1 });
    expect(
      history.items[0]!.players.map((player) => [player.user_id, player.crown]).sort(),
    ).toEqual(
      [
        ['p1', 1],
        ['p2', 2],
        ['p3', 3],
        ['p4', null],
      ].sort(),
    );
  });

  it('hạng thay đổi thì vương miện đổi theo lần tải kế tiếp', async () => {
    const h = setup();
    for (const [id, points] of [
      ['a', 100],
      ['b', 90],
      ['c', 80],
      ['d', 77],
    ] as const) {
      h.repository.addUser(id, `user-${id}`, 1000);
      h.repository.setStats(id, { points, wins: 2, games: 5 });
    }
    expect((await h.service.top3()).users.map((user) => user.user_id)).toEqual(['a', 'b', 'c']);
    // d thắng một ván 4 người: 77 + 10 = 87, vượt c (80) và vào hạng 3.
    const { matchId } = await playMatch(h, ['d', 'x', 'y', 'z'], { winner: 'd' });
    expect((await h.service.top3()).users.map((user) => user.user_id)).toEqual(['a', 'b', 'd']);
    const room = await h.service.createRoom('c', { max_players: 4, stake_xu: 10 });
    const members = (await h.service.getRoom('c', room.id)).members;
    expect(members[0]).toMatchObject({ user_id: 'c', crown: null });
    expect((await h.service.result('d', matchId)).rows[0]).toMatchObject({
      user_id: 'd',
      crown: 3,
    });
  });
});

describe('v2.1 §5 lịch sử đấu', () => {
  it('ván vừa chơi nằm đầu danh sách với kết quả, hạng, xu, điểm, người chơi và chỉ lệnh của mình', async () => {
    const h = setup();
    const { matchId, room } = await playMatch(h, ['a', 'b', 'c', 'd'], { winner: 'a' });
    const view = await h.service.history('a', { result: 'all', days: 'all', page: 1 });
    expect(view).toMatchObject({ page: 1, page_size: 20, total: 1, pages: 1 });
    const item = view.items[0]!;
    expect(item).toMatchObject({
      match_id: matchId,
      room_id: room.id,
      player_count: 4,
      view_bars: 60,
      play_bars: 30,
      minutes: 10,
      stake_xu: 100,
      symbol: 'FPT',
      result: 'win',
      rank: 1,
      xu: 300,
      points: 10,
    });
    expect(item.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.pnl_pct).toBeCloseTo(0.02985, 6);
    expect(item.pnl_percent).toBeCloseTo(2.985, 4);
    expect(
      item.players.map((player) => [player.user_id, player.rank, player.points, player.xu]),
    ).toEqual([
      ['a', 1, 10, 300],
      ['b', 2, 3, -100],
      ['c', 2, 3, -100],
      ['d', 2, 3, -100],
    ]);
    expect(item.players.find((player) => player.is_me)?.user_id).toBe('a');
    // Chỉ có lệnh của mình; tiền mặt cuối ván tính theo tổng tài sản.
    expect(item.orders).toHaveLength(1);
    expect(item.orders[0]).toMatchObject({ side: 'buy', qty: 100, step: 0, price: '10000' });
    expect(item.orders[0]!.fee).toBe('1500');
    expect(item.cash_percent).toBe(Math.round((8_998_500 * 100) / 10_298_500));
    const other = await h.service.history('b', { result: 'all', days: 'all', page: 1 });
    expect(other.items[0]).toMatchObject({
      result: 'lose',
      rank: 2,
      xu: -100,
      points: 3,
      orders: [],
    });
    expect(JSON.stringify(other)).not.toContain('"buy"');
    // Người không chơi ván này không thấy nó.
    h.repository.addUser('zzz', 'zzz');
    expect((await h.service.history('zzz', { result: 'all', days: 'all', page: 1 })).items).toEqual(
      [],
    );
  });

  it('nhãn Thắng, Hoà, Thua, Chơi 1 mình và lọc theo kết quả (Thắng gồm cả Hoà)', async () => {
    const h = setup();
    for (const id of ['me', 'p', 'q']) h.repository.addUser(id, `user-${id}`);
    const base = T0.getTime();
    await seedMatch(h, {
      endedAt: new Date(base - 1 * HOUR),
      players: [
        { userId: 'me', rank: 1, pnlPct: 0.05 },
        { userId: 'p', rank: 2 },
      ],
    });
    await seedMatch(h, {
      endedAt: new Date(base - 2 * HOUR),
      players: [
        { userId: 'me', rank: 1, pnlPct: 0.02 },
        { userId: 'p', rank: 1, pnlPct: 0.02 },
        { userId: 'q', rank: 3 },
      ],
    });
    await seedMatch(h, {
      endedAt: new Date(base - 3 * HOUR),
      players: [
        { userId: 'p', rank: 1, pnlPct: 0.1 },
        { userId: 'me', rank: 2, pnlPct: -0.01 },
      ],
    });
    await seedMatch(h, {
      endedAt: new Date(base - 4 * HOUR),
      players: [{ userId: 'me', rank: 1 }],
    });
    const all = await h.service.history('me', { result: 'all', days: 'all', page: 1 });
    expect(all.items.map((item) => item.result)).toEqual(['win', 'tie', 'lose', 'solo']);
    expect(all.items.map((item) => item.points)).toEqual([10, 10, 3, 0]);
    expect(all.items.map((item) => item.ended_at)).toEqual(
      [1, 2, 3, 4].map((hours) => new Date(base - hours * HOUR).toISOString()),
    );
    const query = (result: 'all' | 'win' | 'lose' | 'solo') =>
      h.service.history('me', { result, days: 'all', page: 1 });
    expect((await query('win')).items.map((item) => item.result)).toEqual(['win', 'tie']);
    expect((await query('lose')).items.map((item) => item.result)).toEqual(['lose']);
    expect((await query('solo')).items.map((item) => item.result)).toEqual(['solo']);
    expect((await query('win')).total).toBe(2);
  });

  it('lọc theo 7 ngày, 30 ngày, tất cả', async () => {
    const h = setup();
    for (const id of ['me', 'p']) h.repository.addUser(id, `user-${id}`);
    for (const days of [1, 10, 40])
      await seedMatch(h, {
        endedAt: new Date(T0.getTime() - days * DAY),
        players: [
          { userId: 'me', rank: 1 },
          { userId: 'p', rank: 2 },
        ],
      });
    const total = async (days: '7' | '30' | 'all') =>
      (await h.service.history('me', { result: 'all', days, page: 1 })).total;
    expect(await total('7')).toBe(1);
    expect(await total('30')).toBe(2);
    expect(await total('all')).toBe(3);
  });

  it('20 ván mỗi trang, trang quá cuối lùi về trang cuối, tối đa 200 ván gần nhất', async () => {
    const h = setup();
    for (const id of ['me', 'p']) h.repository.addUser(id, `user-${id}`);
    for (let index = 0; index < FB_HISTORY_CAP + 5; index += 1)
      await seedMatch(h, {
        endedAt: new Date(T0.getTime() - (index + 1) * HOUR),
        players: [
          { userId: 'me', rank: index % 2 === 0 ? 1 : 2 },
          { userId: 'p', rank: index % 2 === 0 ? 2 : 1 },
        ],
      });
    const first = await h.service.history('me', { result: 'all', days: 'all', page: 1 });
    expect(first).toMatchObject({ page: 1, page_size: 20, total: 200, pages: 10 });
    expect(first.items).toHaveLength(20);
    const second = await h.service.history('me', { result: 'all', days: 'all', page: 2 });
    expect(second.items).toHaveLength(20);
    expect(new Set([...first.items, ...second.items].map((item) => item.match_id)).size).toBe(40);
    // Ván mới nhất trước: trang 1 bắt đầu từ 1 giờ trước.
    expect(first.items[0]!.ended_at).toBe(new Date(T0.getTime() - HOUR).toISOString());
    const last = await h.service.history('me', { result: 'all', days: 'all', page: 10 });
    expect(last.items).toHaveLength(20);
    // 205 ván chỉ hiện 200 ván gần nhất: ván cũ nhất (205 giờ trước) không có trong danh sách.
    expect(last.items.at(-1)!.ended_at).toBe(new Date(T0.getTime() - 200 * HOUR).toISOString());
    const beyond = await h.service.history('me', { result: 'all', days: 'all', page: 99 });
    expect(beyond.page).toBe(10);
    expect(beyond.items).toHaveLength(20);
    // Lọc "Thắng" cũng giới hạn ở 200 ván gần nhất khớp bộ lọc: ở đây chỉ có 103 ván thắng.
    const wins = await h.service.history('me', { result: 'win', days: 'all', page: 6 });
    expect(wins).toMatchObject({ total: 103, pages: 6 });
    expect(wins.items).toHaveLength(3);
    // Tổng kết tính trên mọi ván trong khoảng thời gian, không giới hạn ở 200.
    expect((await h.service.historySummary('me', 'all')).games).toBe(FB_HISTORY_CAP + 5);
  });

  it('chưa có ván nào: danh sách trống và tổng kết bằng 0', async () => {
    const h = setup();
    h.repository.addUser('me', 'me');
    expect(await h.service.history('me', { result: 'all', days: 'all', page: 1 })).toEqual({
      items: [],
      page: 1,
      page_size: 20,
      total: 0,
      pages: 1,
    });
    expect(await h.service.historySummary('me', 'all')).toEqual({
      games: 0,
      solo_games: 0,
      multi_games: 0,
      wins: 0,
      win_rate: 0,
      xu_net: 0,
      points: 0,
      avg_pnl_pct: 0,
      avg_pnl_percent: 0,
      best_pnl_pct: null,
      best_pnl_percent: null,
      best_symbol: null,
    });
  });

  it('sáu số tổng kết đúng theo khoảng thời gian: số ván, thắng và tỷ lệ, xu, điểm, lãi trung bình, ván tốt nhất', async () => {
    const h = setup();
    for (const id of ['me', 'p', 'q']) h.repository.addUser(id, `user-${id}`);
    const base = T0.getTime();
    // 1: thắng, cược 100, thắng 200 → +100 xu, +10 điểm, +8%
    await seedMatch(h, {
      endedAt: new Date(base - 1 * DAY),
      symbol: 'FPT',
      stakeXu: 100,
      players: [
        { userId: 'me', rank: 1, pnlPct: 0.08, winXu: 200 },
        { userId: 'p', rank: 2, pnlPct: -0.02 },
      ],
    });
    // 2: thua, cược 50 → −50 xu, +3 điểm, −4%
    await seedMatch(h, {
      endedAt: new Date(base - 3 * DAY),
      symbol: 'HPG',
      stakeXu: 50,
      players: [
        { userId: 'p', rank: 1, pnlPct: 0.1, winXu: 100 },
        { userId: 'me', rank: 2, pnlPct: -0.04 },
      ],
    });
    // 3: hoà hạng 1 cả phòng, hoàn cược 100 → 0 xu, +10 điểm, 0%
    await seedMatch(h, {
      endedAt: new Date(base - 5 * DAY),
      symbol: 'VNM',
      stakeXu: 100,
      players: [
        { userId: 'me', rank: 1, pnlPct: 0, refundXu: 100 },
        { userId: 'q', rank: 1, pnlPct: 0, refundXu: 100 },
      ],
    });
    // 4: chơi 1 mình, +12%
    await seedMatch(h, {
      endedAt: new Date(base - 6 * DAY),
      symbol: 'MWG',
      players: [{ userId: 'me', rank: 1, pnlPct: 0.12 }],
    });
    // 5: cũ hơn 30 ngày, thắng, +20%
    await seedMatch(h, {
      endedAt: new Date(base - 40 * DAY),
      symbol: 'VCB',
      stakeXu: 100,
      players: [
        { userId: 'me', rank: 1, pnlPct: 0.2, winXu: 100 },
        { userId: 'p', rank: 2 },
      ],
    });
    const week = await h.service.historySummary('me', '7');
    expect(week).toMatchObject({
      games: 4,
      solo_games: 1,
      multi_games: 3,
      wins: 2,
      xu_net: 100 - 50 + 0,
      points: 10 + 3 + 10 + 0,
    });
    expect(week.win_rate).toBeCloseTo(2 / 3, 10);
    expect(week.avg_pnl_pct).toBeCloseTo((0.08 - 0.04 + 0 + 0.12) / 4, 10);
    expect(week.avg_pnl_percent).toBeCloseTo(4, 8);
    expect(week.best_pnl_percent).toBeCloseTo(12, 8);
    expect(week.best_symbol).toBe('MWG');
    const month = await h.service.historySummary('me', '30');
    expect(month.games).toBe(4);
    const all = await h.service.historySummary('me', 'all');
    expect(all).toMatchObject({
      games: 5,
      wins: 3,
      xu_net: 100 - 50 + 0 + 0 - 0 + 0,
      points: 33,
      best_symbol: 'VCB',
    });
    expect(all.xu_net).toBe(100 - 50 + 0 + 0);
    expect(all.best_pnl_percent).toBeCloseTo(20, 8);
    expect(all.win_rate).toBeCloseTo(3 / 4, 10);
  });
});

describe('v2.1 §6.4 biểu cảm', () => {
  async function playing(users: readonly string[] = ['a', 'b', 'c']) {
    const h = setup();
    const room = await roomOf(h, users);
    const { match } = await h.service.startRoom(users[0]!, room.id);
    return { h, matchId: match.match_id };
  }

  it('gửi một biểu cảm: mọi người trong ván thấy ở lần polling state kế tiếp, kèm id và tuổi', async () => {
    const { h, matchId } = await playing();
    const sent = await h.service.sendReaction('a', matchId, '🚀');
    expect(sent).toMatchObject({ user_id: 'a', emoji: '🚀' });
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);
    h.advance(1_200);
    for (const viewer of ['a', 'b', 'c']) {
      const state = await h.service.state(viewer, matchId);
      expect(state.reactions).toEqual([{ id: sent.id, user_id: 'a', emoji: '🚀', age_ms: 1_200 }]);
    }
    expect((await h.service.matchSnapshot('b', matchId)).reactions).toHaveLength(1);
  });

  it('server chỉ nhận 12 emoji trong danh sách, từ chối emoji ngoài danh sách và chuỗi tuỳ ý', async () => {
    const { h, matchId } = await playing();
    expect(FB_REACTION_EMOJIS).toHaveLength(12);
    for (const bad of ['👍', '<b>x</b>', '', '😂😂', 'rocket'])
      expect(code(await rejection(h.service.sendReaction('a', matchId, bad)))).toBe(
        'REACTION_INVALID',
      );
    expect((await h.service.state('a', matchId)).reactions).toEqual([]);
    for (const [index, emoji] of FB_REACTION_EMOJIS.entries()) {
      h.advance(FB_REACTION_COOLDOWN_MS);
      expect((await h.service.sendReaction(`${'abc'[index % 3]}`, matchId, emoji)).emoji).toBe(
        emoji,
      );
    }
  });

  it('giới hạn tốc độ: mỗi người 1 biểu cảm mỗi 1,5 giây, lần 2 bị chặn bằng "Từ từ thôi 😄"', async () => {
    const { h, matchId } = await playing();
    await h.service.sendReaction('a', matchId, '😂');
    h.advance(1_000);
    const blocked = await rejection(h.service.sendReaction('a', matchId, '🔥'));
    expect(blocked.status).toBe(429);
    expect(blocked.response).toMatchObject({
      code: 'REACTION_TOO_FAST',
      message: 'Từ từ thôi 😄',
      details: [{ retry_after_ms: 500 }],
    });
    // Người khác không bị ảnh hưởng.
    await h.service.sendReaction('b', matchId, '🔥');
    h.advance(500);
    await h.service.sendReaction('a', matchId, '🔥');
    expect(
      (await h.service.state('c', matchId)).reactions.map((r) => [r.user_id, r.emoji]),
    ).toEqual([
      ['a', '😂'],
      ['b', '🔥'],
      ['a', '🔥'],
    ]);
  });

  it('không lưu lịch sử: biểu cảm biến khỏi state sau cửa sổ vài giây', async () => {
    const { h, matchId } = await playing();
    await h.service.sendReaction('a', matchId, '👏');
    h.advance(FB_REACTION_WINDOW_MS - 1);
    expect((await h.service.state('b', matchId)).reactions).toHaveLength(1);
    h.advance(1);
    expect((await h.service.state('b', matchId)).reactions).toEqual([]);
  });

  it('chỉ người trong ván mới gửi và xem được; ván kết thúc thì không gửi được và state không còn biểu cảm', async () => {
    const { h, matchId } = await playing(['a', 'b']);
    h.repository.addUser('out', 'out', 0);
    expect(code(await rejection(h.service.sendReaction('out', matchId, '😂')))).toBe(
      'MATCH_NOT_FOUND',
    );
    expect(code(await rejection(h.service.state('out', matchId)))).toBe('MATCH_NOT_FOUND');
    expect(
      code(
        await rejection(h.service.sendReaction('a', '00000000-0000-4000-8000-0000000000ff', '😂')),
      ),
    ).toBe('MATCH_NOT_FOUND');
    await h.service.sendReaction('a', matchId, '😂');
    for (const id of ['a', 'b']) {
      await playTo(h, id, matchId, 30);
      await h.service.finish(id, matchId);
    }
    h.advance(2_000);
    const state = await h.service.state('a', matchId);
    expect(state.status).toBe('ended');
    expect(state.reactions).toEqual([]);
    expect(code(await rejection(h.service.sendReaction('b', matchId, '🔥')))).toBe('MATCH_ENDED');
  });
});
