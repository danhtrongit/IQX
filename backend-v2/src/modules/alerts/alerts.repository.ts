import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { DEFAULT_ALERT_SIGNALS } from './alerts.catalog.js';
import type { AlertEvent, AlertSignal, ScannableRule, UserAlertRule } from './alerts.types.js';
import type {
  AlertSignalCreateInput,
  AlertSignalUpdateInput,
  UserAlertRuleUpdateInput,
} from './alerts.schemas.js';

type TelegramStatusRow = {
  telegram_chat_id: string | null;
  telegram_linked_at: Date | string | null;
};

@Injectable()
export class AlertsRepository {
  constructor(private readonly database: DatabaseService) {}

  listSignals(enabledOnly = false): Promise<AlertSignal[]> {
    return this.database.query<AlertSignal>(
      `select id, key, side::text as side, ta_name, message_title, combination,
              is_enabled, sort_order, created_at, updated_at
         from alert_signals
        ${enabledOnly ? 'where is_enabled = true' : ''}
        order by sort_order asc, key asc`,
    );
  }

  async findSignal(key: string): Promise<AlertSignal | null> {
    const rows = await this.database.query<AlertSignal>(
      `select id, key, side::text as side, ta_name, message_title, combination,
              is_enabled, sort_order, created_at, updated_at
         from alert_signals where key = $1 limit 1`,
      [key],
    );
    return rows[0] ?? null;
  }

  listRules(userId: string): Promise<UserAlertRule[]> {
    return this.database.query<UserAlertRule>(
      `select id, user_id, name, side::text as side, base_signal_key, combination,
              is_enabled, created_at, updated_at
         from user_alert_rules where user_id = $1
        order by created_at asc, id asc`,
      [userId],
    );
  }

  async findRule(userId: string, ruleId: string): Promise<UserAlertRule | null> {
    const rows = await this.database.query<UserAlertRule>(
      `select id, user_id, name, side::text as side, base_signal_key, combination,
              is_enabled, created_at, updated_at
         from user_alert_rules where user_id = $1 and id = $2 limit 1`,
      [userId, ruleId],
    );
    return rows[0] ?? null;
  }

  async createRule(
    userId: string,
    input: {
      name: string;
      side: 'buy' | 'sell';
      base_signal_key: string | null;
      combination: unknown;
      is_enabled: boolean;
    },
  ): Promise<UserAlertRule> {
    const [row] = await this.database.query<UserAlertRule>(
      `insert into user_alert_rules
         (id, user_id, name, side, base_signal_key, combination, is_enabled, created_at, updated_at)
       values ($1, $2, $3, $4::alert_side, $5, $6::jsonb, $7, now(), now())
       returning id, user_id, name, side::text as side, base_signal_key, combination,
                 is_enabled, created_at, updated_at`,
      [
        randomUUID(),
        userId,
        input.name,
        input.side,
        input.base_signal_key,
        JSON.stringify(input.combination),
        input.is_enabled,
      ],
    );
    if (!row) throw new Error('Failed to create alert rule');
    return row;
  }

  async updateRule(
    userId: string,
    ruleId: string,
    input: UserAlertRuleUpdateInput,
  ): Promise<UserAlertRule | null> {
    const [row] = await this.database.query<UserAlertRule>(
      `update user_alert_rules
          set name = coalesce($3, name),
              combination = coalesce($4::jsonb, combination),
              is_enabled = coalesce($5, is_enabled),
              updated_at = now()
        where user_id = $1 and id = $2
       returning id, user_id, name, side::text as side, base_signal_key, combination,
                 is_enabled, created_at, updated_at`,
      [
        userId,
        ruleId,
        input.name ?? null,
        input.combination ? JSON.stringify(input.combination) : null,
        input.is_enabled ?? null,
      ],
    );
    return row ?? null;
  }

  async deleteRule(userId: string, ruleId: string): Promise<boolean> {
    const rows = await this.database.query<{ id: string }>(
      'delete from user_alert_rules where user_id = $1 and id = $2 returning id',
      [userId, ruleId],
    );
    return rows.length > 0;
  }

