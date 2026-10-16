import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';

function integer(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed))
    throw new RangeError('Database integer exceeds JSON safe range');
  return parsed;
}

/**
 * Admin spec v1.1 §3.3-3: MRR and the plan distribution count each user's grant that is
 * active right now, excluding free referral offers. A member who pays while a stacked offer
 * is pending (or the reverse) is counted by whichever grant currently covers them, and a
 * lifetime offer never hides a paid grant. When grants overlap, the latest started wins.
 */
const CURRENT_GRANTS_CTE = `current_grants as (
         select distinct on (g.user_id) g.user_id, g.plan_id
           from billing_entitlement_grants g
          where g.status = 'active' and g.kind <> 'referral_offer'
            and g.starts_at <= now() and now() < g.ends_at
          order by g.user_id, g.starts_at desc, g.ends_at desc, g.id
       )`;

@Injectable()
export class AdminMetricsService {
  constructor(private readonly database: DatabaseService) {}

  async overview(): Promise<Record<string, unknown>> {
    const [users, subscriptions, revenue, virtualTrading, distribution] = await Promise.all([
      this.database.query<Record<string, string>>(
        `select
           count(*) filter (where status <> 'deleted')::text as total_users,
           count(*) filter (where status = 'active')::text as active_users,
           count(*) filter (where created_at >= date_trunc('day', now()))::text as new_users_today,
           count(*) filter (where created_at >= now() - interval '7 days')::text as new_users_last_7d,
           count(*) filter (where created_at >= now() - interval '30 days')::text as new_users_last_30d
         from users`,
      ),
      this.database.query<Record<string, string>>(
        `with ${CURRENT_GRANTS_CTE},
         entitled as (
           select user_id, bool_or(kind = 'referral_offer') as has_referral_offer
             from billing_entitlement_grants
            where status = 'active' and starts_at <= now() and now() < ends_at
            group by user_id
         )
         select
           (select count(*) from entitled)::text as active_subscribers,
           (select count(*) from entitled where has_referral_offer)::text as active_referral_offer_count,
           count(c.user_id) filter (where p.code = 'TRIAL_7D')::text as active_trial_count,
           count(c.user_id) filter (where p.code <> 'TRIAL_7D')::text as active_paid_count,
           coalesce(sum((p.price_vnd::numeric * 30) / nullif(p.duration_days, 0))
             filter (where p.code <> 'TRIAL_7D'), 0)::bigint::text as mrr_vnd
         from current_grants c
         left join premium_plans p on p.id = c.plan_id`,
      ),
      this.database.query<Record<string, string>>(
        `select
           coalesce(sum(amount_vnd) filter (where paid_at >= date_trunc('day', now())), 0)::text as revenue_today_vnd,
           coalesce(sum(amount_vnd) filter (where paid_at >= now() - interval '7 days'), 0)::text as revenue_last_7d_vnd,
           coalesce(sum(amount_vnd) filter (where paid_at >= now() - interval '30 days'), 0)::text as revenue_last_30d_vnd
         from premium_payment_orders
         where status = 'paid' and coalesce(grant_type, '') <> 'admin_grant'`,
      ),
      this.database.query<Record<string, string>>(
        `select
           (select count(*) from virtual_trading_accounts where status = 'active')::text as vt_active_accounts,
           (select count(*) from virtual_orders where created_at >= date_trunc('day', now()))::text as vt_orders_today`,
      ),
      this.planDistribution(false),
    ]);

    const u = users[0] ?? {};
    const s = subscriptions[0] ?? {};
    const r = revenue[0] ?? {};
    const vt = virtualTrading[0] ?? {};
    return {
      total_users: integer(u.total_users),
      active_users: integer(u.active_users),
      new_users_today: integer(u.new_users_today),
      new_users_last_7d: integer(u.new_users_last_7d),
      new_users_last_30d: integer(u.new_users_last_30d),
      active_subscribers: integer(s.active_subscribers),
      active_trial_count: integer(s.active_trial_count),
      active_paid_count: integer(s.active_paid_count),
      active_referral_offer_count: integer(s.active_referral_offer_count),
      plan_distribution: distribution,
      mrr_vnd: integer(s.mrr_vnd),
      revenue_today_vnd: integer(r.revenue_today_vnd),
      revenue_last_7d_vnd: integer(r.revenue_last_7d_vnd),
      revenue_last_30d_vnd: integer(r.revenue_last_30d_vnd),
      vt_active_accounts: integer(vt.vt_active_accounts),
      vt_orders_today: integer(vt.vt_orders_today),
      generated_at: new Date().toISOString(),
    };
  }

  async dailyRevenue(days: number): Promise<Record<string, unknown>[]> {
    const rows = await this.database.query<{
      date: string;
      paid_orders: string;
      revenue_vnd: string;
    }>(
      `with dates as (
         select generate_series(
           current_date - ($1::integer - 1), current_date, interval '1 day'
         )::date as date
       ), totals as (
         select paid_at::date as date, count(*)::text as paid_orders,
                coalesce(sum(amount_vnd), 0)::text as revenue_vnd
           from premium_payment_orders
          where status = 'paid'
            and coalesce(grant_type, '') <> 'admin_grant'
            and paid_at >= current_date - ($1::integer - 1)
          group by paid_at::date
       )
       select d.date::text as date, coalesce(t.paid_orders, '0') as paid_orders,
              coalesce(t.revenue_vnd, '0') as revenue_vnd
         from dates d left join totals t using (date)
        order by d.date`,
      [days],
    );
    return rows.map((row) => ({
      date: row.date,
      paid_orders: integer(row.paid_orders),
      revenue_vnd: integer(row.revenue_vnd),
    }));
  }

  async planDistribution(includeTrial = true): Promise<Record<string, unknown>[]> {
    const rows = await this.database.query<{
      plan_code: string;
      plan_name: string;
      price_vnd: number;
      active_subscriptions: string;
    }>(
      `with ${CURRENT_GRANTS_CTE}
       select p.code as plan_code, p.name as plan_name, p.price_vnd,
              count(c.user_id)::text as active_subscriptions
         from premium_plans p
         left join current_grants c on c.plan_id = p.id
        where p.is_active = true and ($1::boolean or p.code <> 'TRIAL_7D')
        group by p.id, p.code, p.name, p.price_vnd, p.sort_order
        order by p.sort_order, p.price_vnd, p.code`,
      [includeTrial],
    );
    return rows.map((row) => ({
      ...row,
      price_vnd: integer(row.price_vnd),
      active_subscriptions: integer(row.active_subscriptions),
    }));
  }
}
