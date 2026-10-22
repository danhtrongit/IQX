/**
 * Chọn mã và giai đoạn cho một đề Flashback (spec v1.2 §4 và §6.3).
 *
 * Quy trình: lấy rổ VN30 hiện hành, loại mã của 10 đề gần nhất, chọn ngẫu nhiên bằng CSPRNG
 * một mã và một ngày bắt đầu, rồi kiểm tra các điều kiện của §4.3 trên 372 phiên liên tục
 * (252 warmup + 60 lịch sử + 60 chơi). Nếu không mã nào đạt thì nới điều kiện theo thang
 * §6.3 và ghi `fallback_level` của đề.
 */

import { randomInt } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import {
  FLASHBACK_DEFAULT_SETTINGS,
  FLASHBACK_EARLIEST_START_DATE,
  FLASHBACK_MAX_MISSING_SESSIONS,
  FLASHBACK_MAX_ZERO_VOLUME_SESSIONS,
  FLASHBACK_MIN_LIQUIDITY_VND,
  FLASHBACK_MIN_MONTHS_AGO,
  FLASHBACK_MIN_POOL_BEFORE_REPEAT,
  FLASHBACK_ROUNDS_BEFORE_SYMBOL_REPEAT,
  FLASHBACK_TOTAL_SESSIONS,
} from './flashback.constants.js';
import type { FlashbackMarketDataPort } from './flashback.market-data.js';
import { FLASHBACK_REPOSITORY, FlashbackRepository } from './flashback.repository.js';
import type { FlashbackBar } from './flashback.types.js';

/** Token nguồn danh sách mã VN30 hiện hành. */
export const FLASHBACK_VN30 = Symbol('FLASHBACK_VN30');

/** Cổng lấy danh sách mã của một chỉ số (hiện hành, không có lịch sử từ feed). */
export interface FlashbackVn30Port {
  fetchCurrent(indexCode: string): Promise<{ symbols: string[] }>;
}

/** Tham số vận hành của Flashback (spec v1.2 §9). */
export interface FlashbackConfig {
  readonly roundDurationHours: number;
  readonly changeHourUtc7: number;
  readonly roundsBeforeSymbolRepeat: number;
  readonly earliestStartDate: string;
  readonly minMonthsAgo: number;
  readonly warmupSessions: number;
  readonly historySessions: number;
  readonly playSessions: number;
  readonly minLiquidityVnd: number;
  readonly minDailyVolatility: number;
  readonly maxStartAttempts: number;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày Việt Nam của một thời điểm. */
export function vietnamDate(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Lùi `months` tháng kể từ một ngày (giữ ngày trong tháng nếu có). */
export function subtractMonths(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
  ).getUTCDate();
  parsed.setUTCDate(Math.min(day, lastDay));
  return parsed.toISOString().slice(0, 10);
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Đọc tham số vận hành từ `flashback_settings`, thiếu thì dùng mặc định của spec. */
export function readFlashbackConfig(value: unknown): FlashbackConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    roundDurationHours: numberOr(
      raw.round_duration_hours,
      FLASHBACK_DEFAULT_SETTINGS.round_duration_hours,
    ),
    changeHourUtc7: numberOr(raw.change_hour_utc7, FLASHBACK_DEFAULT_SETTINGS.change_hour_utc7),
    roundsBeforeSymbolRepeat: numberOr(
      raw.rounds_before_symbol_repeat,
      FLASHBACK_DEFAULT_SETTINGS.rounds_before_symbol_repeat,
    ),
    earliestStartDate: stringOr(raw.earliest_start_date, FLASHBACK_EARLIEST_START_DATE),
    minMonthsAgo: numberOr(raw.min_months_ago, FLASHBACK_DEFAULT_SETTINGS.min_months_ago),
    warmupSessions: numberOr(raw.warmup_sessions, FLASHBACK_DEFAULT_SETTINGS.warmup_sessions),
    historySessions: numberOr(raw.history_sessions, FLASHBACK_DEFAULT_SETTINGS.history_sessions),
    playSessions: numberOr(raw.play_sessions, FLASHBACK_DEFAULT_SETTINGS.play_sessions),
    minLiquidityVnd: numberOr(
      raw.min_liquidity_vnd,
      FLASHBACK_DEFAULT_SETTINGS.min_liquidity_vnd,
    ),
    minDailyVolatility: numberOr(
      raw.min_daily_volatility,
      FLASHBACK_DEFAULT_SETTINGS.min_daily_volatility,
    ),
    maxStartAttempts: numberOr(raw.max_start_attempts, FLASHBACK_DEFAULT_SETTINGS.max_start_attempts),
  };
}

