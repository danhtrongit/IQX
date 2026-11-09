/**
 * Bản tin thị trường v4 (spec IQX-Ban-Tin-SPEC.md): hằng số dùng chung của backend.
 * Ghi chú quyết định và bàn giao: backend/docs/ban-tin-v4/HANDOFF.md.
 */

export const BULLETIN_SLOT_NUMBERS = [1, 2, 3] as const;
export type SlotNumber = (typeof BULLETIN_SLOT_NUMBERS)[number];

/** Số mã tối đa mỗi bộ lọc trong bản tin (spec §1.3, §4.3). */
export const MAX_PICKS_PER_SLOT = 10;
/** Số ký tự tối đa của mỗi ô nhận định (spec §3.4 bước 2). */
export const MAX_COMMENT_CHARS = 420;
/** Tên hiển thị của bộ lọc trong bản tin (spec §4.3). */
export const MAX_DISPLAY_NAME_CHARS = 60;
/** Số dòng điều kiện in trong bản tin và độ dài mỗi dòng (bản chụp từ Bộ lọc, spec §4.4). */
export const MAX_CONDITION_LINES = 16;
export const MAX_CONDITION_CHARS = 160;

/** Bản tin quá hạn này tự xoá khỏi web, khỏi danh sách Quản trị và xoá file PDF (spec §5.2). */
export const BULLETIN_RETENTION_MONTHS = 6;

/** Theo dõi: 20 phiên, dừng lỗ khi đóng cửa ≤ 93% giá ngày đề xuất (spec §5.3). */
export const TRACKING_MAX_SESSIONS = 20;
export const TRACKING_STOP_RATIO = 0.93;

/** Chuỗi VN-Index: mã trong kho, số phiên giữ lại và số phiên vẽ (spec §1.2). */
export const VNINDEX_SYMBOL = 'VNINDEX';
export const INDEX_RETAINED_SESSIONS = 520;
export const CHART_SESSIONS_DESKTOP = 50;
export const CHART_SESSIONS_MOBILE = 40;
/** Biểu đồ mini mỗi bộ lọc: 60 phiên nến cộng 49 phiên khởi động cho SMA50. */
export const MINI_CHART_SESSIONS = 60;
export const MINI_CHART_WARMUP = 49;
/** Mức kịch bản cách giá quá xa không kéo giãn trục giá (spec §1.2) và ngưỡng lưu ý (spec §3.5). */
export const AXIS_NEAR_RATIO = 0.08;
export const LEVEL_FAR_WARNING_RATIO = 0.15;
export const SUGGESTION_MIN_DISTANCE_RATIO = 0.003;

/**
 * Mẫu đường dẫn Demo trading của một mã (spec §1.4, §9 điểm 3). `view=chart` của spec không phải id công cụ
 * của trang (`demoChrome`): trang đọc `view=trading` (Đặt lệnh) và `symbol`, tab Biểu đồ là mặc định. Đường dẫn
 * này trùng liên kết "Demo Trading" của thanh điều hướng, chỉ thêm `symbol`.
 */
export const DEMO_TRADING_LINK = 'https://iqx.vn/demo-trading?view=trading&symbol={SYMBOL}';

export function demoTradingUrl(symbol: string): string {
  return DEMO_TRADING_LINK.replace('{SYMBOL}', encodeURIComponent(symbol));
}

/**
 * Khổ giấy (spec §1.1, §9 điểm 4), đơn vị px CSS ở 96 dpi, trùng HTML mẫu:
 * máy tính A4 ngang 297 × 210 mm (vừa cột nội dung 1180 px của trang Thị trường),
 * điện thoại 105 × 187 mm (tỷ lệ 9:16, 397 px, thu về còn khoảng 358 px vẫn đọc được trên màn 390 px).
 */
export const PAGE_SIZES = {
  desktop: { width: 1123, height: 794 },
  mobile: { width: 397, height: 707 },
} as const;
export type BulletinVariant = keyof typeof PAGE_SIZES;

/** Một điểm px CSS bằng 0,75 pt của PDF. */
export const PX_TO_PT = 0.75;

export const BULLETIN_STATUSES = ['draft', 'public', 'unpublic'] as const;
export type BulletinStatus = (typeof BULLETIN_STATUSES)[number];

export const TRACKING_EXIT_REASONS = ['20_sessions', 'stop_7', 'unpublished'] as const;
export type TrackingExitReason = (typeof TRACKING_EXIT_REASONS)[number];
