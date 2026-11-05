import { describe, expect, it } from 'vitest';

import {
  FB_INITIAL_CASH_VND,
  FB_POINTS_LOSS,
  FB_POINTS_WIN,
  compareRank,
  hashRoomPassword,
  historyResultOf,
  joinCheck,
  levelBase,
  levelInfo,
  levelOfPoints,
  levelStep,
  matchPoints,
  navAtStep,
  pnlKey,
  randomJoinCandidates,
  resultTitle,
  resultXuLabel,
  settleMatch,
  validateRoomSettings,
  verifyRoomPassword,
  type FbJoinCheckInput,
  type FbSettlementPlayer,
} from '../../src/modules/flashback/flashback-rooms.logic.js';

const CASH = FB_INITIAL_CASH_VND;

describe('§3 tạo phòng: validateRoomSettings', () => {
  const ok = { view_bars: 60, play_bars: 30, minutes: 10, max_players: 4, stake_xu: 100 };

  it('chặn phiên xem / phiên chơi dưới 30 hoặc trên 120 với đúng câu báo lỗi', () => {
    expect(validateRoomSettings({ ...ok, view_bars: 29 }, 1000)).toEqual({
      ok: false,
      message: 'Số phiên xem phải từ 30 đến 120',
    });
    expect(validateRoomSettings({ ...ok, view_bars: 121 }, 1000)).toMatchObject({ ok: false });
    expect(validateRoomSettings({ ...ok, view_bars: 30.5 }, 1000)).toMatchObject({ ok: false });
    expect(validateRoomSettings({ ...ok, play_bars: 29 }, 1000)).toEqual({
      ok: false,
      message: 'Số phiên chơi phải từ 30 đến 120',
    });
    expect(validateRoomSettings({ ...ok, play_bars: 121 }, 1000)).toEqual({
      ok: false,
      message: 'Số phiên chơi phải từ 30 đến 120',
    });
  });

  it('chặn cược không phải bội số 10, dưới 10 hoặc vượt số xu đang có', () => {
    const multiple = { ok: false, message: 'Số xu cược tối thiểu 10, là bội số của 10' };
    expect(validateRoomSettings({ ...ok, stake_xu: 15 }, 1000)).toEqual(multiple);
    expect(validateRoomSettings({ ...ok, stake_xu: 0 }, 1000)).toEqual(multiple);
    expect(validateRoomSettings({ ...ok, stake_xu: 5 }, 1000)).toEqual(multiple);
    expect(validateRoomSettings({ ...ok, stake_xu: 1010 }, 1000)).toEqual({
      ok: false,
      message: 'Bạn chỉ có 1.000 xu',
    });
    expect(validateRoomSettings({ ...ok, stake_xu: 1000 }, 1000)).toMatchObject({ ok: true });
  });

  it('v2.1 §1: phòng 5 đến 30 người hợp lệ, mặc định vẫn 4 người', () => {
    for (const maxPlayers of [5, 8, 9, 29, 30])
      expect(validateRoomSettings({ ...ok, max_players: maxPlayers }, 1000)).toMatchObject({
        ok: true,
        value: { maxPlayers, stakeXu: 100 },
      });
    expect(validateRoomSettings({}, 1000)).toMatchObject({ ok: true, value: { maxPlayers: 4 } });
  });

  it('chọn 1 người thì khoá ô cược: không cược kể cả khi gửi giá trị lẻ hay không có xu', () => {
    expect(validateRoomSettings({ ...ok, max_players: 1, stake_xu: 15 }, 0)).toEqual({
      ok: true,
      value: {
        viewBars: 60,
        playBars: 30,
        minutes: 10,
        maxPlayers: 1,
        stakeXu: 0,
        password: null,
        chatEnabled: true,
      },
    });
  });

  it('kiểm tra thời gian, số người và mật khẩu 4–12 ký tự; trường thiếu dùng mặc định', () => {
    expect(validateRoomSettings({ ...ok, minutes: 7 }, 1000)).toMatchObject({ ok: false });
    expect(validateRoomSettings({ ...ok, max_players: 31 }, 1000)).toEqual({
      ok: false,
      message: 'Số người tối đa phải từ 1 đến 30',
    });
    expect(validateRoomSettings({ ...ok, max_players: 0 }, 1000)).toMatchObject({ ok: false });
    expect(validateRoomSettings({ ...ok, max_players: 2.5 }, 1000)).toMatchObject({ ok: false });
    expect(validateRoomSettings({ ...ok, password: 'abc' }, 1000)).toEqual({
      ok: false,
      message: 'Mật khẩu từ 4 đến 12 ký tự',
    });
    expect(validateRoomSettings({ ...ok, password: 'a'.repeat(13) }, 1000)).toMatchObject({
      ok: false,
    });
    expect(validateRoomSettings({ ...ok, password: '  ' }, 1000)).toMatchObject({
      ok: true,
      value: { password: null },
    });
    expect(validateRoomSettings({}, 100)).toEqual({
      ok: true,
      value: {
        viewBars: 60,
        playBars: 30,
        minutes: 10,
        maxPlayers: 4,
        stakeXu: 100,
        password: null,
        chatEnabled: true,
      },
    });
  });

  it('băm mật khẩu phòng (không lưu bản rõ) và kiểm tra đúng/sai', async () => {
    const hash = await hashRoomPassword('1234');
    expect(hash).not.toContain('1234');
    expect(await verifyRoomPassword('1234', hash)).toBe(true);
    expect(await verifyRoomPassword('12345', hash)).toBe(false);
  });
});