/** Kết quả dựng một đề. */
export interface FlashbackRoundBuildResult {
  readonly symbol: string;
  readonly startDate: string;
  readonly bars: readonly FlashbackBar[];
  readonly warmupBars: readonly FlashbackBar[];
  readonly fallbackLevel: number;
}

/** Ngày bắt đầu tải dữ liệu (trước mốc 2012 để đủ 252 phiên khởi tạo). */
const FETCH_FROM = '2010-06-01';

/** Mốc chỉ số dùng làm lịch giao dịch để phát hiện phiên bị đình chỉnh. */
const CALENDAR_SYMBOL = 'VNINDEX';

const MIN_VN30_POOL_SIZE = 25;
const MAX_SINGLE_SESSION_JUMP = 0.25;

@Injectable()
export class FlashbackRoundBuilder {
  private readonly logger = new Logger(FlashbackRoundBuilder.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
    @Inject('FLASHBACK_MARKET_DATA') private readonly market: FlashbackMarketDataPort,
    @Optional() @Inject(FLASHBACK_VN30) private readonly vn30?: FlashbackVn30Port,
  ) {}

  /**
   * Thử tạo một đề ở mức nới điều kiện `level` (0 = nguyên luật, 3 = bỏ điều kiện dao động).
   * Trả về `null` khi không mã nào đạt yêu cầu.
   */
  async build(
    now: Date,
    level: number,
    config: FlashbackConfig,
  ): Promise<FlashbackRoundBuildResult | null> {
    const pool = await this.currentPool(now);
    if (pool.length === 0) {
      this.logger.warn('Flashback: không lấy được danh sách VN30 hiện hành');
      return null;
    }
    const total =
      config.warmupSessions + config.historySessions + config.playSessions || FLASHBACK_TOTAL_SESSIONS;
    const excludeCount =
      config.roundsBeforeSymbolRepeat || FLASHBACK_ROUNDS_BEFORE_SYMBOL_REPEAT;

    let poolAfterExclude = [...pool];
    if (level === 0) {
      const excluded10 = new Set(
        await this.repository.recentRoundSymbols(this.database, excludeCount),
      );
      poolAfterExclude = pool.filter((symbol) => !excluded10.has(symbol));
      // Rổ còn ít hơn 5 mã thì chỉ bỏ các mã của 5 đề gần nhất (BoSung §3.2).
      if (poolAfterExclude.length < FLASHBACK_MIN_POOL_BEFORE_REPEAT) {
        const fallbackCount = Math.min(FLASHBACK_MIN_POOL_BEFORE_REPEAT, excludeCount);
        const excluded5 = new Set(
          await this.repository.recentRoundSymbols(this.database, fallbackCount),
        );
        poolAfterExclude = pool.filter((symbol) => !excluded5.has(symbol));
      }
    }
    const candidates = this.shuffle(poolAfterExclude);
    const today = vietnamDate(now);
    const latestPlayDate = subtractMonths(today, config.minMonthsAgo || FLASHBACK_MIN_MONTHS_AGO);
    const calendar = await this.calendarDates();

    for (const symbol of candidates) {
      const series = await this.market.dailyBars(symbol, FETCH_FROM, today);
      if (series.length < total) continue;
      const usedDates = new Set(
        (await this.repository.roundChartDates(this.database, symbol, 50)).flat(),
      );
      for (let attempt = 0; attempt < config.maxStartAttempts; attempt += 1) {
        const maxStart = series.length - total;
        if (maxStart <= 0) break;
        const start = randomInt(maxStart + 1);
        const window = series.slice(start, start + total);
        const reason = this.rejectReason(window, config, level, latestPlayDate, calendar, usedDates);
        if (reason) continue;
        const warmup = window.slice(0, config.warmupSessions);
        const chart = window.slice(
          config.warmupSessions,
          config.warmupSessions + config.historySessions + config.playSessions,
        );
        return {
          symbol,
          startDate: chart[0]?.d ?? '',
          bars: chart,
          warmupBars: warmup,
          fallbackLevel: level,
        };
      }
    }
    return null;
  }

