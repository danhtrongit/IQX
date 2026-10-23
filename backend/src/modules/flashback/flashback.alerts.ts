/**
 * Kênh cảnh báo kỹ thuật của Flashback (spec 22-10 FB-09, BoSung §6.1).
 *
 * Cảnh báo luôn được ghi vào `flashback_job_log` (step `alert`) như trước. Ngoài ra, khi cấu hình
 * cả `TELEGRAM_BOT_TOKEN` và `OPS_ALERT_TELEGRAM_CHAT_ID`, cảnh báo được gửi tới nhóm Telegram kỹ
 * thuật qua bot đang có. Thiếu một trong hai thì chỉ ghi log. Gửi lỗi không bao giờ làm hỏng tác
 * vụ: lỗi chỉ được ghi log của Nest.
 *
 * Nội dung chỉ có số đề, trạng thái, mức và lỗi; KHÔNG có mã hay giai đoạn của đề.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { FLASHBACK_ALERT_LEVEL_LABELS, type FlashbackAlertLevel } from './flashback.repository.js';

/** Token của kênh cảnh báo kỹ thuật. */
export const FLASHBACK_OPS_ALERTS = Symbol('FLASHBACK_OPS_ALERTS');

/** Một cảnh báo gửi ra kênh kỹ thuật. */
export interface FlashbackOpsAlert {
  readonly level: FlashbackAlertLevel;
  readonly message: string;
  readonly roundNo?: number | null;
  readonly roundStatus?: string | null;
}

/** Cổng gửi cảnh báo (để test thay bằng bản giả). Không bao giờ ném lỗi. */
export interface FlashbackOpsAlertPort {
  send(alert: FlashbackOpsAlert): Promise<void>;
}

/** Thời gian chờ tối đa khi gọi Telegram, để tác vụ mỗi phút không bị treo. */
const TELEGRAM_TIMEOUT_MS = 5_000;

/** Văn bản cảnh báo: `[IQX Flashback] Mức Cao · Đề #12 (open)` rồi nội dung. */
export function formatFlashbackOpsAlert(alert: FlashbackOpsAlert): string {
  const parts = [`[IQX Flashback] Mức ${FLASHBACK_ALERT_LEVEL_LABELS[alert.level]}`];
  if (alert.roundNo !== null && alert.roundNo !== undefined) {
    parts.push(`Đề #${alert.roundNo}${alert.roundStatus ? ` (${alert.roundStatus})` : ''}`);
  }
  return `${parts.join(' · ')}\n${alert.message}`.slice(0, 3_500);
}

@Injectable()
export class TelegramFlashbackOpsAlerts implements FlashbackOpsAlertPort {
  private readonly logger = new Logger(TelegramFlashbackOpsAlerts.name);
  private readonly token: string | undefined;
  private readonly chatId: string | undefined;

  constructor(@Optional() config?: ConfigService<Environment, true>) {
    this.token = config?.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.chatId = config?.get('OPS_ALERT_TELEGRAM_CHAT_ID', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.chatId);
  }

  async send(alert: FlashbackOpsAlert): Promise<void> {
    if (!this.token || !this.chatId) return;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: formatFlashbackOpsAlert(alert),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Flashback: gửi cảnh báo Telegram lỗi (HTTP ${response.status})`);
      }
    } catch (error) {
      // Không ghi URL hay token: thông báo lỗi của fetch có thể chứa đường dẫn có token.
      this.logger.warn(
        `Flashback: không gửi được cảnh báo Telegram (${error instanceof Error ? error.name : 'lỗi'})`,
      );
    }
  }
}

/** Kênh rỗng: chỉ ghi log (dùng khi không có cấu hình hoặc trong test). */
export const noopFlashbackOpsAlerts: FlashbackOpsAlertPort = { send: async () => undefined };
