import { describe, expect, it } from 'vitest';

import {
  FB_INITIAL_CASH_VND,
  hashRoomPassword,
  joinCheck,
  navAtStep,
  pnlKey,
  randomJoinCandidates,
  resultTitle,
  resultXuLabel,
  settleMatch,
  validateRoomSettings,
  verifyRoomPassword,
  visibleStep,
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

  it('chọn 1 người thì khoá ô cược: không cược kể cả khi gửi giá trị lẻ hay không có xu', () => {
    expect(validateRoomSettings({ ...ok, max_players: 1, stake_xu: 15 }, 0)).toEqual({
      ok: true,
      value: { viewBars: 60, playBars: 30, minutes: 10, maxPlayers: 1, stakeXu: 0, password: null },
    });
  });

  it('kiểm tra thời gian, số người và mật khẩu 4–12 ký tự; trường thiếu dùng mặc định', () => {
    expect(validateRoomSettings({ ...ok, minutes: 7 }, 1000)).toMatchObject({ ok: false });
    expect(validateRoomSettings({ ...ok, max_players: 5 }, 1000)).toEqual({
      ok: false,
      message: 'Số người tối đa phải từ 1 đến 4',
    });
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

describe('§6.1 % người khác và tiêu đề kết quả', () => {
  it('% của người khác lấy tại min(phiên của họ, phiên của mình)', () => {
    expect(visibleStep(20, 10)).toBe(10);
    expect(visibleStep(5, 10)).toBe(5);
    const navs = [CASH, CASH + 1n, CASH + 2n];
    expect(navAtStep(navs, visibleStep(20, 1))).toBe(CASH + 1n);
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
