/**
 * Phía người chơi của Flashback (spec 22-10 FB-03, FB-06, FB-10, FB-11a/d, §1.14, QA-09).
 */

import { describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import {
  FLASHBACK_CONFIG_KEY,
  FLASHBACK_FEE_BPS,
} from '../../src/modules/flashback/flashback.constants.js';
import { FlashbackService, maxBuyQty } from '../../src/modules/flashback/flashback.service.js';
import { roundBasisPoints } from '../../src/modules/trading/trading.service.js';
import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import {
  emptyMemoryState,
  MemoryFlashbackRepository,
  memoryDatabase,
} from './helpers/flashback-memory.js';

const OPENED = new Date('2026-01-05T13:00:00.000Z');
const CLOSES = new Date(OPENED.getTime() + 48 * 3_600_000);
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SYMBOL = 'ZQX';

/** 120 nến có ngày thật năm 2016 và giá đi lên đều. */
function bars(): FlashbackBar[] {
  return Array.from({ length: 120 }, (_, index) => {
    const day = new Date(Date.UTC(2016, 0, 4 + index)).toISOString().slice(0, 10);
    const close = 20_000 + index * 150;
    return { d: day, o: close, h: close + 50, l: close - 50, c: close, v: 2_000_000 };
  });
}

function setup(options: { settings?: Record<string, unknown> } = {}) {
  const clock = { at: new Date(OPENED.getTime() + 60_000) };
  const state = emptyMemoryState();
  state.settings = { ...options.settings };
  state.rounds.push({
    id: 'round-open',
    roundNo: 7,
    status: 'open',
    symbol: SYMBOL,
    startDate: '2016-01-04',
    warmupBars: [],
    bars: bars(),
    scheduledOpenAt: OPENED,
    opensAt: OPENED,
    closesAt: CLOSES,
    fallbackLevel: 0,
    priceSource: 'VCI:dong:adjusted',
    createdAt: OPENED,
    updatedAt: OPENED,
  });
  state.users[ME] = {
    username: 'toi',
    displayName: 'toi',
    phone: null,
    phoneVerified: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  };
  state.users[OTHER] = {
    username: 'ban-khac@example.com',
    displayName: null,
    phone: null,
    phoneVerified: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  };
  state.wallets[ME] = { balance: 1_000, lastSeq: 0 };
  const repository = new MemoryFlashbackRepository(state, () => clock.at);
  const grants = {
    grantedCapabilities: async () => new Set<string>(),
  } as unknown as AcademyGrantsPort;
  const service = new FlashbackService(memoryDatabase(repository), repository, grants, {
    now: () => clock.at,
  });
  return { clock, state, repository, service };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const response = (error as { getResponse(): Record<string, unknown> }).getResponse();
    return { status: (error as { getStatus(): number }).getStatus(), response };
  }
  throw new Error('expected rejection');
}

describe('FB-03 kết thúc chỉ ở phiên 60', () => {
  it('phiên 59 trả 409 FLASHBACK_NOT_AT_END, phản hồi không có final_nav hay pnl_pct', async () => {
    const { service } = setup();
    const joined = await service.join(ME);
    for (let step = 0; step < 59; step += 1) await service.next(ME, joined.entry_id);
    const error = await rejection(service.finish(ME, joined.entry_id));
    expect(error.status).toBe(409);
    expect(error.response.code).toBe('FLASHBACK_NOT_AT_END');
    expect(Object.keys(error.response).sort()).toEqual(['code', 'message']);

    await service.next(ME, joined.entry_id);
    const done = await service.finish(ME, joined.entry_id);
    expect(done.status).toBe('finished');
    // Không cổ phiếu: tài sản cuối bằng vốn ban đầu.
    expect(done.final_nav).toBe('10000000');
  });
});

describe('FB-06 thao tác khi đề đã tới giờ đóng', () => {
  it('join, phiên tiếp, đặt lệnh và kết thúc đều trả 409 FLASHBACK_ROUND_CLOSED', async () => {
    const { service, clock, state } = setup();
    const joined = await service.join(ME);
    for (let step = 0; step < 60; step += 1) await service.next(ME, joined.entry_id);
    clock.at = CLOSES; // đúng giờ đóng, tác vụ chưa chạy nên đề vẫn `open`
    for (const call of [
      () => service.join(OTHER),
      () => service.next(ME, joined.entry_id),
      () => service.placeOrder(ME, joined.entry_id, { side: 'buy', qty: 1 }),
      () => service.finish(ME, joined.entry_id),
    ]) {
      const error = await rejection(call());
      expect(error).toMatchObject({ status: 409, response: { code: 'FLASHBACK_ROUND_CLOSED' } });
    }
    expect(state.entries).toHaveLength(1);
    expect(state.orders).toHaveLength(0);
  });
});

