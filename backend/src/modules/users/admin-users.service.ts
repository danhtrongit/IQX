import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import {
  AcademyProgressReader,
  type AcademyProgressDetail,
} from '../academy/academy-progress-reader.service.js';
import { AuthService } from '../auth/index.js';
import { LIFETIME_THRESHOLD } from '../billing/entitlement-state.js';
import { recordAudit, type AuditContext } from './audit.js';
import {
  memberPerformance,
  type BotPerformance,
  type DemoTradingPerformance,
} from './member-performance.js';
import type { LoginHistoryQuery, UserExportQuery } from './users.schemas.js';

const EXPORT_LIMIT = 50_000;

/** Restricts a user view to one team lead's group (admin spec v1.1 §1.3, `team/*`). */
export type GroupScope = { leadId: string };

export type UserGroupView = {
  lead_user_id: string;
  lead_username: string;
  lead_full_name: string;
  lead_status: 'active' | 'revoked';
  /** The referral code the user joined with is the lead's username. */
  code: string;
  join_via: 'code' | 'admin';
  joined_at: Date | string;
};

export type ReferralOfferView = {
  grant_id: string;
  lead_user_id: string | null;
  offer_type: 'days' | 'lifetime';
  offer_days: number | null;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  lifetime: boolean;
  active: boolean;
};