  /** Lý do từ chối một cửa sổ phiên (null = đạt). */
  private rejectReason(
    window: readonly FlashbackBar[],
    config: FlashbackConfig,
    level: number,
    latestPlayDate: string,
    calendar: readonly string[] | null,
    usedDates: ReadonlySet<string>,
  ): string | null {
    if (!this.isCleanWindow(window)) return 'dữ liệu nến không sạch';

    const warmup = config.warmupSessions;
    const history = window.slice(warmup, warmup + config.historySessions);
    const play = window.slice(warmup + config.historySessions);
    if (history.length === 0 || play.length === 0) return 'không đủ phiên';
    const firstHistory = history[0]?.d ?? '';
    const lastPlay = play[play.length - 1]?.d ?? '';
    if (firstHistory < config.earliestStartDate) return 'phiên lịch sử đầu tiên quá sớm';
    if (lastPlay > latestPlayDate) return 'phiên chơi cuối quá gần hiện tại';

    const chart = [...history, ...play];
    const zeroVolume = chart.filter((bar) => bar.v === 0).length;
    if (zeroVolume > FLASHBACK_MAX_ZERO_VOLUME_SESSIONS) return 'quá nhiều phiên không có giao dịch';

    const liquidity =
      chart.reduce((sum, bar) => sum + bar.c * bar.v, 0) / Math.max(1, chart.length);
    const liquidityFloor =
      level >= 2 ? Number(FLASHBACK_MIN_LIQUIDITY_VND) / 2 : config.minLiquidityVnd;
    if (liquidity < liquidityFloor) return 'thanh khoản không đạt';

    if (level < 3) {
      const volatility = this.dailyVolatility(play);
      if (volatility < config.minDailyVolatility) return 'độ biến động không đạt';
    }

    const missing = this.maxMissingRun(window, calendar);
    if (missing > FLASHBACK_MAX_MISSING_SESSIONS) return 'có quãng đình chỉnh quá dài';

    const overlap = chart.find((bar) => usedDates.has(bar.d));
    if (overlap) return 'trùng giai đoạn với đề cũ';
    return null;
  }