describe('§2.3 vào phòng: joinCheck theo đúng thứ tự', () => {
  const base: FbJoinCheckInput = {
    status: 'waiting',
    memberCount: 1,
    maxPlayers: 4,
    stakeXu: 100,
    balanceXu: 500,
    locked: false,
    passwordGiven: false,
    passwordOk: false,
    inOtherRoom: false,
  };

  it('đang chơi → đủ người → thiếu xu → mật khẩu → đang ở phòng khác', () => {
    const worst: FbJoinCheckInput = {
      ...base,
      status: 'playing',
      memberCount: 4,
      balanceXu: 0,
      locked: true,
      passwordGiven: true,
      passwordOk: false,
      inOtherRoom: true,
    };
    expect(joinCheck(worst)).toEqual({
      code: 'ROOM_PLAYING',
      message: 'Phòng đang chơi, chưa vào được',
    });
    expect(joinCheck({ ...worst, status: 'waiting' })).toEqual({
      code: 'ROOM_FULL',
      message: 'Phòng đã đủ người',
    });
    expect(joinCheck({ ...worst, status: 'waiting', memberCount: 2 })).toEqual({
      code: 'XU_INSUFFICIENT',
      message: 'Không đủ xu để vào phòng cược 100 xu',
    });
    expect(joinCheck({ ...worst, status: 'waiting', memberCount: 2, balanceXu: 100 })).toEqual({
      code: 'WRONG_PASSWORD',
      message: 'Mật khẩu không đúng',
    });
    expect(
      joinCheck({
        ...worst,
        status: 'waiting',
        memberCount: 2,
        balanceXu: 100,
        passwordGiven: false,
      }),
    ).toMatchObject({ code: 'PASSWORD_REQUIRED' });
    expect(
      joinCheck({ ...worst, status: 'waiting', memberCount: 2, balanceXu: 100, passwordOk: true }),
    ).toMatchObject({ code: 'ALREADY_IN_ROOM' });
    expect(joinCheck(base)).toBeNull();
    expect(joinCheck({ ...base, stakeXu: 0, balanceXu: 0 })).toBeNull();
  });
});

describe('§2.1 Chơi phòng bất kỳ: randomJoinCandidates', () => {
  it('chỉ giữ phòng đang chờ, không khoá, còn chỗ và cược không vượt số xu', () => {
    const rooms = [
      { id: 'ok', status: 'waiting', locked: false, memberCount: 1, maxPlayers: 2, stakeXu: 100 },
      {
        id: 'ok-free',
        status: 'waiting',
        locked: false,
        memberCount: 3,
        maxPlayers: 4,
        stakeXu: 0,
      },
      { id: 'locked', status: 'waiting', locked: true, memberCount: 1, maxPlayers: 4, stakeXu: 0 },
      { id: 'full', status: 'waiting', locked: false, memberCount: 2, maxPlayers: 2, stakeXu: 0 },
      { id: 'rich', status: 'waiting', locked: false, memberCount: 1, maxPlayers: 4, stakeXu: 110 },
      {
        id: 'playing',
        status: 'playing',
        locked: false,
        memberCount: 1,
        maxPlayers: 4,
        stakeXu: 0,
      },
    ] as const;
    expect(randomJoinCandidates(rooms, 100).map((room) => room.id)).toEqual(['ok', 'ok-free']);
  });
});

const player = (id: string, overrides: Partial<FbSettlementPlayer> = {}): FbSettlementPlayer => ({
  entryId: `e-${id}`,
  userId: id,
  joinedAt: new Date(Date.UTC(2026, 0, 1) + id.charCodeAt(0) * 1000),
  step: 30,
  cash: CASH,
  holdings: 0,
  navByStep: Array.from({ length: 31 }, () => CASH),
  finished: true,
  ...overrides,
});

