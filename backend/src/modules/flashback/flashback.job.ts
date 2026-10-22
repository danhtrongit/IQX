/**
 * Tác vụ định kỳ của Flashback (spec v1.2 §5.3).
 *
 * Chạy mỗi phút, mỗi bước một transaction riêng và idempotent để chạy lại nhiều lần vẫn an toàn:
 * b1 đóng đề, b2 chốt kết quả và xếp hạng, b3 trả thưởng, b4 mở đề đã chờ, b5 tạo đề kế tiếp.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import type { JobOutcome } from '../runtime/runtime.types.js';
import {
  FLASHBACK_BACKOFF_KEY,
  FLASHBACK_CHANGE_HOUR_UTC7,
  FLASHBACK_CONFIG_KEY,
  FLASHBACK_MAX_RETRY_MINUTES,
  FLASHBACK_PAUSED_KEY,
  flashbackRewardForRank,
} from './flashback.constants.js';
import { FLASHBACK_CLOCK, maxDrawdownOf, type FlashbackClock } from './flashback.service.js';
import {
  FLASHBACK_REPOSITORY,
  FlashbackRepository,
  type FlashbackAlertLevel,
} from './flashback.repository.js';
import {
  FlashbackRoundBuilder,
  readFlashbackConfig,
  type FlashbackConfig,
} from './flashback.round-builder.js';
import type { FlashbackRoundRow } from './flashback.types.js';

/** Số ngày tài khoản phải có để được nhận thưởng (spec v1.1 §2.9). */
const REWARD_MIN_ACCOUNT_DAYS = 7;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Mốc giờ đổi đề (giờ Việt Nam) tại hoặc ngay sau một thời điểm. */
export function nextChangeBoundary(atOrAfter: Date, changeHourUtc7: number): Date {
  const vnDate = new Date(atOrAfter.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
  let candidate = Date.parse(`${vnDate}T00:00:00Z`) - VN_OFFSET_MS + changeHourUtc7 * 3_600_000;
  if (candidate < atOrAfter.getTime()) {
    const nextDay = new Date(Date.parse(`${vnDate}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    candidate = Date.parse(`${nextDay}T00:00:00Z`) - VN_OFFSET_MS + changeHourUtc7 * 3_600_000;
  }
  return new Date(candidate);
}

@Injectable()
export class FlashbackJob {
  private readonly logger = new Logger(FlashbackJob.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
    @Inject(FLASHBACK_CLOCK) private readonly clock: FlashbackClock,
    private readonly builder: FlashbackRoundBuilder,
  ) {}

  /** Chạy toàn bộ vòng đời đề. */
  async run(now: Date = this.clock.now()): Promise<JobOutcome> {
    const locked = (await this.repository.tryAcquireJobLock?.(this.database)) ?? true;
    if (!locked) {
      return { status: 'skipped', reason: 'locked', detail: { locked: false } };
    }
    try {
      const config = await this.config();
      const detail: Record<string, unknown> = {};

      let urgentCreated = false;
      if (!(await this.isPaused())) {
        const [open, ready] = await Promise.all([
          this.repository.openRound(this.database),
          this.repository.readyRound(this.database),
        ]);
        const openExpired =
          open !== null && open.closesAt !== null && open.closesAt.getTime() <= now.getTime();
        if (!ready && (!open || openExpired)) {
          urgentCreated = await this.createNextRound(now, config);
        }
      }

      detail.closed = await this.closeOpenRounds(now);

      // Bước 4 (mở đề ready) không chờ bước 2 và 3 (chốt và trả thưởng đề cũ) xong (BoSung §5.3).
      const [settledAndPaid, opened] = await Promise.all([
        (async () => {
          const settled = await this.settleClosingRounds(now);
          const paid = await this.payClosedRounds();
          return { settled, paid };
        })(),
        this.openReadyRound(now, config),
      ]);
      detail.settled = settledAndPaid.settled;
      detail.paid = settledAndPaid.paid;
      detail.opened = opened;
      detail.created = (await this.createNextRound(now, config)) || urgentCreated;
      await this.checkAlerts(now);
      return { status: 'completed', detail };
    } finally {
      await this.repository.releaseJobLock?.(this.database);
    }
  }

  private async config(): Promise<FlashbackConfig> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_CONFIG_KEY);
    return readFlashbackConfig(stored);
  }

  private async isPaused(): Promise<boolean> {
    const paused = await this.repository.getSetting(this.database, FLASHBACK_PAUSED_KEY);
    return paused === true;
  }

  // ------------------------------------------------------------------ b1

  private async closeOpenRounds(now: Date): Promise<number> {
    const rounds = await this.repository.roundsByStatus(this.database, 'open');
    let closed = 0;
    for (const round of rounds) {
      if (!round.closesAt || round.closesAt > now) continue;
      const updated = await this.database.transaction(async (tx) =>
        this.repository.transitionRound(tx, round.id, ['open'], 'closing'),
      );
      if (updated) {
        closed += 1;
        await this.log('b1', round.id, `đóng đề ${round.roundNo}`, null);
      }
    }
    return closed;
  }

  // ------------------------------------------------------------------ b2

  private async settleClosingRounds(now: Date): Promise<number> {
    const rounds = await this.repository.roundsByStatus(this.database, 'closing');
    let settled = 0;
    for (const round of rounds) {
      const done = await this.database.transaction(async (tx) => {
        const entries = await this.repository.listEntriesByRound(tx, round.id);
        for (const entry of entries) {
          if (entry.status !== 'playing') continue;
          const lots = await this.repository.lotsByEntry(tx, entry.id);
          const orders = await this.repository.ordersByEntry(tx, entry.id);
          const holdings = lots.reduce((sum, lot) => sum + lot.qty, 0);
          const lastPrice = this.lastPrice(round);
          const finalNav = entry.cash + BigInt(holdings) * lastPrice;
          const pnlPct = Number(finalNav - entry.initialCash) / Number(entry.initialCash);
          const drawdown = maxDrawdownOf(round, orders, entry.initialCash);
          await this.repository.finishEntry(tx, entry.id, {
            finalNav,
            pnlPct,
            maxDrawdown: drawdown,
            finishedAt: now,
          });
        }
        const infos = await this.repository.leaderboardEntries(tx, round.id);
        const finished = (await this.repository.listEntriesByRound(tx, round.id))
          .filter((entry) => entry.status === 'finished' && entry.pnlPct !== null)
          .sort((left, right) => {
            const leftPnl = left.pnlPct ?? Number.NEGATIVE_INFINITY;
            const rightPnl = right.pnlPct ?? Number.NEGATIVE_INFINITY;
            if (leftPnl !== rightPnl) return rightPnl - leftPnl;
            const leftDrawdown = left.maxDrawdown ?? Number.POSITIVE_INFINITY;
            const rightDrawdown = right.maxDrawdown ?? Number.POSITIVE_INFINITY;
            if (leftDrawdown !== rightDrawdown) return leftDrawdown - rightDrawdown;
            const leftDone = left.finishedAt ? left.finishedAt.getTime() : Number.POSITIVE_INFINITY;
            const rightDone = right.finishedAt ? right.finishedAt.getTime() : Number.POSITIVE_INFINITY;
            if (leftDone !== rightDone) return leftDone - rightDone;
            return left.joinedAt.getTime() - right.joinedAt.getTime();
          });
        for (const [index, entry] of finished.entries()) {
          const rank = index + 1;
          const info = infos.find((item) => item.id === entry.id);
          const eligible =
            info !== undefined &&
            info.phoneVerified &&
            info.accountCreatedAt.getTime() <=
              now.getTime() - REWARD_MIN_ACCOUNT_DAYS * 86_400_000;
          await this.repository.assignEntryRanking(
            tx,
            entry.id,
            rank,
            eligible ? flashbackRewardForRank(rank) : 0,
          );
        }
        await this.repository.transitionRound(tx, round.id, ['closing'], 'closed');
        return true;
      });
      if (done) {
        settled += 1;
        await this.log('b2', round.id, `chốt kết quả đề ${round.roundNo}`, null);
      }
    }
    return settled;
  }

  // ------------------------------------------------------------------ b3

  private async payClosedRounds(): Promise<number> {
    const rounds = await this.repository.roundsByStatus(this.database, 'closed');
    let paid = 0;
    for (const round of rounds) {
      const done = await this.database.transaction(async (tx) => {
        const entries = await this.repository.leaderboardEntries(tx, round.id);
        for (const entry of entries) {
          if (entry.status !== 'finished' || entry.rewardXu <= 0) continue;
          const wallet = await this.repository.lockWallet(tx, entry.userId);
          const seq = wallet.lastSeq + 1;
          const balanceAfter = wallet.balance + entry.rewardXu;
          const appended = await this.repository.appendLedger(tx, {
            userId: entry.userId,
            seq,
            kind: 'flashback_reward',
            delta: entry.rewardXu,
            balanceAfter,
            uniqueKey: `flashback_reward:${round.id}:${entry.userId}`,
            ref: { round_id: round.id, round_no: round.roundNo, rank: entry.rank },
            policyVersion: 'iqx-flashback-v1',
          });
          if (appended) await this.repository.saveWallet(tx, entry.userId, balanceAfter, seq);
        }
        await this.repository.transitionRound(tx, round.id, ['closed'], 'paid');
        return true;
      });
      if (done) {
        paid += 1;
        await this.log('b3', round.id, `trả thưởng đề ${round.roundNo}`, null);
      }
    }
    return paid;
  }

  // ------------------------------------------------------------------ b4

  private async openReadyRound(now: Date, config: FlashbackConfig): Promise<boolean> {
    if (await this.isPaused()) return false;
    const open = await this.repository.openRound(this.database);
    if (open) return false;
    const ready = await this.repository.readyRound(this.database);
    if (!ready) return false;
    if (ready.scheduledOpenAt > now) return false;
    const minClose = new Date(now.getTime() + config.roundDurationHours * 3_600_000);
    const openedLate = now.getTime() - ready.scheduledOpenAt.getTime() > 5 * 60_000;
    const closesAt = openedLate
      ? minClose
      : nextChangeBoundary(minClose, config.changeHourUtc7 || FLASHBACK_CHANGE_HOUR_UTC7);
    const updated = await this.database.transaction(async (tx) =>
      this.repository.transitionRound(tx, ready.id, ['ready'], 'open', {
        opensAt: now,
        closesAt,
      }),
    );
    if (!updated) return false;
    await this.log('b4', ready.id, `mở đề ${ready.roundNo}`, null);
    return true;
  }

  // ------------------------------------------------------------------ b5

  private async createNextRound(now: Date, config: FlashbackConfig): Promise<boolean> {
    if (await this.isPaused()) return false;
    const ready = await this.repository.readyRound(this.database);
    if (ready) return false;

    const open = await this.repository.openRound(this.database);
    const openActive =
      open !== null && (open.closesAt === null || open.closesAt.getTime() > now.getTime());
    const urgent = !openActive;

    if (await this.backingOff(now, urgent)) return false;

    const maxLevel = urgent ? 3 : 0;
    for (let level = 0; level <= maxLevel; level += 1) {
      let built = null;
      try {
        built = await this.builder.build(now, level, config);
      } catch (error) {
        this.logger.warn(
          `Flashback: lỗi khi dựng đề mức ${level} (${
            error instanceof Error ? error.message : 'lỗi không xác định'
          })`,
        );
        continue;
      }
      if (!built) continue;
      const currentOpen = await this.repository.openRound(this.database);
      const scheduledOpenAt = currentOpen?.closesAt ?? now;
      const created = await this.database.transaction(async (tx) => {
        const roundNo = await this.repository.nextRoundNo(tx);
        return this.repository.insertRound(tx, {
          roundNo,
          symbol: built.symbol,
          startDate: built.startDate,
          warmupBars: built.warmupBars,
          bars: built.bars,
          scheduledOpenAt,
          fallbackLevel: built.fallbackLevel,
        });
      });
      if (!created) continue;
      await this.database.transaction(async (tx) => {
        await this.repository.setSetting(tx, FLASHBACK_BACKOFF_KEY, null);
      });
      await this.log('b5', created.id, `tạo đề ${created.roundNo}`, null);
      if (created.fallbackLevel > 0) {
        await this.alertFor(
          created.id,
          'low',
          `Đề ${created.roundNo} được tạo bằng phương án dự phòng mức ${created.fallbackLevel} (spec v1.2 §6.3).`,
        );
      }
      return true;
    }

    if (urgent) {
      const currentOpen = await this.repository.openRound(this.database);
      if (currentOpen) {
        const baseTime = currentOpen.closesAt
          ? Math.max(currentOpen.closesAt.getTime(), now.getTime())
          : now.getTime();
        const closesAt = new Date(baseTime + 24 * 3_600_000);
        await this.database.transaction(async (tx) =>
          this.repository.transitionRound(tx, currentOpen.id, ['open'], 'open', { closesAt }),
        );
        await this.log(
          'b5',
          currentOpen.id,
          'alert:low:fallback_extend_24h: kéo dài đề đang mở thêm 24 giờ',
          null,
          'low',
        );
        await this.alertFor(
          currentOpen.id,
          'low',
          'alert:low:fallback_extend_24h: Không tạo được đề mới sau khi đã thử hết các mức nới điều kiện (spec v1.2 §6.3). Đề đang mở được kéo dài thêm 24 giờ.',
        );
      } else {
        await this.alert(
          'alert:low:fallback_extend_24h: Không tạo được đề mới sau khi đã thử hết các mức nới điều kiện (spec v1.2 §6.3).',
          'low',
        );
      }
    }

    await this.recordBackoff(now, urgent);
    return false;
  }

  private async recordBackoff(now: Date, urgent: boolean): Promise<void> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_BACKOFF_KEY);
    const prevFailures =
      stored && typeof stored === 'object' && 'failures' in stored && typeof stored.failures === 'number'
        ? stored.failures
        : 0;
    const failures = prevFailures + 1;
    const delayMinutes = urgent
      ? FLASHBACK_MAX_RETRY_MINUTES
      : Math.min(FLASHBACK_MAX_RETRY_MINUTES, 2 ** Math.min(4, failures - 1));
    await this.database.transaction(async (tx) => {
      await this.repository.setSetting(tx, FLASHBACK_BACKOFF_KEY, {
        failures,
        urgent,
        nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
      });
    });
  }

  private async backingOff(now: Date, urgent = false): Promise<boolean> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_BACKOFF_KEY);
    if (!stored || typeof stored !== 'object') return false;
    if (urgent && (!('urgent' in stored) || stored.urgent !== true)) return false;
    const nextAttemptAt = 'nextAttemptAt' in stored ? stored.nextAttemptAt : undefined;
    if (typeof nextAttemptAt !== 'string') return false;
    return new Date(nextAttemptAt).getTime() > now.getTime();
  }

  // ------------------------------------------------------------------ tiện ích

  private lastPrice(round: FlashbackRoundRow): bigint {
    const bar = round.bars[round.bars.length - 1];
    if (!bar) throw new Error(`Đề ${round.id} thiếu nến cuối`);
    return BigInt(Math.round(bar.c));
  }

  private async log(
    step: string,
    roundId: string | null,
    result: string,
    error: string | null,
    level: FlashbackAlertLevel | null = null,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.repository.appendJobLog(tx, { step, roundId, result, error, level });
    });
  }

  /** Ghi cảnh báo vào nhật ký tác vụ (chưa có kênh cảnh báo riêng cho quản trị trong repo). */
  private async alert(message: string, level: FlashbackAlertLevel = 'high'): Promise<void> {
    this.logger.warn(`Flashback: [${level}] ${message}`);
    await this.log('alert', null, message, null, level);
  }

  /**
   * Cảnh báo theo mức độ của spec v1.2 §6.1:
   * - Cao: đề quá giờ đóng 10 phút mà vẫn đang mở, hoặc quá giờ đóng 10 phút mà chưa có đề mới.
   * - Trung bình: đề mở 6 giờ mà chưa có đề chờ, hoặc đề đã chốt quá 1 giờ mà chưa trả thưởng.
   * - Thấp: đề được tạo bằng phương án dự phòng (§6.3).
   */
  private async checkAlerts(now: Date): Promise<void> {
    const rounds = await this.repository.listRounds(this.database, 20);
    const open = rounds.find((round) => round.status === 'open') ?? null;
    const ready = rounds.find((round) => round.status === 'ready') ?? null;
    const lateByMs = 10 * 60_000;

    for (const round of rounds) {
      if (
        round.status === 'open' &&
        round.closesAt &&
        round.closesAt.getTime() < now.getTime() - lateByMs
      ) {
        await this.alertFor(
          round.id,
          'high',
          `Đề ${round.roundNo} quá giờ đóng hơn 10 phút mà vẫn đang mở.`,
        );
      }
      if (round.status === 'closed' && now.getTime() - round.updatedAt.getTime() > 60 * 60_000) {
        await this.alertFor(
          round.id,
          'medium',
          `Đề ${round.roundNo} đã chốt quá 1 giờ mà chưa trả thưởng.`,
        );
      }
    }

    if (!open) {
      const lastClosed = rounds.find(
        (round) =>
          round.status !== 'open' &&
          round.closesAt !== null &&
          round.closesAt.getTime() < now.getTime() - lateByMs,
      );
      if (lastClosed) {
        await this.alertFor(
          lastClosed.id,
          'high',
          `Đề ${lastClosed.roundNo} đã quá giờ đóng 10 phút nhưng chưa có đề mới đang mở.`,
        );
      }
    }

    if (open?.opensAt && !ready && now.getTime() - open.opensAt.getTime() > 6 * 3_600_000) {
      await this.alertFor(
        open.id,
        'medium',
        `Đề ${open.roundNo} đã mở hơn 6 giờ mà chưa có đề chờ (ready).`,
      );
    }

    const fallbackRound = rounds.find(
      (round) => round.status === 'ready' && round.fallbackLevel > 0,
    );
    if (fallbackRound) {
      await this.alertFor(
        fallbackRound.id,
        'low',
        `Đề ${fallbackRound.roundNo} được tạo bằng phương án dự phòng mức ${fallbackRound.fallbackLevel} (spec v1.2 §6.3).`,
      );
    }
  }

  /** Ghi cảnh báo có mức độ; không lặp lại cùng một cảnh báo trong 30 phút. */
  private async alertFor(
    roundId: string,
    level: FlashbackAlertLevel,
    message: string,
  ): Promise<void> {
    const known = await this.repository.hasRecentAlert(this.database, roundId, level, 30);
    if (known) return;
    this.logger.warn(`Flashback: [${level}] ${message}`);
    await this.log('alert', roundId, message, null, level);
  }
}
