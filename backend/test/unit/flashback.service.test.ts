import { describe, expect, it } from 'vitest';

import { DatabaseService, type SqlClient } from '../../src/platform/database/database.service.js';
import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import {
  FLASHBACK_INITIAL_CASH_VND,
  FLASHBACK_JOIN_FEE_XU,
} from '../../src/modules/flashback/flashback.constants.js';
import { FlashbackAdminService } from '../../src/modules/flashback/flashback-admin.service.js';
import { FlashbackAdminController } from '../../src/modules/flashback/flashback.controller.js';
import {
  FLASHBACK_INDICATORS,
  flashbackIndicatorMeta,
  flashbackWarmupRequired,
  validateFlashbackIndicatorParams,
} from '../../src/modules/flashback/flashback.indicators.js';
import { FlashbackJob, nextChangeBoundary } from '../../src/modules/flashback/flashback.job.js';
import type {
  FlashbackJobLogRow,
  FlashbackLedgerEntry,
  FlashbackRepository,
} from '../../src/modules/flashback/flashback.repository.js';
import {
  FlashbackRoundBuilder,
  readFlashbackConfig,
} from '../../src/modules/flashback/flashback.round-builder.js';
import {
  FLASHBACK_CLOCK,
  FlashbackService,
  type FlashbackClock,
} from '../../src/modules/flashback/flashback.service.js';
import type {
  FlashbackBar,
  FlashbackEntryRow,
  FlashbackEntrySignal,
  FlashbackIndicatorInstance,
  FlashbackLeaderboardEntry,
  FlashbackLotRow,
  FlashbackOrderRow,
  FlashbackRewardHoldRow,
  FlashbackRoundRow,
} from '../../src/modules/flashback/flashback.types.js';

const USER = 'user-1';
const SUPER_ADMIN = '7a1d4f0e-4c55-4a51-9f6e-0c5b3d8b2a10';
const OTHER_USER = 'user-2';
const NOW = new Date('2026-01-05T12:00:00.000Z');

/** Bản ghi có thể sửa trong bộ nhớ (bản ghi thật là readonly). */
type MutableEntry = { -readonly [K in keyof FlashbackEntryRow]: FlashbackEntryRow[K] };
type MutableLot = { -readonly [K in keyof FlashbackLotRow]: FlashbackLotRow[K] };

/** 120 nến: 60 phiên lịch sử (giá 28.000, nến cuối 28.800) và 60 phiên chơi (28.900 → 34.800). */
function buildBars(): FlashbackBar[] {
  const bars: FlashbackBar[] = [];
  for (let index = 0; index < 60; index += 1) {
    const close = index === 59 ? 28_800 : 28_000;
    bars.push({
      d: `2020-01-${String(index + 1).padStart(2, '0')}`,
      o: close,
      h: close,
      l: close,
      c: close,
      v: 1_000_000,
    });
  }
  for (let index = 0; index < 60; index += 1) {
    const close = 28_800 + (index + 1) * 100;
    bars.push({
      d: `2020-03-${String(index + 1).padStart(2, '0')}`,
      o: close,
      h: close,
      l: close,
      c: close,
      v: 1_000_000,
    });
  }
  return bars;
}

