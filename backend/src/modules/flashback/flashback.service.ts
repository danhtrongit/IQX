/**
 * Nghiệp vụ phía người chơi của game Flashback.
 *
 * Mọi quyết định quan trọng đều do server tự tính: giá khớp lấy từ nến của phiên hiện tại,
 * phí/thuế tính bằng `roundBasisPoints` giống module trading, lượt chơi chỉ tồn tại một lần
 * mỗi đề (ràng buộc unique) và mọi ghi đều nằm trong một transaction.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { roundBasisPoints } from '../trading/trading.service.js';
import {
  FLASHBACK_FEE_BPS,
  FLASHBACK_HISTORY_SESSIONS,
  FLASHBACK_INITIAL_CASH_VND,
  FLASHBACK_JOIN_FEE_XU,
  FLASHBACK_PLAY_SESSIONS,
  FLASHBACK_REWARD_TABLE,
  FLASHBACK_SETTLEMENT_SESSIONS,
  FLASHBACK_TAX_BPS,
  flashbackRewardForRank,
} from './flashback.constants.js';
import {
  flashbackIndicatorCatalog,
  flashbackIndicatorMeta,
  flashbackWarmupRequired,
  validateFlashbackIndicatorParams,
  type FlashbackIndicatorInstanceInput,
  type FlashbackIndicatorMeta,
} from './flashback.indicators.js';
import { FLASHBACK_REPOSITORY, FlashbackRepository } from './flashback.repository.js';
import type {
  FlashbackBar,
  FlashbackEntryRow,
  FlashbackIndicatorInstance,
  FlashbackOrderRow,
  FlashbackRoundRow,
} from './flashback.types.js';

/** Token kho Flashback (đặt trong `flashback.repository.ts` để chỉ có một nguồn). */
export { FLASHBACK_REPOSITORY };

/** Token đồng hồ (để test cố định thời gian). */
export const FLASHBACK_CLOCK = Symbol('FLASHBACK_CLOCK');

export interface FlashbackClock {
  now(): Date;
}

export const systemFlashbackClock: FlashbackClock = { now: () => new Date() };

const badRequest = (code: string, message: string) => new BadRequestException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const notFound = (code: string, message: string) => new NotFoundException({ code, message });
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message });
const invalid = (code: string, message: string) =>
  new UnprocessableEntityException({ code, message });
const paymentRequired = (code: string, message: string) => new HttpException({ code, message }, 402);

