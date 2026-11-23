/**
 * Cài đặt thông báo, hộp tin (chuông) và link tắt thông báo (update 22-11 §8.2, §8.3, §8.5).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  disableType,
  normalizeSettings,
  verifyUnsubscribeToken,
  type NotificationSettings,
} from './user-notifications.rules.js';
import type {
  MarkReadInput,
  NotificationItem,
  NotificationSettingsInput,
  NotificationSettingsView,
  UnsubscribeResult,
} from './user-notifications.schemas.js';
import type { NotificationType } from './user-notifications.text.js';

/** Khoá dùng ở dev/test khi chưa đặt NOTIFICATION_TOKEN_SECRET (production bắt buộc đặt). */
const DEV_TOKEN_SECRET = 'iqx-dev-notification-token-secret-not-for-production';

export function notificationTokenSecret(config: ConfigService<Environment, true>): string {
  return config.get('NOTIFICATION_TOKEN_SECRET', { infer: true }) ?? DEV_TOKEN_SECRET;
}

type SettingsRow = {
  enabled: boolean;
  bulletin: boolean;
  bot_trades: boolean;
  email: boolean;
  updated_at: Date | string | null;
  is_email_verified: boolean;
};

type ItemRow = {
  id: string;
  type: NotificationType;
  trade_date: string;
  title: string;
  body: string;
  link: string;
  read_at: Date | string | null;
  created_at: Date | string;
};

const iso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

const tokenInvalid = () =>
  new BadRequestException({
    code: 'TOKEN_INVALID',
    message: 'Link tắt thông báo không hợp lệ.',
  });

@Injectable()
export class UserNotificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  // ───────────── cài đặt ─────────────

  async settings(userId: string): Promise<NotificationSettingsView> {
    const row = await this.loadSettings(this.database, userId, false);
    return view(row);
  }

  async saveSettings(
    userId: string,
    input: NotificationSettingsInput,
  ): Promise<NotificationSettingsView> {
    return this.database.transaction(async (tx) => {
      const current = await this.loadSettings(tx, userId, true);
      if (input.channels.email && !current.is_email_verified)
        throw new UnprocessableEntityException({
          code: 'EMAIL_UNVERIFIED',
          message: 'Chưa có email',
        });
      const next = normalizeSettings(current, {
        enabled: input.enabled,
        bulletin: input.types.bulletin,
        bot_trades: input.types.bot_trades,
        email: input.channels.email,
      });
      const saved = await this.upsert(tx, userId, next);
      return view({ ...saved, is_email_verified: current.is_email_verified });
    });
  }

  // ───────────── hộp tin ─────────────

  async list(
    userId: string,
    limit = 50,
  ): Promise<{ items: NotificationItem[]; unread_count: number }> {
    const rows = await this.database.query<ItemRow>(
      `select id, type, trade_date, title, body, link, read_at, created_at
         from user_notifications
        where user_id = $1
        order by created_at desc, id desc
        limit $2`,
      [userId, Math.min(Math.max(limit, 1), 50)],
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        trade_date: String(row.trade_date),
        title: row.title,
        body: row.body,
        link: row.link,
        read_at: iso(row.read_at),
        created_at: iso(row.created_at)!,
      })),
      unread_count: await this.unreadCount(userId),
    };
  }

  async unreadCount(userId: string, client: SqlClient = this.database): Promise<number> {
    const [row] = await client.query<{ count: string }>(
      'select count(*)::text as count from user_notifications where user_id = $1 and read_at is null',
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  async markRead(userId: string, input: MarkReadInput): Promise<{ unread_count: number }> {
    if ('id' in input) {
      const rows = await this.database.query<{ id: string }>(
        `update user_notifications set read_at = coalesce(read_at, now())
          where id = $1 and user_id = $2 returning id`,
        [input.id, userId],
      );
      if (!rows.length)
        throw new NotFoundException({
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Không tìm thấy thông báo.',
        });
    } else {
      await this.database.query(
        'update user_notifications set read_at = now() where user_id = $1 and read_at is null',
        [userId],
      );
    }
    return { unread_count: await this.unreadCount(userId) };
  }

  // ───────────── tắt thông báo từ email ─────────────

  async unsubscribe(token: string): Promise<UnsubscribeResult> {
    const emailId = verifyUnsubscribeToken(notificationTokenSecret(this.config), token);
    if (!emailId) throw tokenInvalid();
    return this.database.transaction(async (tx) => {
      const [row] = await tx.query<{
        used: Date | null;
        type: NotificationType;
        user_id: string;
      }>(
        `select e.unsubscribe_used_at as used, n.type, n.user_id
           from user_notification_emails e
           join user_notifications n on n.id = e.notification_id
          where e.id = $1
          for update of e`,
        [emailId],
      );
      if (!row) throw tokenInvalid();
      if (row.type !== 'bulletin' && row.type !== 'bot_trades') throw tokenInvalid();
      if (row.used) return { type: row.type, status: 'already_used' };
      await tx.query(
        'update user_notification_emails set unsubscribe_used_at = now() where id = $1',
        [emailId],
      );
      const current = await this.loadSettings(tx, row.user_id, true);
      await this.upsert(tx, row.user_id, disableType(current, row.type));
      return { type: row.type, status: 'unsubscribed' };
    });
  }

  // ───────────── SQL ─────────────

  private async loadSettings(
    client: SqlClient,
    userId: string,
    lock: boolean,
  ): Promise<SettingsRow> {
    const [row] = await client.query<SettingsRow & { has_row: boolean }>(
      `select s.user_id is not null as has_row, s.enabled, s.bulletin, s.bot_trades, s.email,
              s.updated_at, u.is_email_verified
         from users u
         left join user_notification_settings s on s.user_id = u.id
        where u.id = $1${lock ? ' for update of u' : ''}`,
      [userId],
    );
    if (!row)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản.' });
    if (!row.has_row)
      return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        updated_at: null,
        is_email_verified: row.is_email_verified,
      };
    return row;
  }

  private async upsert(
    client: SqlClient,
    userId: string,
    settings: NotificationSettings,
  ): Promise<SettingsRow> {
    const [row] = await client.query<SettingsRow>(
      `insert into user_notification_settings (user_id, enabled, bulletin, bot_trades, email, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (user_id) do update
         set enabled = excluded.enabled, bulletin = excluded.bulletin,
             bot_trades = excluded.bot_trades, email = excluded.email, updated_at = now()
       returning enabled, bulletin, bot_trades, email, updated_at, false as is_email_verified`,
      [userId, settings.enabled, settings.bulletin, settings.bot_trades, settings.email],
    );
    return row!;
  }
}

function view(row: SettingsRow): NotificationSettingsView {
  return {
    enabled: row.enabled,
    types: { bulletin: row.bulletin, bot_trades: row.bot_trades },
    // Email chỉ có hiệu lực khi tài khoản có email đã xác thực.
    channels: { web: true, email: row.email && row.is_email_verified },
    email_available: row.is_email_verified,
    updated_at: iso(row.updated_at),
  };
}
