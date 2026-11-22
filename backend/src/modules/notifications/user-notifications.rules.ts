/**
 * Quy tắc thuần của thông báo: chuẩn hoá cài đặt (§8.2) và token tắt thông báo ký HMAC (§8.4,
 * PLAN D21). Token = `<email row id>.<chữ ký>`; dùng một lần do cột `unsubscribe_used_at`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type NotificationSettings = {
  enabled: boolean;
  bulletin: boolean;
  bot_trades: boolean;
  email: boolean;
};

/** Không có dòng cài đặt = mặc định: tổng bật, 2 loại bật, Email tắt. */
export const DEFAULT_NOTIFICATION_SETTINGS: Readonly<NotificationSettings> = Object.freeze({
  enabled: true,
  bulletin: true,
  bot_trades: true,
  email: false,
});

/**
 * Áp quy tắc công tắc (§8.2): bật lại tổng khi cả hai loại đang tắt thì bật cả hai; tắt cả hai
 * loại thì tổng tự tắt.
 */
export function normalizeSettings(
  previous: NotificationSettings,
  next: NotificationSettings,
): NotificationSettings {
  const result = { ...next };
  if (!result.bulletin && !result.bot_trades) {
    if (result.enabled && !previous.enabled) {
      result.bulletin = true;
      result.bot_trades = true;
    } else {
      result.enabled = false;
    }
  }
  return result;
}

/** Tắt đúng một loại (link trong email); hai loại cùng tắt thì tắt luôn tổng. */
export function disableType(
  settings: NotificationSettings,
  type: 'bulletin' | 'bot_trades',
): NotificationSettings {
  const result = { ...settings, [type]: false };
  if (!result.bulletin && !result.bot_trades) result.enabled = false;
  return result;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function signature(secret: string, emailId: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${emailId}`).digest('base64url');
}

export function signUnsubscribeToken(secret: string, emailId: string): string {
  return `${emailId}.${signature(secret, emailId)}`;
}

/** Trả id dòng email khi token đúng chữ ký, ngược lại `null`. */
export function verifyUnsubscribeToken(secret: string, token: string): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const emailId = token.slice(0, dot).toLowerCase();
  const given = Buffer.from(token.slice(dot + 1));
  if (!UUID.test(emailId)) return null;
  const expected = Buffer.from(signature(secret, emailId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return emailId;
}