/** Giá 10.000đ ở mọi phiên, riêng phiên cuối (30) là 12.000đ. */
const priceAt = (step: number) => (step === 30 ? 12_000n : 10_000n);

describe('§7 chốt ván: settleMatch', () => {
  it('phòng 4 người cược 100: người thắng +400, người thua không có xu', () => {
    const settlement = settleMatch({
      players: [
        player('a', { cash: CASH - 1_000_000n, holdings: 100 }),
        player('b'),
        player('c', { cash: CASH - 50_000n }),
        player('d', { cash: CASH - 100_000n }),
      ],
      playBars: 30,
      priceAt,
      stakeXu: 100,
    });
    expect(settlement.potXu).toBe(400);
    expect(settlement.outcomes.map((o) => [o.userId, o.rank, o.winXu])).toEqual([
      ['a', 1, 400],
      ['b', 2, 0],
      ['c', 3, 0],
      ['d', 4, 0],
    ]);
    expect(settlement.refund).toBe(false);
  });

  it('hai người hoà hạng 1 (làm tròn 2 chữ số): mỗi người +200; người sau cùng hạng 3', () => {
    const settlement = settleMatch({
      players: [
        player('a', { cash: CASH + 1_000n }), // +0,01%
        player('b', { cash: CASH + 1_400n }), // +0,014% → 0,01%
        player('c'),
        player('d'),
      ],
      playBars: 30,
      priceAt,
      stakeXu: 100,
    });
    expect(settlement.outcomes.map((o) => [o.userId, o.rank, o.winXu])).toEqual([
      ['a', 1, 200],
      ['b', 1, 200],
      ['c', 3, 0],
      ['d', 3, 0],
    ]);
  });

  it('ba người hoà hạng 1 với tổng cược 400: mỗi người 133, phần lẻ không trả', () => {
    const settlement = settleMatch({
      players: [player('a'), player('b'), player('c'), player('d', { cash: CASH - 10_000n })],
      playBars: 30,
      priceAt,
      stakeXu: 100,
    });
    expect(settlement.shareXu).toBe(133);
    expect(settlement.outcomes.filter((o) => o.winner).map((o) => o.winXu)).toEqual([
      133, 133, 133,
    ]);
  });

  it('cả phòng hoà ở 0% (không ai giao dịch): mỗi người được hoàn đúng số đã cược', () => {
    const settlement = settleMatch({
      players: [player('a'), player('b'), player('c')],
      playBars: 30,
      priceAt,
      stakeXu: 100,
    });
    expect(settlement.refund).toBe(true);
    expect(settlement.outcomes.map((o) => [o.rank, o.winXu, o.refundXu])).toEqual([
      [1, 0, 100],
      [1, 0, 100],
      [1, 0, 100],
    ]);
    expect(resultXuLabel(settlement.outcomes[0]!)).toBe('Hoàn xu cược');
  });

  it('v2.1 §1: phòng 30 người cược 10: người thắng nhận đủ 300 xu, mọi người đều có hạng', () => {
    const ids = Array.from({ length: 30 }, (_, index) => String.fromCharCode(65 + index));
    const settlement = settleMatch({
      players: ids.map((id, index) =>
        player(id, { cash: index === 7 ? CASH + 500_000n : CASH - BigInt(index) * 1_000n }),
      ),
      playBars: 30,
      priceAt,
      stakeXu: 10,
    });
    expect(settlement.outcomes).toHaveLength(30);
    expect(settlement.potXu).toBe(300);
    expect(settlement.outcomes[0]).toMatchObject({
      userId: 'H',
      rank: 1,
      winner: true,
      winXu: 300,
    });
    expect(settlement.outcomes.reduce((sum, outcome) => sum + outcome.winXu, 0)).toBe(300);
    expect(settlement.outcomes.filter((outcome) => outcome.winner)).toHaveLength(1);
    expect(new Set(settlement.outcomes.map((outcome) => outcome.userId)).size).toBe(30);
    expect(settlement.outcomes[29]!.rank).toBe(30);
  });

  it('chơi một mình: không cược, không xu', () => {
    const settlement = settleMatch({
      players: [player('a', { holdings: 100, cash: CASH - 1_000_000n })],
      playBars: 30,
      priceAt,
      stakeXu: 0,
    });
    expect(settlement.outcomes[0]).toMatchObject({ rank: 1, winXu: 0, refundXu: 0 });
    expect(settlement.potXu).toBe(0);
  });

  it('hết giờ: chơi 30 phiên, mua ở phiên 10, dừng ở phiên 20 → tính theo giá phiên 30, giữ nguyên số cổ phiếu', () => {
    const prices = (step: number) => BigInt(10_000 + step * 100);
    const cost = 100n * prices(10) + 1_515n; // phí 0,15% của 1.010.000
    const navByStep = Array.from({ length: 21 }, (_, step) =>
      step < 10 ? CASH : CASH - cost + 100n * prices(step),
    );
    const settlement = settleMatch({
      players: [
        player('a', { step: 20, finished: false, cash: CASH - cost, holdings: 100, navByStep }),
      ],
      playBars: 30,
      priceAt: prices,
      stakeXu: 0,
    });
    const outcome = settlement.outcomes[0]!;
    expect(outcome.finalNav).toBe(CASH - cost + 100n * prices(30));
    expect(outcome.autoFinished).toBe(true);
    expect(outcome.navByStep).toHaveLength(31);
    expect(outcome.navByStep[25]).toBe(CASH - cost + 100n * prices(25));
  });
});