/** Admin spec v1.1 §5.1.3 / §5.1.4 additions to the user 360. */
export type UserInsights = {
  group: UserGroupView | null;
  referral_offer: ReferralOfferView | null;
  demo_trading: DemoTradingPerformance;
  bot: BotPerformance;
  academy: AcademyProgressDetail;
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly academy: AcademyProgressReader,
  ) {}

  /**
   * True when the user is a live (not deleted) member of the lead's group. Team views answer
   * 404 USER_NOT_FOUND otherwise, so a lead cannot tell whether an outside user exists.
   */
  async isGroupMember(userId: string, scope: GroupScope): Promise<boolean> {
    const rows = await this.database.query<{ id: string }>(
      `select id from users
        where id = $1 and group_lead_id = $2 and deleted_at is null and status <> 'deleted'`,
      [userId, scope.leadId],
    );
    return rows.length > 0;
  }

  /**
   * The admin user 360. With a group scope (team lead) the user must be a live member of that
   * group, and the admin-only money views are left out: the VT account (capital, cash) and its
   * recent orders (prices). Demo Trading and Bot results are percentages only (§5.1.3).
   */
  async get360(userId: string, scope?: GroupScope): Promise<Record<string, unknown>> {
    const users = await this.database.query<AdminUserRow>(
      `select id, email, username, full_name, phone_number, role, status, is_email_verified,
              last_login_at, created_at from users
        where id = $1
          ${scope ? "and group_lead_id = $2 and deleted_at is null and status <> 'deleted'" : ''}
        limit 1`,
      scope ? [userId, scope.leadId] : [userId],
    );
    const user = users[0];
    if (!user)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
    const [subscriptions, payments, accounts, loginHistory, insights] = await Promise.all([
      this.database.query<SubscriptionRow>(
        `select s.id, s.status, s.current_period_start, s.current_period_end,
                s.cancelled_at, s.cancelled_by_user_id, s.cancel_reason,
                p.id as plan_id, p.code as plan_code, p.name as plan_name,
                p.price_vnd as plan_price_vnd, p.duration_days as plan_duration_days
         from premium_subscriptions s left join premium_plans p on p.id = s.current_plan_id
         where s.user_id = $1 order by s.current_period_start desc`,
        [userId],
      ),
      this.database.query<PaymentRow>(
        `select o.id, o.invoice_number, o.amount_vnd, o.status, o.grant_type,
                p.code as plan_code, o.paid_at, o.created_at
         from premium_payment_orders o left join premium_plans p on p.id = o.plan_id
         where o.user_id = $1 order by o.created_at desc limit 20`,
        [userId],
      ),
      this.database.query<AccountRow>(
        `select id, status, initial_cash_vnd, cash_available_vnd, cash_reserved_vnd,
                cash_pending_vnd, activated_at, frozen_at, freeze_reason
         from virtual_trading_accounts where user_id = $1 limit 1`,
        [userId],
      ),
      this.database.query<LoginRow>(
        `select id, user_id, email, success, failure_reason, ip, user_agent, login_at
         from user_login_history where user_id = $1 order by login_at desc limit 20`,
        [userId],
      ),
      this.insights(userId),
    ]);
    const account = accounts[0];
    const recentOrders =
      account && !scope
        ? await this.database.query<OrderRow>(
            `select id, symbol, side, status, quantity, limit_price_vnd as price_vnd, created_at
           from virtual_orders where account_id = $1 order by created_at desc limit 10`,
            [account.id],
          )
        : [];
    const history = subscriptions.map(subscriptionResponse);
    const now = Date.now();
    const currentIndex = subscriptions.findIndex(
      (subscription) =>
        subscription.status === 'active' &&
        new Date(subscription.current_period_end).getTime() > now,
    );
    const current = currentIndex >= 0 ? history[currentIndex] : undefined;
    const base = {
      user,
      subscription: current ?? null,
      subscription_history: history,
      payment_history: payments.map((row) => ({ ...row, amount_vnd: Number(row.amount_vnd) })),
      trial_used: subscriptions.some((row) => row.plan_code === 'TRIAL_7D'),
    };
    if (scope) return { ...base, login_history: loginHistory, ...insights };
    return {
      ...base,
      vt_account: account ? moneyAccount(account) : null,
      vt_recent_orders: recentOrders.map((row) => ({
        ...row,
        price_vnd: nullableNumber(row.price_vnd),
      })),
      login_history: loginHistory,
      ...insights,
    };
  }

  /** Group, referral offer, Demo Trading / Bot results (percent only) and Academy progress. */
  async insights(userId: string): Promise<UserInsights> {
    const [groups, offers, performance, academy] = await Promise.all([
      this.database.query<UserGroupView>(
        `select u.group_lead_id as lead_user_id, l.username as lead_username,
                l.full_name as lead_full_name, coalesce(p.status, 'revoked') as lead_status,
                l.username as code, u.group_join_via as join_via, u.group_joined_at as joined_at
           from users u
           join users l on l.id = u.group_lead_id
           left join team_lead_profiles p on p.user_id = u.group_lead_id
          where u.id = $1`,
        [userId],
      ),
      this.database.query<ReferralOfferView>(
        `select g.id as grant_id, pol.lead_user_id,
                case when g.ends_at >= $2::timestamptz then 'lifetime' else 'days' end as offer_type,
                case when g.ends_at >= $2::timestamptz then null else g.duration_days end as offer_days,
                g.status, g.starts_at, g.ends_at, g.ends_at >= $2::timestamptz as lifetime,
                (g.status = 'active' and g.starts_at <= now() and now() < g.ends_at) as active
           from billing_entitlement_grants g
           left join team_lead_policies pol on pol.id = g.team_lead_policy_id
          where g.user_id = $1 and g.kind = 'referral_offer'
          order by g.created_at desc, g.id desc
          limit 1`,
        [userId, LIFETIME_THRESHOLD],
      ),
      memberPerformance(this.database, [userId]),
      this.academy.detail(userId),
    ]);
    const result = performance.get(userId);
    if (!result) throw new Error('member performance lookup returned no entry');
    return {
      group: groups[0] ?? null,
      referral_offer: offers[0] ?? null,
      demo_trading: result.demo_trading,
      bot: result.bot,
      academy,
    };
  }

  async resetPassword(
    userId: string,
    audit: AuditContext,
  ): Promise<{ reset_requested: true; message: string }> {
    const { user, token } = await this.auth.createPasswordResetToken(userId);
    const sent = await this.auth.sendPasswordResetEmail(user.email, user.full_name, token);
    if (!sent) {
      throw new ServiceUnavailableException({
        code: 'RESET_EMAIL_UNAVAILABLE',
        message: 'Không thể gửi liên kết đặt lại mật khẩu vào lúc này',
      });
    }
    await this.database.transaction(async (tx) => {
      await recordAudit(tx, audit, {
        action: 'user.password_reset',
        targetEntity: 'user',
        targetId: userId,
        note: 'admin requested one-time reset email; password unchanged until token is consumed',
      });
    });
    return { reset_requested: true, message: 'Đã gửi liên kết đặt lại mật khẩu.' };
  }

  async loginHistory(userId: string, query: LoginHistoryQuery): Promise<Record<string, unknown>> {
    const counts = await this.database.query<{ total: string }>(
      'select count(*)::text as total from user_login_history where user_id = $1',
      [userId],
    );
    const rows = await this.database.query<LoginRow>(
      `select id, user_id, email, success, failure_reason, ip, user_agent, login_at
       from user_login_history where user_id = $1 order by login_at desc limit $2 offset $3`,
      [userId, query.page_size, (query.page - 1) * query.page_size],
    );
    const total = Number(counts[0]?.total ?? 0);
    return {
      items: rows,
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }

  async exportCsv(query: UserExportQuery, audit: AuditContext): Promise<Buffer> {
    const { where, params } = exportFilter(query);
    const counts = await this.database.query<{ total: string }>(
      `select count(*)::text as total from users ${where}`,
      params,
    );
    const total = Number(counts[0]?.total ?? 0);
    if (total > EXPORT_LIMIT) {
      throw new BadRequestException({
        code: 'EXPORT_TOO_LARGE',
        message: `Export filter matches ${total} rows (max ${EXPORT_LIMIT}). Tighten filters first.`,
      });
    }
    const rows = await this.database.query<ExportRow>(
      `select id, email, username, full_name, phone_e164, role, status, is_email_verified,
              last_login_at, created_at from users ${where} order by created_at desc`,
      params,
    );
    await this.database.transaction((tx) =>
      recordAudit(tx, audit, {
        action: 'user.export',
        targetEntity: 'user',
        after: { row_count: total, filters: query },
      }),
    );
    const header = [
      'id',
      'email',
      'username',
      'full_name',
      'phone_e164',
      'role',
      'status',
      'is_email_verified',
      'last_login_at',
      'created_at',
    ];
    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(header.map((key) => csvCell(row[key as keyof ExportRow])).join(','));
    }
    return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
  }
}

