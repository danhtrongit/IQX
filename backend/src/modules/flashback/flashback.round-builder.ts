/**
 * Chọn mã và giai đoạn cho một đề Flashback (spec v1.2 §4 và §6.3).
 *
 * Quy trình: lấy rổ VN30 hiện hành, loại mã của 10 đề gần nhất, chọn ngẫu nhiên bằng CSPRNG
 * một mã và một ngày bắt đầu, rồi kiểm tra các điều kiện của §4.3 trên 372 phiên liên tục
 * (252 warmup + 60 lịch sử + 60 chơi). Nếu không mã nào đạt thì nới điều kiện theo thang
 * §6.3 và ghi `fallback_level` của đề.
 *
 * Bản 22-10: rổ VN30 làm mới ở mỗi lần tạo đề (FB-05), giá chuẩn hoá về đồng và ghi nguồn
 * (FB-04), kiểm tra chồng giai đoạn với MỌI đề cùng mã (FB-11e), bước nhảy giá theo biên độ
 * HOSE từng thời kỳ (FB-11f), mốc tải dữ liệu tính từ `earliest_start_date` (FB-11g) và bắt buộc
 * có lịch giao dịch VNINDEX phủ giai đoạn (FB-11h).
 */

import { randomInt } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import {
  FLASHBACK_BAND_TOLERANCE,
  FLASHBACK_DEFAULT_SETTINGS,
  FLASHBACK_EARLIEST_START_DATE,
  FLASHBACK_FALLBACK_LIQUIDITY_VND,
  FLASHBACK_FEE_BPS,
  FLASHBACK_MAX_MISSING_SESSIONS,
  FLASHBACK_MAX_ZERO_VOLUME_SESSIONS,
  FLASHBACK_MIN_MONTHS_AGO,
  FLASHBACK_MIN_POOL_BEFORE_REPEAT,
  FLASHBACK_ROUNDS_BEFORE_SYMBOL_REPEAT,
  FLASHBACK_SETTLEMENT_SESSIONS,
  FLASHBACK_TAX_BPS,
  FLASHBACK_TOTAL_SESSIONS,
  flashbackHosePriceBand,
} from './flashback.constants.js';
import {
  FLASHBACK_OPS_ALERTS,
  noopFlashbackOpsAlerts,
  type FlashbackOpsAlertPort,
} from './flashback.alerts.js';
import type { FlashbackMarketDataPort, FlashbackSeries } from './flashback.market-data.js';
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
  /** Khoảng lợi nhuận tối đa cho phép (0,2 = 20%), xem `flashbackMaxProfit`. */
  readonly minMaxProfit: number;
  readonly maxMaxProfit: number;
  readonly maxStartAttempts: number;
  /** Phí tham gia từ lần thứ hai (xu); 0 = miễn phí (spec 22-10 §1.14). */
  readonly entryFeeXu: number;
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

/**
 * Ngày bắt đầu tải dữ liệu (FB-11g): `earliest_start_date` lùi đủ cho `warmupSessions` phiên
 * khởi tạo (khoảng 7/5 ngày lịch mỗi phiên) cộng 60 ngày dự phòng cho ngày lễ.
 */
