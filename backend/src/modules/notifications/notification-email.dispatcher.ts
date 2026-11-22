/**
 * Gửi email thông báo từ outbox `user_notification_emails` (update 22-11 §8.4, PLAN D13).
 * Job `notifications.email-dispatch` gọi `dispatch()` mỗi phút. Mỗi dòng thử tối đa 3 lần (lần 2
 * sau 1 phút, lần 3 sau 5 phút), rồi `failed`. Dòng chờ quá 24 giờ thì `skipped` (không gửi tin cũ
 * khi vừa bật EMAIL_ENABLED). Gửi lỗi chỉ ghi log và trạng thái dòng email; tin trên web không đổi.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { DatabaseService } from '../../platform/database/index.js';
import { EmailService } from '../auth/email.service.js';
import type { JobOutcome } from '../runtime/runtime.types.js';
import { signUnsubscribeToken } from './user-notifications.rules.js';
import { notificationTokenSecret } from './user-notifications.service.js';
import { UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl } from './user-notifications.text.js';

export const NOTIFICATIONS_EMAIL_DISPATCH_JOB = 'notifications.email-dispatch';

export const EMAIL_MAX_ATTEMPTS = 3;
/** Chờ trước lần thử thứ 2, thứ 3 (ms). */
const RETRY_DELAYS_MS = [60_000, 300_000];
/** Khoá dòng đang gửi để hai tiến trình không gửi trùng. */
const CLAIM_MS = 300_000;
const STALE_MS = 24 * 3_600_000;
const BATCH = 50;

type ClaimedRow = {
  id: string;
  to_email: string;
  sender: string | null;
  subject: string;
  html: string;
  attempts: number;
};

@Injectable()
export class NotificationEmailDispatcher {
  private readonly logger = new Logger(NotificationEmailDispatcher.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async dispatch(now = new Date()): Promise<JobOutcome> {
    if (!this.email.isEnabled()) return { status: 'skipped', reason: 'email-disabled' };
    const stale = await this.database.query<{ id: string }>(
      `update user_notification_emails
          set status = 'skipped', last_error = 'stale'
        where status = 'pending' and created_at < $1
        returning id`,
      [new Date(now.getTime() - STALE_MS)],
    );
    const claimed = await this.database.query<ClaimedRow>(
      `update user_notification_emails e
          set attempts = e.attempts + 1, next_attempt_at = $2
        where e.id in (
          select id from user_notification_emails
           where status = 'pending' and attempts < $3
             and (next_attempt_at is null or next_attempt_at <= $1)
           order by created_at
           limit $4
           for update skip locked)
        returning e.id, e.to_email, e.sender, e.subject, e.html, e.attempts`,
      [now, new Date(now.getTime() + CLAIM_MS), EMAIL_MAX_ATTEMPTS, BATCH],
    );
    if (!claimed.length && !stale.length) return { status: 'skipped', reason: 'nothing-pending' };

    const appUrl = this.config.get('APP_PUBLIC_URL', { infer: true }) ?? 'http://localhost:5173';
    const secret = notificationTokenSecret(this.config);
    let sent = 0;
    let retried = 0;
    let failed = 0;
    for (const row of claimed) {
      const html = row.html
        .split(UNSUBSCRIBE_PLACEHOLDER)
        .join(unsubscribeUrl(appUrl, signUnsubscribeToken(secret, row.id)));
      const result = await this.email.deliver({
        to: row.to_email,
        subject: row.subject,
        html,
        ...(row.sender ? { from: row.sender } : {}),
      });
      if (result.status === 'sent') {
        sent += 1;
        await this.database.query(
          `update user_notification_emails
              set status = 'sent', sent_at = now(), last_error = null, next_attempt_at = null
            where id = $1`,
          [row.id],
        );
        continue;
      }
      const error = result.status === 'failed' ? result.error : result.status;
      if (row.attempts >= EMAIL_MAX_ATTEMPTS) {
        failed += 1;
        this.logger.warn(
          `Notification email ${row.id} failed after ${row.attempts} attempts: ${error}`,
        );
        await this.database.query(
          `update user_notification_emails
              set status = 'failed', last_error = $2, next_attempt_at = null
            where id = $1`,
          [row.id, error.slice(0, 500)],
        );
      } else {
        retried += 1;
        const delay = RETRY_DELAYS_MS[row.attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!;
        await this.database.query(
          'update user_notification_emails set last_error = $2, next_attempt_at = $3 where id = $1',
          [row.id, error.slice(0, 500), new Date(now.getTime() + delay)],
        );
      }
    }
    return {
      status: 'completed',
      detail: { claimed: claimed.length, sent, retried, failed, stale: stale.length },
    };
  }
}
