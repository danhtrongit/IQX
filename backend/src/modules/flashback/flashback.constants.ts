/**
 * Hằng số của game Flashback (IQX-Flashback-SPEC v1.1 + BoSung v1.2).
 *
 * Mọi con số bắt buộc của spec nằm ở đây để service, job và test dùng chung một nguồn.
 * Tham số có thể đổi khi chạy nằm trong bảng `flashback_settings` (spec v1.2 §9).
 */

/** Vòng đời của một đề (spec v1.2 §5.1). */
export const FLASHBACK_ROUND_STATUSES = ['ready', 'open', 'closing', 'closed', 'paid'] as const;

export type FlashbackRoundStatus = (typeof FLASHBACK_ROUND_STATUSES)[number];

/**
 * Phí tham gia mặc định từ lần thứ hai trở đi (xu). Lần đầu của tài khoản được miễn phí.
 * Phí thật đọc từ `flashback_settings.config.entry_fee_xu` (spec 22-10 §1.14: 0 = miễn phí).
 */
export const FLASHBACK_JOIN_FEE_XU = 100;

/** Phí 0,15% mỗi chiều (mua và bán). */
export const FLASHBACK_FEE_BPS = 15;

/** Thuế 0,1% chỉ tính khi bán. */
export const FLASHBACK_TAX_BPS = 10;

/** Vốn mỗi lượt chơi (VND). */
export const FLASHBACK_INITIAL_CASH_VND = 10_000_000n;

/** Số phiên lịch sử hiện sẵn trên biểu đồ. */
export const FLASHBACK_HISTORY_SESSIONS = 60;

/** Số phiên chơi được mở dần (1 nến mỗi lần bấm "Phiên tiếp"). */
export const FLASHBACK_PLAY_SESSIONS = 60;

/** Số phiên khởi tạo chỉ báo (không vẽ lên biểu đồ). */
export const FLASHBACK_WARMUP_SESSIONS = 252;

/** Tổng số phiên liên tục một giai đoạn cần có: 252 + 60 + 60. */
export const FLASHBACK_TOTAL_SESSIONS =
  FLASHBACK_WARMUP_SESSIONS + FLASHBACK_HISTORY_SESSIONS + FLASHBACK_PLAY_SESSIONS;

/** Một phiên chơi kéo dài 48 giờ. */
export const FLASHBACK_ROUND_DURATION_HOURS = 48;

/** Giờ đổi đề cố định theo giờ Việt Nam (UTC+7). */
export const FLASHBACK_CHANGE_HOUR_UTC7 = 20;

/** Số đề gần nhất bị loại khỏi rổ mã (mã không lặp lại sớm). */
export const FLASHBACK_ROUNDS_BEFORE_SYMBOL_REPEAT = 10;

/** Khi rổ còn dưới 5 mã thì chỉ loại mã của 5 đề gần nhất. */
export const FLASHBACK_MIN_POOL_BEFORE_REPEAT = 5;

/** Mốc sớm nhất của phiên lịch sử đầu tiên. */
export const FLASHBACK_EARLIEST_START_DATE = '2012-01-01';

/** Phiên chơi cuối cùng phải cách hôm nay ít nhất 12 tháng. */
export const FLASHBACK_MIN_MONTHS_AGO = 12;

/** Thanh khoản bình quân tối thiểu của 120 phiên trên biểu đồ (VND/phiên). */
export const FLASHBACK_MIN_LIQUIDITY_VND = 10_000_000_000n;

/** Thanh khoản khi nới điều kiện mức 2 (spec v1.2 §6.3). */
export const FLASHBACK_FALLBACK_LIQUIDITY_VND = 5_000_000_000n;

/** Độ lệch chuẩn lợi suất ngày tối thiểu trong 60 phiên chơi. */
export const FLASHBACK_MIN_DAILY_VOLATILITY = 0.01;

/**
 * Lợi nhuận tối đa của đề: chơi hoàn hảo (biết trước giá) theo đúng luật game phải nằm trong
 * khoảng này. Đề lời quá dễ hoặc quá ít cơ hội đều bị loại. Không nới ở mọi mức dự phòng.
 */
export const FLASHBACK_MIN_MAX_PROFIT = 0.2;
export const FLASHBACK_MAX_MAX_PROFIT = 0.4;

/** Số lần thử ngày bắt đầu tối đa cho mỗi mã. */
export const FLASHBACK_MAX_START_ATTEMPTS = 200;

/** Số phiên liên tục tối đa được phép thiếu (đình chỉ giao dịch). */
export const FLASHBACK_MAX_MISSING_SESSIONS = 5;

/** Số phiên trên biểu đồ được phép có khối lượng bằng 0. */
export const FLASHBACK_MAX_ZERO_VOLUME_SESSIONS = 3;

/** Chu kỳ T+2: mua ở phiên T thì bán được từ phiên T+2. */
export const FLASHBACK_SETTLEMENT_SESSIONS = 2;

/** Số lượng cổ phiếu tối đa trong một lệnh (chống lệnh vô lý). */
export const FLASHBACK_MAX_ORDER_QTY = 1_000_000_000;

