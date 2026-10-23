/**
 * Tác vụ định kỳ của Flashback (spec v1.2 §5.3).
 *
 * Chạy mỗi phút, mỗi bước một transaction riêng và idempotent để chạy lại nhiều lần vẫn an toàn:
 * b1 đóng đề, b2 chốt kết quả và xếp hạng, b3 trả thưởng, b4 mở đề đã chờ, b5 tạo đề kế tiếp.
 *
 * Bản 22-10:
 * - FB-01: đề mở đúng giờ đóng ở mốc 20:00 đầu tiên không sớm hơn `scheduled_open_at + 48h`
 *   (48 giờ trừ vài giây trễ), đề mở muộn hơn 5 phút giữ đủ 48 giờ tính từ lúc mở thật.
 * - FB-02: khoá phiên giữ trên MỘT kết nối riêng suốt lần chạy.
 * - FB-07: thưởng của tài khoản bị đánh dấu được giữ lại chờ quản trị viên duyệt.
 * - FB-09: cảnh báo gửi thêm ra kênh kỹ thuật (Telegram) khi có cấu hình.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import type { JobOutcome } from '../runtime/runtime.types.js';
import {
  FLASHBACK_BACKOFF_KEY,
  FLASHBACK_CHANGE_HOUR_UTC7,
  FLASHBACK_CONFIG_KEY,
  FLASHBACK_MAX_RETRY_MINUTES,
  FLASHBACK_ON_TIME_GRACE_MS,
  FLASHBACK_PAUSED_KEY,
  flashbackRewardEligible,
  flashbackRewardForRank,
  flashbackRewardLedgerKey,
} from './flashback.constants.js';
import {
  FLASHBACK_OPS_ALERTS,
  noopFlashbackOpsAlerts,
  type FlashbackOpsAlertPort,
} from './flashback.alerts.js';
import { FLASHBACK_CLOCK, maxDrawdownOf, type FlashbackClock } from './flashback.service.js';
import {
  FLASHBACK_REPOSITORY,
  FlashbackRepository,
  type FlashbackAlertLevel,
} from './flashback.repository.js';
import {
  FlashbackCalendarUnavailableError,
  FlashbackRoundBuilder,
  readFlashbackConfig,
  type FlashbackConfig,
} from './flashback.round-builder.js';
import { flashbackFlaggedUsers } from './flashback.suspects.js';
import type { FlashbackRoundRow } from './flashback.types.js';

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

/**
 * Giờ đóng của một đề mở lúc `now` (spec 22-10 FB-01, BoSung §5.4).
 *
 * - Mở đúng giờ (trễ không quá 5 phút so với `scheduledOpenAt`): mốc đổi đề đầu tiên không sớm
 *   hơn `scheduledOpenAt + 48h`. Tác vụ chạy ở 20:00:30 vẫn đóng lúc 20:00 ngày N+2.
 *   Đề kế sau một đề mở muộn cũng đi nhánh này nên lịch tự quay về mốc 20:00.
 * - Mở muộn hơn 5 phút: `now + 48h`, giữ đủ 48 giờ tính từ lúc mở thật.
 */
export function flashbackClosesAt(
  scheduledOpenAt: Date,
  now: Date,
  config: Pick<FlashbackConfig, 'roundDurationHours' | 'changeHourUtc7'>,
): Date {
  const durationMs = (config.roundDurationHours || 48) * 3_600_000;
  const late = now.getTime() - scheduledOpenAt.getTime() > FLASHBACK_ON_TIME_GRACE_MS;
  if (late) return new Date(now.getTime() + durationMs);
  return nextChangeBoundary(
    new Date(scheduledOpenAt.getTime() + durationMs),
    config.changeHourUtc7 || FLASHBACK_CHANGE_HOUR_UTC7,
  );
}

@Injectable()
export class FlashbackJob {
  private readonly logger = new Logger(FlashbackJob.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
    @Inject(FLASHBACK_CLOCK) private readonly clock: FlashbackClock,
    private readonly builder: FlashbackRoundBuilder,
    @Optional()
    @Inject(FLASHBACK_OPS_ALERTS)
    private readonly opsAlerts: FlashbackOpsAlertPort = noopFlashbackOpsAlerts,
  ) {}

  /**
   * Chạy toàn bộ vòng đời đề dưới khoá phiên (FB-02). Khoá được lấy và nhả trên cùng một kết
   * nối riêng của pool; kết nối lỗi thì bị huỷ nên khoá không thể kẹt trên một kết nối rảnh.
   */
  async run(now: Date = this.clock.now()): Promise<JobOutcome> {
    return this.database.withDedicatedClient(async (client) => {
      const locked = await this.repository.tryAcquireJobLock(client);
      if (!locked) {
        return { status: 'skipped', reason: 'locked', detail: { locked: false } };
      }
      try {
        return await this.cycle(now);
      } finally {
        await this.repository.releaseJobLock(client);
      }
    });
  }