  /**
   * Kiểm tra dữ liệu sạch trên toàn bộ 372 phiên (BoSung §4.3):
   * 1. Giá dương hữu hạn, khối lượng không âm, thấp <= mở/đóng <= cao.
   * 2. Không có bước nhảy giá đóng cửa bất thường (> 25%) giữa hai phiên liên tiếp chưa điều chỉnh.
   */
  private isCleanWindow(window: readonly FlashbackBar[]): boolean {
    for (let index = 0; index < window.length; index += 1) {
      const bar = window[index]!;
      if (
        !Number.isFinite(bar.o) ||
        !Number.isFinite(bar.h) ||
        !Number.isFinite(bar.l) ||
        !Number.isFinite(bar.c) ||
        !Number.isFinite(bar.v) ||
        bar.o <= 0 ||
        bar.h <= 0 ||
        bar.l <= 0 ||
        bar.c <= 0 ||
        bar.v < 0 ||
        bar.h < bar.l ||
        bar.o < bar.l ||
        bar.o > bar.h ||
        bar.c < bar.l ||
        bar.c > bar.h
      ) {
        return false;
      }
      if (index > 0) {
        const prev = window[index - 1]!;
        if (Math.abs(bar.c / prev.c - 1) > MAX_SINGLE_SESSION_JUMP) {
          return false;
        }
      }
    }
    return true;
  }
  /** Độ lệch chuẩn lợi suất ngày của các phiên chơi. */
  private dailyVolatility(bars: readonly FlashbackBar[]): number {
    if (bars.length < 2) return 0;
    const returns: number[] = [];
    for (let index = 1; index < bars.length; index += 1) {
      const previous = bars[index - 1]?.c ?? 0;
      if (previous <= 0) continue;
      returns.push(((bars[index]?.c ?? previous) - previous) / previous);
    }
    if (returns.length === 0) return 0;
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Số phiên liên tục bị thiếu tối đa. Nếu có lịch giao dịch của chỉ số thì so với lịch đó,
   * nếu không thì dùng xấp xỉ theo ngày làm việc.
   */
  private maxMissingRun(
    window: readonly FlashbackBar[],
    calendar: readonly string[] | null,
  ): number {
    const dates = window.map((bar) => bar.d);
    if (calendar && calendar.length > 0) {
      const first = dates[0] ?? '';
      const last = dates[dates.length - 1] ?? '';
      const present = new Set(dates);
      let run = 0;
      let worst = 0;
      for (const day of calendar) {
        if (day < first || day > last) continue;
        if (present.has(day)) {
          run = 0;
          continue;
        }
        run += 1;
        if (run > worst) worst = run;
      }
      return worst;
    }
    let worst = 0;
    for (let index = 1; index < dates.length; index += 1) {
      const missing = this.weekdaysBetween(dates[index - 1] ?? '', dates[index] ?? '') - 1;
      if (missing > worst) worst = missing;
    }
    return worst;
  }

  /** Số ngày làm việc nằm giữa hai ngày (không tính ngày đầu và ngày cuối). */
  private weekdaysBetween(from: string, to: string): number {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    if (end <= start) return 1;
    let count = 0;
    for (let time = start + 86_400_000; time < end; time += 86_400_000) {
      const day = new Date(time).getUTCDay();
      if (day !== 0 && day !== 6) count += 1;
    }
    return count + 1;
  }

  /** Ngày giao dịch của chỉ số (lịch tham chiếu để phát hiện đình chỉnh). */
  private async calendarDates(): Promise<string[] | null> {
    try {
      const bars = await this.market.dailyBars(CALENDAR_SYMBOL, FETCH_FROM, vietnamDate(new Date()));
      if (bars.length === 0) return null;
      return bars.map((bar) => bar.d);
    } catch (error) {
      this.logger.warn(
        `Flashback: không lấy được lịch giao dịch của ${CALENDAR_SYMBOL} (${
          error instanceof Error ? error.message : 'lỗi không xác định'
        })`,
      );
      return null;
    }
  }

  /** Rổ mã VN30 hiện hành (đọc từ kho, làm mới từ feed khi có thể). */
  private async currentPool(now: Date): Promise<string[]> {
    const stored = await this.repository.listCurrentVn30(this.database);
    const canRefresh =
      typeof this.market.vn30Symbols === 'function' ||
      typeof this.vn30?.fetchCurrent === 'function';

    if (stored.length >= MIN_VN30_POOL_SIZE && typeof this.market.vn30Symbols !== 'function') {
      return stored;
    }

    let pool = stored;
    let degraded = stored.length < MIN_VN30_POOL_SIZE;
    if (canRefresh) {
      try {
        const refreshed =
          typeof this.market.vn30Symbols === 'function'
            ? await this.market.vn30Symbols()
            : (await this.vn30!.fetchCurrent('VN30')).symbols;
        if (refreshed.length > 0) {
          await this.database.transaction(async (tx) => {
            await this.repository.replaceVn30(tx, refreshed, now);
          });
          pool = [...refreshed];
        }
        degraded = refreshed.length < MIN_VN30_POOL_SIZE;
      } catch (error) {
        degraded = true;
        this.logger.warn(
          `Flashback: không làm mới được VN30 (${
            error instanceof Error ? error.message : 'lỗi không xác định'
          })`,
        );
      }
    }

    if (degraded || pool.length < MIN_VN30_POOL_SIZE) {
      await this.recordPoolDegradedAlert();
    }
    return pool;
  }

  private async recordPoolDegradedAlert(): Promise<void> {
    const known = await this.repository.hasRecentAlert(this.database, null, 'medium', 30);
    if (known) return;
    await this.database.transaction(async (tx) => {
      await this.repository.appendJobLog(tx, {
        step: 'alert',
        roundId: null,
        result:
          'alert:medium:vn30_pool_degraded: Rổ VN30 lấy được ít hơn 25 mã hoặc không cập nhật được.',
        error: null,
        level: 'medium',
      });
    });
  }

  /** Xáo trộn bằng CSPRNG (Fisher-Yates). */
  private shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      const current = result[index]!;
      result[index] = result[swap]!;
      result[swap] = current;
    }
    return result;
  }
}