export function flashbackFetchFrom(
  config: Pick<FlashbackConfig, 'earliestStartDate' | 'warmupSessions'>,
): string {
  const start = Date.parse(`${config.earliestStartDate}T00:00:00Z`);
  const base = Number.isFinite(start)
    ? start
    : Date.parse(`${FLASHBACK_EARLIEST_START_DATE}T00:00:00Z`);
  const days = Math.ceil((Math.max(0, config.warmupSessions) * 7) / 5) + 60;
  return new Date(base - days * 86_400_000).toISOString().slice(0, 10);
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
  const fee = numberOr(raw.entry_fee_xu, FLASHBACK_DEFAULT_SETTINGS.entry_fee_xu);
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
    minLiquidityVnd: numberOr(raw.min_liquidity_vnd, FLASHBACK_DEFAULT_SETTINGS.min_liquidity_vnd),
    minDailyVolatility: numberOr(
      raw.min_daily_volatility,
      FLASHBACK_DEFAULT_SETTINGS.min_daily_volatility,
    ),
    minMaxProfit: numberOr(raw.min_max_profit, FLASHBACK_DEFAULT_SETTINGS.min_max_profit),
    maxMaxProfit: numberOr(raw.max_max_profit, FLASHBACK_DEFAULT_SETTINGS.max_max_profit),
    maxStartAttempts: numberOr(
      raw.max_start_attempts,
      FLASHBACK_DEFAULT_SETTINGS.max_start_attempts,
    ),
    // Phí là số nguyên không âm; giá trị hỏng thì quay về mặc định thay vì cho tham gia sai phí.
    entryFeeXu:
      Number.isSafeInteger(fee) && fee >= 0 && fee <= 100_000
        ? fee
        : FLASHBACK_DEFAULT_SETTINGS.entry_fee_xu,
  };
}

/**
 * Lợi nhuận tối đa (0,25 = 25%) của người chơi biết trước giá, theo đúng luật đặt lệnh:
 * khớp giá đóng cửa, phí 0,15% hai chiều, thuế 0,1% khi bán, mua ở phiên T thì bán từ phiên T+2,
 * một phiên đặt được nhiều lệnh, cổ phiếu còn giữ cuối đề tính theo giá đóng cửa phiên cuối.
 * Mỗi lô sinh lời độc lập theo tỉ lệ nên dồn hết vốn vào mỗi lần mua là tối ưu; bỏ qua làm tròn
 * số cổ phiếu. `closes[k]` là giá đóng cửa của Phiên k (Phiên 0 = nến lịch sử cuối cùng).
 */
export function flashbackMaxProfit(closes: readonly number[]): number {
  const n = closes.length;
  if (n === 0) return 0;
  const buy = 1 + FLASHBACK_FEE_BPS / 10_000;
  const sell = 1 - (FLASHBACK_FEE_BPS + FLASHBACK_TAX_BPS) / 10_000;
  // cash[j]: tài sản lớn nhất (toàn tiền mặt) có được sau khi đặt xong lệnh ở Phiên j.
  const cash: number[] = new Array<number>(n).fill(1);
  for (let j = 0; j < n; j += 1) {
    let best = j > 0 ? cash[j - 1]! : 1;
    for (let i = 0; i + FLASHBACK_SETTLEMENT_SESSIONS <= j; i += 1) {
      best = Math.max(best, (cash[i]! * closes[j]! * sell) / (closes[i]! * buy));
    }
    cash[j] = best;
  }
  let end = cash[n - 1]!;
  for (let i = 0; i < n; i += 1) {
    end = Math.max(end, (cash[i]! * closes[n - 1]!) / (closes[i]! * buy));
  }
  return end - 1;
}

/** Kết quả dựng một đề. */
export interface FlashbackRoundBuildResult {
  readonly symbol: string;
  readonly startDate: string;
  readonly bars: readonly FlashbackBar[];
  readonly warmupBars: readonly FlashbackBar[];
  readonly fallbackLevel: number;
  /** Nguồn và đơn vị giá (FB-04), lưu vào `flashback_rounds.price_source`. */
  readonly priceSource: string;
}

/** Không lấy được lịch giao dịch VNINDEX: bỏ lần tạo đề này và thử lại (FB-11h). */
export class FlashbackCalendarUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlashbackCalendarUnavailableError';
  }
}

/** Mốc chỉ số dùng làm lịch giao dịch để phát hiện phiên bị đình chỉnh. */
const CALENDAR_SYMBOL = 'VNINDEX';

const MIN_VN30_POOL_SIZE = 25;

/** Lịch giao dịch: danh sách ngày tăng dần và vị trí của từng ngày. */
interface TradingCalendar {
  readonly dates: readonly string[];
  readonly position: ReadonlyMap<string, number>;
}