function buildRound(): FlashbackRoundRow {
  return {
    id: 'round-1',
    roundNo: 1,
    status: 'open',
    symbol: 'AAA',
    startDate: '2020-01-01',
    warmupBars: [],
    bars: buildBars(),
    scheduledOpenAt: NOW,
    opensAt: NOW,
    closesAt: new Date(NOW.getTime() + 48 * 3_600_000),
    fallbackLevel: 0,
    priceSource: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function buildEntry(overrides: Partial<FlashbackEntryRow> = {}): MutableEntry {
  return {
    id: 'entry-1',
    roundId: 'round-1',
    userId: USER,
    joinedAt: NOW,
    feeXu: 0,
    firstJoin: true,
    indicatorParams: [],
    step: 0,
    cash: FLASHBACK_INITIAL_CASH_VND,
    initialCash: FLASHBACK_INITIAL_CASH_VND,
    finishedAt: null,
    finalNav: null,
    pnlPct: null,
    maxDrawdown: null,
    rank: null,
    rewardXu: 0,
    status: 'playing',
    ...overrides,
  } as MutableEntry;
}

interface FakeState {
  round: FlashbackRoundRow | null;
  entries: MutableEntry[];
  lots: MutableLot[];
  orders: FlashbackOrderRow[];
  wallet: { balance: number; lastSeq: number };
  ledger: FlashbackLedgerEntry[];
  jobLog: FlashbackJobLogRow[];
  settings: Record<string, unknown>;
  teamMembers: string[];
  vn30: string[];
  recentSymbols: string[];
  recentLimitCalls: number[];
  phones: Record<string, string>;
  devices: Record<string, string>;
  ips: Record<string, string>;
  ineligible: string[];
  holds: FlashbackRewardHoldRow[];
}

function createFake(state: Partial<FakeState> = {}) {
  const data: FakeState = {
    round: buildRound(),
    entries: [],
    lots: [],
    orders: [],
    wallet: { balance: 1_000, lastSeq: 0 },
    ledger: [],
    jobLog: [],
    settings: {},
    teamMembers: [],
    vn30: ['AAA', 'BBB'],
    recentSymbols: [],
    recentLimitCalls: [],
    phones: {},
    devices: {},
    ips: {},
    ineligible: [],
    holds: [],
    ...state,
  };
  let lotSeq = 0;
  let orderSeq = 0;

  const repository = {
    openRound: async () => (data.round && data.round.status === 'open' ? data.round : null),
    readyRound: async () => (data.round && data.round.status === 'ready' ? data.round : null),
    roundById: async (_db: SqlClient, id: string) =>
      data.round && data.round.id === id ? data.round : null,
    listRounds: async () => (data.round ? [data.round] : []),
    nextRoundNo: async () => 2,
    insertRound: async () => null,
    transitionRound: async (
      _tx: SqlClient,
      id: string,
      from: readonly string[],
      to: FlashbackRoundRow['status'],
      extra?: { opensAt?: Date; closesAt?: Date },
    ) => {
      if (!data.round || data.round.id !== id || !from.includes(data.round.status)) return null;
      data.round = {
        ...data.round,
        status: to,
        opensAt: extra?.opensAt ?? data.round.opensAt,
        closesAt: extra?.closesAt ?? data.round.closesAt,
      };
      return data.round;
    },
    recentRoundSymbols: async (_db: SqlClient, limit: number) => {
      data.recentLimitCalls.push(limit);
      return data.recentSymbols.slice(0, limit);
    },
    roundChartDates: async () => [],
    roundsByStatus: async (_db: SqlClient, status: string) =>
      data.round && data.round.status === status ? [data.round] : [],
    tryAcquireJobLock: async () => true,
    releaseJobLock: async () => undefined,
    advanceEntryStep: async (_db: SqlClient, id: string, fromStep: number, toStep: number) => {
      const entry = data.entries.find((item) => item.id === id);
      if (!entry || entry.step !== fromStep) return null;
      entry.step = toStep;
      return entry;
    },
    entryByRoundUser: async (_db: SqlClient, roundId: string, userId: string) =>
      data.entries.find((item) => item.roundId === roundId && item.userId === userId) ?? null,
    entryById: async (_db: SqlClient, id: string) =>
      data.entries.find((item) => item.id === id) ?? null,
    countEntriesByUser: async (_db: SqlClient, userId: string) =>
      data.entries.filter((item) => item.userId === userId).length,
    insertEntry: async (
      _db: SqlClient,
      input: {
        roundId: string;
        userId: string;
        feeXu: number;
        firstJoin: boolean;
        cash: bigint;
        initialCash: bigint;
      },
    ) => {
      const entry = buildEntry({
        id: `entry-${data.entries.length + 1}`,
        roundId: input.roundId,
        userId: input.userId,
        feeXu: input.feeXu,
        firstJoin: input.firstJoin,
        cash: input.cash,
        initialCash: input.initialCash,
      });
      data.entries.push(entry);
      return entry;
    },
    updateEntryStep: async () => null,
    updateEntryCash: async (_db: SqlClient, id: string, cash: bigint) => {
      const entry = data.entries.find((item) => item.id === id);
      if (!entry) return null;
      entry.cash = cash;
      return entry;
    },
    updateEntryIndicators: async (
      _db: SqlClient,
      id: string,
      indicators: FlashbackIndicatorInstance[],
    ) => {
      const entry = data.entries.find((item) => item.id === id);
      if (!entry) return null;
      entry.indicatorParams = indicators;
      return entry;
    },
    finishEntry: async (
      _db: SqlClient,
      id: string,
      result: { finalNav: bigint; pnlPct: number; maxDrawdown: number; finishedAt: Date },
    ) => {
      const entry = data.entries.find((item) => item.id === id);
      if (!entry || entry.status !== 'playing') return null;
      entry.status = 'finished';
      entry.finishedAt = result.finishedAt;
      entry.finalNav = result.finalNav;
      entry.pnlPct = result.pnlPct;
      entry.maxDrawdown = result.maxDrawdown;
      return entry;
    },
    assignEntryRanking: async () => null,
    listEntriesByRound: async (_db: SqlClient, roundId: string) =>
      data.entries.filter((item) => item.roundId === roundId),
    countEntriesByRound: async (_db: SqlClient, roundId: string) =>
      data.entries.filter((item) => item.roundId === roundId).length,
    leaderboardEntries: async (_db: SqlClient, roundId: string) =>
      data.entries
        .filter((item) => item.roundId === roundId)
        .map(
          (item): FlashbackLeaderboardEntry => ({
            ...item,
            username: item.userId,
            displayName: item.userId,
            phoneVerified: true,
            accountCreatedAt: new Date(NOW.getTime() - 30 * 86_400_000),
            phoneE164: data.phones[item.userId] ?? null,
          }),
        ),
    holdingsByRound: async (_db: SqlClient, roundId: string) => {
      const map = new Map<string, number>();
      for (const lot of data.lots) {
        const entry = data.entries.find((item) => item.id === lot.entryId);
        if (!entry || entry.roundId !== roundId) continue;
        map.set(lot.entryId, (map.get(lot.entryId) ?? 0) + lot.qty);
      }
      return map;
    },
    teamMemberIds: async (_db: SqlClient, userId: string) =>
      data.teamMembers.includes(userId) ? data.teamMembers : [],
    entrySignals: async (_db: SqlClient, roundId: string): Promise<FlashbackEntrySignal[]> =>
      data.entries
        .filter((item) => item.roundId === roundId)
        .map((item) => ({
          entryId: item.id,
          userId: item.userId,
          username: item.userId,
          deviceId: data.devices[item.userId] ?? null,
          joinIp: data.ips[item.userId] ?? null,
          phone: data.phones[item.userId] ?? null,
        })),
    playerEligibility: async (_db: SqlClient, userId: string) =>
      data.ineligible.includes(userId)
        ? { phoneVerified: false, accountCreatedAt: NOW }
        : { phoneVerified: true, accountCreatedAt: new Date(NOW.getTime() - 30 * 86_400_000) },
    insertRewardHold: async (
      _tx: SqlClient,
      input: { roundId: string; userId: string; entryId: string; amount: number; reason: string },
    ) => {
      if (data.holds.some((h) => h.roundId === input.roundId && h.userId === input.userId))
        return false;
      data.holds.push({
        id: `hold-${data.holds.length + 1}`,
        roundId: input.roundId,
        roundNo: 1,
        userId: input.userId,
        username: input.userId,
        entryId: input.entryId,
        amount: input.amount,
        reason: input.reason,
        status: 'held',
        decidedBy: null,
        decidedAt: null,
        createdAt: NOW,
      });
      return true;
    },
    listRewardHolds: async (
      _db: SqlClient,
      filter: { status?: string; roundId?: string },
    ) =>
      data.holds.filter(
        (h) =>
          (!filter.status || h.status === filter.status) &&
          (!filter.roundId || h.roundId === filter.roundId),
      ),
    lockRewardHold: async (_tx: SqlClient, id: string) =>
      data.holds.find((h) => h.id === id) ?? null,
    decideRewardHold: async (
      _tx: SqlClient,
      id: string,
      status: FlashbackRewardHoldRow['status'],
      decidedBy: string,
      decidedAt: Date,
    ) => {
      const index = data.holds.findIndex((h) => h.id === id && h.status === 'held');
      if (index < 0) return false;
      data.holds[index] = { ...data.holds[index]!, status, decidedBy, decidedAt };
      return true;
    },
    lotsByEntry: async (_db: SqlClient, entryId: string) =>
      data.lots.filter((lot) => lot.entryId === entryId && lot.qty > 0),
    insertLot: async (
      _db: SqlClient,
      input: { entryId: string; qty: number; price: bigint; step: number; sellableStep: number },
    ) => {
      lotSeq += 1;
      const lot: MutableLot = {
        id: `lot-${lotSeq}`,
        entryId: input.entryId,
        qty: input.qty,
        price: input.price,
        step: input.step,
        sellableStep: input.sellableStep,
        createdAt: NOW,
      };
      data.lots.push(lot);
      return lot;
    },
    consumeLot: async (_db: SqlClient, id: string, qty: number) => {
      const lot = data.lots.find((item) => item.id === id);
      if (!lot || lot.qty < qty) return false;
      lot.qty -= qty;
      return true;
    },
    insertOrder: async (
      _db: SqlClient,
      input: {
        entryId: string;
        side: 'buy' | 'sell';
        qty: number;
        price: bigint;
        step: number;
        amount: bigint;
        fee: bigint;
        tax: bigint;
        idempotencyKey: string | null;
      },
    ) => {
      orderSeq += 1;
      const order: FlashbackOrderRow = {
        id: `order-${orderSeq}`,
        entryId: input.entryId,
        side: input.side,
        qty: input.qty,
        price: input.price,
        step: input.step,
        amount: input.amount,
        fee: input.fee,
        tax: input.tax,
        idempotencyKey: input.idempotencyKey,
        createdAt: NOW,
      };
      data.orders.push(order);
      return order;
    },
    ordersByEntry: async (_db: SqlClient, entryId: string) =>
      data.orders.filter((order) => order.entryId === entryId),
    orderByIdempotencyKey: async (_db: SqlClient, entryId: string, key: string) =>
      data.orders.find((order) => order.entryId === entryId && order.idempotencyKey === key) ??
      null,
    lockWallet: async () => ({ ...data.wallet }),
    saveWallet: async (_db: SqlClient, _userId: string, balance: number, lastSeq: number) => {
      data.wallet = { balance, lastSeq };
    },
    appendLedger: async (_db: SqlClient, entry: FlashbackLedgerEntry) => {
      if (data.ledger.some((item) => item.uniqueKey === entry.uniqueKey)) return false;
      data.ledger.push(entry);
      return true;
    },
    getSetting: async (_db: SqlClient, key: string) => data.settings[key] ?? null,
    setSetting: async (_db: SqlClient, key: string, value: unknown) => {
      data.settings[key] = value;
    },
    appendJobLog: async (
      _db: SqlClient,
      entry: {
        step: string;
        roundId: string | null;
        result: string;
        error: string | null;
        level?: FlashbackJobLogRow['level'];
      },
    ) => {
      data.jobLog.push({
        runAt: NOW,
        step: entry.step,
        roundId: entry.roundId,
        result: entry.result,
        error: entry.error,
        level: entry.level ?? null,
      });
    },
    listJobLog: async () => data.jobLog,
    hasRecentAlert: async () => false,
    listCurrentVn30: async () => data.vn30,
    syncVn30: async (_tx: SqlClient, symbols: readonly string[]) => {
      const removed = data.vn30.filter((symbol) => !symbols.includes(symbol));
      const added = symbols.filter((symbol) => !data.vn30.includes(symbol));
      data.vn30 = [...symbols];
      return { added, removed };
    },
  } as unknown as FlashbackRepository;

  const database = {
    query: async () => [],
    transaction: async (operation: (tx: SqlClient) => Promise<unknown>) =>
      operation({ query: async () => [] } as unknown as SqlClient),
    withDedicatedClient: async (operation: (client: SqlClient) => Promise<unknown>) =>
      operation({ query: async () => [] } as unknown as SqlClient),
  } as unknown as DatabaseService;

  const grants = {
    grantedCapabilities: async () => new Set<string>(['indicator:rsi', 'indicator:macd']),
  } as unknown as AcademyGrantsPort;

  const clock: FlashbackClock = { now: () => NOW };

  const service = new FlashbackService(database, repository, grants, clock);
  const admin = new FlashbackAdminService(database, repository, [SUPER_ADMIN]);
  const adminController = new FlashbackAdminController(admin);
  return { service, admin, adminController, data, repository, database };
}

describe('FlashbackService', () => {
  it('cho phép lần tham gia đầu tiên miễn phí', async () => {
    const { service, data } = createFake();
    const result = await service.join(USER);
    expect(result.first_join).toBe(true);
    expect(result.fee_xu).toBe(0);
    expect(result.cash).toBe('10000000');
    expect(data.ledger).toHaveLength(0);
  });

  it('trừ 100 xu ở lần tham gia thứ hai', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry({ id: 'entry-0', roundId: 'round-0' }));
    const result = await service.join(USER);
    expect(result.first_join).toBe(false);
    expect(result.fee_xu).toBe(FLASHBACK_JOIN_FEE_XU);
    expect(data.ledger).toHaveLength(1);
    expect(data.ledger[0]?.kind).toBe('flashback_fee');
    expect(data.ledger[0]?.delta).toBe(-FLASHBACK_JOIN_FEE_XU);
    expect(data.wallet.balance).toBe(1_000 - FLASHBACK_JOIN_FEE_XU);
  });

  it('từ chối tham gia khi không đủ xu', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry({ id: 'entry-0', roundId: 'round-0' }));
    data.wallet.balance = 10;
    await expect(service.join(USER)).rejects.toMatchObject({
      response: { code: 'XU_INSUFFICIENT' },
    });
  });

  it('từ chối tham gia lại cùng một đề', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry({ id: 'entry-1', roundId: 'round-1' }));
    await expect(service.join(USER)).rejects.toMatchObject({
      response: { code: 'FLASHBACK_ALREADY_JOINED' },
    });
  });

  it('mở đúng một nến mỗi lần bấm phiên tiếp và không rò nến tương lai', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    const result = await service.next(USER, 'entry-1');
    expect(result.step).toBe(1);
    expect(result.bar.session).toBe(1);
    expect(result.bar.close).toBe(28_900);
    expect(Object.keys(result.bar).sort()).toEqual([
      'close',
      'high',
      'low',
      'open',
      'session',
      'volume',
    ]);
  });

  it('tính đúng tiền mua (150 cp × 28.800, phí 0,15%)', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    const result = await service.placeOrder(USER, 'entry-1', { side: 'buy', qty: 150 });
    expect(result.order.amount).toBe('4320000');
    expect(result.order.fee).toBe('6480');
    expect(result.order.tax).toBe('0');
    expect(result.cash).toBe('5673520');
    expect(result.holdings).toBe(150);
  });

  it('từ chối mua vượt quá "Mua tối đa"', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await expect(
      service.placeOrder(USER, 'entry-1', { side: 'buy', qty: 347 }),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_CASH' } });
  });

  it('giữ lệnh mua đến hết phiên T+2 mới bán được', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await service.placeOrder(USER, 'entry-1', { side: 'buy', qty: 10 });
    await service.next(USER, 'entry-1');
    await expect(
      service.placeOrder(USER, 'entry-1', { side: 'sell', qty: 10 }),
    ).rejects.toMatchObject({ response: { code: 'NOT_SETTLED_YET' } });
    await service.next(USER, 'entry-1');
    const sold = await service.placeOrder(USER, 'entry-1', { side: 'sell', qty: 10 });
    // Giá khớp ở phiên 2 là 29.000: phí 0,15% = 435, thuế 0,1% = 290.
    expect(sold.order.price).toBe('29000');
    expect(sold.order.amount).toBe('290000');
    expect(sold.order.fee).toBe('435');
    expect(sold.order.tax).toBe('290');
    expect(sold.holdings).toBe(0);
  });

  it('từ chối bán khi không đủ cổ phiếu đang giữ', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await expect(
      service.placeOrder(USER, 'entry-1', { side: 'sell', qty: 1 }),
    ).rejects.toMatchObject({ response: { code: 'NOT_ENOUGH_SHARES' } });
  });

  it('chốt final_nav theo giá đóng cửa phiên 60', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await service.placeOrder(USER, 'entry-1', { side: 'buy', qty: 150 });
    for (let index = 0; index < 60; index += 1) await service.next(USER, 'entry-1');
    const result = await service.finish(USER, 'entry-1');
    // Tiền mặt 5.673.520 + 150 cp × 34.800 = 10.893.520
    expect(result.final_nav).toBe('10893520');
    expect(result.pnl_pct).toBeCloseTo(0.089352, 6);
    expect(result.status).toBe('finished');
  });

  it('xếp hạng theo lợi nhuận, tie-break theo sụt giảm rồi thời điểm hoàn thành', async () => {
    const { service, data } = createFake();
    data.entries.push(
      buildEntry({
        id: 'entry-1',
        userId: 'user-a',
        pnlPct: 0.1,
        maxDrawdown: 0.2,
        status: 'finished',
        finishedAt: NOW,
      }),
      buildEntry({
        id: 'entry-2',
        userId: 'user-b',
        pnlPct: 0.1,
        maxDrawdown: 0.05,
        status: 'finished',
        finishedAt: NOW,
      }),
      buildEntry({
        id: 'entry-3',
        userId: USER,
        pnlPct: 0.2,
        maxDrawdown: 0.3,
        status: 'finished',
        finishedAt: NOW,
      }),
    );
    const board = await service.leaderboard(USER, 'all');
    expect(board.rows.map((row) => row.username)).toEqual(['user-1', 'user-b', 'user-a']);
    expect(board.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(board.me?.is_me).toBe(true);
    // FB-10: không có user_id; phiên và trạng thái chỉ có ở dòng của mình.
    expect(JSON.stringify(board)).not.toContain('user_id');
    expect(Object.keys(board.rows[1]!).sort()).toEqual(['is_me', 'pnl_pct', 'rank', 'username']);
    expect(board.me).toMatchObject({ step: 0, status: 'finished' });
  });

  it('trả bảng xếp hạng nhóm rỗng khi người dùng không có nhóm', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry({ id: 'entry-1' }));
    const board = await service.leaderboard(USER, 'team');
    expect(board.rows).toHaveLength(0);
    expect(board.me).toBeNull();
  });

  it('chỉ trả các chỉ báo người dùng đã mở', async () => {
    const { service } = createFake();
    const result = await service.listIndicators(USER);
    expect(result.map((item) => item.id)).toEqual(['rsi', 'macd']);
  });

  it('từ chối lưu chỉ báo chưa mở', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await expect(
      service.saveIndicatorParams(USER, 'entry-1', [{ id: 'ma', params: { period: 20 } }]),
    ).rejects.toMatchObject({ response: { code: 'FLASHBACK_INDICATOR_LOCKED' } });
  });

  it('kiểm tra chéo tham số MACD (fast < slow)', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await expect(
      service.saveIndicatorParams(USER, 'entry-1', [
        { id: 'macd', params: { fast: 30, slow: 26, signal: 9 } },
      ]),
    ).rejects.toMatchObject({ response: { code: 'FLASHBACK_INDICATOR_PARAMS_INVALID' } });
    const ok = await service.saveIndicatorParams(USER, 'entry-1', [
      { id: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
    ]);
    expect(ok.indicators).toHaveLength(1);
  });

  it('không nhận giá trị tham số ngoài miền của registry', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await expect(
      service.saveIndicatorParams(USER, 'entry-1', [{ id: 'rsi', params: { period: 500 } }]),
    ).rejects.toMatchObject({ response: { code: 'FLASHBACK_INDICATOR_PARAMS_INVALID' } });
  });

  it('không gửi mã và ngày thật cho trình duyệt', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    const view = await service.getCurrent(USER);
    const payload = JSON.stringify(view);
    expect(payload).not.toContain('AAA');
    expect(payload).not.toContain('2020-01-01');
    expect(view.bars).toHaveLength(60);
    expect(view.bars[59]?.session).toBe(0);
    expect(view.played_bars).toHaveLength(0);
  });

  it('bỏ qua lệnh lặp lại khi có idempotency_key', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    const first = await service.placeOrder(USER, 'entry-1', {
      side: 'buy',
      qty: 10,
      idempotencyKey: 'abc',
    });
    const second = await service.placeOrder(USER, 'entry-1', {
      side: 'buy',
      qty: 10,
      idempotencyKey: 'abc',
    });
    expect(second.order.id).toBe(first.order.id);
    expect(data.orders).toHaveLength(1);
  });

  it('không cho người khác chơi thay lượt của mình', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry());
    await expect(service.next(OTHER_USER, 'entry-1')).rejects.toMatchObject({
      response: { code: 'FLASHBACK_ENTRY_NOT_FOUND' },
    });
  });

  it('không mở thêm phiên khi đã chơi đủ 60 phiên', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry({ step: 60 }));
    await expect(service.next(USER, 'entry-1')).rejects.toMatchObject({
      response: { code: 'FLASHBACK_COMPLETE' },
    });
  });

  it('chốt kết quả bằng thời điểm của đồng hồ đã cấu hình', async () => {
    const { service, data } = createFake();
    data.entries.push(buildEntry({ step: 60 }));
    await service.finish(USER, 'entry-1');
    expect(data.entries[0]?.finishedAt?.toISOString()).toBe(NOW.toISOString());
    expect(FLASHBACK_CLOCK).toBeDefined();
  });
  it('không rò giá tương lai qua max_drawdown khi đang chơi dở', async () => {
    const bars = buildBars();
    // Giả sử ở phiên 10 giá sập mạnh xuống 10.000, nhưng người chơi mới ở phiên 1 (giá tăng 28.800 -> 28.900)
    bars[59 + 10] = { d: '2020-03-11', o: 10_000, h: 10_000, l: 10_000, c: 10_000, v: 1_000_000 };
    const { service, data } = createFake({
      round: { ...buildRound(), bars },
    });
    data.entries.push(buildEntry());
    const ordered = await service.placeOrder(USER, 'entry-1', { side: 'buy', qty: 100 });
    expect(ordered.max_drawdown).toBeCloseTo((100 * 28_800 * 0.0015) / 10_000_000, 6);
    const nextStep = await service.next(USER, 'entry-1');
    expect(nextStep.max_drawdown).toBeLessThan(0.01);
  });

  it('tính hạng tạm thời và thưởng tạm thời theo toàn bộ người chơi khi đề còn mở', async () => {
    const { service, data } = createFake();
    // Người chơi khác đang chơi ở phiên 10 và giữ 200 cp (lãi cao hơn người chơi hiện tại đứng yên)
    data.entries.push(
      buildEntry({ id: 'entry-other', userId: OTHER_USER, step: 10, cash: 4_000_000n }),
      buildEntry({ id: 'entry-1', userId: USER, step: 60 }),
    );
    data.lots.push({
      id: 'lot-other',
      entryId: 'entry-other',
      qty: 250,
      price: 28_800n,
      step: 0,
      sellableStep: 2,
      createdAt: NOW,
    });
    const finished = await service.finish(USER, 'entry-1');
    expect(finished.rank).toBe(2);
    expect(finished.reward_xu).toBe(500);

    const current = await service.getCurrent(USER);
    expect(current.my_entry?.rank).toBe(2);
    expect(current.my_entry?.reward_xu).toBe(500);
  });

  it('sắp xếp đủ 16 chỉ báo theo thứ tự bài học v3.3, ngưỡng dưới < ngưỡng trên và gửi warmup_bars ngay từ chu kỳ nhỏ', async () => {
    expect(FLASHBACK_INDICATORS.map((item) => item.id)).toEqual([
      'volume',
      'ma',
      'rsi',
      'macd',
      'bollinger',
      'ema',
      'ma_cross',
      'dmi',
      'donchian',
      'stochastic',
      'cci',
      'roc',
      'williams_r',
      'obv',
      'mfi',
      'cmf',
    ]);
    expect(FLASHBACK_INDICATORS.map((item) => item.lesson_id)).toEqual([
      'ch04-l04',
      'ch04-l05',
      'ch04-l06',
      'ch04-l07',
      'ch04-l08',
      'ch06-l01',
      'ch06-l02',
      'ch06-l03',
      'ch06-l04',
      'ch07-l01',
      'ch07-l02',
      'ch07-l03',
      'ch07-l04',
      'ch07-l05',
      'ch07-l06',
      'ch07-l07',
    ]);

    const roc = flashbackIndicatorMeta('roc')!;
    const rocLevel = roc.params.find((p) => p.key === 'level')!;
    expect(rocLevel.lower?.default).toBe(-5);
    expect(rocLevel.upper?.default).toBe(5);

    const cci = flashbackIndicatorMeta('cci')!;
    const cciLevel = cci.params.find((p) => p.key === 'level')!;
    expect(cciLevel.lower?.default).toBe(-100);
    expect(cciLevel.upper?.default).toBe(100);

    const rsi = flashbackIndicatorMeta('rsi')!;
    expect(
      validateFlashbackIndicatorParams(rsi, { period: 14, level: { lower: 45, upper: 45 } }),
    ).toBeTruthy();
    expect(
      validateFlashbackIndicatorParams(cci, { period: 20, level: { lower: 100, upper: -100 } }),
    ).toBe('CCI: Ngưỡng dưới phải nhỏ hơn ngưỡng trên.');

    expect(
      flashbackWarmupRequired([
        { id: 'cci', params: { period: 20, level: { lower: -100, upper: 100 } } },
      ]),
    ).toBe(20);
    expect(
      flashbackWarmupRequired([{ id: 'macd', params: { fast: 12, slow: 26, signal: 9 } }]),
    ).toBe(35);
    expect(
      flashbackWarmupRequired([
        { id: 'stochastic', params: { k: 14, smooth: 3, d: 3, level: { lower: 20, upper: 80 } } },
      ]),
    ).toBe(20);
    expect(flashbackWarmupRequired([{ id: 'dmi', params: { period: 14 } }])).toBe(28);

    const warmupBars: FlashbackBar[] = Array.from({ length: 30 }, (_, idx) => ({
      d: `2019-11-${String(idx + 1).padStart(2, '0')}`,
      o: 27_500,
      h: 27_500,
      l: 27_500,
      c: 27_500,
      v: 500_000,
    }));
    const { service, data } = createFake({
      round: { ...buildRound(), warmupBars },
    });
    data.entries.push(
      buildEntry({
        indicatorParams: [{ id: 'rsi', params: { period: 14, level: { lower: 30, upper: 70 } } }],
      }),
    );
    const current = await service.getCurrent(USER);
    expect(current.warmup_bars).toHaveLength(14);
    expect(current.warmup_bars?.[13]?.session).toBe(-60);
  });
});