/** Thưởng theo hạng cuối cùng (spec v1.1 §2.9). */
export const FLASHBACK_REWARD_TABLE: readonly {
  readonly fromRank: number;
  readonly toRank: number | null;
  readonly xu: number;
}[] = [
  { fromRank: 1, toRank: 1, xu: 1000 },
  { fromRank: 2, toRank: 3, xu: 500 },
  { fromRank: 4, toRank: 10, xu: 200 },
  { fromRank: 11, toRank: 50, xu: 100 },
  { fromRank: 51, toRank: null, xu: 0 },
];

/** Thưởng (xu) theo hạng cuối cùng; hạng ngoài bảng thì không có thưởng. */
export function flashbackRewardForRank(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) return 0;
  for (const tier of FLASHBACK_REWARD_TABLE) {
    if (rank >= tier.fromRank && (tier.toRank === null || rank <= tier.toRank)) return tier.xu;
  }
  return 0;
}

/** Tham số mặc định của spec v1.2 §9 (ghi vào `flashback_settings`). */
export const FLASHBACK_DEFAULT_SETTINGS = {
  round_duration_hours: FLASHBACK_ROUND_DURATION_HOURS,
  change_hour_utc7: FLASHBACK_CHANGE_HOUR_UTC7,
  rounds_before_symbol_repeat: FLASHBACK_ROUNDS_BEFORE_SYMBOL_REPEAT,
  earliest_start_date: FLASHBACK_EARLIEST_START_DATE,
  min_months_ago: FLASHBACK_MIN_MONTHS_AGO,
  warmup_sessions: FLASHBACK_WARMUP_SESSIONS,
  history_sessions: FLASHBACK_HISTORY_SESSIONS,
  play_sessions: FLASHBACK_PLAY_SESSIONS,
  min_liquidity_vnd: Number(FLASHBACK_MIN_LIQUIDITY_VND),
  min_daily_volatility: FLASHBACK_MIN_DAILY_VOLATILITY,
  min_max_profit: FLASHBACK_MIN_MAX_PROFIT,
  max_max_profit: FLASHBACK_MAX_MAX_PROFIT,
  max_start_attempts: FLASHBACK_MAX_START_ATTEMPTS,
  entry_fee_xu: FLASHBACK_JOIN_FEE_XU,
} as const;

/** Đề mở trễ không quá chừng này so với `scheduled_open_at` vẫn coi là mở đúng giờ (FB-01). */
export const FLASHBACK_ON_TIME_GRACE_MS = 5 * 60_000;

/**
 * Biên độ giá HOSE theo ngày (FB-11f). Đã đối chiếu trên nến VCI của 10 mã VN30: tới hết
 * 12/2012 không phiên nào vượt 5%, từ 24/01/2013 có nhiều phiên 6-7%. Mốc đổi ±5% -> ±7% là
 * 15/01/2013.
 */
export const FLASHBACK_HOSE_BAND_CHANGE_DATE = '2013-01-15';

/** Sai số làm tròn cộng thêm vào biên độ khi kiểm tra bước nhảy giá (0,5%). */
export const FLASHBACK_BAND_TOLERANCE = 0.005;

/** Biên độ giá HOSE áp dụng cho phiên `date` (YYYY-MM-DD). */
export function flashbackHosePriceBand(date: string): number {
  return date < FLASHBACK_HOSE_BAND_CHANGE_DATE ? 0.05 : 0.07;
}

/** Số ngày tài khoản phải có để được nhận thưởng (spec v1.1 §2.9). */
export const FLASHBACK_REWARD_MIN_ACCOUNT_DAYS = 7;

/** Điều kiện nhận thưởng (spec v1.1 §2.9): đã xác thực số điện thoại và tạo đủ 7 ngày. */
export function flashbackRewardEligible(
  info: { readonly phoneVerified: boolean; readonly accountCreatedAt: Date } | null | undefined,
  now: Date,
): boolean {
  if (!info || !info.phoneVerified) return false;
  return (
    info.accountCreatedAt.getTime() <=
    now.getTime() - FLASHBACK_REWARD_MIN_ACCOUNT_DAYS * 86_400_000
  );
}

/** Khoá ledger của thưởng một người trong một đề (dùng chung cho trả tự động và duyệt tay). */
export function flashbackRewardLedgerKey(roundId: string, userId: string): string {
  return `flashback_reward:${roundId}:${userId}`;
}

/** Cờ tạm dừng Flashback (spec v1.2 §7): dừng mở đề mới, đề đang mở vẫn chạy. */
export const FLASHBACK_PAUSED_KEY = 'paused';

/** Khóa tham số cấu hình trong `flashback_settings`. */
export const FLASHBACK_CONFIG_KEY = 'config';

/** Khoá tham số vận hành trong `flashback_settings`. */
export const FLASHBACK_BACKOFF_KEY = 'backoff';

/** Số phút tối đa giữa hai lần thử tạo đề (spec v1.2 §6.2). */
export const FLASHBACK_MAX_RETRY_MINUTES = 15;

/** Tên job định kỳ trong runtime. */
export const FLASHBACK_JOB_NAME = 'flashback.round-cycle';
