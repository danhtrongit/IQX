/**
 * Vòng đời đề Flashback chạy nhiều ngày với đồng hồ tua nhanh (spec 22-10 FB-01, FB-02, FB-05,
 * FB-07, FB-09, QA-01, QA-03, QA-04, QA-05). Tác vụ chạy mỗi phút ở một giây ngẫu nhiên.
 */

import { describe, expect, it } from 'vitest';

import { FLASHBACK_PAUSED_KEY } from '../../src/modules/flashback/flashback.constants.js';
import type {
  FlashbackOpsAlert,
  FlashbackOpsAlertPort,
} from '../../src/modules/flashback/flashback.alerts.js';
import { FlashbackAdminService } from '../../src/modules/flashback/flashback-admin.service.js';
import { FlashbackJob, flashbackClosesAt } from '../../src/modules/flashback/flashback.job.js';
import {
  FlashbackRoundBuilder,
  readFlashbackConfig,
} from '../../src/modules/flashback/flashback.round-builder.js';
import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import {
  emptyMemoryState,
  MemoryFlashbackRepository,
  memoryDatabase,
  seededRandom,
} from './helpers/flashback-memory.js';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;
const CONFIG = readFlashbackConfig({});

/** 20:00 giờ Việt Nam của một ngày (YYYY-MM-DD) theo UTC. */
const vn20 = (date: string) => new Date(`${date}T13:00:00.000Z`);
/** Giờ:phút:giây Việt Nam của một thời điểm. */
const vnClock = (at: Date) => new Date(at.getTime() + 7 * HOUR).toISOString().slice(11, 19);

/** Bộ dựng đề giả: luôn tạo được đề, mỗi đề một mã và một dải ngày riêng. */
function stubBuilder(): FlashbackRoundBuilder {
  let counter = 0;
  return {
    build: async (_now: Date, level: number) => {
      counter += 1;
      const bars: FlashbackBar[] = Array.from({ length: 120 }, (_, index) => ({
        d: `${2000 + counter}-01-${String(index).padStart(3, '0')}`,
        o: 30_000,
        h: 30_000,
        l: 30_000,
        c: 30_000 + index * 10,
        v: 1_000_000,
      }));
      return {
        symbol: `S${counter % 30}`,
        startDate: bars[0]!.d,
        bars,
        warmupBars: [],
        fallbackLevel: level,
        priceSource: 'VCI:dong:adjusted',
      };
    },
  } as unknown as FlashbackRoundBuilder;
}

class SpyAlerts implements FlashbackOpsAlertPort {
  readonly sent: FlashbackOpsAlert[] = [];
  async send(alert: FlashbackOpsAlert) {
    this.sent.push(alert);
  }
}

function harness(options: { builder?: FlashbackRoundBuilder } = {}) {
  const clock = { at: new Date('2026-01-01T00:00:00.000Z') };
  const repository = new MemoryFlashbackRepository(emptyMemoryState(), () => clock.at);
  const database = memoryDatabase(repository);
  const alerts = new SpyAlerts();
  const builder = options.builder ?? stubBuilder();
  const job = new FlashbackJob(database, repository, { now: () => clock.at }, builder, alerts);
  const random = seededRandom(22_10);
  /** Chạy tác vụ một lần ở phút chứa `minute`, tại một giây ngẫu nhiên của phút đó. */
  const runAtMinute = async (minute: number, jobs: FlashbackJob[] = [job]) => {
    clock.at = new Date(minute + Math.floor(random() * 60_000));
    return Promise.all(jobs.map((item) => item.run(clock.at)));
  };
  const openCount = () => repository.state.rounds.filter((round) => round.status === 'open').length;
  return { clock, repository, database, alerts, job, builder, runAtMinute, openCount };
}

