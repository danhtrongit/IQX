import type { BulletinStatus, SlotNumber, TrackingExitReason } from './bulletin.constants.js';

export type LevelKey = 'r1' | 'r2' | 's1' | 's2' | 'pa' | 'pt' | 'na' | 'nt';
export const LEVEL_KEYS: readonly LevelKey[] = ['r1', 'r2', 's1', 's2', 'pa', 'pt', 'na', 'nt'];

/** Hỗ trợ, kháng cự và hai nhánh kịch bản (spec §6 `levels`); mọi mức là số điểm hoặc null. */
export type Levels = Record<LevelKey, number | null>;

export const EMPTY_LEVELS: Readonly<Levels> = Object.freeze({
  r1: null,
  r2: null,
  s1: null,
  s2: null,
  pa: null,
  pt: null,
  na: null,
  nt: null,
});

export type CommentKey = 'trend' | 'momentum' | 'liquidity';
export const COMMENT_KEYS: readonly CommentKey[] = ['trend', 'momentum', 'liquidity'];
export const COMMENT_LABELS: Readonly<Record<CommentKey, string>> = {
  trend: 'Xu hướng',
  momentum: 'Động lượng',
  liquidity: 'Thanh khoản',
};

/** Ba nhận định do quản trị viên viết. */
export type BulletinContent = Record<CommentKey, string> & { levels: Levels };

/** Nến ngày của VN-Index (điểm, khối lượng là số cổ phiếu khớp). */
export type IndexBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Số liệu cả thị trường (HOSE) của phiên, tính một lần từ kho nến khi dữ liệu chốt. */
export type MarketStats = {
  /** Giá trị giao dịch, tỷ đồng: tổng giá đóng cửa × khối lượng của các mã HOSE có nến ngày T. */
  value_bn: number;
  advances: number;
  unchanged: number;
  declines: number;
  /** Số mã HOSE có nến ngày T (mẫu số của độ rộng). */
  symbols: number;
  source: string;
  computed_at: string;
};

/** Mô hình số liệu VN-Index của một phiên: nến tới T và các chuỗi chỉ báo cùng chỉ số với nến. */
export type VnIndexModel = {
  date: string;
  bars: IndexBar[];
  /** Chỉ số của phiên T trong `bars` (luôn là phần tử cuối). */
  last: number;
  close: number;
  previousClose: number;
  change: number;
  changePct: number;
  /** Số cổ phiếu khớp của phiên T. */
  volume: number;
  volumeMa20: number | null;
  stats: MarketStats | null;
  series: {
    sma20: (number | null)[];
    sma50: (number | null)[];
    sma200: (number | null)[];
    rsi: (number | null)[];
    macd: (number | null)[];
    signal: (number | null)[];
    hist: (number | null)[];
    volumeMa20: (number | null)[];
  };
};

export type SlotPick = {
  symbol: string;
  /** nghìn đồng, giá đóng cửa phiên T. */
  close: number;
  change_pct: number | null;
  /** tỷ đồng, giá trị giao dịch phiên T (cột "GTGD hôm nay"). */
  value_bn: number | null;
};

/** Các cột nến ngày đã chụp của mã có GTGD lớn nhất (60 phiên hiển thị cộng khởi động SMA50). */
export type MiniChartData = {
  symbol: string;
  d: string[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
};

/** Bản chụp một ô bộ lọc khi đẩy (spec §4.4); không tính lại về sau. */
export type SlotSnapshot = {
  slot: SlotNumber;
  trade_date: string;
  display_name: string;
  filter_id: string;
  filter_name: string;
  filter_version: number;
  result_id: string;
  /** Điều kiện in trong bản tin (tóm tắt tiêu chí của Bộ lọc). */
  conditions: string[];
  passed_count: number;
  picks: SlotPick[];
  chart: MiniChartData | null;
  pushed_by: string | null;
  pushed_at: string;
};

export type CheckLevel = 'error' | 'warn' | 'info';

export type BulletinCheck = {
  level: CheckLevel;
  code: string;
  message: string;
  /** Ô nhận định hoặc ô bộ lọc bị lỗi (để tô viền đỏ). */
  field?: CommentKey | 'levels' | 'scenario' | 'data' | `slot${SlotNumber}`;
};

export type BulletinChecks = {
  errors: number;
  warnings: number;
  items: BulletinCheck[];
  checked_at: string;
};

export type BulletinHistoryEntry = {
  action: 'publish' | 'republish' | 'unpublish';
  by: string | null;
  at: string;
  /** Bản PDF đang trên web trước lần này (đã bị thay hoặc gỡ); file cũ vẫn giữ tới khi bản tin hết hạn. */
  previous_revision: number | null;
  /** Bản PDF được tạo lần này (null khi gỡ). */
  revision: number | null;
};

/** Tóm tắt lúc Public: dùng cho danh sách Bản tin cũ và đầu tab, không đọc lại từ số liệu về sau. */
export type PublishedSummary = {
  close: number;
  change: number;
  change_pct: number;
  /** Số mã trong 3 bộ lọc (chỉ đếm mã đã chọn). */
  pick_count: number;
  slot_counts: [number, number, number];
};

export type BulletinRow = {
  trade_date: string;
  status: BulletinStatus;
  data_ready_at: string | null;
  market_stats: MarketStats | null;
  trend: string;
  momentum: string;
  liquidity: string;
  levels: Levels;
  checks: BulletinChecks | null;
  /** Số bản PDF đã tạo (tăng mỗi lần Public hoặc Public lại). */
  revision: number;
  /** Bản PDF đang trên web; null khi chưa Public hoặc đã gỡ. */
  published_revision: number | null;
  published_summary: PublishedSummary | null;
  /** Băm nội dung (nhận định, mức, bộ lọc) ở lần Public gần nhất, để biết có thay đổi chưa đưa lên web. */
  published_hash: string | null;
  /** Danh sách mã của 3 bộ lọc bị khoá từ lần Public đầu tới khi gỡ. */
  slots_locked: boolean;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  /** Lần Public lại gần nhất (null khi chưa Public lại). */
  updated_at: string | null;
  edited_at: string | null;
  edited_by: string | null;
  history: BulletinHistoryEntry[];
};

export type TrackingRow = {
  id: string;
  symbol: string;
  slot: SlotNumber;
  first_trade_date: string;
  /** Giá đóng cửa ngày đề xuất theo chuỗi giá đã điều chỉnh hiện tại (nghìn đồng). */
  entry_price_adj: number;
  source_trade_date: string;
  exit_trade_date: string | null;
  exit_reason: TrackingExitReason | null;
};