/** Vị trí đầu tiên có ngày >= `date` (tìm nhị phân). */
function lowerBound(dates: readonly string[], date: string): number {
  let low = 0;
  let high = dates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (dates[middle]! < date) low = middle + 1;
    else high = middle;
  }
  return low;
}

@Injectable()
export class FlashbackRoundBuilder {
  private readonly logger = new Logger(FlashbackRoundBuilder.name);
  /** Rổ đã làm mới cho một lần tạo đề (cùng `now` cho các mức nới 0..3). */
  private poolCache: { at: number; pool: string[] } | null = null;

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
    @Inject('FLASHBACK_MARKET_DATA') private readonly market: FlashbackMarketDataPort,
    @Optional() @Inject(FLASHBACK_VN30) private readonly vn30?: FlashbackVn30Port,
    @Optional()
    @Inject(FLASHBACK_OPS_ALERTS)
    private readonly alerts: FlashbackOpsAlertPort = noopFlashbackOpsAlerts,
  ) {}

  /**
   * Thử tạo một đề ở mức nới điều kiện `level` (0 = nguyên luật, 3 = bỏ điều kiện dao động).
   * Trả về `null` khi không mã nào đạt yêu cầu. Ném `FlashbackCalendarUnavailableError` khi
   * không có lịch giao dịch để kiểm tra quãng đình chỉ.
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
      config.warmupSessions + config.historySessions + config.playSessions ||
      FLASHBACK_TOTAL_SESSIONS;
    const excludeCount = config.roundsBeforeSymbolRepeat || FLASHBACK_ROUNDS_BEFORE_SYMBOL_REPEAT;

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
    const fetchFrom = flashbackFetchFrom(config);
    const latestPlayDate = subtractMonths(today, config.minMonthsAgo || FLASHBACK_MIN_MONTHS_AGO);
    const calendar = await this.calendar(fetchFrom, today);

    for (const symbol of candidates) {
      const series = await this.series(symbol, fetchFrom, today);
      if (!series || series.bars.length < total) continue;
      const bars = series.bars;
      // Mọi đề cùng mã, không giới hạn số đề (FB-11e).
      const usedDates = new Set(
        (await this.repository.roundChartDates(this.database, symbol)).flat(),
      );
      for (let attempt = 0; attempt < config.maxStartAttempts; attempt += 1) {
        const maxStart = bars.length - total;
        if (maxStart <= 0) break;
        const start = randomInt(maxStart + 1);
        const window = bars.slice(start, start + total);
        const reason = this.rejectReason(
          window,
          config,
          level,
          latestPlayDate,
          calendar,
          usedDates,
        );
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
          priceSource: series.source,
        };
      }
    }
    return null;
  }

  /** Nến của một mã; lỗi nguồn (kể cả sai đơn vị) thì bỏ mã đó trong lần tạo đề này. */
  private async series(symbol: string, from: string, to: string): Promise<FlashbackSeries | null> {
    try {
      if (typeof this.market.dailySeries === 'function') {
        return await this.market.dailySeries(symbol, from, to);
      }
      return { bars: await this.market.dailyBars(symbol, from, to), source: 'unknown' };
    } catch (error) {
      this.logger.warn(
        `Flashback: bỏ một mã vì lỗi nguồn nến (${error instanceof Error ? error.message : 'lỗi không xác định'})`,
      );
      return null;
    }
  }

  /** Lý do từ chối một cửa sổ phiên (null = đạt). */
  private rejectReason(
    window: readonly FlashbackBar[],
    config: FlashbackConfig,
    level: number,
    latestPlayDate: string,
    calendar: TradingCalendar,
    usedDates: ReadonlySet<string>,
  ): string | null {
    const warmup = config.warmupSessions;
    const history = window.slice(warmup, warmup + config.historySessions);
    const play = window.slice(warmup + config.historySessions);
    if (history.length === 0 || play.length === 0) return 'không đủ phiên';
    const firstHistory = history[0]?.d ?? '';
    const lastPlay = play[play.length - 1]?.d ?? '';
    if (firstHistory < config.earliestStartDate) return 'phiên lịch sử đầu tiên quá sớm';
    if (lastPlay > latestPlayDate) return 'phiên chơi cuối quá gần hiện tại';

    const chart = [...history, ...play];
    // Không chồng giai đoạn với đề cũ cùng mã: không bao giờ nới (BoSung §6.3).
    if (chart.some((bar) => usedDates.has(bar.d))) return 'trùng giai đoạn với đề cũ';

    // Lịch phải phủ cả giai đoạn, nếu không thì không kiểm tra được quãng đình chỉ (FB-11h).
    const first = window[0]?.d ?? '';
    const calendarFirst = calendar.dates[0] ?? '';
    if (!calendarFirst || calendarFirst > first) return 'lịch giao dịch không phủ giai đoạn';

    if (!this.isCleanWindow(window, calendar)) return 'dữ liệu nến không sạch';

    const zeroVolume = chart.filter((bar) => bar.v === 0).length;
    if (zeroVolume > FLASHBACK_MAX_ZERO_VOLUME_SESSIONS)
      return 'quá nhiều phiên không có giao dịch';

    const liquidity =
      chart.reduce((sum, bar) => sum + bar.c * bar.v, 0) / Math.max(1, chart.length);
    const liquidityFloor =
      level >= 2 ? Number(FLASHBACK_FALLBACK_LIQUIDITY_VND) : config.minLiquidityVnd;
    if (liquidity < liquidityFloor) return 'thanh khoản không đạt';

    if (level < 3) {
      const volatility = this.dailyVolatility(play);
      if (volatility < config.minDailyVolatility) return 'độ biến động không đạt';
    }

    // Lợi nhuận tối đa khi chơi hoàn hảo, tính từ Phiên 0 (nến lịch sử cuối) tới Phiên 60.
    const maxProfit = flashbackMaxProfit([
      history[history.length - 1]!.c,
      ...play.map((bar) => bar.c),
    ]);
    if (maxProfit < config.minMaxProfit || maxProfit > config.maxMaxProfit)
      return 'lợi nhuận tối đa ngoài khoảng cho phép';

    const missing = this.maxMissingRun(window, calendar);
    if (missing > FLASHBACK_MAX_MISSING_SESSIONS) return 'có quãng đình chỉnh quá dài';
    return null;
  }

  /**
   * Kiểm tra dữ liệu sạch trên toàn bộ 372 phiên (BoSung §4.3):
   * 1. Giá dương hữu hạn, khối lượng không âm, thấp <= mở/đóng <= cao.
   * 2. Không có bước nhảy giá đóng cửa vượt biên độ HOSE của ngày đó cộng 0,5% sai số làm tròn
   *    (FB-11f). Phiên đầu tiên sau quãng tạm ngừng giao dịch (thiếu phiên trên lịch) được miễn.
   */
  private isCleanWindow(window: readonly FlashbackBar[], calendar: TradingCalendar): boolean {
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
        const limit = flashbackHosePriceBand(bar.d) + FLASHBACK_BAND_TOLERANCE;
        if (Math.abs(bar.c / prev.c - 1) > limit) {
          const at = calendar.position.get(bar.d);
          const before = calendar.position.get(prev.d);
          const resumedAfterHalt = at !== undefined && before !== undefined && at - before > 1;
          if (!resumedAfterHalt) return false;
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
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
  }

  /** Số phiên liên tục bị thiếu tối đa so với lịch giao dịch của VNINDEX. */
  private maxMissingRun(window: readonly FlashbackBar[], calendar: TradingCalendar): number {
    const first = window[0]?.d ?? '';
    const last = window[window.length - 1]?.d ?? '';
    const present = new Set(window.map((bar) => bar.d));
    let run = 0;
    let worst = 0;
    for (let index = lowerBound(calendar.dates, first); index < calendar.dates.length; index += 1) {
      const day = calendar.dates[index]!;
      if (day > last) break;
      if (present.has(day)) {
        run = 0;
        continue;
      }
      run += 1;
      if (run > worst) worst = run;
    }
    return worst;
  }

  /**
   * Lịch giao dịch của VNINDEX trong khoảng tải dữ liệu. Không lấy được thì bỏ lần tạo đề
   * (FB-11h): không còn đếm xấp xỉ theo ngày thường.
   */
  private async calendar(from: string, to: string): Promise<TradingCalendar> {
    let bars: readonly FlashbackBar[];
    try {
      bars = await this.market.dailyBars(CALENDAR_SYMBOL, from, to);
    } catch (error) {
      throw new FlashbackCalendarUnavailableError(
        `Không lấy được lịch giao dịch ${CALENDAR_SYMBOL} (${
          error instanceof Error ? error.message : 'lỗi không xác định'
        })`,
      );
    }
    if (bars.length === 0) {
      throw new FlashbackCalendarUnavailableError(`Lịch giao dịch ${CALENDAR_SYMBOL} rỗng`);
    }
    const dates = [...new Set(bars.map((bar) => bar.d))].sort();
    return { dates, position: new Map(dates.map((date, index) => [date, index])) };
  }

  /**
   * Rổ mã VN30 hiện hành (FB-05). Mỗi lần tạo đề gọi nguồn thành phần chỉ số và đồng bộ bảng
   * `vn30_constituents` (mã rời rổ có `effective_to`, mã mới có `effective_from`). Nguồn lỗi
   * hoặc trả ít hơn 25 mã thì giữ rổ đang lưu và bắn cảnh báo (BoSung §6.1).
   */
  private async currentPool(now: Date): Promise<string[]> {
    if (this.poolCache && this.poolCache.at === now.getTime()) return [...this.poolCache.pool];
    const stored = await this.repository.listCurrentVn30(this.database);
    const fetcher =
      typeof this.market.vn30Symbols === 'function'
        ? () => this.market.vn30Symbols!()
        : this.vn30 && typeof this.vn30.fetchCurrent === 'function'
          ? async () => (await this.vn30!.fetchCurrent('VN30')).symbols
          : null;

    let pool = stored;
    let problem: string | null = null;
    if (!fetcher) {
      problem = 'không có nguồn thành phần chỉ số';
    } else {
      try {
        const fetched = [...new Set((await fetcher()).map((symbol) => symbol.trim().toUpperCase()))]
          .filter(Boolean)
          .sort();
        if (fetched.length >= MIN_VN30_POOL_SIZE) {
          await this.database.transaction(async (tx) => {
            await this.repository.syncVn30(tx, fetched, now);
          });
          pool = fetched;
        } else {
          problem = `nguồn chỉ trả ${fetched.length} mã`;
          // Chưa từng có rổ thì tạm dùng rổ thiếu cho lần này, nhưng không ghi đè bảng.
          if (stored.length === 0) pool = fetched;
        }
      } catch (error) {
        problem = `lỗi nguồn (${error instanceof Error ? error.message : 'không xác định'})`;
      }
    }

    if (problem || pool.length < MIN_VN30_POOL_SIZE) {
      this.logger.warn(`Flashback: rổ VN30 không cập nhật được: ${problem ?? 'rổ dưới 25 mã'}`);
      await this.recordPoolDegradedAlert(problem ?? `rổ chỉ có ${pool.length} mã`);
    }
    this.poolCache = { at: now.getTime(), pool: [...pool] };
    return pool;
  }

  private async recordPoolDegradedAlert(detail: string): Promise<void> {
    const known = await this.repository.hasRecentAlert(this.database, null, 'medium', 30);
    if (known) return;
    const message = `alert:medium:vn30_pool_degraded: Rổ VN30 không cập nhật được hoặc lấy được ít hơn 25 mã (${detail}). Đang dùng rổ đã lưu.`;
    await this.database.transaction(async (tx) => {
      await this.repository.appendJobLog(tx, {
        step: 'alert',
        roundId: null,
        result: message,
        error: null,
        level: 'medium',
      });
    });
    await this.alerts.send({ level: 'medium', message });
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