/** Thêm ba người chơi đã kết thúc vào đề đang mở (để kiểm tra trả thưởng). */
async function addFinishedPlayers(
  h: ReturnType<typeof harness>,
  devices: Record<string, string> = {},
) {
  const round = await h.repository.openRound();
  if (!round) return;
  const tx = { query: async () => [] };
  for (const [index, userId] of ['u-a', 'u-b', 'u-c'].entries()) {
    if (await h.repository.entryByRoundUser(tx, round.id, userId)) continue;
    h.repository.state.users[userId] ??= {
      username: userId,
      displayName: userId,
      phone: null,
      phoneVerified: true,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };
    const entry = await h.repository.insertEntry(tx, {
      roundId: round.id,
      userId,
      feeXu: 0,
      firstJoin: false,
      cash: 10_000_000n,
      initialCash: 10_000_000n,
      deviceId: devices[userId] ?? `device-${userId}`,
      joinIp: `10.0.0.${index + 1}`,
    });
    await h.repository.finishEntry(tx, entry!.id, {
      finalNav: 10_000_000n + BigInt((3 - index) * 100_000),
      pnlPct: (3 - index) / 100,
      maxDrawdown: 0.01,
      finishedAt: h.clock.at,
    });
  }
}

describe('FB-01 giờ đóng đề', () => {
  const scheduled = vn20('2026-01-05');

  it.each([
    ['20:00:00', 0],
    ['20:00:30', 30_000],
    ['20:04:59', 4 * MINUTE + 59_000],
  ])('tác vụ chạy lúc %s thì đề đóng 20:00 ngày N+2', (_label, lateMs) => {
    const now = new Date(scheduled.getTime() + lateMs);
    expect(flashbackClosesAt(scheduled, now, CONFIG).toISOString()).toBe(
      vn20('2026-01-07').toISOString(),
    );
  });

  it('chạy lúc 20:06 thì giữ đủ 48 giờ; đề sau quay về mốc 20:00', () => {
    const now = new Date(scheduled.getTime() + 6 * MINUTE);
    const closesAt = flashbackClosesAt(scheduled, now, CONFIG);
    expect(closesAt.getTime()).toBe(now.getTime() + 48 * HOUR);
    // Đề kế tiếp có scheduled_open_at = closes_at của đề này, mở đúng giờ.
    const nextOpen = new Date(closesAt.getTime() + 20_000);
    const nextClose = flashbackClosesAt(closesAt, nextOpen, CONFIG);
    expect(vnClock(nextClose)).toBe('20:00:00');
    expect(nextClose.getTime()).toBeGreaterThanOrEqual(nextOpen.getTime() + 48 * HOUR - MINUTE);
  });
});

