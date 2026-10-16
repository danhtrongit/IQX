import type { BillingSqlClient } from './billing.types.js';

/**
 * Entitlement primitives shared by BillingService and the modules that grant Premium outside
 * of a payment (registration trial, team-lead referral offers). They only take a SQL client,
 * so a caller can run them inside its own transaction without importing BillingModule.
 */

/** Admin spec v1.1 §3.3-3: a lifetime offer ends here, so `now() < ends_at` keeps holding. */
export const LIFETIME_ENDS_AT = '9999-12-31T23:59:59+07:00';

/** Any grant ending in year 9999 or later is a lifetime grant (DECISION 4). */
export const LIFETIME_THRESHOLD = '9999-01-01T00:00:00Z';

/** Serialize every grant change for one user, across payments, trials and offers. */
export async function lockEntitlementUser(client: BillingSqlClient, userId: string): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `billing-entitlement:${userId}`,
  ]);
}

/** True while the user holds an active lifetime grant, even one that starts later. */
export async function hasActiveLifetimeGrant(
  client: BillingSqlClient,
  userId: string,
): Promise<boolean> {
  const rows = await client.query<{ id: string }>(
    `select id from billing_entitlement_grants
      where user_id = $1 and status = 'active' and ends_at >= $2::timestamptz
        and now() < ends_at
      limit 1`,
    [userId, LIFETIME_THRESHOLD],
  );
  return rows.length > 0;
}

export async function addSubscriptionHistory(
  client: BillingSqlClient,
  userId: string,
  planId: string | null,
  eventType: string,
  actorId: string | null,
  reason: string | null,
  days?: number,
): Promise<void> {
  await client.query(
    `insert into billing_subscription_history
       (user_id, plan_id, event_type, actor_user_id, reason, days_delta)
     values ($1, $2, $3, $4, $5, $6)`,
    [userId, planId, eventType, actorId, reason, days ?? null],
  );
}

/**
 * Project the user's active grants onto premium_subscriptions and the user <-> premium role.
 * Only those two roles are ever rewritten: admin and team_lead keep their role whatever the
 * grants say (admin spec v1.1 §1.1 rule 1).
 */
export async function refreshSubscriptionState(
  client: BillingSqlClient,
  userId: string,
  fallbackPlanId: string,
): Promise<void> {
  const [aggregate] = await client.query<
    Record<string, unknown> & {
      starts_at: Date | string | null;
      ends_at: Date | string | null;
      current_plan_id: string | null;
      entitled: boolean;
    }
  >(
    `select min(starts_at) filter (where ends_at > now()) as starts_at,
            max(ends_at) filter (where ends_at > now()) as ends_at,
            (array_agg(plan_id order by ends_at desc) filter (where ends_at > now()))[1] as current_plan_id,
            coalesce(bool_or(starts_at <= now() and now() < ends_at), false) as entitled
       from billing_entitlement_grants
      where user_id = $1 and status = 'active'`,
    [userId],
  );
  if (aggregate?.ends_at && aggregate.starts_at) {
    const [sub] = await client.query<{ id: string } & Record<string, unknown>>(
      `insert into premium_subscriptions
         (user_id, current_plan_id, current_period_start, current_period_end, status)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set
         current_plan_id = excluded.current_plan_id,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         status = excluded.status,
         cancelled_at = null, cancelled_by_user_id = null, cancel_reason = null,
         updated_at = now()
       returning id`,
      [
        userId,
        aggregate.current_plan_id ?? fallbackPlanId,
        aggregate.starts_at,
        aggregate.ends_at,
        aggregate.entitled ? 'active' : 'expired',
      ],
    );
    if (aggregate.entitled) {
      await client.query(
        `update users set role = 'premium', updated_at = now() where id = $1 and role = 'user'`,
        [userId],
      );
    } else {
      await client.query(
        `update users set role = 'user', updated_at = now() where id = $1 and role = 'premium'`,
        [userId],
      );
    }
    if (sub)
      await addSubscriptionHistory(
        client,
        userId,
        aggregate.current_plan_id ?? fallbackPlanId,
        'grant_applied',
        null,
        null,
      );
    return;
  }
  await client.query(
    `update premium_subscriptions
        set status = 'expired', current_period_end = least(current_period_end, now()), updated_at = now()
      where user_id = $1 and status <> 'cancelled'`,
    [userId],
  );
  await client.query(
    `update users set role = 'user', updated_at = now() where id = $1 and role = 'premium'`,
    [userId],
  );
}
