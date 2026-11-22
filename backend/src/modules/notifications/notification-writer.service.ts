/**
 * Ghi tin thông báo trong transaction của bên gọi (update 22-11 §8.1, PLAN D20):
 * - `botTrades`: 1 tin "Bot giao dịch" cho một tài khoản một phiên, kèm dòng email chờ gửi khi
 *   tài khoản bật Email và đã xác thực.
 * - `bulletinPublished`: phát tin "Bản tin cuối phiên" tới mọi tài khoản đang hoạt động bằng một
 *   câu `insert … select`, chỉ khi bản tin Public lần đầu.
 * Chống trùng bằng khoá (user, type, trade_date) + `on conflict do nothing`. Mọi lỗi được cô lập
 * bằng SAVEPOINT để không làm hỏng transaction của Bot hay của thao tác Public.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import type { SqlClient } from '../../platform/database/index.js';
import { EmailService } from '../auth/email.service.js';
import type {
  BotTradesNotificationInput,
  BulletinNotifier,
  BulletinPublishedInput,
  NotificationWriteResult,
  NotificationWriter,
} from './notification-writer.port.js';
import {
  botTradesEmail,
  botTradesText,
  bulletinEmail,
  bulletinText,
} from './user-notifications.text.js';

let savepointSequence = 0;

/** Chạy `work` sau một SAVEPOINT: lỗi thì quay lại savepoint, transaction ngoài vẫn dùng được. */
export async function isolated<T>(
  tx: SqlClient,
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  savepointSequence = (savepointSequence + 1) % 1_000_000;
  const name = `iqx_notification_${savepointSequence}`;
  await tx.query(`savepoint ${name}`);
  try {
    const value = await work();
    await tx.query(`release savepoint ${name}`);
    return { ok: true, value };
  } catch (error) {
    await tx.query(`rollback to savepoint ${name}`);
    await tx.query(`release savepoint ${name}`);
    return { ok: false, error };
  }
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown error';

@Injectable()
export class NotificationWriterService implements NotificationWriter, BulletinNotifier {
  private readonly logger = new Logger(NotificationWriterService.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly email: EmailService,
  ) {}

  private appUrl(): string {
    return this.config.get('APP_PUBLIC_URL', { infer: true }) ?? 'http://localhost:5173';
  }

  async botTrades(
    tx: SqlClient,
    input: BotTradesNotificationInput,
  ): Promise<NotificationWriteResult> {
    if (!input.executions.length) return { created: false, reason: 'no_executions' };
    const result = await isolated(tx, () => this.writeBotTrades(tx, input));
    if (!result.ok) {
      this.logger.error(
        `Bot trade notification failed for ${input.userId} ${input.tradeDate}: ${message(result.error)}`,
      );
      return { created: false, reason: 'error' };
    }
    return result.value;
  }

  private async writeBotTrades(
    tx: SqlClient,
    input: BotTradesNotificationInput,
  ): Promise<NotificationWriteResult> {
    const [user] = await tx.query<{
      email: string;
      verified: boolean;
      active: boolean;
      enabled: boolean;
      bot_trades: boolean;
      email_on: boolean;
    }>(
      `select u.email, u.is_email_verified as verified,
              (u.status = 'active' and u.deleted_at is null) as active,
              coalesce(s.enabled, true) as enabled, coalesce(s.bot_trades, true) as bot_trades,
              coalesce(s.email, false) as email_on
         from users u left join user_notification_settings s on s.user_id = u.id
        where u.id = $1`,
      [input.userId],
    );
    if (!user || !user.active) return { created: false, reason: 'user_inactive' };
    if (!user.enabled || !user.bot_trades) return { created: false, reason: 'disabled' };
    const text = botTradesText(input);
    const payload = {
      executions: input.executions.map((item) => ({
        side: item.side,
        symbol: item.symbol,
        price: item.price,
        quantity: item.quantity,
        reason: item.side === 'buy' ? 'indicator' : (item.reason ?? 'indicator'),
      })),
      strategy_label: input.strategyLabel ?? null,
      nav_vnd: input.navVnd ?? null,
    };
    const [row] = await tx.query<{ id: string }>(
      `insert into user_notifications (user_id, type, trade_date, title, body, link, payload)
       values ($1, 'bot_trades', $2::date, $3, $4, $5, $6::jsonb)
       on conflict (user_id, type, trade_date) do nothing
       returning id`,
      [input.userId, input.tradeDate, text.title, text.body, text.link, JSON.stringify(payload)],
    );
    if (!row) return { created: false, reason: 'duplicate' };
    let email = false;
    if (user.email_on && user.verified) {
      // Email lỗi (dựng nội dung hay ghi outbox) không được làm mất tin trên web.
      const queued = await isolated(tx, async () => {
        const content = botTradesEmail(input, this.appUrl());
        await tx.query(
          `insert into user_notification_emails (notification_id, to_email, sender, subject, html)
           values ($1, $2, $3, $4, $5)
           on conflict (notification_id) do nothing`,
          [row.id, user.email, this.email.sender('bot') ?? null, content.subject, content.html],
        );
      });
      email = queued.ok;
      if (!queued.ok)
        this.logger.warn(
          `Bot trade email not queued for ${input.userId}: ${message(queued.error)}`,
        );
    }
    return { created: true, notificationId: row.id, email };
  }

  async bulletinPublished(
    tx: SqlClient,
    input: BulletinPublishedInput,
  ): Promise<{ notified: number }> {
    const text = bulletinText(input);
    let content: { subject: string; html: string } | null = null;
    try {
      content = bulletinEmail(input, this.appUrl());
    } catch (error) {
      this.logger.warn(`Bulletin email content failed: ${message(error)}`);
    }
    const payload = {
      close: input.close,
      change: input.change,
      change_pct: input.changePct,
      volume: input.volume,
      pick_count: input.pickCount,
    };
    const inserted = await isolated(tx, () =>
      tx.query<{ id: string }>(
        `insert into user_notifications (user_id, type, trade_date, title, body, link, payload)
         select u.id, 'bulletin', $1::date, $2, $3, $4, $5::jsonb
           from users u
           left join user_notification_settings s on s.user_id = u.id
          where u.status = 'active' and u.deleted_at is null
            and coalesce(s.enabled, true) and coalesce(s.bulletin, true)
         on conflict (user_id, type, trade_date) do nothing
         returning id`,
        [input.tradeDate, text.title, text.body, text.link, JSON.stringify(payload)],
      ),
    );
    if (!inserted.ok) {
      this.logger.error(
        `Bulletin notification fan-out failed for ${input.tradeDate}: ${message(inserted.error)}`,
      );
      return { notified: 0 };
    }
    const ids = inserted.value.map((row) => row.id);
    let emails = 0;
    if (ids.length && content) {
      // Bước email tách riêng: lỗi ở đây không làm mất tin trên web.
      const queued = await isolated(tx, () =>
        tx.query<{ id: string }>(
          `insert into user_notification_emails (notification_id, to_email, sender, subject, html)
           select n.id, u.email, $2, $3, $4
             from user_notifications n
             join users u on u.id = n.user_id
             join user_notification_settings s on s.user_id = n.user_id
            where n.id = any($1::uuid[]) and s.email and u.is_email_verified
           on conflict (notification_id) do nothing
           returning id`,
          [ids, this.email.sender('bulletin') ?? null, content.subject, content.html],
        ),
      );
      if (queued.ok) emails = queued.value.length;
      else
        this.logger.warn(
          `Bulletin emails not queued for ${input.tradeDate}: ${message(queued.error)}`,
        );
    }
    this.logger.log(
      `Bulletin ${input.tradeDate}: ${ids.length} notifications, ${emails} emails queued`,
    );
    return { notified: ids.length };
  }
}
