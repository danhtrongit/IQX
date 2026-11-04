/**
 * Tham số của kho dữ liệu Flashback v2.2 (IQX-Flashback-SPEC-DuLieu.md §5) và lịch làm mới (§2.1).
 *
 * Lưu trong `flashback_settings` khoá `dataset` như các tham số Flashback khác: quản trị viên đổi
 * được bằng API (`PUT /api/v2/admin/flashback/dataset/config`) hoặc SQL, không cần sửa code. Khoá
 * thiếu hoặc không hợp lệ thì dùng mặc định bên dưới; không bao giờ ném lỗi khi đọc.
 *
 * Riêng `max_gap_sessions` được ghi cứng vào mảng `p_gap` lúc tạo kho (§1.3), nên mỗi phiên bản
 * giữ ngưỡng của chính nó (`fb_dataset_versions.params`); đổi ngưỡng này chỉ có hiệu lực từ lần
 * làm mới kế tiếp. Mọi ngưỡng khác được áp lúc cắt đề nên có hiệu lực ngay.
 */

import { z } from 'zod';

import { FLASHBACK_MIN_DAILY_VOLATILITY } from './flashback.constants.js';

/** Khoá tham số trong `flashback_settings`. */
export const FLASHBACK_DATASET_CONFIG_KEY = 'dataset';

/** Thông báo cho chủ phòng khi không cắt được đề (spec §3.3 bước 7). */
export const FLASHBACK_NO_DATA_MESSAGE = 'Chưa tạo được dữ liệu ván chơi, vui lòng thử lại sau';

/** Số phiên khởi tạo chỉ báo mặc định (W). */
export const DATASET_WARMUP_SESSIONS = 252;

/** Số phiên xem và chơi nhỏ nhất của một phòng (khớp ràng buộc `fb_matches`). */
export const DATASET_MIN_PHASE_BARS = 30;
export const DATASET_MAX_PHASE_BARS = 120;

/** Nguồn nến ngày của bộ dựng kho. */
export const DATASET_PRICE_SOURCES = ['DNSE', 'VCI'] as const;
export type DatasetPriceSource = (typeof DATASET_PRICE_SOURCES)[number];

export interface FlashbackDatasetConfig {
  /** Rổ mã lấy từ nguồn dữ liệu thị trường (spec §1.1). */
  readonly basket: string;
  /** W: số phiên khởi tạo chỉ báo, không vẽ lên biểu đồ. */
  readonly warmupSessions: number;
  /** Phiên chơi cuối phải cách hôm nay ít nhất chừng này tháng (§3.2 #2). */
  readonly minMonthsAgo: number;
  /** Khoảng nghỉ tối đa, tính bằng phiên (§3.2 #3). Ghi cứng vào kho lúc tạo. */
  readonly maxGapSessions: number;
  /** Tỷ lệ phiên khối lượng 0 tối đa trên phần hiện (§3.2 #5), tối thiểu cho phép 1 phiên. */
  readonly maxZeroVolumeRatio: number;
  /** Thanh khoản bình quân tối thiểu trên phần hiện, đồng/phiên (§3.2 #6). */
  readonly minLiquidityVnd: number;
  /** Độ lệch chuẩn lợi suất ngày tối thiểu trên các phiên chơi (§3.2 #7). */
  readonly minDailyVolatility: number;
  /** Số mã hợp lệ tối thiểu để kích hoạt một phiên bản kho (§2.2 bước 4). */
  readonly minSymbols: number;
  /**
   * Thứ tự nguồn nến ngày: nguồn đầu là nguồn chính, các nguồn sau chỉ dùng khi nguồn trước lỗi
   * hoặc không có dữ liệu của mã. Mặc định `DNSE` rồi `VCI` (DNSE có lịch sử từ 2012-03, VCI từ
   * ngày lên sàn); đặt `VCI` lên đầu nếu cần các điểm cắt trước 2012.
   */
  readonly priceSources: readonly DatasetPriceSource[];
  /** Các tháng có kỳ cơ cấu định kỳ của VN100 (mặc định tháng 2 và tháng 8). */
  readonly refreshMonths: readonly number[];
  /** Chờ thêm chừng này ngày sau ngày hiệu lực kỳ cơ cấu rồi mới làm mới kho. */
  readonly refreshDelayDays: number;
  /**
   * Ngày hiệu lực kỳ cơ cấu lấy từ lịch của sở (YYYY-MM-DD). Nếu có thì dùng danh sách này thay
   * cho quy tắc "thứ Hai đầu tiên của các tháng `refreshMonths`".
   */
  readonly rebalanceDates: readonly string[];
}

export const FLASHBACK_DATASET_DEFAULTS: FlashbackDatasetConfig = Object.freeze({
  basket: 'VN100',
  warmupSessions: DATASET_WARMUP_SESSIONS,
  minMonthsAgo: 12,
  maxGapSessions: 5,
  maxZeroVolumeRatio: 0.025,
  minLiquidityVnd: 3_000_000_000,
  minDailyVolatility: FLASHBACK_MIN_DAILY_VOLATILITY,
  minSymbols: 80,
  priceSources: Object.freeze<DatasetPriceSource[]>(['DNSE', 'VCI']),
  refreshMonths: Object.freeze([2, 8]),
  refreshDelayDays: 7,
  rebalanceDates: Object.freeze([]),
});

