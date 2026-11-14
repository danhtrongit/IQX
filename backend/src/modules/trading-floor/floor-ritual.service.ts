/**
 * Nghi lễ Thần Tài (port từ `server/ritual.ts` của IQX-KhuGiaoDich) trên PostgreSQL, danh tính là tài khoản
 * IQX: gieo quẻ một lần mỗi phiên, hoàn tất dự đoán một lần, bảng xếp hạng tháng, và chấm các phiên đã
 * đóng cửa (`scorePending`, chạy ở tác vụ `trading-floor.ritual-score`).
 */

import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { FLOOR_CLOCK, type FloorClock } from './floor-clock.js';
import { FloorEvents } from './floor-events.js';
import { FLOOR_MARKET, type FloorMarketPort } from './floor-market.js';
import { FloorProfileService } from './floor-profile.service.js';
import {
  canResolve,
  isSameVnDay,
  normaliseTickers,
  queById,
  QUE_LIST,
  RITUAL_RULES,
  targetSession,
  vnDay,
  vnTimeOn,
  monthOf,
} from './floor-ritual.logic.js';
import { FLOOR_RITUAL_REPOSITORY, type FloorRitualRepository } from './floor-ritual.repository.js';
import type {
  Leaderboard,
  MyRitual,
  RitualDirection,
  RitualQue,
  RitualStats,
  RitualToday,
} from './floor-types.js';

export interface RitualDrawResult {
  que: RitualQue;
  ritual: MyRitual;
}

export interface RitualSubmitResult {
  mine: MyRitual;
  stats: RitualStats;
  que: RitualQue;
}

export interface RitualScoreOutcome {
  scored: Array<{ session: string; rituals: number; close: number; change: number; source: string }>;
  waiting: string[];
}