describe('QA-01 tự chạy 30 ngày với đồng hồ tua nhanh', () => {
  it('đủ 15 đề, mỗi đề 48 giờ, đóng lúc 20:00, không lúc nào có 0 hoặc 2 đề open', async () => {
    const h = harness();
    const start = new Date('2025-12-31T17:00:00.000Z').getTime(); // 00:00 ngày 01/01 giờ VN
    const end = start + 30 * DAY;
    for (let minute = start; minute < end; minute += MINUTE) {
      await h.runAtMinute(minute);
      expect(h.openCount()).toBe(1);
      const open = (await h.repository.openRound())!;
      // Luôn có một đề còn nhận thao tác hoặc vừa tới giờ đóng trong phút này.
      expect(open.closesAt!.getTime()).toBeGreaterThan(h.clock.at.getTime() - MINUTE);
      if (minute % HOUR === 0) await addFinishedPlayers(h);
    }
    const opened = h.repository.state.rounds.filter(
      (round) => round.opensAt && round.opensAt.getTime() < end,
    );
    expect(opened).toHaveLength(15);
    for (const round of opened) {
      expect(vnClock(round.closesAt!)).toBe('20:00:00');
      if (round.roundNo === 1) continue;
      const length = round.closesAt!.getTime() - round.opensAt!.getTime();
      expect(length).toBeLessThanOrEqual(48 * HOUR);
      expect(length).toBeGreaterThan(48 * HOUR - MINUTE);
    }
    // Mỗi đề đã đóng trả thưởng đúng một lần cho mỗi người.
    const paid = h.repository.state.rounds.filter((round) => round.status === 'paid');
    expect(paid.length).toBe(14);
    const keys = h.repository.state.ledger.map((row) => row.uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(paid.length * 3);
    // Không có cảnh báo mức Cao trong vận hành bình thường.
    expect(h.repository.state.jobLog.some((row) => row.level === 'high')).toBe(false);
  });
});

describe('QA-04 máy chủ dừng 5 giờ qua giờ đổi đề', () => {
  it('đề cũ đóng và trả thưởng, đề mới mở ngay đủ 48 giờ, đề sau quay về 20:00', async () => {
    const h = harness();
    const start = vn20('2026-01-01').getTime() - 10 * MINUTE;
    for (let minute = start; minute < start + 20 * MINUTE; minute += MINUTE) {
      await h.runAtMinute(minute);
    }
    const first = (await h.repository.openRound())!;
    expect(first.closesAt!.toISOString()).toBe(vn20('2026-01-03').toISOString());
    await addFinishedPlayers(h);

    // Chạy bình thường tới 18:00 ngày 03/01, rồi dừng 5 giờ (tới 23:00).
    const outageFrom = vn20('2026-01-03').getTime() - 2 * HOUR;
    for (let minute = start + 20 * MINUTE; minute < outageFrom; minute += 10 * MINUTE) {
      await h.runAtMinute(minute);
    }
    const resumeAt = outageFrom + 5 * HOUR;
    await h.runAtMinute(resumeAt);

    const old = (await h.repository.roundById({ query: async () => [] }, first.id))!;
    expect(old.status).toBe('paid');
    expect(h.repository.state.ledger.filter((row) => row.kind === 'flashback_reward')).toHaveLength(
      3,
    );
    const current = (await h.repository.openRound())!;
    expect(current.id).not.toBe(first.id);
    expect(current.opensAt!.getTime()).toBe(h.clock.at.getTime());
    expect(current.closesAt!.getTime()).toBe(h.clock.at.getTime() + 48 * HOUR);

    // Đề sau mở đúng giờ ở closes_at của đề này và đóng ở mốc 20:00.
    for (let minute = resumeAt + MINUTE; minute < resumeAt + 4 * DAY; minute += 5 * MINUTE) {
      await h.runAtMinute(minute);
    }
    const after = h.repository.state.rounds.find((round) => round.roundNo === current.roundNo + 1)!;
    expect(after.opensAt).not.toBeNull();
    expect(vnClock(after.closesAt!)).toBe('20:00:00');
    expect(after.closesAt!.getTime()).toBeGreaterThanOrEqual(
      after.opensAt!.getTime() + 48 * HOUR - 5 * MINUTE,
    );
  });
});

describe('QA-05 tạm dừng', () => {
  it('đề đang mở vẫn đóng và trả thưởng, không mở đề mới; bỏ tạm dừng thì mở trong 2 lần chạy', async () => {
    const h = harness();
    const start = vn20('2026-01-01').getTime();
    await h.runAtMinute(start);
    const open = (await h.repository.openRound())!;
    await addFinishedPlayers(h);
    h.repository.state.settings[FLASHBACK_PAUSED_KEY] = true;
    const roundsBefore = h.repository.state.rounds.length;

    // Bỏ cả đề ready để kiểm tra nhánh "b5 tạo trước, b4 mở sau" khi bỏ tạm dừng.
    h.repository.state.rounds = h.repository.state.rounds.filter(
      (round) => round.status !== 'ready',
    );
    const afterClose = open.closesAt!.getTime() + MINUTE;
    for (let minute = afterClose; minute < afterClose + 30 * MINUTE; minute += MINUTE) {
      await h.runAtMinute(minute);
    }
    expect((await h.repository.roundById({ query: async () => [] }, open.id))!.status).toBe('paid');
    expect(h.openCount()).toBe(0);
    expect(h.repository.state.rounds.length).toBeLessThan(roundsBefore);
    expect(h.repository.state.ledger.filter((row) => row.kind === 'flashback_reward')).toHaveLength(
      3,
    );

    h.repository.state.settings[FLASHBACK_PAUSED_KEY] = false;
    await h.runAtMinute(afterClose + 30 * MINUTE);
    if (h.openCount() === 0) await h.runAtMinute(afterClose + 31 * MINUTE);
    expect(h.openCount()).toBe(1);
  });
});

describe('QA-03 chạy đồng thời và ngắt giữa chừng (bản bộ nhớ)', () => {
  it('hai tiến trình: mỗi phút chỉ một tiến trình chạy, không kẹt khoá sau 100 lần, không trùng đề', async () => {
    const h = harness();
    const other = new FlashbackJob(
      h.database,
      h.repository,
      { now: () => h.clock.at },
      h.builder,
      h.alerts,
    );
    const start = vn20('2026-01-01').getTime();
    for (let index = 0; index < 100; index += 1) {
      const outcomes = await h.runAtMinute(start + index * MINUTE, [h.job, other]);
      expect(outcomes.filter((item) => item.status === 'completed')).toHaveLength(1);
      expect(outcomes.filter((item) => item.status === 'skipped')).toHaveLength(1);
      expect(h.repository.lockHolder).toBeNull();
    }
    const numbers = h.repository.state.rounds.map((round) => round.roundNo);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(h.openCount()).toBe(1);
  });

  it('lỗi giữa lần chạy vẫn nhả khoá, lần chạy sau lấy được khoá', async () => {
    const h = harness();
    const start = vn20('2026-01-01').getTime();
    await h.runAtMinute(start);
    let failures = 1;
    h.repository.fault = (method) => {
      if (method === 'listRounds' && failures > 0) {
        failures -= 1;
        throw new Error('mất kết nối');
      }
    };
    await expect(h.runAtMinute(start + MINUTE)).rejects.toThrow('mất kết nối');
    expect(h.repository.lockHolder).toBeNull();
    const [outcome] = await h.runAtMinute(start + 2 * MINUTE);
    expect(outcome?.status).toBe('completed');
  });

  it('ngắt giữa bước trả thưởng rồi chạy lại: mỗi người nhận thưởng đúng một lần', async () => {
    const h = harness();
    const start = vn20('2026-01-01').getTime();
    await h.runAtMinute(start);
    const open = (await h.repository.openRound())!;
    await addFinishedPlayers(h);

    let calls = 0;
    h.repository.fault = (method) => {
      if (method !== 'appendLedger') return;
      calls += 1;
      if (calls === 2) throw new Error('máy chủ dừng giữa bước 3');
    };
    const afterClose = open.closesAt!.getTime() + MINUTE;
    await expect(h.runAtMinute(afterClose)).rejects.toThrow('máy chủ dừng giữa bước 3');
    // Giao dịch bước 3 đã rollback: chưa ai nhận thưởng, đề vẫn `closed`.
    expect(h.repository.state.ledger).toHaveLength(0);
    expect((await h.repository.roundById({ query: async () => [] }, open.id))!.status).toBe(
      'closed',
    );

    h.repository.fault = null;
    await h.runAtMinute(afterClose + MINUTE);
    await h.runAtMinute(afterClose + 2 * MINUTE);
    const rewards = h.repository.state.ledger.filter((row) => row.kind === 'flashback_reward');
    expect(rewards.map((row) => row.userId).sort()).toEqual(['u-a', 'u-b', 'u-c']);
    for (const userId of ['u-a', 'u-b', 'u-c']) {
      const wallet = h.repository.state.wallets[userId]!;
      expect(wallet.balance).toBe(rewards.find((row) => row.userId === userId)!.delta);
    }
  });
});

describe('FB-07 giữ thưởng tài khoản bị đánh dấu', () => {
  it('trả tự động phần không bị đánh dấu, giữ phần trùng thiết bị, quản trị trả hoặc huỷ', async () => {
    const h = harness();
    const start = vn20('2026-01-01').getTime();
    await h.runAtMinute(start);
    const open = (await h.repository.openRound())!;
    await addFinishedPlayers(h, { 'u-a': 'shared-device-01', 'u-b': 'shared-device-01' });
    await h.runAtMinute(open.closesAt!.getTime() + MINUTE);

    const round = (await h.repository.roundById({ query: async () => [] }, open.id))!;
    expect(round.status).toBe('paid');
    expect(h.repository.state.ledger.map((row) => row.userId)).toEqual(['u-c']);
    expect(h.repository.state.holds.map((hold) => [hold.userId, hold.reason])).toEqual([
      ['u-a', 'same_device'],
      ['u-b', 'same_device'],
    ]);

    const superAdmin = '0b8f3c62-7a43-4d9e-9a51-1f2e3d4c5b6a';
    const admin = new FlashbackAdminService(h.database, h.repository, [superAdmin]);
    const audit = {
      adminId: superAdmin,
      actorRole: 'admin' as const,
      ip: null,
      userAgent: null,
      requestId: null,
    };
    const [holdA, holdB] = h.repository.state.holds;
    const released = await admin.releaseRewardHold(holdA!.id, audit);
    expect(released.status).toBe('released');
    await expect(admin.releaseRewardHold(holdA!.id, audit)).rejects.toMatchObject({
      response: { code: 'FLASHBACK_HOLD_DECIDED' },
    });
    await admin.voidRewardHold(holdB!.id, audit);

    const ledger = h.repository.state.ledger;
    expect(ledger.map((row) => row.userId).sort()).toEqual(['u-a', 'u-c']);
    expect(ledger.find((row) => row.userId === 'u-a')?.uniqueKey).toBe(
      `flashback_reward:${open.id}:u-a`,
    );
    // Chạy lại tác vụ không trả thêm cho ai.
    await h.runAtMinute(open.closesAt!.getTime() + 2 * MINUTE);
    expect(h.repository.state.ledger).toHaveLength(2);

    const [view] = (await admin.rounds()).filter((item) => item.id === open.id);
    const rewardOf = (userId: string) =>
      h.repository.state.entries.find((e) => e.roundId === open.id && e.userId === userId)!
        .rewardXu;
    expect(view?.total_reward_xu).toBe(rewardOf('u-a') + rewardOf('u-c'));
    expect(view?.held_reward_xu).toBe(0);
  });
});

describe('FB-09 cảnh báo ra kênh kỹ thuật', () => {
  it('gửi cảnh báo kéo dài 24 giờ, không có mã hay giai đoạn', async () => {
    const failing = { build: async () => null } as unknown as FlashbackRoundBuilder;
    const h = harness({ builder: stubBuilder() });
    const start = vn20('2026-01-01').getTime();
    await h.runAtMinute(start);
    const open = (await h.repository.openRound())!;
    // Bỏ đề ready, rồi cho bộ dựng hỏng ở giờ đóng.
    h.repository.state.rounds = h.repository.state.rounds.filter(
      (round) => round.status !== 'ready',
    );
    const job = new FlashbackJob(
      h.database,
      h.repository,
      { now: () => h.clock.at },
      failing,
      h.alerts,
    );
    await h.runAtMinute(open.closesAt!.getTime() + MINUTE, [job]);
    const sent = h.alerts.sent.find((alert) => alert.message.includes('fallback_extend_24h'));
    expect(sent).toMatchObject({ level: 'low', roundNo: open.roundNo });
    const text = JSON.stringify(h.alerts.sent);
    expect(text).not.toContain(open.symbol);
    expect(text).not.toContain(open.startDate);
  });
});

describe('FB-05 rổ VN30 tự cập nhật', () => {
  const basket = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(2, '0')}`);

  it('đổi 2 mã giữa hai lần tạo đề: rổ mới được dùng, mã cũ có effective_to', async () => {
    const first = basket('V', 30);
    const second = [...first.slice(2), 'NEW1', 'NEW2'];
    let current = first;
    const series = cleanSeries();
    let allowed: ReadonlySet<string> | null = null;
    const market = {
      vn30Symbols: async () => current,
      dailyBars: async (symbol: string) =>
        symbol === 'VNINDEX' || !allowed || allowed.has(symbol) ? series : [],
    };
    const clock = { at: new Date('2026-10-23T05:00:00.000Z') };
    const repository = new MemoryFlashbackRepository(emptyMemoryState(), () => clock.at);
    const database = memoryDatabase(repository);
    const builder = new FlashbackRoundBuilder(database, repository, market);

    expect(await builder.build(clock.at, 0, CONFIG)).not.toBeNull();
    expect(await repository.listCurrentVn30()).toEqual([...first].sort());

    current = second;
    allowed = new Set(['NEW1', 'NEW2']);
    clock.at = new Date('2026-10-25T13:00:00.000Z');
    const built = await builder.build(clock.at, 0, CONFIG);
    expect(['NEW1', 'NEW2']).toContain(built?.symbol);
    expect(await repository.listCurrentVn30()).toEqual([...second].sort());
    const retired = repository.state.vn30.filter((row) => row.to !== null);
    expect(retired.map((row) => row.symbol).sort()).toEqual(['V00', 'V01']);
    expect(retired.every((row) => row.to!.getTime() === clock.at.getTime())).toBe(true);
  });

  it('nguồn lỗi hoặc ít hơn 25 mã: giữ rổ đang lưu và bắn cảnh báo', async () => {
    const series = cleanSeries();
    let mode: 'error' | 'short' = 'error';
    const market = {
      vn30Symbols: async () => {
        if (mode === 'error') throw new Error('timeout');
        return basket('X', 10);
      },
      dailyBars: async () => series,
    };
    const clock = { at: new Date('2026-10-23T05:00:00.000Z') };
    const state = emptyMemoryState();
    state.vn30 = basket('V', 30).map((symbol) => ({ symbol, from: new Date(0), to: null }));
    const repository = new MemoryFlashbackRepository(state, () => clock.at);
    const alerts = new SpyAlerts();
    const builder = new FlashbackRoundBuilder(
      memoryDatabase(repository),
      repository,
      market,
      undefined,
      alerts,
    );
    const built = await builder.build(clock.at, 0, CONFIG);
    expect(built?.symbol.startsWith('V')).toBe(true);
    expect(alerts.sent[0]?.level).toBe('medium');

    mode = 'short';
    clock.at = new Date(clock.at.getTime() + HOUR);
    const again = await builder.build(clock.at, 0, CONFIG);
    expect(again?.symbol.startsWith('V')).toBe(true);
    expect(await repository.listCurrentVn30()).toHaveLength(30);
    expect(
      repository.state.jobLog.filter((row) => row.result.includes('vn30_pool_degraded')).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

/** Chuỗi nến sạch từ 2010 tới 2025: ngày thường, dao động khoảng 2%, thanh khoản ~30 tỷ. */
function cleanSeries(): FlashbackBar[] {
  const random = seededRandom(7);
  const bars: FlashbackBar[] = [];
  let close = 30_000;
  for (let time = Date.UTC(2010, 5, 1); time <= Date.UTC(2025, 11, 31); time += DAY) {
    const day = new Date(time).getUTCDay();
    if (day === 0 || day === 6) continue;
    close = Math.max(5_000, Math.round(close * (1 + (random() - 0.5) * 0.08)));
    bars.push({
      d: new Date(time).toISOString().slice(0, 10),
      o: close,
      h: close,
      l: close,
      c: close,
      v: 1_000_000,
    });
  }
  return bars;
}