describe('§6.1 tài sản theo phiên và tiêu đề kết quả', () => {
  it('navAtStep lấy tài sản tại phiên, quá lịch sử thì lấy phần tử cuối', () => {
    const navs = [CASH, CASH + 1n, CASH + 2n];
    expect(navAtStep(navs, 1)).toBe(CASH + 1n);
    expect(navAtStep(navs, 9)).toBe(CASH + 2n);
  });

  it('làm tròn % hai chữ số: 0,004% và 0% là hoà', () => {
    expect(pnlKey(CASH + 400n)).toBe(0);
    expect(pnlKey(CASH - 400n)).toBe(0);
    expect(pnlKey(CASH + 1_000n)).toBe(1);
  });

  it('tiêu đề: Kết quả (một mình), Hoà, Bạn thắng, {tên} thắng', () => {
    const a = { userId: 'a', name: 'minhkhoa' };
    const b = { userId: 'b', name: 'lan' };
    expect(resultTitle({ solo: true, winners: [a], viewerId: 'a' })).toBe('Kết quả');
    expect(resultTitle({ solo: false, winners: [a, b], viewerId: 'a' })).toBe('Hoà');
    expect(resultTitle({ solo: false, winners: [a], viewerId: 'a' })).toBe('Bạn thắng');
    expect(resultTitle({ solo: false, winners: [a], viewerId: 'b' })).toBe('minhkhoa thắng');
    expect(resultXuLabel({ winXu: 400, refundXu: 0 })).toBe('+400 xu');
    expect(resultXuLabel({ winXu: 0, refundXu: 0 })).toBeNull();
  });
});

describe('v2.1 §3 điểm mỗi ván: matchPoints', () => {
  it('thắng +10, thua +3, chơi 1 mình 0 (kể cả khi "thắng")', () => {
    expect(FB_POINTS_WIN).toBe(10);
    expect(FB_POINTS_LOSS).toBe(3);
    expect(matchPoints({ solo: false, winner: true })).toBe(10);
    expect(matchPoints({ solo: false, winner: false })).toBe(3);
    expect(matchPoints({ solo: true, winner: true })).toBe(0);
    expect(matchPoints({ solo: true, winner: false })).toBe(0);
  });

  it('điểm cố định theo số người: phòng 2 người và phòng 30 người cùng +10 / +3', () => {
    const settle = (count: number) =>
      settleMatch({
        players: Array.from({ length: count }, (_, index): FbSettlementPlayer => ({
          entryId: `e${index}`,
          userId: `u${String(index).padStart(2, '0')}`,
          joinedAt: new Date(1000 + index),
          step: 30,
          cash: index === 0 ? CASH + 1_000_000n : CASH,
          holdings: 0,
          navByStep: [CASH],
          finished: true,
        })),
        playBars: 30,
        priceAt: () => 10_000n,
        stakeXu: 0,
      });
    for (const count of [2, 30]) {
      const solo = false;
      const points = settle(count).outcomes.map((outcome) =>
        matchPoints({ solo, winner: outcome.winner }),
      );
      expect(points.filter((value) => value === 10)).toHaveLength(1);
      expect(points.filter((value) => value === 3)).toHaveLength(count - 1);
    }
  });

  it('hoà hạng 1: mọi người đồng hạng đều là người thắng và nhận +10', () => {
    const tie = settleMatch({
      players: ['a', 'b', 'c'].map((id, index): FbSettlementPlayer => ({
        entryId: id,
        userId: id,
        joinedAt: new Date(1000 + index),
        step: 30,
        cash: CASH,
        holdings: 0,
        navByStep: [CASH],
        finished: true,
      })),
      playBars: 30,
      priceAt: () => 10_000n,
      stakeXu: 0,
    });
    expect(
      tie.outcomes.map((outcome) => matchPoints({ solo: false, winner: outcome.winner })),
    ).toEqual([10, 10, 10]);
  });
});