describe('FB-10 và QA-09 không lộ dữ liệu', () => {
  it('quét mọi phản hồi của một lượt: không nến tương lai, không mã, ngày thật hay user_id người khác', async () => {
    const { service, state } = setup();
    // Người chơi khác đã ở phiên 40.
    const other = await service.join(OTHER);
    for (let step = 0; step < 40; step += 1) await service.next(OTHER, other.entry_id);

    const responses: { step: number; body: unknown }[] = [];
    const joined = await service.join(ME);
    responses.push({ step: 0, body: joined });
    responses.push({ step: 0, body: await service.getCurrent(ME) });
    responses.push({ step: 0, body: await service.leaderboard(ME, 'all') });
    for (let step = 1; step <= 60; step += 1) {
      responses.push({ step, body: await service.next(ME, joined.entry_id) });
      if (step % 7 === 0) {
        responses.push({
          step,
          body: await service.placeOrder(ME, joined.entry_id, { side: 'buy', qty: 10 }),
        });
      }
      if (step % 15 === 0) {
        responses.push({ step, body: await service.getCurrent(ME) });
        responses.push({ step, body: await service.leaderboard(ME, 'all') });
      }
    }
    responses.push({ step: 60, body: await service.finish(ME, joined.entry_id) });
    responses.push({ step: 60, body: await service.leaderboard(ME, 'all') });

    const futureCloses = (step: number) =>
      new Set(state.rounds[0]!.bars.slice(60 + step).map((bar) => bar.c));
    for (const { step, body } of responses) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(SYMBOL);
      // Không có ngày thật nào của nến (kể cả warmup).
      for (const bar of state.rounds[0]!.bars) expect(text).not.toContain(bar.d);
      expect(text).not.toContain(OTHER);
      expect(text).not.toContain('ban-khac@example.com');
      expect(text).not.toContain('user_id');
      // Mọi nến gửi đi có session <= bước hiện tại, và không có giá đóng cửa của phiên sau.
      const sessions = [...text.matchAll(/"session":(-?\d+)/g)].map((match) => Number(match[1]));
      expect(sessions.every((session) => session <= step)).toBe(true);
      const future = futureCloses(step);
      const closes = [...text.matchAll(/"close":(\d+)/g)].map((match) => Number(match[1]));
      expect(closes.some((close) => future.has(close))).toBe(false);
    }

    const board = await service.leaderboard(ME, 'all');
    const otherRow = board.rows.find((row) => !row.is_me)!;
    expect(otherRow.username).toBe('Người chơi ẩn danh');
    expect(otherRow).not.toHaveProperty('step');
    expect(otherRow).not.toHaveProperty('status');
    expect(board.me).toMatchObject({ is_me: true, step: 60, status: 'finished' });
  });
});

describe('FB-11a thưởng tạm tính xét điều kiện nhận thưởng', () => {
  it('tài khoản chưa xác thực số điện thoại hoặc chưa đủ 7 ngày nhận 0 xu kèm reward_eligible=false', async () => {
    const { service, state, clock } = setup();
    state.users[ME]!.phoneVerified = false;
    const joined = await service.join(ME);
    for (let step = 0; step < 60; step += 1) await service.next(ME, joined.entry_id);
    const done = await service.finish(ME, joined.entry_id);
    expect(done.rank).toBe(1);
    expect(done.reward_xu).toBe(0);
    expect(done.reward_eligible).toBe(false);
    expect((await service.getCurrent(ME)).my_entry).toMatchObject({
      reward_xu: 0,
      reward_eligible: false,
    });

    state.users[ME] = { ...state.users[ME]!, phoneVerified: true, createdAt: clock.at };
    expect((await service.getCurrent(ME)).my_entry?.reward_eligible).toBe(false);
    state.users[ME]!.createdAt = new Date(clock.at.getTime() - 8 * 86_400_000);
    const view = (await service.getCurrent(ME)).my_entry!;
    expect(view.reward_eligible).toBe(true);
    expect(view.reward_xu).toBeGreaterThan(0);
  });
});