describe('FlashbackAdminService', () => {
  it('trả id của đề để gọi được endpoint reveal, luôn ẩn symbol và start_date trong danh sách', async () => {
    const { admin, data } = createFake({
      round: { ...buildRound(), status: 'closed' },
    });
    const rounds = await admin.rounds();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.id).toBe('round-1');
    expect(rounds[0]?.round_no).toBe(1);
    expect(rounds[0]?.symbol).toBeNull();
    expect(rounds[0]?.start_date).toBeNull();

    await expect(
      admin.revealRound('round-1', { adminId: 'tl-1', actorRole: 'team_lead', role: 'team_lead' }),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_REQUIRED' } });
    // FB-08: vai trò admin thường không đủ, phải có trong SUPER_ADMIN_USER_IDS.
    await expect(
      admin.revealRound('round-1', { adminId: 'admin-1', actorRole: 'admin', role: 'admin' }),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_REQUIRED' } });

    const revealed = await admin.revealRound('round-1', {
      adminId: SUPER_ADMIN.toUpperCase(),
      actorRole: 'admin',
      role: 'admin',
      ip: '127.0.0.1',
    });
    expect(revealed.symbol).toBe('AAA');
    expect(revealed.start_date).toBe('2020-01-01');
    expect(data.jobLog.some((item) => item.step === 'reveal')).toBe(true);
  });

  it('phát hiện tài khoản trùng số điện thoại (same_phone) và fallback sang đề gần nhất khi không có đề mở', async () => {
    const { admin, data } = createFake({
      round: { ...buildRound(), status: 'closed' },
      phones: { alice: '+84901234567', bob: '+84901234567' },
    });
    data.entries.push(
      buildEntry({ id: 'e-1', userId: 'alice' }),
      buildEntry({ id: 'e-2', userId: 'bob' }),
    );
    const suspects = await admin.suspects();
    expect(suspects).toEqual([
      {
        round_id: 'round-1',
        reason: 'same_phone',
        shared: '+84901234567',
        user_count: 2,
        usernames: ['alice', 'bob'],
      },
    ]);
  });

  it('đọc và ghi trạng thái tạm dừng, chỉ quản trị viên cao nhất được bấm', async () => {
    const { admin } = createFake();
    const audit = (adminId: string) => ({
      adminId,
      actorRole: 'admin' as const,
      ip: null,
      userAgent: null,
      requestId: null,
    });
    expect(await admin.paused()).toBe(false);
    await expect(admin.setPaused(true, audit('admin-1'))).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    expect(await admin.paused()).toBe(false);
    expect(await admin.setPaused(true, audit(SUPER_ADMIN))).toEqual({ paused: true });
    expect(await admin.paused()).toBe(true);
  });

  it('endpoint trạng thái tạm dừng trả về paused và super_admin', async () => {
    const { adminController } = createFake();
    expect(
      await adminController.pauseStatus({ id: 'admin-1' } as unknown as AuthenticatedUser),
    ).toEqual({ paused: false, super_admin: false });
    expect(
      await adminController.pauseStatus({ id: SUPER_ADMIN } as unknown as AuthenticatedUser),
    ).toEqual({ paused: false, super_admin: true });
  });

  it('trả mức độ của cảnh báo kèm nhãn tiếng Việt', async () => {
    const { admin, data } = createFake();
    data.jobLog.push({
      runAt: NOW,
      step: 'alert',
      roundId: 'round-1',
      result: 'Đề quá giờ đóng',
      error: null,
      level: 'high',
    });
    data.jobLog.push({
      runAt: NOW,
      step: 'alert',
      roundId: 'round-1',
      result: 'Đề dùng phương án dự phòng',
      error: null,
      level: 'low',
    });
    data.jobLog.push({
      runAt: NOW,
      step: 'b1',
      roundId: 'round-1',
      result: 'đóng đề',
      error: null,
      level: null,
    });
    const alerts = await admin.alerts();
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.level).toBe('high');
    expect(alerts[0]?.level_label).toBe('Cao');
    expect(alerts[1]?.level).toBe('low');
    expect(alerts[1]?.level_label).toBe('Thấp');
  });
});