describe('v2.1 §3.2 công thức cấp', () => {
  it('tổng điểm để đạt cấp L = 5 × (L − 1) × (L + 2), khớp bảng của spec', () => {
    const table: [level: number, base: number, step: number][] = [
      [1, 0, 20],
      [2, 20, 30],
      [3, 50, 40],
      [5, 140, 60],
      [10, 540, 110],
      [20, 2090, 210],
      [30, 4640, 310],
    ];
    for (const [level, base, step] of table) {
      expect(levelBase(level)).toBe(base);
      expect(levelStep(level)).toBe(step);
      expect(levelBase(level + 1) - levelBase(level)).toBe(step);
      expect(levelOfPoints(base)).toBe(level);
    }
  });

  it('mốc cấp: 50 điểm là cấp 3, 49 điểm là cấp 2; 0 điểm là cấp 1', () => {
    expect(levelOfPoints(0)).toBe(1);
    expect(levelOfPoints(19)).toBe(1);
    expect(levelOfPoints(20)).toBe(2);
    expect(levelOfPoints(49)).toBe(2);
    expect(levelOfPoints(50)).toBe(3);
    expect(levelOfPoints(89)).toBe(3);
    expect(levelOfPoints(90)).toBe(4);
  });

  it('khớp định nghĩa ở mọi điểm tới 20.000 và không bao giờ xuống cấp khi điểm tăng', () => {
    let previous = 1;
    for (let points = 0; points <= 20_000; points += 1) {
      const level = levelOfPoints(points);
      expect(levelBase(level)).toBeLessThanOrEqual(points);
      expect(levelBase(level + 1)).toBeGreaterThan(points);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('không giới hạn cấp; điểm âm hoặc lẻ được chuẩn hoá', () => {
    expect(levelOfPoints(1_000_000)).toBeGreaterThan(400);
    expect(levelOfPoints(-5)).toBe(1);
    expect(levelOfPoints(49.9)).toBe(2);
  });

  it('levelInfo: mốc hiện tại, mốc kế tiếp và số điểm còn thiếu', () => {
    expect(levelInfo(75)).toEqual({
      points: 75,
      level: 3,
      levelBase: 50,
      nextLevelPoints: 90,
      remaining: 15,
    });
    expect(levelInfo(0)).toMatchObject({
      level: 1,
      levelBase: 0,
      nextLevelPoints: 20,
      remaining: 20,
    });
    expect(levelInfo(50)).toMatchObject({ level: 3, remaining: 40 });
  });
});

describe('v2.1 §4.1 thứ tự bảng xếp hạng: compareRank', () => {
  const key = (userId: string, points: number, wins: number, minute: number) => ({
    userId,
    points,
    wins,
    reachedPointsAt: new Date(Date.UTC(2026, 10, 1, 0, minute)),
  });

  it('điểm cao trước; bằng điểm thì nhiều ván thắng trước; vẫn bằng thì ai đạt mốc sớm hơn', () => {
    const rows = [
      key('d', 50, 3, 5),
      key('b', 60, 2, 9),
      key('c', 50, 4, 8),
      key('a', 50, 3, 1),
      key('e', 10, 1, 0),
    ];
    expect(rows.sort(compareRank).map((row) => row.userId)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('bằng cả ba tiêu chí thì so mã người dùng để thứ tự luôn ổn định', () => {
    const rows = [key('u2', 30, 1, 3), key('u1', 30, 1, 3)];
    expect(rows.sort(compareRank).map((row) => row.userId)).toEqual(['u1', 'u2']);
    expect(compareRank(rows[0]!, rows[0]!)).toBe(0);
  });
});

describe('v2.1 §5.2 nhãn kết quả trong lịch sử: historyResultOf', () => {
  it('chơi 1 mình, thắng một mình, hoà hạng 1, thua', () => {
    expect(historyResultOf({ playerCount: 1, rank: 1, topCount: 1 })).toBe('solo');
    expect(historyResultOf({ playerCount: 4, rank: 1, topCount: 1 })).toBe('win');
    expect(historyResultOf({ playerCount: 4, rank: 1, topCount: 2 })).toBe('tie');
    expect(historyResultOf({ playerCount: 4, rank: 3, topCount: 2 })).toBe('lose');
  });
});