/** Số phiên nhỏ nhất của một bộ: W + 30 + 30 (§2.2 bước 3). */
export function datasetMinBars(config: Pick<FlashbackDatasetConfig, 'warmupSessions'>): number {
  return config.warmupSessions + DATASET_MIN_PHASE_BARS * 2;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Ngày có thật trong lịch: `2026-02-30` và `2026-13-01` đều không (và không được ném lỗi). */
const isRealDate = (value: string): boolean => {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** Khoá và khoảng giá trị hợp lệ của từng tham số, dùng chung cho đọc và cập nhật. */
const fields = {
  basket: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,16}$/)
    .transform((value) => value.toUpperCase()),
  warmup_sessions: z.number().int().min(100).max(500),
  min_months_ago: z.number().int().min(0).max(60),
  max_gap_sessions: z.number().int().min(0).max(60),
  max_zero_volume_ratio: z.number().min(0).max(0.5),
  min_liquidity_vnd: z.number().min(0).max(1_000_000_000_000),
  min_daily_volatility: z.number().min(0).max(0.2),
  min_symbols: z.number().int().min(1).max(500),
  price_sources: z
    .array(z.enum(DATASET_PRICE_SOURCES))
    .min(1)
    .max(DATASET_PRICE_SOURCES.length)
    .refine((sources) => new Set(sources).size === sources.length),
  refresh_months: z
    .array(z.number().int().min(1).max(12))
    .min(1)
    .max(12)
    .refine((months) => new Set(months).size === months.length),
  refresh_delay_days: z.number().int().min(0).max(60),
  rebalance_dates: z
    .array(z.string().refine(isRealDate))
    .max(40)
    .refine((dates) => new Set(dates).size === dates.length),
};