/** Một nến gửi cho trình duyệt (không có ngày thật, không có mã). */
export interface FlashbackPublicBar {
  readonly session: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Một lô cổ phiếu đang giữ. */
export interface FlashbackPositionView {
  readonly qty: number;
  readonly price: string;
  readonly step: number;
  readonly sellable_step: number;
  readonly status: 'settled' | 'pending';
  readonly sessions_left: number;
  readonly pnl_pct: number;
  readonly value: string;
}

/** Một lệnh đã khớp. */
export interface FlashbackOrderView {
  readonly id: string;
  readonly side: 'buy' | 'sell';
  readonly qty: number;
  readonly price: string;
  readonly step: number;
  readonly amount: string;
  readonly fee: string;
  readonly tax: string;
  readonly created_at: string;
}

/** Lượt chơi của người dùng trong đề hiện tại. */
export interface FlashbackEntryView {
  readonly id: string;
  readonly step: number;
  readonly cash: string;
  readonly holdings: number;
  readonly total_assets: string;
  readonly pnl_pct: number | null;
  readonly pnl_percent: number | null;
  readonly max_drawdown: number | null;
  readonly max_drawdown_percent: number | null;
  readonly status: 'playing' | 'finished';
  readonly joined_at: string;
  readonly finished_at: string | null;
  readonly final_nav: string | null;
  readonly rank: number | null;
  readonly reward_xu: number;
  readonly indicator_params: readonly FlashbackIndicatorInstance[];
  readonly positions: readonly FlashbackPositionView[];
  readonly orders: readonly FlashbackOrderView[];
}

/** Kết quả `GET /current`. */
export interface FlashbackCurrentView {
  readonly round_id: string;
  readonly round_no: number;
  readonly closes_at: string;
  readonly player_count: number;
  readonly fee_xu: number;
  readonly first_join_free: boolean;
  readonly reward_table: readonly { from_rank: number; to_rank: number | null; xu: number }[];
  readonly joined: boolean;
  readonly my_entry: FlashbackEntryView | null;
  readonly bars: readonly FlashbackPublicBar[];
  readonly played_bars: readonly FlashbackPublicBar[];
  readonly warmup_bars?: readonly FlashbackPublicBar[];
  readonly max_drawdown?: number;
  readonly history_sessions: number;
  readonly play_sessions: number;
  readonly total_sessions: number;
}

/** Kết quả `POST /current/join`. */
export interface FlashbackJoinResult {
  readonly entry_id: string;
  readonly round_id: string;
  readonly first_join: boolean;
  readonly fee_xu: number;
  readonly cash: string;
  readonly joined_at: string;
}

/** Kết quả `POST /entries/:id/next`. */
export interface FlashbackNextResult {
  readonly entry_id: string;
  readonly step: number;
  readonly bar: FlashbackPublicBar;
  readonly cash: string;
  readonly holdings: number;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  readonly max_drawdown: number;
}

/** Kết quả `POST /entries/:id/orders`. */
export interface FlashbackOrderViewResult {
  readonly order: FlashbackOrderView;
  readonly cash: string;
  readonly holdings: number;
  readonly total_assets: string;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  readonly max_drawdown: number;
}

/** Kết quả `POST /entries/:id/finish`. */
export interface FlashbackFinishResult {
  readonly entry_id: string;
  readonly final_nav: string;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  readonly max_drawdown: number;
  readonly max_drawdown_percent: number;
  readonly rank: number | null;
  readonly reward_xu: number;
  readonly status: 'finished';
}

/** Kết quả `GET /current/leaderboard`. */
export interface FlashbackLeaderboardView {
  readonly scope: 'all' | 'team';
  readonly rows: readonly FlashbackLeaderboardRowView[];
  readonly me: FlashbackLeaderboardRowView | null;
  readonly total_players: number;
}

export interface FlashbackLeaderboardRowView {
  readonly rank: number;
  readonly user_id: string;
  readonly username: string;
  readonly pnl_pct: number | null;
  readonly pnl_percent: number | null;
  readonly max_drawdown: number | null;
  readonly status: 'playing' | 'finished';
  readonly step: number;
  readonly reward_xu: number;
  readonly is_me: boolean;
}

/** Nến biểu đồ tại một bước chơi: bước 0 là nến lịch sử cuối cùng. */
function chartBar(round: FlashbackRoundRow, step: number): FlashbackBar {
  const index = FLASHBACK_HISTORY_SESSIONS - 1 + step;
  const bar = round.bars[index];
  if (!bar) throw new Error(`Round ${round.id} thiếu nến tại bước ${step}`);
  return bar;
}

function barPrice(bar: FlashbackBar): bigint {
  return BigInt(Math.round(bar.c));
}

function toPublicBar(bar: FlashbackBar, session: number): FlashbackPublicBar {
  return {
    session,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  };
}

/** Lượng cổ phiếu lớn nhất mua được với số tiền mặt hiện có (cùng công thức với lệnh mua). */
export function maxBuyQty(cash: bigint, price: bigint): number {
  if (price <= 0n || cash <= 0n) return 0;
  const affordable = (qty: number): boolean => {
    const amount = price * BigInt(qty);
    return amount + roundBasisPoints(amount, FLASHBACK_FEE_BPS) <= cash;
  };
  // Tìm nhị phân trên khoảng [0, 1 tỷ] vì chi phí tăng đơn điệu theo số lượng.
  let low = 0;
  let high = 1_000_000_000;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (affordable(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Đường vốn tài sản theo từng bước để tính sụt giảm lớn nhất. */
export function maxDrawdownOf(
  round: FlashbackRoundRow,
  orders: readonly FlashbackOrderRow[],
  initialCash: bigint,
  upToStep: number = FLASHBACK_PLAY_SESSIONS,
): number {
  const limit = Math.max(0, Math.min(FLASHBACK_PLAY_SESSIONS, upToStep));
  let cash = initialCash;
  let holdings = 0n;
  let peak = initialCash;
  let worst = 0;
  for (let step = 0; step <= limit; step += 1) {
    for (const order of orders) {
      if (order.step !== step) continue;
      if (order.side === 'buy') {
        cash -= order.amount + order.fee;
        holdings += BigInt(order.qty);
      } else {
        cash += order.amount - order.fee - order.tax;
        holdings -= BigInt(order.qty);
      }
    }
    const equity = cash + holdings * barPrice(chartBar(round, step));
    if (equity > peak) peak = equity;
    if (peak > 0n) {
      const drawdown = Number(peak - equity) / Number(peak);
      if (drawdown > worst) worst = drawdown;
    }
  }
  return worst;
}

@Injectable()
export class FlashbackService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY)
    private readonly repository: FlashbackRepository,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    @Inject(FLASHBACK_CLOCK) private readonly clock: FlashbackClock,
  ) {}

  // ------------------------------------------------------------------ đọc

  async getCurrent(userId: string): Promise<FlashbackCurrentView> {
    const round = await this.repository.openRound(this.database);
    if (!round)
      throw notFound('FLASHBACK_NO_OPEN_ROUND', 'Hiện không có đề Flashback nào đang mở.');
    const entry = await this.repository.entryByRoundUser(this.database, round.id, userId);
    const playerCount = await this.repository.countEntriesByRound(this.database, round.id);
    const priorEntries = await this.repository.countEntriesByUser(this.database, userId);
    const firstJoinFree = priorEntries === 0 || entry?.firstJoin === true;

    const bars: FlashbackPublicBar[] = round.bars
      .slice(0, FLASHBACK_HISTORY_SESSIONS)
      .map((bar, index) => toPublicBar(bar, index - (FLASHBACK_HISTORY_SESSIONS - 1)));
    const playedBars: FlashbackPublicBar[] = [];
    if (entry) {
      for (let step = 1; step <= entry.step; step += 1) {
        playedBars.push(toPublicBar(chartBar(round, step), step));
      }
    }

    const view: { -readonly [K in keyof FlashbackCurrentView]: FlashbackCurrentView[K] } = {
      round_id: round.id,
      round_no: round.roundNo,
      closes_at: (round.closesAt ?? round.scheduledOpenAt).toISOString(),
      player_count: playerCount,
      fee_xu: firstJoinFree ? 0 : FLASHBACK_JOIN_FEE_XU,
      first_join_free: firstJoinFree,
      reward_table: FLASHBACK_REWARD_TABLE.map((tier) => ({
        from_rank: tier.fromRank,
        to_rank: tier.toRank,
        xu: tier.xu,
      })),
      joined: entry !== null,
      my_entry: entry ? await this.entryView(round, entry) : null,
      bars,
      played_bars: playedBars,
      history_sessions: FLASHBACK_HISTORY_SESSIONS,
      play_sessions: FLASHBACK_PLAY_SESSIONS,
      total_sessions: FLASHBACK_HISTORY_SESSIONS + FLASHBACK_PLAY_SESSIONS,
    };

    if (entry) {
      const required = flashbackWarmupRequired(entry.indicatorParams);
      if (required > 0 && round.warmupBars.length > 0) {
        const count = Math.min(round.warmupBars.length, required);
        const slice = round.warmupBars.slice(round.warmupBars.length - count);
        view.warmup_bars = slice.map((bar, index) =>
          toPublicBar(bar, index - slice.length - (FLASHBACK_HISTORY_SESSIONS - 1)),
        );
      }
    }
    return view;
  }

  async listIndicators(userId: string): Promise<FlashbackIndicatorMeta[]> {
    const granted = await this.grants.grantedCapabilities(userId);
    return flashbackIndicatorCatalog()
      .filter((meta) => granted.has(`indicator:${meta.id}`))
      .map((meta) => ({ ...meta }));
  }

  async saveIndicatorParams(
    userId: string,
    entryId: string,
    indicators: readonly FlashbackIndicatorInstanceInput[],
  ): Promise<{
    entry_id: string;
    indicators: readonly FlashbackIndicatorInstance[];
    warmup_required: number;
  }> {
    const granted = await this.grants.grantedCapabilities(userId);
    const validated: FlashbackIndicatorInstance[] = [];
    for (const instance of indicators) {
      const meta = flashbackIndicatorMeta(instance.id);
      if (!meta)
        throw invalid('FLASHBACK_INDICATOR_UNKNOWN', `Không có chỉ báo "${instance.id}".`);
      if (!granted.has(`indicator:${instance.id}`))
        throw forbidden(
          'FLASHBACK_INDICATOR_LOCKED',
          `Chỉ báo ${meta.name} chưa được mở, không thể lưu tham số.`,
        );
      const error = validateFlashbackIndicatorParams(meta, instance.params);
      if (error) throw invalid('FLASHBACK_INDICATOR_PARAMS_INVALID', error);
      validated.push({ id: instance.id, params: instance.params });
    }
    const entry = await this.database.transaction(async (tx) => {
      const current = await this.repository.entryById(tx, entryId);
      if (!current || current.userId !== userId)
        throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
      if (current.status !== 'playing')
        throw conflict('FLASHBACK_ALREADY_FINISHED', 'Lượt chơi đã kết thúc.');
      const updated = await this.repository.updateEntryIndicators(tx, current.id, validated);
      if (!updated)
        throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
      return updated;
    });
    return {
      entry_id: entry.id,
      indicators: entry.indicatorParams,
      warmup_required: flashbackWarmupRequired(entry.indicatorParams),
    };
  }

  // ------------------------------------------------------------------ chơi

  async join(userId: string): Promise<FlashbackJoinResult> {
    const round = await this.repository.openRound(this.database);
    if (!round)
      throw conflict('FLASHBACK_NO_OPEN_ROUND', 'Hiện không có đề Flashback nào đang mở.');
    const entry = await this.database.transaction(async (tx) => {
      const existing = await this.repository.entryByRoundUser(tx, round.id, userId);
      if (existing)
        throw conflict('FLASHBACK_ALREADY_JOINED', 'Bạn đã tham gia đề này rồi.');
      const priorEntries = await this.repository.countEntriesByUser(tx, userId);
      const firstJoin = priorEntries === 0;
      const fee = firstJoin ? 0 : FLASHBACK_JOIN_FEE_XU;
      if (fee > 0) {
        const wallet = await this.repository.lockWallet(tx, userId);
        if (wallet.balance < fee)
          throw paymentRequired(
            'XU_INSUFFICIENT',
            'Không đủ xu. Cần 100 xu để tham gia đề tiếp theo.',
          );
        const seq = wallet.lastSeq + 1;
        const balanceAfter = wallet.balance - fee;
        const appended = await this.repository.appendLedger(tx, {
          userId,
          seq,
          kind: 'flashback_fee',
          delta: -fee,
          balanceAfter,
          uniqueKey: `flashback_fee:${round.id}:${userId}`,
          ref: { round_id: round.id, round_no: round.roundNo },
          policyVersion: 'iqx-flashback-v1',
        });
        if (!appended)
          throw conflict('FLASHBACK_ALREADY_JOINED', 'Bạn đã tham gia đề này rồi.');
        await this.repository.saveWallet(tx, userId, balanceAfter, seq);
      }
      const created = await this.repository.insertEntry(tx, {
        roundId: round.id,
        userId,
        feeXu: fee,
        firstJoin,
        cash: FLASHBACK_INITIAL_CASH_VND,
        initialCash: FLASHBACK_INITIAL_CASH_VND,
      });
      if (!created)
        throw conflict('FLASHBACK_ALREADY_JOINED', 'Bạn đã tham gia đề này rồi.');
      return created;
    });
    return {
      entry_id: entry.id,
      round_id: entry.roundId,
      first_join: entry.firstJoin,
      fee_xu: entry.feeXu,
      cash: entry.cash.toString(),
      joined_at: entry.joinedAt.toISOString(),
    };
  }

  async next(userId: string, entryId: string): Promise<FlashbackNextResult> {
    const result = await this.database.transaction(async (tx) => {
      const entry = await this.repository.entryById(tx, entryId);
      if (!entry || entry.userId !== userId)
        throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
      if (entry.status !== 'playing')
        throw conflict('FLASHBACK_ALREADY_FINISHED', 'Lượt chơi đã kết thúc.');
      if (entry.step >= FLASHBACK_PLAY_SESSIONS)
        throw conflict('FLASHBACK_COMPLETE', 'Bạn đã chơi đủ 60 phiên.');
      const round = await this.repository.roundById(tx, entry.roundId);
      if (!round) throw notFound('FLASHBACK_ROUND_NOT_FOUND', 'Không tìm thấy đề.');
      const step = entry.step + 1;
      const advanced = await this.repository.advanceEntryStep(tx, entry.id, entry.step, step);
      if (!advanced)
        throw conflict('FLASHBACK_STEP_MISMATCH', 'Phiên vừa được mở ở nơi khác, hãy tải lại.');
      const bar = chartBar(round, step);
      const lots = await this.repository.lotsByEntry(tx, entry.id);
      const holdings = lots.reduce((sum, lot) => sum + lot.qty, 0);
      const nav = advanced.cash + BigInt(holdings) * barPrice(bar);
      return {
        entry: advanced,
        round,
        step,
        bar,
        holdings,
        pnlPct: Number(nav - advanced.initialCash) / Number(advanced.initialCash),
      };
    });
    return {
      entry_id: result.entry.id,
      step: result.step,
      bar: toPublicBar(result.bar, result.step),
      cash: result.entry.cash.toString(),
      holdings: result.holdings,
      pnl_pct: result.pnlPct,
      pnl_percent: result.pnlPct * 100,
      max_drawdown: await this.currentDrawdown(result.entry.id, result.round),
    };
  }

  async placeOrder(
    userId: string,
    entryId: string,
    input: { side: 'buy' | 'sell'; qty: number; idempotencyKey?: string | null },
  ): Promise<FlashbackOrderViewResult> {
    if (!Number.isInteger(input.qty) || input.qty < 1)
      throw badRequest('INVALID_QTY', 'Số lượng phải là số nguyên lớn hơn 0.');
    const result = await this.database.transaction(async (tx) => {
      const entry = await this.repository.entryById(tx, entryId);
      if (!entry || entry.userId !== userId)
        throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
      if (entry.status !== 'playing')
        throw conflict('FLASHBACK_ALREADY_FINISHED', 'Lượt chơi đã kết thúc.');
      const round = await this.repository.roundById(tx, entry.roundId);
      if (!round) throw notFound('FLASHBACK_ROUND_NOT_FOUND', 'Không tìm thấy đề.');
      if (round.status !== 'open')
        throw conflict('FLASHBACK_ROUND_NOT_OPEN', 'Đề đã đóng, không nhận lệnh nữa.');
      if (input.idempotencyKey) {
        const replay = await this.repository.orderByIdempotencyKey(
          tx,
          entry.id,
          input.idempotencyKey,
        );
        if (replay) {
          const lots = await this.repository.lotsByEntry(tx, entry.id);
          const holdings = lots.reduce((sum, lot) => sum + lot.qty, 0);
          return { order: replay, entry, round, holdings };
        }
      }

      const price = barPrice(chartBar(round, entry.step));
      const amount = price * BigInt(input.qty);
      const fee = roundBasisPoints(amount, FLASHBACK_FEE_BPS);
      let cash: bigint;
      let holdings: number;

      if (input.side === 'buy') {
        const total = amount + fee;
        if (total > entry.cash)
          throw badRequest('INSUFFICIENT_CASH', 'Không đủ tiền mặt.');
        cash = entry.cash - total;
        holdings = (await this.repository.lotsByEntry(tx, entry.id)).reduce(
          (sum, lot) => sum + lot.qty,
          input.qty,
        );
      } else {
        const tax = roundBasisPoints(amount, FLASHBACK_TAX_BPS);
        const lots = await this.repository.lotsByEntry(tx, entry.id);
        const totalHeld = lots.reduce((sum, lot) => sum + lot.qty, 0);
        const sellable = lots.filter((lot) => lot.sellableStep <= entry.step);
        const settled = sellable.reduce((sum, lot) => sum + lot.qty, 0);
        if (input.qty > settled) {
          if (settled < totalHeld && input.qty <= totalHeld)
            throw badRequest(
              'NOT_SETTLED_YET',
              'Cổ phiếu mới mua chưa đủ chu kỳ T+2, chưa bán được.',
            );
          throw badRequest('NOT_ENOUGH_SHARES', 'Vượt quá số cổ phiếu đang giữ.');
        }
        let remaining = input.qty;
        for (const lot of sellable) {
          if (remaining <= 0) break;
          const take = Math.min(lot.qty, remaining);
          const consumed = await this.repository.consumeLot(tx, lot.id, take);
          if (!consumed)
            throw conflict('FLASHBACK_LOT_CHANGED', 'Số cổ phiếu đã thay đổi, hãy thử lại.');
          remaining -= take;
        }
        cash = entry.cash + amount - fee - tax;
        holdings = totalHeld - input.qty;
        const order = await this.repository.insertOrder(tx, {
          entryId: entry.id,
          side: 'sell',
          qty: input.qty,
          price,
          step: entry.step,
          amount,
          fee,
          tax,
          idempotencyKey: input.idempotencyKey ?? null,
        });
        if (!order) throw conflict('FLASHBACK_ORDER_CONFLICT', 'Lệnh bị từ chối, hãy thử lại.');
        const updated = await this.repository.updateEntryCash(tx, entry.id, cash);
        if (!updated) throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
        return { order, entry: updated, round, holdings };
      }

      const order = await this.repository.insertOrder(tx, {
        entryId: entry.id,
        side: 'buy',
        qty: input.qty,
        price,
        step: entry.step,
        amount,
        fee,
        tax: 0n,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      if (!order) throw conflict('FLASHBACK_ORDER_CONFLICT', 'Lệnh bị từ chối, hãy thử lại.');
      await this.repository.insertLot(tx, {
        entryId: entry.id,
        qty: input.qty,
        price,
        step: entry.step,
        sellableStep: entry.step + FLASHBACK_SETTLEMENT_SESSIONS,
      });
      const updated = await this.repository.updateEntryCash(tx, entry.id, cash);
      if (!updated) throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
      return { order, entry: updated, round, holdings };
    });

    const totalAssets =
      result.entry.cash + BigInt(result.holdings) * barPrice(chartBar(result.round, result.entry.step));
    const pnlPct =
      Number(totalAssets - result.entry.initialCash) / Number(result.entry.initialCash);
    return {
      order: this.orderView(result.order),
      cash: result.entry.cash.toString(),
      holdings: result.holdings,
      total_assets: totalAssets.toString(),
      pnl_pct: pnlPct,
      pnl_percent: pnlPct * 100,
      max_drawdown: await this.currentDrawdown(result.entry.id, result.round),
    };
  }

  async finish(userId: string, entryId: string): Promise<FlashbackFinishResult> {
    const result = await this.database.transaction(async (tx) => {
      const entry = await this.repository.entryById(tx, entryId);
      if (!entry || entry.userId !== userId)
        throw notFound('FLASHBACK_ENTRY_NOT_FOUND', 'Không tìm thấy lượt chơi.');
      if (entry.status === 'finished') {
        const round = await this.repository.roundById(tx, entry.roundId);
        if (!round) throw notFound('FLASHBACK_ROUND_NOT_FOUND', 'Không tìm thấy đề.');
        return { entry, round };
      }
      const round = await this.repository.roundById(tx, entry.roundId);
      if (!round) throw notFound('FLASHBACK_ROUND_NOT_FOUND', 'Không tìm thấy đề.');
      const lots = await this.repository.lotsByEntry(tx, entry.id);
      const holdings = lots.reduce((sum, lot) => sum + lot.qty, 0);
      const orders = await this.repository.ordersByEntry(tx, entry.id);
      const lastPrice = barPrice(chartBar(round, FLASHBACK_PLAY_SESSIONS));
      const finalNav = entry.cash + BigInt(holdings) * lastPrice;
      const pnlPct = Number(finalNav - entry.initialCash) / Number(entry.initialCash);
      const drawdown = maxDrawdownOf(round, orders, entry.initialCash);
      const finished = await this.repository.finishEntry(tx, entry.id, {
        finalNav,
        pnlPct,
        maxDrawdown: drawdown,
        finishedAt: this.clock.now(),
      });
      if (!finished)
        throw conflict('FLASHBACK_ALREADY_FINISHED', 'Lượt chơi đã kết thúc.');
      return { entry: finished, round };
    });

    const rank =
      result.entry.rank ?? (await this.provisionalRank(result.round, result.entry));
    const rewardXu =
      result.round.status === 'open' && result.entry.rank === null
        ? rank !== null
          ? flashbackRewardForRank(rank)
          : 0
        : result.entry.rewardXu;
    return {
      entry_id: result.entry.id,
      final_nav: (result.entry.finalNav ?? 0n).toString(),
      pnl_pct: result.entry.pnlPct ?? 0,
      pnl_percent: (result.entry.pnlPct ?? 0) * 100,
      max_drawdown: result.entry.maxDrawdown ?? 0,
      max_drawdown_percent: (result.entry.maxDrawdown ?? 0) * 100,
      rank,
      reward_xu: rewardXu,
      status: 'finished',
    };
  }

  async leaderboard(userId: string, scope: 'all' | 'team'): Promise<FlashbackLeaderboardView> {
    const round = await this.repository.openRound(this.database);
    if (!round) return { scope, rows: [], me: null, total_players: 0 };
    const entries = await this.repository.leaderboardEntries(this.database, round.id);
    const holdings = await this.repository.holdingsByRound(this.database, round.id);

    let members: string[] | null = null;
    if (scope === 'team') {
      members = await this.repository.teamMemberIds(this.database, userId);
      if (members.length === 0)
        return { scope, rows: [], me: null, total_players: 0 };
    }

    const rows = entries
      .filter((entry) => members === null || members.includes(entry.userId))
      .map((entry) => {
        const held = holdings.get(entry.id) ?? 0;
        if (entry.status === 'finished') {
          return {
            entry,
            pnlPct: entry.pnlPct,
            drawdown: entry.maxDrawdown,
            finishedAt: entry.finishedAt,
          };
        }
        const price = barPrice(chartBar(round, entry.step));
        const nav = entry.cash + BigInt(held) * price;
        return {
          entry,
          pnlPct: Number(nav - entry.initialCash) / Number(entry.initialCash),
          drawdown: null,
          finishedAt: null,
        };
      })
      .sort((left, right) => {
        const leftPnl = left.pnlPct ?? Number.NEGATIVE_INFINITY;
        const rightPnl = right.pnlPct ?? Number.NEGATIVE_INFINITY;
        if (leftPnl !== rightPnl) return rightPnl - leftPnl;
        const leftDd = left.drawdown ?? Number.POSITIVE_INFINITY;
        const rightDd = right.drawdown ?? Number.POSITIVE_INFINITY;
        if (leftDd !== rightDd) return leftDd - rightDd;
        const leftDone = left.finishedAt ? left.finishedAt.getTime() : Number.POSITIVE_INFINITY;
        const rightDone = right.finishedAt ? right.finishedAt.getTime() : Number.POSITIVE_INFINITY;
        if (leftDone !== rightDone) return leftDone - rightDone;
        return left.entry.joinedAt.getTime() - right.entry.joinedAt.getTime();
      })
      .map((row, index) => ({
        rank: index + 1,
        user_id: row.entry.userId,
        username: row.entry.username,
        pnl_pct: row.pnlPct,
        pnl_percent: row.pnlPct === null ? null : row.pnlPct * 100,
        max_drawdown: row.drawdown,
        status: row.entry.status,
        step: row.entry.step,
        reward_xu: row.entry.rewardXu,
        is_me: row.entry.userId === userId,
      }));

    const top = rows.slice(0, 10);
    const me = rows.find((row) => row.is_me) ?? null;
    return { scope, rows: top, me, total_players: rows.length };
  }

  // ------------------------------------------------------------------ nội bộ

  private orderView(order: FlashbackOrderRow): FlashbackOrderView {
    return {
      id: order.id,
      side: order.side,
      qty: order.qty,
      price: order.price.toString(),
      step: order.step,
      amount: order.amount.toString(),
      fee: order.fee.toString(),
      tax: order.tax.toString(),
      created_at: order.createdAt.toISOString(),
    };
  }

  private async entryView(
    round: FlashbackRoundRow,
    entry: FlashbackEntryRow,
  ): Promise<FlashbackEntryView> {
    const lots = await this.repository.lotsByEntry(this.database, entry.id);
    const orders = await this.repository.ordersByEntry(this.database, entry.id);
    const price = barPrice(chartBar(round, entry.step));
    const holdings = lots.reduce((sum, lot) => sum + lot.qty, 0);
    const positions: FlashbackPositionView[] = lots.map((lot) => {
      const settled = lot.sellableStep <= entry.step;
      const pnl = lot.price > 0n ? Number(price - lot.price) / Number(lot.price) : 0;
      return {
        qty: lot.qty,
        price: lot.price.toString(),
        step: lot.step,
        sellable_step: lot.sellableStep,
        status: settled ? 'settled' : 'pending',
        sessions_left: Math.max(0, lot.sellableStep - entry.step),
        pnl_pct: pnl,
        value: (BigInt(lot.qty) * price).toString(),
      };
    });
    const totalAssets = entry.cash + BigInt(holdings) * price;
    const pnlPct =
      entry.status === 'finished' && entry.pnlPct !== null
        ? entry.pnlPct
        : Number(totalAssets - entry.initialCash) / Number(entry.initialCash);
    let rank = entry.rank;
    let rewardXu = entry.rewardXu;
    if (entry.status === 'finished' && rank === null) {
      rank = await this.provisionalRank(round, entry);
      if (round.status === 'open' && rank !== null) {
        rewardXu = flashbackRewardForRank(rank);
      }
    }
    return {
      id: entry.id,
      step: entry.step,
      cash: entry.cash.toString(),
      holdings,
      total_assets: totalAssets.toString(),
      pnl_pct: pnlPct,
      pnl_percent: pnlPct * 100,
      max_drawdown: entry.maxDrawdown,
      max_drawdown_percent: entry.maxDrawdown === null ? null : entry.maxDrawdown * 100,
      status: entry.status,
      joined_at: entry.joinedAt.toISOString(),
      finished_at: entry.finishedAt ? entry.finishedAt.toISOString() : null,
      final_nav: entry.finalNav === null ? null : entry.finalNav.toString(),
      rank,
      reward_xu: rewardXu,
      indicator_params: entry.indicatorParams,
      positions,
      orders: orders.map((order) => this.orderView(order)),
    };
  }

  private async currentDrawdown(entryId: string, round: FlashbackRoundRow): Promise<number> {
    const entry = await this.repository.entryById(this.database, entryId);
    if (!entry) return 0;
    const orders = await this.repository.ordersByEntry(this.database, entryId);
    const upToStep = entry.status === 'playing' ? entry.step : FLASHBACK_PLAY_SESSIONS;
    return maxDrawdownOf(round, orders, entry.initialCash, upToStep);
  }

  private async provisionalRank(
    round: FlashbackRoundRow,
    targetEntry: FlashbackEntryRow,
  ): Promise<number | null> {
    const entries = await this.repository.listEntriesByRound(this.database, round.id);
    if (entries.length === 0) return null;
    const holdings = await this.repository.holdingsByRound(this.database, round.id);
    const sorted = entries
      .map((entry) => {
        if (entry.status === 'finished') {
          return {
            entry,
            pnlPct: entry.pnlPct,
            drawdown: entry.maxDrawdown,
            finishedAt: entry.finishedAt,
          };
        }
        const held = holdings.get(entry.id) ?? 0;
        const price = barPrice(chartBar(round, entry.step));
        const nav = entry.cash + BigInt(held) * price;
        return {
          entry,
          pnlPct: Number(nav - entry.initialCash) / Number(entry.initialCash),
          drawdown: null,
          finishedAt: null,
        };
      })
      .sort((left, right) => {
        const leftPnl = left.pnlPct ?? Number.NEGATIVE_INFINITY;
        const rightPnl = right.pnlPct ?? Number.NEGATIVE_INFINITY;
        if (leftPnl !== rightPnl) return rightPnl - leftPnl;
        const leftDd = left.drawdown ?? Number.POSITIVE_INFINITY;
        const rightDd = right.drawdown ?? Number.POSITIVE_INFINITY;
        if (leftDd !== rightDd) return leftDd - rightDd;
        const leftDone = left.finishedAt ? left.finishedAt.getTime() : Number.POSITIVE_INFINITY;
        const rightDone = right.finishedAt ? right.finishedAt.getTime() : Number.POSITIVE_INFINITY;
        if (leftDone !== rightDone) return leftDone - rightDone;
        return left.entry.joinedAt.getTime() - right.entry.joinedAt.getTime();
      });
    const index = sorted.findIndex((item) => item.entry.id === targetEntry.id);
    return index < 0 ? null : index + 1;
  }
}