type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone_number: string | null;
  role: string;
  status: string;
  is_email_verified: boolean;
  last_login_at: string | Date | null;
  created_at: string | Date;
};
type SubscriptionRow = {
  id: string;
  status: string;
  current_period_start: string | Date;
  current_period_end: string | Date;
  cancelled_at: string | Date | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_price_vnd: string | number | null;
  plan_duration_days: number | null;
};
type PaymentRow = {
  id: string;
  invoice_number: string;
  amount_vnd: string | number;
  status: string;
  grant_type: string | null;
  plan_code: string | null;
  paid_at: string | Date | null;
  created_at: string | Date;
};
type AccountRow = {
  id: string;
  status: string;
  initial_cash_vnd: string | number;
  cash_available_vnd: string | number;
  cash_reserved_vnd: string | number;
  cash_pending_vnd: string | number;
  activated_at: string | Date;
  frozen_at: string | Date | null;
  freeze_reason: string | null;
};
type OrderRow = {
  id: string;
  symbol: string;
  side: string;
  status: string;
  quantity: number;
  price_vnd: string | number | null;
  created_at: string | Date;
};
type LoginRow = {
  id: string;
  user_id: string | null;
  email: string;
  success: boolean;
  failure_reason: string | null;
  ip: string | null;
  user_agent: string | null;
  login_at: string | Date;
};
type ExportRow = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone_e164: string | null;
  role: string;
  status: string;
  is_email_verified: boolean;
  last_login_at: string | Date | null;
  created_at: string | Date;
};

function subscriptionResponse(row: SubscriptionRow): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    plan: row.plan_id
      ? {
          id: row.plan_id,
          code: row.plan_code,
          name: row.plan_name,
          price_vnd: Number(row.plan_price_vnd),
          duration_days: row.plan_duration_days,
        }
      : null,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    is_trial: row.plan_code === 'TRIAL_7D',
    cancelled_at: row.cancelled_at,
    cancelled_by_user_id: row.cancelled_by_user_id,
    cancel_reason: row.cancel_reason,
  };
}

function moneyAccount(row: AccountRow): Record<string, unknown> {
  return {
    ...row,
    initial_cash_vnd: Number(row.initial_cash_vnd),
    cash_available_vnd: Number(row.cash_available_vnd),
    cash_reserved_vnd: Number(row.cash_reserved_vnd),
    cash_pending_vnd: Number(row.cash_pending_vnd),
  };
}

function nullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function exportFilter(query: UserExportQuery): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    conditions.push(clause.replaceAll('?', `$${params.length}`));
  };
  if (query.role) add('role = ?', query.role);
  if (query.status) add('status = ?', query.status);
  if (query.search)
    add('(email ilike ? or username ilike ? or full_name ilike ?)', `%${query.search}%`);
  if (query.last_login_from) add('last_login_at >= ?', query.last_login_from);
  if (query.last_login_to) add('last_login_at < ?', query.last_login_to);
  return { where: conditions.length ? `where ${conditions.join(' and ')}` : '', params };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