/** Thân cập nhật tham số: mọi khoá đều tuỳ chọn, khoá lạ bị từ chối. */
export const flashbackDatasetConfigPatchSchema = z
  .strictObject({
    basket: fields.basket.optional(),
    warmup_sessions: fields.warmup_sessions.optional(),
    min_months_ago: fields.min_months_ago.optional(),
    max_gap_sessions: fields.max_gap_sessions.optional(),
    max_zero_volume_ratio: fields.max_zero_volume_ratio.optional(),
    min_liquidity_vnd: fields.min_liquidity_vnd.optional(),
    min_daily_volatility: fields.min_daily_volatility.optional(),
    min_symbols: fields.min_symbols.optional(),
    price_sources: fields.price_sources.optional(),
    refresh_months: fields.refresh_months.optional(),
    refresh_delay_days: fields.refresh_delay_days.optional(),
    rebalance_dates: fields.rebalance_dates.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Không có tham số nào để cập nhật' });
export type FlashbackDatasetConfigPatch = z.infer<typeof flashbackDatasetConfigPatchSchema>;

/** Dạng lưu trong `flashback_settings` (khoá snake_case). */
export interface StoredDatasetConfig {
  basket: string;
  warmup_sessions: number;
  min_months_ago: number;
  max_gap_sessions: number;
  max_zero_volume_ratio: number;
  min_liquidity_vnd: number;
  min_daily_volatility: number;
  min_symbols: number;
  price_sources: DatasetPriceSource[];
  refresh_months: number[];
  refresh_delay_days: number;
  rebalance_dates: string[];
}

export function datasetConfigToStored(config: FlashbackDatasetConfig): StoredDatasetConfig {
  return {
    basket: config.basket,
    warmup_sessions: config.warmupSessions,
    min_months_ago: config.minMonthsAgo,
    max_gap_sessions: config.maxGapSessions,
    max_zero_volume_ratio: config.maxZeroVolumeRatio,
    min_liquidity_vnd: config.minLiquidityVnd,
    min_daily_volatility: config.minDailyVolatility,
    min_symbols: config.minSymbols,
    price_sources: [...config.priceSources],
    refresh_months: [...config.refreshMonths],
    refresh_delay_days: config.refreshDelayDays,
    rebalance_dates: [...config.rebalanceDates],
  };
}

/**
 * Đọc tham số đã lưu, từng khoá một: khoá thiếu hoặc ngoài khoảng cho phép thì dùng mặc định.
 * `invalid` liệt kê các khoá bị bỏ để trang quản trị có thể cảnh báo.
 */
export function readFlashbackDatasetConfig(stored: unknown): {
  config: FlashbackDatasetConfig;
  invalid: string[];
} {
  const source =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const defaults = datasetConfigToStored(FLASHBACK_DATASET_DEFAULTS);
  const result: Record<string, unknown> = { ...defaults };
  const invalid: string[] = [];
  for (const [key, schema] of Object.entries(fields)) {
    if (!(key in source) || source[key] === null || source[key] === undefined) continue;
    const parsed = (schema as z.ZodType).safeParse(source[key]);
    if (parsed.success) result[key] = parsed.data;
    else invalid.push(key);
  }
  const value = result as unknown as StoredDatasetConfig;
  return {
    config: {
      basket: value.basket,
      warmupSessions: value.warmup_sessions,
      minMonthsAgo: value.min_months_ago,
      maxGapSessions: value.max_gap_sessions,
      maxZeroVolumeRatio: value.max_zero_volume_ratio,
      minLiquidityVnd: value.min_liquidity_vnd,
      minDailyVolatility: value.min_daily_volatility,
      minSymbols: value.min_symbols,
      priceSources: [...value.price_sources],
      refreshMonths: [...value.refresh_months].sort((a, b) => a - b),
      refreshDelayDays: value.refresh_delay_days,
      rebalanceDates: [...value.rebalance_dates].sort(),
    },
    invalid,
  };
}

/** Áp một bản cập nhật lên tham số hiện hành. */
export function applyDatasetConfigPatch(
  current: FlashbackDatasetConfig,
  patch: FlashbackDatasetConfigPatch,
): FlashbackDatasetConfig {
  const merged = { ...datasetConfigToStored(current), ...patch };
  return readFlashbackDatasetConfig(merged).config;
}

/** Khoá ổn định của bộ tham số ảnh hưởng tới danh sách điểm cắt (dùng làm khoá bộ nhớ đệm). */
export function datasetCutConfigKey(config: FlashbackDatasetConfig): string {
  return [
    config.warmupSessions,
    config.minMonthsAgo,
    config.maxZeroVolumeRatio,
    config.minLiquidityVnd,
    config.minDailyVolatility,
  ].join('|');
}

// ------------------------------------------------------------------ lịch làm mới (§2.1)

const addDays = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

/** Thứ Hai đầu tiên của một tháng (YYYY-MM-DD). */
export function firstMondayOf(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (8 - first.getUTCDay()) % 7; // 1 = thứ Hai
  return addDays(first.toISOString().slice(0, 10), offset);
}

/**
 * Ngày hiệu lực của các kỳ cơ cấu định kỳ trong khoảng năm `[fromYear, toYear]`.
 *
 * Giả định (cần đối chiếu với lịch của HOSE, xem báo cáo): danh mục VN100 mới có hiệu lực vào
 * thứ Hai đầu tiên của tháng 2 và tháng 8. Muốn dùng ngày chính xác của sở, đặt
 * `rebalance_dates` trong tham số; khi đó danh sách này thay cho quy tắc.
 */
export function rebalanceEffectiveDates(
  config: Pick<FlashbackDatasetConfig, 'refreshMonths' | 'rebalanceDates'>,
  fromYear: number,
  toYear: number,
): string[] {
  if (config.rebalanceDates.length > 0) return [...config.rebalanceDates].sort();
  const dates: string[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    for (const month of config.refreshMonths) dates.push(firstMondayOf(year, month));
  }
  return dates.sort();
}

/**
 * Mốc làm mới gần nhất không muộn hơn `today`: ngày hiệu lực kỳ cơ cấu cộng
 * `refreshDelayDays`. `null` nếu chưa có mốc nào trong hai năm qua.
 */
export function latestRefreshAnchor(
  today: string,
  config: Pick<FlashbackDatasetConfig, 'refreshMonths' | 'rebalanceDates' | 'refreshDelayDays'>,
): string | null {
  const year = Number(today.slice(0, 4));
  const anchors = rebalanceEffectiveDates(config, year - 2, year)
    .map((date) => addDays(date, config.refreshDelayDays))
    .filter((anchor) => anchor <= today)
    .sort();
  return anchors.at(-1) ?? null;
}

/** Kết quả kiểm tra "đã tới hạn làm mới chưa" của tác vụ định kỳ. */
export interface DatasetRefreshDecision {
  readonly due: boolean;
  readonly reason: 'no_active_version' | 'rebalance_passed' | 'up_to_date';
  readonly anchor: string | null;
}

/**
 * Tác vụ định kỳ chạy hằng ngày nhưng chỉ làm mới khi chưa có kho đang dùng, hoặc khi có một kỳ
 * cơ cấu đã qua mà kho đang dùng được tạo trước mốc đó. Nhờ vậy chạy lại nhiều lần trong cùng một
 * kỳ không tạo thêm phiên bản (§2.2: không tạo phiên bản trùng).
 */
export function decideScheduledRefresh(
  today: string,
  activeCreatedDate: string | null,
  config: Pick<FlashbackDatasetConfig, 'refreshMonths' | 'rebalanceDates' | 'refreshDelayDays'>,
): DatasetRefreshDecision {
  if (activeCreatedDate === null) return { due: true, reason: 'no_active_version', anchor: null };
  const anchor = latestRefreshAnchor(today, config);
  if (anchor !== null && activeCreatedDate < anchor)
    return { due: true, reason: 'rebalance_passed', anchor };
  return { due: false, reason: 'up_to_date', anchor };
}