  listEvents(userId: string, limit = 50): Promise<AlertEvent[]> {
    return this.database.query<AlertEvent>(
      `select id, user_id, rule_id, symbol, signal_key, session_date, fired_at,
              price, delivered, delivery_error, created_at, updated_at
         from alert_events where user_id = $1
        order by fired_at desc, id desc limit $2`,
      [userId, limit],
    );
  }

  async telegramStatus(userId: string): Promise<TelegramStatusRow> {
    const [row] = await this.database.query<TelegramStatusRow>(
      'select telegram_chat_id, telegram_linked_at from users where id = $1 limit 1',
      [userId],
    );
    return row ?? { telegram_chat_id: null, telegram_linked_at: null };
  }

  async unlinkTelegram(userId: string): Promise<void> {
    await this.database.query(
      `update users set telegram_chat_id = null, telegram_linked_at = null,
                        updated_at = now() where id = $1`,
      [userId],
    );
  }

  async linkTelegram(userId: string, chatId: string): Promise<boolean> {
    const rows = await this.database.query<{ id: string }>(
      `update users set telegram_chat_id = $2, telegram_linked_at = now(), updated_at = now()
        where id = $1 and status = 'active' returning id`,
      [userId, chatId],
    );
    return rows.length > 0;
  }

  async createSignal(input: AlertSignalCreateInput, adminId: string): Promise<AlertSignal | null> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<AlertSignal>(
        `insert into alert_signals
           (id, key, side, ta_name, message_title, combination, is_enabled, sort_order, created_at, updated_at)
         values ($1, $2, $3::alert_side, $4, $5, $6::jsonb, $7, $8, now(), now())
         on conflict (key) do nothing
         returning id, key, side::text as side, ta_name, message_title, combination,
                   is_enabled, sort_order, created_at, updated_at`,
        [
          randomUUID(),
          input.key,
          input.side,
          input.ta_name,
          input.message_title,
          JSON.stringify(input.combination),
          input.is_enabled,
          input.sort_order,
        ],
      );
      if (!rows[0]) return null;
      await this.audit(tx, adminId, 'alert.signal_create', input.key, input);
      return rows[0];
    });
  }

  async updateSignal(
    key: string,
    input: AlertSignalUpdateInput,
    adminId: string,
  ): Promise<AlertSignal | null> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<AlertSignal>(
        `update alert_signals
            set side = $2::alert_side, ta_name = $3, message_title = $4,
                combination = $5::jsonb, is_enabled = $6, sort_order = $7,
                updated_at = now()
          where key = $1
         returning id, key, side::text as side, ta_name, message_title, combination,
                   is_enabled, sort_order, created_at, updated_at`,
        [
          key,
          input.side,
          input.ta_name,
          input.message_title,
          JSON.stringify(input.combination),
          input.is_enabled,
          input.sort_order,
        ],
      );
      if (!rows[0]) return null;
      await this.audit(tx, adminId, 'alert.signal_update', key, input);
      return rows[0];
    });
  }

  async deleteSignal(key: string, adminId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<{ id: string }>(
        'delete from alert_signals where key = $1 returning id',
        [key],
      );
      if (!rows.length) return false;
      await this.audit(tx, adminId, 'alert.signal_delete', key, {});
      return true;
    });
  }

  seedSignals(overwrite: boolean, adminId: string): Promise<number> {
    return this.database.transaction(async (tx) => {
      let changed = 0;
      for (const signal of DEFAULT_ALERT_SIGNALS) {
        const rows = await tx.query<{ inserted: boolean }>(
          `insert into alert_signals
             (id, key, side, ta_name, message_title, combination, is_enabled, sort_order, created_at, updated_at)
           values ($1, $2, $3::alert_side, $4, $5, $6::jsonb, true, $7, now(), now())
           on conflict (key) do ${
             overwrite
               ? `update set side = excluded.side, ta_name = excluded.ta_name,
                          message_title = excluded.message_title, combination = excluded.combination,
                          sort_order = excluded.sort_order, updated_at = now()`
               : 'nothing'
           }
           returning (xmax = 0) as inserted`,
          [
            randomUUID(),
            signal.key,
            signal.side,
            signal.ta_name,
            signal.message_title,
            JSON.stringify(signal.combination),
            signal.sort_order,
          ],
        );
        if (rows.length) changed += 1;
      }
      await this.audit(tx, adminId, 'alert.signal_seed', 'defaults', { overwrite, changed });
      return changed;
    });
  }

  listScannableRules(): Promise<ScannableRule[]> {
    return this.database.query<ScannableRule>(
      `select r.id, r.user_id, r.name, r.side::text as side, r.base_signal_key,
              r.combination, r.is_enabled, r.created_at, r.updated_at,
              u.telegram_chat_id,
              coalesce(array_remove(array_agg(distinct upper(w.symbol)), null), '{}') as symbols
         from user_alert_rules r
         join users u on u.id = r.user_id and u.status = 'active'
         left join watchlist_items w on w.user_id = r.user_id
        where r.is_enabled = true
          and (
            u.role = 'admin'
            or exists (
              select 1
                from billing_entitlement_grants g
               where g.user_id = u.id
                 and g.status = 'active'
                 and g.starts_at <= now()
                 and now() < g.ends_at
            )
          )
        group by r.id, u.telegram_chat_id
        order by r.user_id, r.id`,
    );
  }

  async recordFire(input: {
    userId: string;
    ruleId: string;
    symbol: string;
    signalKey: string | null;
    sessionDate: string;
    firedAt: Date;
    price: number;
    cooldownSeconds: number;
  }): Promise<AlertEvent | null> {
    return this.database.transaction(async (tx) => {
      const identity = `${input.userId}:${input.ruleId}:${input.symbol}`;
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);
      const recent = await tx.query<{ id: string }>(
        `select id from alert_events
          where user_id = $1 and rule_id = $2 and symbol = $3
            and (session_date = $4::date or fired_at > $5::timestamptz - ($6 * interval '1 second'))
          limit 1`,
        [
          input.userId,
          input.ruleId,
          input.symbol,
          input.sessionDate,
          input.firedAt.toISOString(),
          input.cooldownSeconds,
        ],
      );
      if (recent.length) return null;
      const rows = await tx.query<AlertEvent>(
        `insert into alert_events
           (id, user_id, rule_id, symbol, signal_key, session_date, fired_at, price,
            delivered, delivery_error, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::date, $7, $8, false, null, now(), now())
         on conflict (user_id, rule_id, symbol, session_date) do nothing
         returning id, user_id, rule_id, symbol, signal_key, session_date, fired_at,
                   price, delivered, delivery_error, created_at, updated_at`,
        [
          randomUUID(),
          input.userId,
          input.ruleId,
          input.symbol,
          input.signalKey,
          input.sessionDate,
          input.firedAt,
          input.price,
        ],
      );
      return rows[0] ?? null;
    });
  }

  async markDelivery(eventId: string, delivered: boolean, error: string | null): Promise<void> {
    await this.database.query(
      `update alert_events set delivered = $2, delivery_error = $3, updated_at = now()
        where id = $1 and delivered = false`,
      [eventId, delivered, error?.slice(0, 300) ?? null],
    );
  }

  listPendingDeliveries(
    limit = 100,
  ): Promise<
    Array<AlertEvent & { telegram_chat_id: string; rule_name: string; side: 'buy' | 'sell' }>
  > {
    return this.database.query(
      `select e.*, u.telegram_chat_id, r.name as rule_name, r.side::text as side
         from alert_events e
         join users u on u.id = e.user_id
         join user_alert_rules r on r.id = e.rule_id
        where e.delivered = false and u.telegram_chat_id is not null
        order by e.fired_at asc limit $1`,
      [limit],
    );
  }

  private async audit(
    tx: SqlClient,
    adminId: string,
    action: string,
    key: string,
    payload: unknown,
  ): Promise<void> {
    await tx.query(
      `insert into admin_audit_log
         (id, admin_user_id, action, target_entity, target_id, payload_after, note, created_at)
       values ($1, $2, $3, 'alert_signal', $4, $5::jsonb, $6, now())`,
      [randomUUID(), adminId, action, key, JSON.stringify(payload), `${action} ${key}`],
    );
  }
}