@Injectable()
export class FloorRitualService {
  private readonly logger = new Logger(FloorRitualService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLOOR_RITUAL_REPOSITORY) private readonly repository: FloorRitualRepository,
    @Inject(FLOOR_MARKET) private readonly market: FloorMarketPort,
    @Inject(FLOOR_CLOCK) private readonly clock: FloorClock,
    private readonly profiles: FloorProfileService,
    private readonly events: FloorEvents,
  ) {}

  async today(userId: string): Promise<RitualToday> {
    const now = this.clock.now().getTime();
    const session = targetSession(now);
    const [mine, stats, lastResult] = await Promise.all([
      this.repository.findMine(this.database, userId, session),
      this.repository.stats(this.database, session),
      this.repository.lastResult(this.database),
    ]);
    return { session, cutoffAt: vnTimeOn(session, RITUAL_RULES.cutoff), mine, stats, lastResult };
  }

  /** Gieo quẻ một lần mỗi người và phiên; gieo lại trả đúng quẻ cũ. */
  async draw(userId: string): Promise<RitualDrawResult> {
    const now = this.clock.now();
    const session = targetSession(now.getTime());
    const existing = await this.repository.findMine(this.database, userId, session);
    if (existing) return { que: this.queOf(existing.queId), ritual: existing };
    const que = QUE_LIST[randomInt(QUE_LIST.length)]!;
    await this.repository.insertDraw(this.database, userId, session, que.id, now);
    const ritual = (await this.repository.findMine(this.database, userId, session))!;
    return { que: this.queOf(ritual.queId), ritual };
  }

  async submit(
    userId: string,
    input: { direction: RitualDirection; level: number; tickers: readonly string[] },
  ): Promise<RitualSubmitResult> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    const session = targetSession(nowMs);
    const mine = await this.repository.findMine(this.database, userId, session);
    if (!mine) {
      throw new ConflictException({
        code: 'RITUAL_NOT_DRAWN',
        message: 'Hãy gieo quẻ trước khi dự đoán.',
      });
    }
    if (mine.direction) throw this.alreadyDone();
    const level = Math.round(input.level * 100) / 100;
    if (!Number.isFinite(level) || level <= 0) {
      throw new BadRequestException({
        code: 'RITUAL_BAD_LEVEL',
        message: 'Mức đóng cửa dự đoán không hợp lệ.',
      });
    }
    const index = await this.market.vnindex(nowMs);
    if (index && Math.abs(level - index.value) / index.value > RITUAL_RULES.maxLevelDeviation) {
      throw new BadRequestException({
        code: 'RITUAL_LEVEL_TOO_FAR',
        message: `Mức dự đoán lệch quá ${RITUAL_RULES.maxLevelDeviation * 100}% so với VNINDEX hiện tại.`,
      });
    }
    const tickers = normaliseTickers(input.tickers);
    if (!tickers) {
      throw new BadRequestException({
        code: 'RITUAL_BAD_TICKERS',
        message: `Chọn đúng ${RITUAL_RULES.tickersToPray} mã cổ phiếu khác nhau.`,
      });
    }
    const listed = await this.market.listedSymbols(nowMs);
    const unknown = listed ? tickers.filter((ticker) => !listed.has(ticker)) : [];
    if (unknown.length) {
      throw new BadRequestException({
        code: 'RITUAL_UNKNOWN_TICKER',
        message: `Mã không có trên sàn: ${unknown.join(', ')}.`,
      });
    }
    const done = await this.repository.complete(this.database, {
      userId,
      session,
      direction: input.direction,
      level,
      tickers,
      at: now,
    });
    if (!done) throw this.alreadyDone();
    const que = this.queOf(mine.queId);
    const [ritual, stats, name] = await Promise.all([
      this.repository.findMine(this.database, userId, session),
      this.repository.stats(this.database, session),
      this.profiles.displayName(userId),
    ]);
    this.events.toAll({
      type: 'ritual:done',
      name,
      que: que.name,
      luck: que.luck,
      direction: input.direction,
    });
    return { mine: ritual!, stats, que };
  }

  async leaderboard(month?: string): Promise<Leaderboard> {
    return this.repository.leaderboard(
      this.database,
      month ?? monthOf(vnDay(this.clock.now().getTime())),
    );
  }

  /**
   * Chấm mọi phiên đã tới giờ mà chưa có điểm đóng cửa. Điểm lấy từ nến ngày VN-Index của phiên đó
   * (`market_index_bars`, kèm nến trước để tính chênh); riêng phiên của hôm nay còn được lấy từ báo giá
   * trực tiếp nếu báo giá ấy là của chính ngày hôm nay và từ 14:45. Idempotent: phiên đã chấm không bị
   * chấm lại; phiên chưa có dữ liệu để lại cho lần chạy sau.
   */
  async scorePending(nowDate = this.clock.now()): Promise<RitualScoreOutcome> {
    const now = nowDate.getTime();
    const today = vnDay(now);
    const sessions = (await this.repository.unscoredSessions(this.database)).filter((session) =>
      canResolve(session, now),
    );
    const outcome: RitualScoreOutcome = { scored: [], waiting: [] };
    for (const session of sessions) {
      const result = await this.closeOf(session, today, now);
      if (!result) {
        outcome.waiting.push(session);
        continue;
      }
      const rituals = await this.database.transaction((tx) =>
        this.repository.resolve(tx, session, result.close, result.change, result.source, nowDate),
      );
      this.logger.log(
        `Ritual session ${session} scored: close ${result.close} (${result.change >= 0 ? '+' : ''}${result.change}), ${rituals} rituals, ${result.source}`,
      );
      outcome.scored.push({ session, rituals, ...result });
    }
    return outcome;
  }

  private async closeOf(
    session: string,
    today: string,
    now: number,
  ): Promise<{ close: number; change: number; source: string } | null> {
    const bar = await this.market.indexClose(session);
    if (bar && bar.change !== null) return { close: bar.close, change: bar.change, source: 'iqx-bars' };
    if (session !== today) return null;
    const quote = await this.market.vnindex(now);
    const closeAt = vnTimeOn(session, RITUAL_RULES.liveCloseAt);
    if (!quote || quote.time === null) return null;
    if (!isSameVnDay(quote.time, closeAt) || quote.time < closeAt) return null;
    return { close: quote.value, change: quote.change, source: 'iqx-live' };
  }

  private queOf(id: number): RitualQue {
    return queById(id) ?? QUE_LIST[0]!;
  }

  private alreadyDone(): ConflictException {
    return new ConflictException({
      code: 'RITUAL_ALREADY_DONE',
      message: 'Bạn đã hoàn tất nghi lễ cho phiên này.',
    });
  }
}
