import type { StoredColumns } from '../market-integration/daily-bars.service.js';
import {
  TRACKING_MAX_SESSIONS,
  TRACKING_STOP_RATIO,
  type TrackingExitReason,
} from './bulletin.constants.js';

export type TrackingEvaluation = {
  /** Giá đóng cửa ngày đề xuất theo chuỗi giá đã điều chỉnh hiện tại (nghìn đồng). */
  entry: number;
  /** Giá đóng cửa mới nhất (nghìn đồng); null khi mã không còn chuỗi giá. */
  price: number | null;
  /** Số phiên giao dịch từ ngày đề xuất (ngày đề xuất = 0). */
  sessions: number;
  returnPct: number | null;
  /** Phiên mã rời danh sách (đã tới hạn 20 phiên hoặc chạm dừng lỗ); null khi vẫn theo dõi. */
  exit: { date: string; reason: Exclude<TrackingExitReason, 'unpublished'> } | null;
};

const closeAt = (series: StoredColumns, date: string): number | null => {
  const index = series.d.indexOf(date);
  if (index < 0) return null;
  const value = series.c[index];
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Quy tắc theo dõi của spec §5.3, thuần hàm (không đọc cơ sở dữ liệu) để server dùng chung cho job lẫn API.
 *
 * - Giá ngày đề xuất lấy lại từ chuỗi giá đã điều chỉnh hiện tại, nên một lần chia cổ tức hay tách cổ phiếu điều
 *   chỉnh giá ngày đề xuất cùng hệ số với cả chuỗi.
 * - `sessionDates`: các phiên giao dịch của thị trường (VN-Index) tăng dần tới phiên mới nhất đã chốt.
 * - Phiên thứ 21 trở đi mã rời danh sách; phiên nào đóng cửa <= 93% giá đề xuất thì rời từ phiên đó. Phiên nào tới
 *   trước thì tính trước.
 */
export function evaluateTracking(
  row: { firstTradeDate: string; entryPrice: number },
  series: StoredColumns | null,
  sessionDates: readonly string[],
): TrackingEvaluation {
  const entry = (series ? closeAt(series, row.firstTradeDate) : null) ?? row.entryPrice;
  const after = sessionDates.filter((date) => date > row.firstTradeDate);
  let exit: TrackingEvaluation['exit'] = null;
  for (let i = 0; i < after.length && !exit; i += 1) {
    const date = after[i]!;
    if (i + 1 > TRACKING_MAX_SESSIONS) {
      exit = { date, reason: '20_sessions' };
      break;
    }
    const close = series ? closeAt(series, date) : null;
    if (close !== null && close <= entry * TRACKING_STOP_RATIO) exit = { date, reason: 'stop_7' };
  }
  const lastIndex = series ? series.c.length - 1 : -1;
  const price =
    lastIndex >= 0 && Number.isFinite(series!.c[lastIndex]!) ? series!.c[lastIndex]! : null;
  return {
    entry,
    price,
    sessions: after.length,
    returnPct: price === null ? null : (price / entry - 1) * 100,
    exit,
  };
}

export type TrackingSummary = {
  /** Số mã đang theo dõi (gồm mã đề xuất hôm nay). */
  tracking_count: number;
  today_count: number;
  /** a / b: mã đang có lãi trên mã có số phiên >= 1. */
  profit_count: number;
  profit_base: number;
  /** Trung bình cộng lợi nhuận (%) của các mã có số phiên >= 1; null khi không có mã nào. */
  average_return: number | null;
  /** Trung bình % thay đổi VN-Index từ ngày đề xuất của từng mã tới hôm nay. */
  index_return: number | null;
};

export function summarizeTracking(
  items: ReadonlyArray<{
    sessions: number;
    returnPct: number | null;
    indexReturnPct: number | null;
  }>,
): TrackingSummary {
  const aged = items.filter((item) => item.sessions >= 1 && item.returnPct !== null);
  const mean = (values: readonly number[]): number | null =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    tracking_count: items.length,
    today_count: items.filter((item) => item.sessions === 0).length,
    profit_count: aged.filter((item) => item.returnPct! > 0).length,
    profit_base: aged.length,
    average_return: mean(aged.map((item) => item.returnPct!)),
    index_return: mean(
      aged.map((item) => item.indexReturnPct).filter((value): value is number => value !== null),
    ),
  };
}