describe('§1.14 phí tham gia cấu hình được', () => {
  it('entry_fee_xu = 0: lần thứ hai cũng miễn phí', async () => {
    const { service, state } = setup({ settings: { [FLASHBACK_CONFIG_KEY]: { entry_fee_xu: 0 } } });
    state.entries.push({ ...(await prior(state)), roundId: 'round-old' });
    const current = await service.getCurrent(ME).catch(() => null);
    expect(current?.fee_xu).toBe(0);
    const joined = await service.join(ME);
    expect(joined.fee_xu).toBe(0);
    expect(state.ledger).toHaveLength(0);
  });

  it('entry_fee_xu = 250: trừ 250 xu, thiếu xu thì báo đúng số', async () => {
    const { service, state } = setup({
      settings: { [FLASHBACK_CONFIG_KEY]: { entry_fee_xu: 250 } },
    });
    state.entries.push({ ...(await prior(state)), roundId: 'round-old' });
    state.wallets[ME] = { balance: 200, lastSeq: 0 };
    const error = await rejection(service.join(ME));
    expect(error).toMatchObject({ status: 402, response: { code: 'XU_INSUFFICIENT' } });
    expect(String(error.response.message)).toContain('250');
    state.wallets[ME] = { balance: 300, lastSeq: 0 };
    const joined = await service.join(ME);
    expect(joined.fee_xu).toBe(250);
    expect(state.wallets[ME]!.balance).toBe(50);
  });
});

/** Một lượt chơi cũ của tôi (để lần này không còn là lần đầu). */
async function prior(_state: ReturnType<typeof setup>['state']) {
  return {
    id: 'entry-old',
    roundId: 'round-old',
    userId: ME,
    joinedAt: OPENED,
    feeXu: 0,
    firstJoin: true,
    indicatorParams: [],
    step: 60,
    cash: 10_000_000n,
    initialCash: 10_000_000n,
    finishedAt: OPENED,
    finalNav: 10_000_000n,
    pnlPct: 0,
    maxDrawdown: 0,
    rank: 1,
    rewardXu: 0,
    status: 'finished' as const,
    deviceId: null,
    joinIp: null,
  };
}

/**
 * FB-11d: cùng bộ số với `frontend/src/pages/demo-trading/flashback/flashback-model.test.ts`.
 * [tiền mặt, giá, số cổ phiếu tối đa].
 */
const MAX_BUY_CASES: readonly [string, string, number][] = [
  ['10000000', '28800', 346],
  ['10000000', '1000', 9985],
  ['5673520', '29000', 195],
  ['100150', '100', 1000],
  ['100149', '100', 999],
  ['0', '28800', 0],
  ['28843', '28800', 1],
  ['28842', '28800', 0],
  ['999999999', '33333', 29955],
];

describe('FB-11d "Mua tối đa" dùng chung công thức số nguyên với trình duyệt', () => {
  it.each(MAX_BUY_CASES)('tiền %s, giá %s → %d cổ phiếu', (cash, price, expected) => {
    expect(maxBuyQty(BigInt(cash), BigInt(price))).toBe(expected);
  });

  it('khớp đúng kiểm tra tiền của lệnh mua (thử vét cạn quanh biên)', () => {
    for (let cash = 0n; cash < 300_000n; cash += 977n) {
      for (const price of [100n, 999n, 28_800n, 51_234n]) {
        const qty = BigInt(maxBuyQty(cash, price));
        const cost = (q: bigint) => price * q + roundBasisPoints(price * q, FLASHBACK_FEE_BPS);
        expect(cost(qty) <= cash).toBe(true);
        expect(cost(qty + 1n) > cash).toBe(true);
      }
    }
  });
});

describe('FB-07 lưu mã thiết bị và IP khi tham gia', () => {
  it('ghi device_id và join_ip vào lượt chơi', async () => {
    const { service, state } = setup();
    await service.join(ME, { deviceId: 'dev_abcdef123456', ip: '203.0.113.9' });
    expect(state.entries[0]).toMatchObject({ deviceId: 'dev_abcdef123456', joinIp: '203.0.113.9' });
  });
});