describe('FlashbackJob & FlashbackRoundBuilder', () => {
  it('nextChangeBoundary giữ nguyên mốc 20:00 UTC+7 và chỉ dịch sang ngày hôm sau khi đã qua 20:00', () => {
    const exact20Vn = new Date('2026-01-05T13:00:00.000Z');
    expect(nextChangeBoundary(exact20Vn, 20).toISOString()).toBe('2026-01-05T13:00:00.000Z');
    const after20Vn = new Date('2026-01-05T13:01:00.000Z');
    expect(nextChangeBoundary(after20Vn, 20).toISOString()).toBe('2026-01-06T13:00:00.000Z');
  });

  it('chỉ loại 5 đề gần nhất khi rổ còn dưới 5 mã sau khi loại 10 đề, kiểm tra dữ liệu sạch và ghi cảnh báo khi rổ VN30 < 25 mã', async () => {
    const { data, repository, database } = createFake({
      vn30: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12'],
      recentSymbols: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'],
    });

    const cleanSeries: FlashbackBar[] = Array.from({ length: 400 }, (_, i) => {
      const day = new Date(Date.UTC(2018, 0, 1 + i)).toISOString().slice(0, 10);
      const close = 30_000 + (i % 2 === 0 ? 500 : -400);
      return { d: day, o: close, h: close + 100, l: close - 100, c: close, v: 1_000_000 };
    });
    const dirtySeries: FlashbackBar[] = cleanSeries.map((bar, i) =>
      i === 100 ? { ...bar, c: bar.c * 1.5, h: bar.c * 1.5 } : bar,
    );

    const builder = new FlashbackRoundBuilder(database, repository, {
      dailyBars: async (symbol: string) => (symbol === 'S12' ? dirtySeries : cleanSeries),
    });

    const config = readFlashbackConfig({});
    const built = await builder.build(NOW, 0, config);
    expect(built).not.toBeNull();
    expect(data.recentLimitCalls).toEqual([10, 5]);
    expect(
      data.jobLog.some(
        (item) =>
          item.step === 'alert' &&
          item.level === 'medium' &&
          item.result.includes('vn30_pool_degraded'),
      ),
    ).toBe(true);
  });

  it('kéo dài đề đang mở thêm 24 giờ và không đóng đề khi tới giờ đổi đề mà mọi mức dự phòng 0..3 đều thất bại', async () => {
    const expiredRound: FlashbackRoundRow = {
      ...buildRound(),
      closesAt: new Date(NOW.getTime() - 60_000),
    };
    const { data, repository, database } = createFake({ round: expiredRound });
    const builder = {
      build: async () => null,
    } as unknown as FlashbackRoundBuilder;
    const job = new FlashbackJob(database, repository, { now: () => NOW }, builder);

    const outcome = await job.run(NOW);
    expect(outcome.status).toBe('completed');
    expect(data.round?.status).toBe('open');
    expect(data.round?.closesAt?.getTime()).toBe(NOW.getTime() + 24 * 3_600_000);
    expect(data.jobLog.some((item) => item.result.includes('fallback_extend_24h'))).toBe(true);
  });
});
