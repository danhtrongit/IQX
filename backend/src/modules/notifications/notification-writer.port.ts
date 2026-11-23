/**
 * Cổng ghi thông báo (update 22-11 §8.1, PLAN D20). Bên gọi truyền chính transaction của mình
 * để tin được ghi cùng lúc commit: lượt lỗi giữa chừng rollback thì không có tin.
 *
 * Hợp đồng với bên gọi:
 * - Bot runner (W3) gọi `botTrades` **trong transaction commit lượt chạy của phiên**, chỉ khi phiên
 *   có ít nhất 1 lệnh khớp. Truyền danh sách rỗng cũng an toàn (không ghi gì, T02).
 * - Chạy lại cùng phiên: khoá duy nhất (user, type, trade_date) làm lần sau thành no-op, không có
 *   tin hay email thứ hai (T03).
 * - KHÔNG gọi khi: chuyển đổi dữ liệu (§11, T11), đổi chiến lược, lưu bản, IQX có bản mới (T12),
 *   lệnh bị chặn, Bot lỗi. Script chuyển đổi không được import cổng này.
 * - Không bao giờ ném lỗi ra transaction của bên gọi: lỗi ghi tin hoặc email được cô lập bằng
 *   SAVEPOINT và ghi log; email lỗi không ảnh hưởng tin trên web.
 */
import type { SqlClient } from '../../platform/database/index.js';

export const NOTIFICATION_WRITER = Symbol('NOTIFICATION_WRITER');

/** Một lệnh đã khớp của phiên. Giá và khối lượng ở đơn vị VND / cổ phiếu. */
export type BotTradeExecution = {
  side: 'buy' | 'sell';
  symbol: string;
  /** Giá khớp, VND. */
  price: number;
  quantity: number;
  /**
   * Lý do của lệnh Bán: `indicator` = Điều kiện Bán, `max_holding` = Hết thời gian giữ.
   * Lệnh Mua luôn là Điều kiện Mua (bỏ qua trường này).
   */
  reason?: 'indicator' | 'max_holding';
};

export type BotTradesNotificationInput = {
  userId: string;
  /** Phiên giao dịch `YYYY-MM-DD`. */
  tradeDate: string;
  executions: readonly BotTradeExecution[];
  /** Nhãn chiến lược đang chạy, vd `Chiến lược của tôi · bản 3` (cho email). */
  strategyLabel?: string | null;
  /** Tài sản Bot sau phiên, VND (cho email). */
  navVnd?: number | null;
};

export type NotificationWriteResult =
  | { created: true; notificationId: string; email: boolean }
  | {
      created: false;
      reason: 'no_executions' | 'disabled' | 'duplicate' | 'user_inactive' | 'error';
    };

export interface NotificationWriter {
  botTrades(tx: SqlClient, input: BotTradesNotificationInput): Promise<NotificationWriteResult>;
}

/** Dữ liệu bản tin khi Public lần đầu (gọi từ `MarketBulletinsService.publish`). */
export type BulletinPublishedInput = {
  tradeDate: string;
  close: number;
  change: number;
  /** Phần trăm, vd 0.85 = +0,85%. */
  changePct: number;
  /** Khối lượng khớp của phiên (cổ phiếu), có thể thiếu. */
  volume: number | null;
  /** Số mã trong 3 bộ lọc. */
  pickCount: number;
};

export const BULLETIN_NOTIFIER = Symbol('BULLETIN_NOTIFIER');

export interface BulletinNotifier {
  /** Gọi trong transaction Public lần đầu; Public lại hoặc gỡ thì không gọi. Không ném lỗi. */
  bulletinPublished(tx: SqlClient, input: BulletinPublishedInput): Promise<{ notified: number }>;
}

export type OfficeNotificationKind =
  | 'office_task_assigned'
  | 'office_task_approved'
  | 'office_task_returned'
  | 'office_task_submitted'
  | 'office_proposal_sent'
  | 'office_proposal_replied';

export type OfficeNotificationInput = {
  userId: string;
  type: OfficeNotificationKind;
  /** Ngày theo giờ Việt Nam (UTC+7), dạng `YYYY-MM-DD`. */
  tradeDate: string;
  title: string;
  body: string;
  link: string;
  payload?: Record<string, unknown>;
};

export const OFFICE_NOTIFIER = Symbol('OFFICE_NOTIFIER');

export interface OfficeNotifier {
  /** Ghi thông báo Khu Văn phòng trong transaction của bên gọi, cô lập lỗi bằng SAVEPOINT. */
  officeNotify(
    tx: SqlClient,
    input: OfficeNotificationInput,
  ): Promise<{ created: boolean; notificationId?: string }>;
}