  private async cycle(now: Date): Promise<JobOutcome> {
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
            const rightDone = right.finishedAt
              ? right.finishedAt.getTime()
              : Number.POSITIVE_INFINITY;
            if (leftDone !== rightDone) return leftDone - rightDone;
            return left.joinedAt.getTime() - right.joinedAt.getTime();
          });
        for (const [index, entry] of finished.entries()) {
          const rank = index + 1;
          const info = infos.find((item) => item.id === entry.id);
          const eligible = flashbackRewardEligible(info, now);
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

  /**
   * Trả thưởng (BoSung §5.3 bước 3). Tài khoản không bị đánh dấu được cộng xu ngay; tài khoản
   * bị đánh dấu (FB-07) chỉ được ghi một khoản "giữ" chờ quản trị viên duyệt. Đề chuyển sang
   * `paid` khi phần không bị giữ đã trả xong. Chạy lại không trả hai lần: khoá duy nhất của
   * ledger và của bảng giữ thưởng chặn dòng thứ hai.
   */
  private async payClosedRounds(): Promise<number> {
    const rounds = await this.repository.roundsByStatus(this.database, 'closed');
    let paid = 0;
    for (const round of rounds) {
      const result = await this.database.transaction(async (tx) => {
        const entries = await this.repository.leaderboardEntries(tx, round.id);
        const flagged = flashbackFlaggedUsers(await this.repository.entrySignals(tx, round.id));
        let held = 0;
        for (const entry of entries) {
          if (entry.status !== 'finished' || entry.rewardXu <= 0) continue;
          const reason = flagged.get(entry.userId);
          if (reason) {
            if (
              await this.repository.insertRewardHold(tx, {
                roundId: round.id,
                userId: entry.userId,
                entryId: entry.id,
                amount: entry.rewardXu,
                reason,
              })
            )
              held += 1;
            continue;
          }
          const wallet = await this.repository.lockWallet(tx, entry.userId);
          const seq = wallet.lastSeq + 1;
          const balanceAfter = wallet.balance + entry.rewardXu;
          const appended = await this.repository.appendLedger(tx, {
            userId: entry.userId,
            seq,
            kind: 'flashback_reward',
            delta: entry.rewardXu,
            balanceAfter,
            uniqueKey: flashbackRewardLedgerKey(round.id, entry.userId),
            ref: { round_id: round.id, round_no: round.roundNo, rank: entry.rank },
            policyVersion: 'iqx-flashback-v1',
          });
          if (appended) await this.repository.saveWallet(tx, entry.userId, balanceAfter, seq);
        }
        const moved = await this.repository.transitionRound(tx, round.id, ['closed'], 'paid');
        return { moved: moved !== null, held };
      });
      if (result.moved) {
        paid += 1;
        await this.log(
          'b3',
          round.id,
          result.held > 0
            ? `trả thưởng đề ${round.roundNo}, giữ ${result.held} khoản chờ duyệt`
            : `trả thưởng đề ${round.roundNo}`,
          null,
        );
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
    const closesAt = flashbackClosesAt(ready.scheduledOpenAt, now, config);
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
        // Không có lịch giao dịch thì mọi mức đều hỏng như nhau: bỏ lần này, thử lại sau (FB-11h).
        if (error instanceof FlashbackCalendarUnavailableError) break;
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
          priceSource: built.priceSource,
        });
      });
      if (!created) continue;
      await this.database.transaction(async (tx) => {
        await this.repository.setSetting(tx, FLASHBACK_BACKOFF_KEY, null);
      });
      await this.log('b5', created.id, `tạo đề ${created.roundNo}`, null);
      if (created.fallbackLevel > 0) {
        await this.alertFor(
          created,
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
          currentOpen,
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
      stored &&
      typeof stored === 'object' &&
      'failures' in stored &&
      typeof stored.failures === 'number'
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

  /** Cảnh báo không gắn với một đề: ghi nhật ký và gửi ra kênh kỹ thuật. */
  private async alert(message: string, level: FlashbackAlertLevel = 'high'): Promise<void> {
    this.logger.warn(`Flashback: [${level}] ${message}`);
    await this.log('alert', null, message, null, level);
    await this.opsAlerts.send({ level, message });
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
          round,
          'high',
          `Đề ${round.roundNo} quá giờ đóng hơn 10 phút mà vẫn đang mở.`,
        );
      }
      if (round.status === 'closed' && now.getTime() - round.updatedAt.getTime() > 60 * 60_000) {
        await this.alertFor(
          round,
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
          lastClosed,
          'high',
          `Đề ${lastClosed.roundNo} đã quá giờ đóng 10 phút nhưng chưa có đề mới đang mở.`,
        );
      }
    }

    if (open?.opensAt && !ready && now.getTime() - open.opensAt.getTime() > 6 * 3_600_000) {
      await this.alertFor(
        open,
        'medium',
        `Đề ${open.roundNo} đã mở hơn 6 giờ mà chưa có đề chờ (ready).`,
      );
    }

    const fallbackRound = rounds.find(
      (round) => round.status === 'ready' && round.fallbackLevel > 0,
    );
    if (fallbackRound) {
      await this.alertFor(
        fallbackRound,
        'low',
        `Đề ${fallbackRound.roundNo} được tạo bằng phương án dự phòng mức ${fallbackRound.fallbackLevel} (spec v1.2 §6.3).`,
      );
    }
  }

  /**
   * Ghi cảnh báo có mức độ và gửi ra kênh kỹ thuật; không lặp lại cùng một cảnh báo trong 30
   * phút. Nội dung chỉ có số đề, trạng thái và mức (không có mã, không có giai đoạn).
   */
  private async alertFor(
    round: Pick<FlashbackRoundRow, 'id' | 'roundNo' | 'status'>,
    level: FlashbackAlertLevel,
    message: string,
  ): Promise<void> {
    const known = await this.repository.hasRecentAlert(this.database, round.id, level, 30);
    if (known) return;
    this.logger.warn(`Flashback: [${level}] ${message}`);
    await this.log('alert', round.id, message, null, level);
    await this.opsAlerts.send({
      level,
      message,
      roundNo: round.roundNo,
      roundStatus: round.status,
    });
  }
}
